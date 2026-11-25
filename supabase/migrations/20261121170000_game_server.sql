-- Spelservern (docs/backend/server-plan.md, beslut P1–P15 i docs/decisions/server.md).
--
-- Hela GameState ligger som ett jsonb-dokument per kampanj (P1). Spelare läser
-- aldrig tabellerna här: RLS är påslaget utan policyer, och alla funktioner är
-- bara körbara av service_role, alltså av edge-funktionen `game` (P11).
-- Migrationen är additiv, utom att INSERT-policyn på campaign_members byts (P12).

-- ---------------------------------------------------------------------------
-- Medlemskap: vilken motor-spelare (player-3) en användare är i kampanjen (P4)

alter table public.campaign_members add column if not exists player_id text;

create unique index if not exists campaign_members_campaign_player
  on public.campaign_members (campaign_id, player_id)
  where player_id is not null;

-- Vem som helst kunde lägga in sig själv i en kampanj, även som gm. Medlemmar
-- läggs nu bara till av servern (service role) eller av en gm.
drop policy if exists "creator becomes first gm" on public.campaign_members;
create policy "gms can add members"
  on public.campaign_members for insert
  to authenticated
  with check (public.is_campaign_gm((select auth.uid()), campaign_id));

-- ---------------------------------------------------------------------------
-- Tabeller

create table public.game_states (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  state jsonb not null,
  -- Räknas upp vid varje commit; skyddar mot dubbel upplösning (P8).
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.game_rounds (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  round integer not null,
  -- Dold för spelare (M9).
  seed text not null,
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved', 'suspended')),
  -- Pausad upplösning (strid). Kan inte återupptas än (BACKLOG).
  resolution jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  resolved_at timestamptz,
  primary key (campaign_id, round)
);

create table public.game_submissions (
  campaign_id uuid not null,
  round integer not null,
  player_id text not null,
  -- Motorns Submission, oförändrad.
  submission jsonb not null,
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, round, player_id),
  foreign key (campaign_id, round) references public.game_rounds (campaign_id, round) on delete cascade
);

create table public.game_round_events (
  campaign_id uuid not null,
  round integer not null,
  -- RoundEvent[] med audience. Filtreras av buildPlayerView, aldrig av klienten.
  events jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, round),
  foreign key (campaign_id, round) references public.game_rounds (campaign_id, round) on delete cascade
);

alter table public.game_states enable row level security;
alter table public.game_rounds enable row level security;
alter table public.game_submissions enable row level security;
alter table public.game_round_events enable row level security;

revoke all on public.game_states, public.game_rounds, public.game_submissions, public.game_round_events
  from public, anon, authenticated;
grant all on public.game_states, public.game_rounds, public.game_submissions, public.game_round_events
  to service_role;

-- ---------------------------------------------------------------------------
-- Hjälpare

create or replace function public.game_ms(t timestamptz) returns bigint
  language sql immutable set search_path = public
  as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function public.game_ts(ms bigint) returns timestamptz
  language sql immutable set search_path = public
  as $$ select to_timestamp(ms / 1000.0) $$;

create or replace function public.game_round_json(r public.game_rounds) returns jsonb
  language sql stable set search_path = public
  as $$
    select jsonb_build_object(
      'round', r.round, 'seed', r.seed, 'deadline', public.game_ms(r.deadline), 'status', r.status)
  $$;

-- ---------------------------------------------------------------------------
-- Läsning

create or replace function public.game_user_campaigns(_user uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaignId', c.id, 'name', c.name, 'role', m.role, 'playerId', m.player_id
    ) order by c.created_at, c.id), '[]'::jsonb)
    from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
    where m.user_id = _user
  $$;

