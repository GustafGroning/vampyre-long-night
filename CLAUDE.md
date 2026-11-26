# Vampyre: The Long Night

Ett 20-spelar "matrix megagame" i 1920-talets England (World of Darkness). Spelare styr vampyrer från Camarilla, Anarch eller Sabbat och tävlar om VP under 8 ronder. Spelet har hittills spelats manuellt över Discord med en GM. Målet med detta repo är att bygga nästa version, som kan köras utan GM.

Kärnprincip: spelet är en ren funktion, `spelstatus + spelaraktioner -> ny spelstatus`.

## Regler: source of truth

**Google Doc "Vampire the long night 2.0"** är source of truth för reglerna: https://docs.google.com/document/d/1fmMGpOBGNUOeFuGpYrsOYZ6RVUaZWz-SsuZl4IZGTUM/edit. Designern Jakob Ladstedt håller det uppdaterat. Läs det via Google Drive-connectorn.

- När Gustaf ber om en feature står detaljerna (siffror, villkor, ordning) i dokumentet. Läs den relevanta delen där innan du planerar, i stället för att gissa eller bara gå på repots kopior.
- `docs/rules/game_design.txt` är en äldre ögonblicksbild av regelboken och `docs/rules/SPEC.md` är kraven skrivna ur den. Båda kan ligga efter Google Doc:et.
- Prioritet vid konflikt: Google Doc:et, sedan `game_design.txt`, sedan `SPEC.md`. Flagga avvikelsen (i planen eller PR:en, och i `BACKLOG.md` om den inte löses direkt).
- Om Google Doc:et inte går att läsa (connectorn saknas eller är utloggad): säg det till Gustaf, fortsätt med `game_design.txt` och skriv i planen att reglerna inte är kontrollerade mot 2.0.

## Status (2026-11-26)

TypeScript-monorepo med npm workspaces. Motorn, spelservern och spelarens gränssnitt finns och har tester. Spelet är inte färdigt: många aktioners effekter är fortfarande stubbar.

| Del | Var | Läge |
|---|---|---|
| Spelmotorn | `packages/engine` | Ren, deterministisk TS utan beroenden. State, content (klaner, discipliner, titlar, kartor), seedad RNG, rondens skelett (`resolveRound`, pausläge), actionkatalogen, per-spelare-vyer (`buildPlayerView`), karaktärsskapande/backlog. Effekterna byggs i 7 steg (`docs/engine/effects-plan.md`): steg 1 klart, steg 2 delvis, resten stubbar (`stubbedActionIds()`). |
| Spelservern | `packages/server`, `supabase/` | Kör motorn i Supabase-edge-funktionen `game` (esbuild-bundle, genererad, inte incheckad). Logiken (`handle.ts`) går mot ett `Store`-gränssnitt: `MemoryStore` i tester och lokal dev-server, `SupabaseStore` i drift. State lagras som jsonb per kampanj (`game_*`-tabeller, RLS utan policyer, RPC bara för `service_role`). GM-verktyg på kommandoraden: `scripts/gm.ts`. |
| Gränssnittet | `packages/web` | React 19 + Vite + TS. Tre lägen: demo (motorn i webbläsaren), lokal server, spel mot Supabase. Inloggning med e-post + lösenord och "Create account" (självregistrering, ingen e-post igång). Efter inloggning: startsida med kampanjerna man hör till och "Mina vampyrer" (bygga, ändra, ta bort). Huvudskärmen: resursrad, karta, vampyrpanel och actionpanel (dra och släpp, motorns utkastanalys live). Komponenterna ser bara `PlayerView` via `PlayerScreenPort`, aldrig `GameState`. |
| Supabase | projektet "Vampire" | Migrationerna i `supabase/migrations/` körs manuellt av Gustaf (SQL Editor eller CLI), liksom driftsättning av funktionen `game`. Inga skrivande Supabase-connectoranrop från Claude: godkännandet når inte Gustaf. |
| Driftsättning av webben | Netlify, `netlify.toml` | Bygger `packages/web` från roten (workspaces). Spelläget kräver `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` i Netlify; utan dem byggs demoläget. |

Kommandon (i roten, efter `npm install`):

```sh
npm test                                   # alla paket (Vitest)
npm run typecheck                          # tsc --noEmit i alla paket
npm run dev                                # webben, http://localhost:5173/?player=prince (demoläge)
npm run dev:server -w @vampyre/server      # lokal server på :8787, konton prince@dev m.fl., lösen vampyre
npm run build:function -w @vampyre/server  # bundlar edge-funktionen till supabase/functions/game/index.js
bash supabase/tests/run.sh                 # SQL-testerna; kräver Postgres 16 och att man inte är root (su postgres)
```

