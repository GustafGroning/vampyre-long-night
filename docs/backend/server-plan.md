# Server och inloggning för huvudskärmen: plan

Datum: 2026-11-21. Underlag: gapanalysen `/mnt/project-files/ui/huvudskarm-features.md` (punkt 2A), kartläggningen `docs/backend/supabase-current-setup.md`, SPEC B1–B5.

Mål: spelarens huvudskärm (`packages/web`) laddar sin `PlayerView` från servern, lämnar in där, ser sin inlämnade lista efter omladdning och hämtar ny vy när ronden har lösts. Inloggning avgör vilken spelare man är. Bara logik, ingen design.

Beslut med id **P1–P15** står i `docs/decisions/server.md`. De är provisoriska tills Gustaf har granskat dem.

## Arkitektur

```
packages/web ──(Supabase Auth: e-post + lösenord)──> auth.users
     │  POST /functions/v1/game  { op, ... }  + användarens JWT
     ▼
supabase/functions/game  (Deno, bundlad från packages/server med esbuild)
     │  kör motorn: buildPlayerView, submitActions, resolveRound
     │  pratar med databasen via RPC-funktioner, bara med service role
     ▼
Postgres: campaigns, campaign_members (+ player_id),
          game_states, game_rounds, game_submissions, game_round_events
```

- **Väg 1 ur kartläggningen** (P1): hela `GameState` som ett `jsonb`-dokument per kampanj. Spelare läser aldrig speltabellerna; de nya `game_*`-tabellerna har RLS påslaget och inga policyer, så bara service role kommer åt dem (P11). Det är databasens försvar enligt B3; motorns vy är det andra.
- **En edge function, `game`** (P2), med operationer för spelare (`campaigns`, `screen`, `status`, `submit`, `unlock`) och för GM (`gm_create_campaign`, `gm_assign`, `gm_status`, `gm_resolve`) plus `admin_create_user` för plattformsadmin.
- **Logiken ligger i `packages/server`** som vanlig TypeScript: `handle(request, ctx)` mot ett `Store`-gränssnitt. I test körs den mot en minnes-store; i edge-funktionen mot `SupabaseStore`, som bara gör `fetch` mot PostgREST-RPC och Auth (inga beroenden, P13). Samma kod körs alltså i Vitest och i Deno.
- **Klienten** kör fortfarande katalog och utkastanalys lokalt mot den nedladdade vyn (som i dag). Bara `load`, `confirm` och `unlock` går till servern.

## Steg

1. **Testet som är rött.** `test/localPort.test.ts` väntar 80 blood för demons Prince. Bevisat: demorondens upplösning ger nu 100 − 20 (upkeep) + 25 (stadsinkomst, 5a) + 75 (Bleed, 5b) = 180 sedan PR #10. Uppdatera det förväntade värdet.
2. **Migration** `supabase/migrations/20261121170000_game_server.sql`: tabeller, RPC:er, `player_id` på `campaign_members`, täpp till INSERT-hålet på `campaign_members`. Testas mot lokal Postgres 16 med en stub av Supabase-schemat (`supabase/tests/`).
3. **`packages/server`**: API-typer (delas med web), `handle`, minnes-store, `SupabaseStore`, Deno-ingång. Tester för hela flödet: skapa kampanj, koppla spelare, ladda vy, lämna in, låsa upp, lösa rond, ny rond, behörighet och att ingen annans data läcker.
4. **Bygg av edge-funktionen**: `npm run build:function` bundlar `packages/server/src/edge.ts` + motorn till `supabase/functions/game/index.js` (genererad, inte incheckad).
5. **Web**:
   - `PlayerScreenPort.confirm`/`unlock` blir async; porten får `initialDraft()` och `initialExtras()` (inlämnad lista och Royal Privileges efter omladdning).
   - `restoreDraft`: bygger tillbaka radernas visningstexter från vyn genom att spela upp `nextParam` (P7), så servern behöver bara spara motorns `Submission`.
   - `serverPort.ts`: hämtar `screen`, bygger en `viewPort` och skickar `submit`/`unlock` till servern.
   - Inloggning (`LoginForm`), kampanjval om man är med i flera, utloggning, och en `useRoundWatcher` som frågar `status` var 30:e sekund och laddar om skärmen när ronden har bytts (P6).
   - Demoläget finns kvar: utan `VITE_SUPABASE_URL`, eller med `?demo`, körs demokampanjen lokalt som i dag.
6. **GM-skript** `packages/server/scripts/gm.ts`: loggar in som GM och anropar GM-operationerna (skapa demokampanj, koppla spelare, status, lös rond). Inget GM-gränssnitt i webben än.
7. **Validera**: alla tester, typecheck, migrationen mot lokal Postgres, och webben i en riktig webbläsare (demo och serverläge mot en lokal server).
8. **Driftsättning i Supabase-projektet**: kräver Gustafs ok (projektminnet: ändra inte databasen utan ok). Migrationen är additiv utom att INSERT-policyn på `campaign_members` byts.

## Utanför scope (BACKLOG)

GM-gränssnitt, pausad upplösning (strid) som kan återupptas, automatisk upplösning vid deadline (`pg_cron`), Realtime i stället för polling, content per kampanj (B4), invites, osparat utkast mellan omladdningar, städning av de gamla generiska tabellerna, och migrationshistoriken från juni som filer i repot.
