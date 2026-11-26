-- Spelarens vampyrer utan kampanj (docs/ui/character-backlog-plan.md, beslut P16–P17).
-- En rad per användare med motorns CharacterBacklog. Som spelservern i övrigt:
-- RLS utan policyer och RPC bara för service_role (P11).

create table public.character_backlogs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  backlog jsonb not null,
  -- Räknas upp vid varje sparning; skyddar mot att två flikar skriver över varandra.
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.character_backlogs enable row level security;
revoke all on public.character_backlogs from public, anon, authenticated;
grant all on public.character_backlogs to service_role;

create or replace function public.game_backlog_get(_user uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object('backlog', backlog, 'revision', revision)
    from public.character_backlogs where user_id = _user
  $$;

-- _expected_revision 0 = backloggen finns inte än. false = någon annan har sparat emellan.
create or replace function public.game_backlog_save(_user uuid, _backlog jsonb, _expected_revision integer)
  returns boolean
  language plpgsql security definer set search_path = public
  as $$
  begin
    if _expected_revision = 0 then
      insert into public.character_backlogs (user_id, backlog) values (_user, _backlog)
        on conflict (user_id) do nothing;
      return found;
    end if;
    update public.character_backlogs
      set backlog = _backlog, revision = revision + 1, updated_at = now()
      where user_id = _user and revision = _expected_revision;
    return found;
  end;
  $$;

revoke execute on function public.game_backlog_get(uuid) from public, anon, authenticated;
revoke execute on function public.game_backlog_save(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.game_backlog_get(uuid) to service_role;
grant execute on function public.game_backlog_save(uuid, jsonb, integer) to service_role;
