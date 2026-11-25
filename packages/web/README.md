# @vampyre/web

Spelarens gränssnitt: React 19 + Vite + TypeScript. Plan: `docs/ui/main-screen-plan.md`.

```sh
npm install        # i repots rot
npm run dev        # i roten eller här; öppna http://localhost:5173/?player=prince
npm test -w @vampyre/web
npm run typecheck -w @vampyre/web
```

### Tre lägen

| Läge | Hur | Vad |
|---|---|---|
| Demo | Inga miljövariabler, eller `?demo` | Demokampanjen körs i webbläsaren. `?player=` väljer spelare: `innerCircle`, `prince`, `baron`, `hiddenArchbishop`, `untitled`. |
| Lokal server | `npm run dev:server -w @vampyre/server` och `VITE_DEV_SERVER_URL=http://localhost:8787 npm run dev` | Samma serverlogik som i Supabase, i minnet. Konton `prince@dev` m.fl., lösenord `vampyre` (se `packages/server/scripts/dev-server.ts`). `POST /dev/resolve` löser ronden. |
| Spel | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` i `.env.local` (se `.env.example`) | Inloggning mot Supabase Auth, vyn och inlämningen via edge-funktionen `game` (`supabase/README.md`). |

## Struktur

| Fil | Innehåll |
|---|---|
| `src/screen/model.ts` | Skärmens modell och `PlayerScreenPort`. Det enda komponenterna känner till. |
| `src/screen/viewPort.ts` | Porten mot motorns actionkatalog och kartvy, räknad från `PlayerView`. |
| `src/screen/localPort.ts` | Utvecklingsport: demokampanjen och lokal inlämning (SPEC B1: i spelet gör servern det). |
| `src/server/` | Spelläget: API-klient, inloggning (`auth.ts`), serverporten och `useRoundWatcher` (ny rond). |
| `src/Root.tsx` | Inloggning → kampanj → huvudskärmen från servern. |
| `src/screen/mapModel.ts` | Skalar `PlayerView.map` (bara garanterad information) till kartans rityta. |
| `src/screen/draft.ts` | Rena operationer på actionlistan. |
| `src/components/` | Resursrad, karta, flikmeny, vampyrpanel, actionpanel. |
