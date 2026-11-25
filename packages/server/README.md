# @vampyre/server

Spelservern: kör motorn bakom Supabase (edge function `game`). Plan: `docs/backend/server-plan.md`, beslut P1–P15: `docs/decisions/server.md`.

```sh
npm test -w @vampyre/server            # logiken mot MemoryStore (+ Postgres om GAME_TEST_PG_URL är satt)
npm run typecheck -w @vampyre/server
npm run build:function -w @vampyre/server   # bundlar till supabase/functions/game/index.js
npm run dev:server -w @vampyre/server       # lokal server på :8787 med demokampanjen
npm run gm -w @vampyre/server -- status <campaignId>   # GM-verktyg, se scripts/gm.ts
```

| Fil | Innehåll |
|---|---|
| `src/api.ts` | Operationerna och deras svar. Bara typer; webben importerar `@vampyre/server/api`. |
| `src/handle.ts` | Logiken: behörighet, `buildPlayerView`, `submitActions`, `resolveRound`. Ingen HTTP, ingen databas. |
| `src/store.ts` | `Store`-gränssnittet (en metod per atomisk operation). |
| `src/memoryStore.ts` | Store i minnet, samma semantik som SQL-funktionerna. Tester och dev-server. |
| `src/supabaseStore.ts` | Store mot Supabase: RPC via `fetch`, Auth admin-API. |
| `src/http.ts` | Request → Response, CORS, felformat. |
| `src/edge.ts` | Deno-ingången för edge-funktionen. |
| `scripts/gm.ts` | GM-verktyg på kommandoraden mot Supabase. |
| `scripts/dev-server.ts` | Lokal server (Node) med testkonton. |
