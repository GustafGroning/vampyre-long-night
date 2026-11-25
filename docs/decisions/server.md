# Beslut: spelservern och inloggningen (P1–P15)

Plan: `docs/backend/server-plan.md`. Provisoriska tills Gustaf har granskat dem. Inga av dem kräver designern (ren plattform och logik).

| # | Beslut | Varför | Var |
|---|---|---|---|
| P1 | **State som jsonb-dokument** per kampanj (väg 1 i kartläggningen). Nya tabeller `game_states`, `game_rounds`, `game_submissions`, `game_round_events`. De gamla generiska tabellerna lämnas orörda. | Motorn är `GameState` som ren JSON med atomisk commit (B1). Ingen mappning fält för fält. Databasen är tom, så inget att migrera. | `supabase/migrations/20261121170000_game_server.sql` |
| P2 | **En edge function, `game`**, för alla operationer. Motorn bundlas in med esbuild från `packages/server`. | Motorn ska bara köras på servern (B1). En bundle undviker Denos `.js`→`.ts`-problem och delar kod med testerna. | `packages/server/src/edge.ts`, `npm run build:function` |
| P3 | **Inloggning med e-post + lösenord** (Supabase Auth). Konton skapas av plattformsadmin (`admin_create_user`, `email_confirm: true`); ingen självregistrering. | Supabase standard-SMTP skickar bara till projektets egna medlemmar, så magic link och bekräftelsemejl fungerar inte utan egen SMTP. 20 spelare per kampanj är lätt att skapa för hand. **Fråga till Gustaf** om annan metod (magic link, Discord-OAuth). | `packages/web/src/server/auth.ts`, `handle.ts` |
| P4 | **`campaign_members.player_id`** kopplar användare till motorns `PlayerId`. Unik per kampanj; att koppla en ny användare till en spelare tar bort den gamla kopplingen. | Kartläggningen pekade ut `campaign_members` som rätt plats. Klienten anger aldrig vilken spelare den är. | migrationen, `game_assign_member` |
| P5 | **Confirm = spara + låsa** i ett anrop (`submit`). "Ändra" = `unlock`, listan finns kvar. Ogiltig lista sparas inte alls. | Samma beteende som demoläget och motorns `submitActions` (avvisar hela listan). | `handle.ts` |
| P6 | **Ny rond upptäcks genom polling** av `status` var 30:e sekund och när fliken blir synlig igen. Ny rond eller fas laddar om skärmen och nollställer listan. | Enklast som fungerar. Realtime kräver en publicerad tabell som spelare får läsa, vilket inte finns (P11). Realtime i BACKLOG. | `packages/web/src/server/useRoundWatcher.ts` |
| P7 | **Inlämnad lista byggs tillbaka i klienten** (`restoreDraft`): radtexterna räknas fram genom att spela upp `nextParam` mot vyn. Servern sparar bara motorns `Submission`. | Ingen klientdata (visningstexter) i databasen, och texterna blir alltid samma som när man valde. | `packages/web/src/screen/viewPort.ts` |
| P8 | **Upplösningen:** GM anropar `gm_resolve`. Servern stänger ronden atomiskt (`open → closed`), löser, och sparar ny state, events och nästa rond i en transaktion med versionskontroll. Misslyckas något öppnas ronden igen. Inlämning håller radlås mot stängningen. | B1: atomisk commit, ingen halvskriven rond, ingen dubbel upplösning. | `handle.ts`, `game_close_round`, `game_commit_round` |
| P9 | **Deadline** sätts när en rond öppnas: `deadlineHours`, standard 72 timmar. Ingen automatisk upplösning vid deadline än; GM löser. | Motorn har ingen klocka (M10). Siffran är en plattformsinställning, inte en regel. **Fråga till Gustaf** om standardvärdet. | `DEFAULT_DEADLINE_HOURS` |
| P10 | **Seed** slumpas på servern (128 bitar, Web Crypto) när en rond öppnas och ligger bara i `game_rounds`. | M9: seeden är dold. | `runtime.ts` |
| P11 | **Spelare läser aldrig speltabellerna.** RLS på, inga policyer, `revoke` från `anon`/`authenticated`, och RPC-funktionerna är bara körbara av `service_role`. All läsning går via servern och `buildPlayerView`. | B3: data-lagret är ena försvaret, motorns vy det andra. Kartläggningen visade att de gamla policyerna läckte. | migrationen, `supabase/tests/game_server.test.sql` |
| P12 | **INSERT-hålet på `campaign_members` täpps till:** policyn som lät vem som helst lägga in sig själv (även som gm) ersätts med "bara gm". | Annars kunde vem som helst bli GM i en kampanj och lösa ronder. | migrationen |
| P13 | **`SupabaseStore` använder bara `fetch`** mot PostgREST-RPC och Auth, inga npm-beroenden. | Samma kod i Deno och Node, och bundlen blir liten. | `supabaseStore.ts` |
| P14 | **Vyn räknas vid varje laddning** (`buildPlayerView` med förra rondens events) i stället för att förberäknas och sparas per spelare. | Samma resultat som B3:s förberäknade uppdateringar, eftersom state och events inte ändras mellan upplösningar, men ingen extra tabell att hålla i synk. Byts om laddningen blir för långsam. Avvikelse från SPEC B3 ("precomputed and stored"). | `handle.ts` (`screen`) |
| P15 | **Bara plattformsadmin skapar kampanjer** (`gm_create_campaign`); GM i kampanjen kopplar spelare och löser ronder. | Kontoskapande och kampanjskapande ska inte vara öppet för alla inloggade. Använder befintliga `user_roles`/`has_role`. | `handle.ts` |

## Utanför beslutet

- Den gamla `rounds.rng_seed` och övriga gamla tabeller rörs inte. De används inte av servern. Städning i BACKLOG.
- Content per kampanj (B4) finns inte: både server och klient använder `DEFAULT_CONTENT`.