Varje paket har en README med filkarta: `packages/engine/README.md`, `packages/server/README.md`, `packages/web/README.md`, `supabase/README.md`.

## Beslut som styr koden

- Motorn V1 ska bara ha aktioner som löses automatiskt. Aktioner som kräver GM-bedömning är "not-fixed" och borttagna ur motorn (`docs/engine/not-fixed-actions.md`, ett test vaktar listan). Tärningsslag med seedad slump och spelarens egna val räknas som automatiska.
- Dold information är central: kartan och vyerna visar bara det spelaren garanterat vet, ingen last-known-location. En läcka är en spelbrytande bugg.
- Justicars finns inte i V1. GM tilldelar titel per kampanj. Bara plattformsadmin skapar kampanjer.
- Motorn körs på servern i spelet (SPEC B1). Klienten räknar bara utkastanalys från `PlayerView`.
- Besluten är numrerade och står i `docs/decisions/`: `state.md` (S), `round.md`, `views.md` (V), `catalog.md` (K), `characters.md` (K), `effects.md` (E), `server.md` (P). Läs rätt fil innan du ändrar modellen, och lägg nya beslut där.

## Dokument

| Fil | Innehåll |
|---|---|
| Google Doc "Vampire the long night 2.0" | Reglerna, source of truth (se ovan). |
| `docs/rules/game_design.txt` | Äldre kopia av regelboken i repot. |
| `docs/rules/SPEC.md` | Fullständig spec (regler som krav, plattformsbeslut, öppna beslut i Part C). Stack-oberoende. |
| `docs/decisions/` | Numrerade beslut per område (se ovan). |
| `docs/engine/` | Motorns planer: `001_motorbeslut.md` (M1–M20), rondens skelett, vyer, katalog, karaktärsskapande, effekter, not-fixed-listan. |
| `docs/backend/server-plan.md` | Spelservern och inloggningen (`packages/server`, `supabase/`). Beslut P1–P20 i `docs/decisions/server.md`. |
| `docs/backend/supabase-current-setup.md` | Kartläggning av Supabase-projektet som det såg ut före spelservern. |
| `docs/ui/` | Planer för gränssnittet: huvudskärmen (`main-screen-plan.md`), kartan (`territory-map-integration.md`), vampyrer på kontot och startsidan (`character-backlog-plan.md`). |
| `docs/for_agents/` | Mockup av huvudskärmen (bara UX, ingen styling). |
| `docs/playtest-logs/` | Riktiga spelarloggar (stats, rondresultat, action-listor). Bra exempel på hur spelet faktiskt spelas. |
| `docs/prototype/` | Research och planer från ett tidigare prototypförsök (Vue 3 + Pinia + Supabase). Koden följde inte med; används bara som referens. |
| `BACKLOG.md` | Sidofynd och "Olösta designerfrågor". |

## Arbetssätt

- Svenska i dokument och kommunikation med användaren, engelska för spelets termer (Stealth, Intercept, VP, Blood, Prince osv.).
- Hoppa inte direkt till implementation: research -> plan -> implement -> validera. Spara research och planer som filer i repot så kontexten överlever mellan sessioner (särskilt viktigt i molnsessioner).
- Sidofynd som inte hör till nuvarande scope går i `BACKLOG.md`, inte in i planen.
- Spelmotorn ska vara deterministisk. Allt som regelboken lämnar åt GM:s bedömning ska lösas explicit och spåras i SPEC.md Part C (eller i `docs/decisions/`).
- Ny motorkod i `packages/engine`, ny serverlogik i `packages/server` (mot `Store`, inte direkt mot databasen), ny UI-kod i `packages/web` (bara via porten och `PlayerView`).
- Ändras databasen: ny migration i `supabase/migrations/`, SQL-test i `supabase/tests/`, och säg till Gustaf att den ska köras och att funktionen `game` ska driftsättas om.

## Frågor till designern

Vi har **ingen live-tillgång till spelets lead game designer**. Kolla först om svaret står i Google Doc:et "Vampire the long night 2.0". Pausa inte arbetet för frågor som kräver designerns svar (regeltolkningar, balans, siffror som regelboken inte ger):
1. Välj ett provisoriskt, spårbart standardval och bygg vidare på det.
2. Skriv frågan under "Olösta designerfrågor" i `BACKLOG.md`, med ditt provisoriska val och var det finns i koden/besluten.
3. Nämn frågan för Gustaf, men vänta inte på svar.

Frågor om ren logik, kod och arkitektur kan Gustaf svara på direkt.

## Hemligheter

Committa aldrig `.env`, Supabase-nycklar eller andra credentials.