create or replace function public.game_membership(_campaign uuid, _user uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object('role', m.role, 'playerId', m.player_id)
    from public.campaign_members m
    where m.campaign_id = _campaign and m.user_id = _user
  $$;

create or replace function public.game_is_platform_admin(_user uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.has_role(_user, 'platform_admin') $$;

create or replace function public.game_user_id_by_email(_email text) returns uuid
  language sql stable security definer set search_path = public, auth
  as $$ select id from auth.users where lower(email) = lower(btrim(_email)) limit 1 $$;

-- State, aktuell rond och förra rondens events (för kartans "sågs förra ronden", V17).
create or replace function public.game_load(_campaign uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object(
      'state', s.state,
      'version', s.version,
      'round', (select public.game_round_json(r) from public.game_rounds r
                where r.campaign_id = _campaign order by r.round desc limit 1),
      'previousEvents', coalesce((select e.events from public.game_round_events e
                where e.campaign_id = _campaign and e.round < (s.state ->> 'round')::int
                order by e.round desc limit 1), '[]'::jsonb)
    )
    from public.game_states s where s.campaign_id = _campaign
  $$;

create or replace function public.game_list_submissions(_campaign uuid, _round integer) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select coalesce(jsonb_object_agg(player_id, submission), '{}'::jsonb)
    from public.game_submissions where campaign_id = _campaign and round = _round
  $$;

create or replace function public.game_assigned_players(_campaign uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select coalesce(jsonb_agg(player_id order by player_id), '[]'::jsonb)
    from public.campaign_members where campaign_id = _campaign and player_id is not null
  $$;

-- Hela logen för en löst rond (bara GM, via servern).
create or replace function public.game_round_events_get(_campaign uuid, _round integer) returns jsonb
  language sql stable security definer set search_path = public
  as $$ select events from public.game_round_events where campaign_id = _campaign and round = _round $$;

-- ---------------------------------------------------------------------------
-- Inlämning. Båda kontrollerar att ronden är öppen och håller radlåset (for share)
-- så att en samtidig game_close_round väntar (P8).

create or replace function public.game_save_submission(
  _campaign uuid, _round integer, _player text, _submission jsonb
) returns boolean
  language plpgsql security definer set search_path = public
  as $$
  begin
    perform 1 from public.game_rounds
      where campaign_id = _campaign and round = _round and status = 'open' for share;
    if not found then return false; end if;
    insert into public.game_submissions (campaign_id, round, player_id, submission, locked, updated_at)
      values (_campaign, _round, _player, _submission, coalesce((_submission ->> 'locked')::boolean, false), now())
      on conflict (campaign_id, round, player_id)
      do update set submission = excluded.submission, locked = excluded.locked, updated_at = now();
    return true;
  end;
  $$;

-- ---------------------------------------------------------------------------
-- Rondens livscykel

create or replace function public.game_close_round(_campaign uuid, _round integer) returns boolean
  language plpgsql security definer set search_path = public
  as $$
  begin
    update public.game_rounds set status = 'closed', closed_at = now()
      where campaign_id = _campaign and round = _round and status = 'open';
    return found;
  end;
  $$;

create or replace function public.game_reopen_round(_campaign uuid, _round integer) returns boolean
  language plpgsql security definer set search_path = public
  as $$
  begin
    update public.game_rounds set status = 'open', closed_at = null
      where campaign_id = _campaign and round = _round and status = 'closed';
    return found;
  end;
  $$;

-- Sparar en löst rond atomiskt: ny state, events, rondstatus och nästa rond (B1).
-- _outcome = 'resolved' | 'suspended'. Vid 'suspended' sparas bara upplösningen.
create or replace function public.game_commit_round(
  _campaign uuid,
  _expected_version integer,
  _round integer,
  _outcome text,
  _state jsonb,
  _events jsonb,
  _resolution jsonb,
  _next_round integer,
  _next_seed text,
  _next_deadline_ms bigint
) returns boolean
  language plpgsql security definer set search_path = public
  as $$
  begin
    if _outcome = 'suspended' then
      update public.game_rounds set status = 'suspended', resolution = _resolution
        where campaign_id = _campaign and round = _round and status = 'closed';
      return found;
    end if;
    if _outcome <> 'resolved' then raise exception 'okänt utfall %', _outcome; end if;

    update public.game_states set state = _state, version = version + 1, updated_at = now()
      where campaign_id = _campaign and version = _expected_version;
    if not found then return false; end if;

    update public.game_rounds set status = 'resolved', resolved_at = now(), resolution = null
      where campaign_id = _campaign and round = _round and status in ('closed', 'suspended');
    if not found then raise exception 'rond % är inte stängd', _round; end if;

    insert into public.game_round_events (campaign_id, round, events) values (_campaign, _round, _events);

    if _next_round is not null then
      insert into public.game_rounds (campaign_id, round, seed, deadline)
        values (_campaign, _next_round, _next_seed, public.game_ts(_next_deadline_ms));
    end if;

    update public.campaigns
      set current_round = (_state ->> 'round')::int,
          status = case when _state ->> 'phase' = 'finished' then 'completed'::public.campaign_status else status end
      where id = _campaign;
    return true;
  end;
  $$;

-- ---------------------------------------------------------------------------
-- Kampanj och medlemmar

-- _id sätts av servern, eftersom motorns state bär kampanjens id (campaignId).
create or replace function public.game_create_campaign(
  _id uuid, _name text, _created_by uuid, _state jsonb, _seed text, _deadline_ms bigint
) returns uuid
  language plpgsql security definer set search_path = public
  as $$
  begin
    insert into public.campaigns (id, name, created_by, status, current_round)
      values (_id, _name, _created_by, 'active', (_state ->> 'round')::int);
    insert into public.campaign_members (campaign_id, user_id, role) values (_id, _created_by, 'gm');
    insert into public.game_states (campaign_id, state) values (_id, _state);
    insert into public.game_rounds (campaign_id, round, seed, deadline)
      values (_id, (_state ->> 'round')::int, _seed, public.game_ts(_deadline_ms));
    return _id;
  end;
  $$;

-- Lägger till eller ändrar en medlem. _player null = ingen spelare (t.ex. gm).
create or replace function public.game_assign_member(
  _campaign uuid, _user uuid, _role public.campaign_role, _player text, _display_name text
) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    -- En spelare kan bara ha en användare: ta bort pekaren från en tidigare.
    if _player is not null then
      update public.campaign_members set player_id = null
        where campaign_id = _campaign and player_id = _player and user_id <> _user;
    end if;
    insert into public.campaign_members (campaign_id, user_id, role, player_id, display_name)
      values (_campaign, _user, _role, _player, _display_name)
      on conflict (campaign_id, user_id)
      do update set role = excluded.role, player_id = excluded.player_id,
                    display_name = coalesce(excluded.display_name, public.campaign_members.display_name);
  end;
  $$;

-- ---------------------------------------------------------------------------
-- Bara service_role får köra funktionerna.

do $$
declare f text;
begin
  foreach f in array array[
    'public.game_ms(timestamptz)',
    'public.game_ts(bigint)',
    'public.game_round_json(public.game_rounds)',
    'public.game_user_campaigns(uuid)',
    'public.game_membership(uuid, uuid)',
    'public.game_is_platform_admin(uuid)',
    'public.game_user_id_by_email(text)',
    'public.game_load(uuid)',
    'public.game_list_submissions(uuid, integer)',
    'public.game_assigned_players(uuid)',
    'public.game_round_events_get(uuid, integer)',
    'public.game_save_submission(uuid, integer, text, jsonb)',
    'public.game_close_round(uuid, integer)',
    'public.game_reopen_round(uuid, integer)',
    'public.game_commit_round(uuid, integer, integer, text, jsonb, jsonb, jsonb, integer, text, bigint)',
    'public.game_create_campaign(uuid, text, uuid, jsonb, text, bigint)',
    'public.game_assign_member(uuid, uuid, public.campaign_role, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
