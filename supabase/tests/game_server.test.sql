-- Kör: supabase/tests/run.sh. Varje kontroll kastar vid fel.
\set ON_ERROR_STOP 1
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FEL: %', what; end if; end $$;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'gm@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'Spelare@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'other@example.test');

set role service_role;
select public.game_create_campaign('00000000-0000-0000-0000-0000000000c1', 'Test', '00000000-0000-0000-0000-00000000000a',
  '{"round": 1, "phase": "submission"}', 'seed-1', 1000000) as cid \gset
select public.game_assign_member(:'cid', public.game_user_id_by_email(' spelare@EXAMPLE.test'), 'player', 'player-2', 'B');

do $$ begin
  if (select count(*) from public.campaign_members) <> 2 then raise exception 'medlemmar'; end if;
end $$;
select pg_temp.check(public.game_membership(:'cid', '00000000-0000-0000-0000-00000000000b') = '{"role": "player", "playerId": "player-2"}', 'membership');
select pg_temp.check(jsonb_array_length(public.game_user_campaigns('00000000-0000-0000-0000-00000000000b')) = 1, 'user_campaigns');
select pg_temp.check((public.game_load(:'cid') -> 'round' ->> 'deadline') = '1000000', 'deadline ms');

-- Spelare-pekaren flyttas om en annan användare får samma spelare
select public.game_assign_member(:'cid', '00000000-0000-0000-0000-00000000000c', 'player', 'player-2', null);
select pg_temp.check(public.game_membership(:'cid', '00000000-0000-0000-0000-00000000000b') ->> 'playerId' is null, 'pekaren flyttades inte');
select public.game_assign_member(:'cid', '00000000-0000-0000-0000-00000000000b', 'player', 'player-2', null);

-- Inlämning i öppen rond
select pg_temp.check(public.game_save_submission(:'cid', 1, 'player-2', '{"playerId":"player-2","actions":[],"royalPrivilegesToSpend":0,"locked":true,"updatedAt":5}'), 'save');
select pg_temp.check((select locked from public.game_submissions where player_id = 'player-2'), 'locked-kolumnen');
select pg_temp.check(public.game_list_submissions(:'cid', 1) ? 'player-2', 'list');

-- Stäng: inlämning nekas, dubbel stängning nekas
select pg_temp.check(public.game_close_round(:'cid', 1), 'close');
select pg_temp.check(not public.game_close_round(:'cid', 1), 'dubbel close');
select pg_temp.check(not public.game_save_submission(:'cid', 1, 'player-2', '{}'), 'save i stängd rond');
select pg_temp.check(public.game_reopen_round(:'cid', 1) and public.game_close_round(:'cid', 1), 'reopen');

-- Commit med fel version nekas, rätt version går igenom
select pg_temp.check(not public.game_commit_round(:'cid', 99, 1, 'resolved', '{"round":2,"phase":"submission"}', '[]', null, 2, 's2', 2000000), 'version');
select pg_temp.check(public.game_commit_round(:'cid', 1, 1, 'resolved', '{"round":2,"phase":"submission"}', '[{"seq":1}]', null, 2, 's2', 2000000), 'commit');
select pg_temp.check((public.game_load(:'cid') -> 'round' ->> 'round') = '2'
   and (public.game_load(:'cid') ->> 'version') = '2'
   and (public.game_load(:'cid') -> 'previousEvents') = '[{"seq":1}]'
   and (select current_round from public.campaigns) = 2, 'efter commit');
select pg_temp.check(public.game_round_events_get(:'cid', 1) = '[{"seq":1}]', 'round_events_get');
select pg_temp.check(public.game_round_events_get(:'cid', 2) is null, 'round_events_get olöst');
select pg_temp.check(public.game_assigned_players(:'cid') = '["player-2"]', 'assigned_players');
-- Backlog: skapa, versionskoll, läsa
select pg_temp.check(public.game_backlog_get('00000000-0000-0000-0000-00000000000b') is null, 'backlog saknas');
select pg_temp.check(public.game_backlog_save('00000000-0000-0000-0000-00000000000b', '{"nextId":1}', 0), 'backlog skapa');
select pg_temp.check(not public.game_backlog_save('00000000-0000-0000-0000-00000000000b', '{"nextId":9}', 0), 'backlog dubbel skapa');
select pg_temp.check(not public.game_backlog_save('00000000-0000-0000-0000-00000000000b', '{"nextId":9}', 5), 'backlog fel revision');
select pg_temp.check(public.game_backlog_save('00000000-0000-0000-0000-00000000000b', '{"nextId":2}', 1), 'backlog uppdatera');
select pg_temp.check(public.game_backlog_get('00000000-0000-0000-0000-00000000000b') = '{"backlog":{"nextId":2},"revision":2}', 'backlog läsa');
reset role;

-- Spelare och anon kommer inte åt speltabellerna eller funktionerna
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin perform * from public.game_states; raise exception 'LÄCKA: game_states';
  exception when insufficient_privilege then null; end;
  begin perform * from public.game_rounds; raise exception 'LÄCKA: game_rounds (seed)';
  exception when insufficient_privilege then null; end;
  begin perform * from public.game_submissions; raise exception 'LÄCKA: game_submissions';
  exception when insufficient_privilege then null; end;
  begin perform * from public.character_backlogs; raise exception 'LÄCKA: character_backlogs';
  exception when insufficient_privilege then null; end;
  begin perform public.game_backlog_get('00000000-0000-0000-0000-00000000000b'); raise exception 'LÄCKA: game_backlog_get';
  exception when insufficient_privilege then null; end;
  begin perform public.game_load((select id from public.campaigns limit 1)); raise exception 'LÄCKA: game_load';
  exception when insufficient_privilege then null; end;
  -- Ser sin kampanj (gamla policyn), men kan inte lägga in sig som gm i en annan
  if (select count(*) from public.campaigns) <> 1 then raise exception 'campaigns-select'; end if;
end $$;
do $$ begin
  insert into public.campaigns (id, name, created_by) values ('00000000-0000-0000-0000-0000000000ff', 'x', '00000000-0000-0000-0000-00000000000b');
exception when insufficient_privilege then null; end $$;
reset role;
insert into public.campaigns (id, name, created_by) values ('00000000-0000-0000-0000-0000000000ee', 'annan', '00000000-0000-0000-0000-00000000000c');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  insert into public.campaign_members (campaign_id, user_id, role) values ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-00000000000b', 'gm');
  raise exception 'HÅL: kunde lägga in sig som gm';
exception when insufficient_privilege then null; end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.game_user_id_by_email('gm@example.test'); raise exception 'LÄCKA: anon kör game_user_id_by_email';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'OK: alla kontroller i game_server.test.sql'
