# Supabase: spelservern

Plan och beslut: `docs/backend/server-plan.md`, `docs/decisions/server.md`. Projektets tidigare läge: `docs/backend/supabase-current-setup.md`.

| Fil | Innehåll |
|---|---|
| `migrations/20261121170000_game_server.sql` | Speltabellerna, RPC-funktionerna, `campaign_members.player_id`, ny INSERT-policy på `campaign_members`. Bygger på de åtta migrationerna från juni 2026 som finns i projektet men inte som filer här. |
| `migrations/20261126050000_character_backlogs.sql` | Spelarens vampyrer utan kampanj (`character_backlogs`, `game_backlog_get`, `game_backlog_save`), P16. |
| `functions/game/index.js` | Edge function `game`. **Genererad**, inte incheckad: `npm run build:function -w @vampyre/server`. |
| `config.toml` | Pekar ut bundlen som funktionens entrypoint. |
| `tests/` | Testar migrationen mot en lokal Postgres med en stub av Supabase-schemat. |

## Testa lokalt

```sh
bash supabase/tests/run.sh                 # kräver Postgres 16-binärer (initdb, pg_ctl) och att man inte är root
```

`packages/server/test/supabaseStore.pg.test.ts` kör hela serverflödet mot samma databas genom en PostgREST-shim. Starta en Postgres med stubben och migrationerna och sätt `GAME_TEST_PG_URL=postgres://…`; annars hoppas testet över.

## Driftsätta

1. Migrationerna i ordning: `supabase db push`, Supabase-connectorn (`apply_migration`) eller SQL Editor.
2. Funktionen: `npm run build:function -w @vampyre/server`, sedan `supabase functions deploy game` (läser `config.toml`). `verify_jwt` ska vara på.
3. Första admin: skapa användaren i dashboarden (Authentication → Users → Add user, med "Auto Confirm") och kör
   `insert into public.user_roles (user_id, role) select id, 'platform_admin' from auth.users where email = '<din e-post>';`
4. Resten med GM-skriptet (`packages/server/scripts/gm.ts`): `create-user`, `create-demo`, `assign`, `status`, `resolve`.
5. Självregistrering (P20): Authentication → Sign In / Providers → Email: "Allow new users to sign up" på och "Confirm email" av.
6. Webben: `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` (publishable key) i `packages/web/.env.local`. Committa aldrig `.env`.
