# Backlog

Sidofynd som inte hör till pågående scope. Skriv var fyndet gjordes.

## Olösta designerfrågor (unresolved)

Frågor som bara lead game designern kan svara på. Designern är inte tillgänglig live (se CLAUDE.md), så arbetet fortsätter med det provisoriska valet. Format: fråga, provisoriskt val, var det används.

- [ ] **Röster för exponerad Sabbat/Archbishop i Vampiric Society.** Provisoriskt 0 (Archbishop-titelns värde i `content/titles.ts`). Används i `baseSocietyVotes`, beslut V18 i `docs/decisions/views.md`. — hittad under: kartvyn (PR #7)
- [ ] **Röster för Anarch-titlar (Baron) i Vampiric Society.** Provisoriskt 0 (content), medan en Anarch utan titel har 1, vilket är bakvänt. Används i `baseSocietyVotes`, beslut V18. — hittad under: kartvyn (PR #7)
- [ ] **Royal Privileges: får en Prince spendera flera i samma rond?** gd:923 säger "spend a royal privilege to gain 1 extra action for a round". Provisoriskt ja, +1 action per spenderad (motorns `budgetFrom`, M6 i `docs/engine/001_motorbeslut.md`). UI:t tillåter upp till innehavet (`RoyalPrivilegeControl` i `packages/web/src/components/ActionPanel.tsx`). — hittad under: Royal Privileges i UI

## Motorbeslut (hittat under `docs/engine/001_motorbeslut.md`)

- [ ] **Kartdata saknas/motsägelsefull.** `docs/prototype/plans/001_map_improvement.md` listar 37 adjacency-par men säger 36; `007_campaign_setup.md` säger 34. Startvärden per stad (blood flow, stability, MS, intercept) och sea region per hamn finns inte i repot (prototypens `seed.js` följde inte med). Måste bekräftas med GM innan British Isles-kartan blir standardmall (SPEC Part C #14). — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Regelboken säger emot sig själv om ≥/>** vid intercept mot stealth (gd:114/115/925 vs gd:498/913). Provisoriskt ≥ (M16). Rätta regelboken när Gustaf bekräftat. — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Rundbreakdown i regelboken numrerar income-fasen som 4a–4c** (gd:955–957) och end-of-round hoppar från 4c till 4e. Kosmetiskt, men bör rättas. — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Klan-synlighet:** prototypens backlog funderade på att dölja klan. Provisoriskt publikt (M2). — hittad under: docs/engine/001_motorbeslut.md

## State och typer (hittat under `docs/decisions/state.md`)

- [ ] **Regelbokens stavning av artefakter** (gd:411, 420, 422, 426): Vispers in a bottle, Ring of Tremer, Scepter of Venture, Ravanos boots. Normaliserat i koden (S18); rätta regelboken.
- [ ] **Kopierad text i Baron-avsnittet** (gd:551): "Princes can build influence in cities they control" står under Barons. Troligen kvar från Prince-avsnittet.
- [ ] **Rule of Three och avdrag** (gd:530): regeln nämner bara bonusar. Bekräfta att avdrag (Banu Haqim −1, Seduction −1) inte kapas (S7).

## Ronden (hittat under rondens skelett, `docs/engine/round-skeleton-plan.md`)
- [ ] Riktiga aktionseffekter: pågår i `src/effects/` (plan `docs/engine/effects-plan.md`). `stubbedActionIds()` listar det som återstår.
- [ ] Faserna 2a–2c, 4a–4d och 5a–5c är tomma krokar: contest-straff, storm, masquerade-kaskad, Ventrue +10, klan-curses, missions, Archon-loyalty, start-of-turn-VP. (Income från städer, bleeds och aktioner, 5a–5c, är byggt: E9–E11.)
- [ ] Fight for Control-strider som löses i fas 4a nästa rond (spänner över rondgränsen).
- [ ] Pending choices för målet (M8): fight/flee, acceptera Invite, återvända till contestad stad.
- [ ] Klanregler som påverkar budget eller Trifle: Lasombra (ingen Trifle om mindre blood än förra ronden), Tremere (enda Thaumaturgy kostar ingen action), Salubri (en Give per rond).
- [ ] Bränd minion kan lämna dinglande referenser (strider, effekter, Follow Them). Behöver en gemensam `burnMinion` i state när de modellerna används.
- [ ] Brujah-rabatt mitt i ronden ska återbetalas i fas 5 (M7).
- [ ] `ActionDefinition` är data + TypeScript-handler; utvärdera "data + effektprimitiver" (SPEC B11) när några aktioner byggts (R19).
- [ ] Per-spelare-vyer ska filtrera `RoundResolution.events` (steg 4). Events saknar ännu `audience` (M18).

## Vyer (hittat under `docs/engine/views-plan.md`)
- [ ] **Världseffekter i vyn:** `OngoingEffect` utan ägare (debattutfall m.m.) syns inte för spelare. Behöver ett publik-fält på effekten (V13).
- [ ] **Torpor publikt eller dolt?** Provisoriskt dolt (V4). Bekräfta mot hur Discord-spelet gjorde.
- [ ] **Vy av en pausad strid:** `RoundResolution` under `awaitingCombat` har ingen spelarvy. Byggs med combat.
- [ ] **Avslöjande aktioner:** Investigate, Search, Auspex m.fl. ska kunna göra dolda fält synliga för en spelare. Behöver en modell för "känd information" per spelare när aktionerna byggs.
- [ ] **Kartan och strider/mål:** den som ser X attackera Y i A, eller är part i en strid, får inte Y/motståndaren på kartan än (V17). Bestäm när strid och Attack byggs. — hittad under: kartvyn (V15–V19)
- [ ] **Debatterna heter fortfarande Ivory Tower** i koden (V9, `content/titles.ts`) och ska byggas om till Vampiric Society där alla sekter röstar. Röstfrågorna står under "Olösta designerfrågor". — hittad under: kartvyn (V18)
- [x] **Move/Sail behöver `destination` och `targets`** (V16). Löst i katalogen: `targets` läses från valen och `destination` härleds från `moves` (K21). — hittad under: kartvyn
- [ ] **Motsägelse om controller-sikt:** gd:115 säger "target and originate", gd:498 "against or in". Tolkat som samma sak (startstad + målstäder).

## Karaktärsskapande (hittat under `docs/decisions/characters.md`)
- [ ] **Ring of Tremere är avstängd** (K14): den ligger inte i slumppoolen eftersom man ska välja disciplin när man får den (gd:420). Hitta ett sätt att hantera valet (startartefakt, Search, My treasure, stöld) och slå på den igen.
- [ ] **Toreador-obsession** (C8) dras fortfarande inte vid kampanjstart.

## Actionkatalog (hittat under `docs/decisions/catalog.md`)
- [ ] **Bundna discipliner:** Ring of Tremere och (M)Thaumaturgy-skapade artefakter har ingen aktion i katalogen; inte heller artefaktaktioner som (M)Thaumaturgy gett permanent (`grantedArtifactActions`) (K15).
- [ ] **Hide and Spy** ska spärra minionens action nästa rond (gd:296). Kräver att förra rondens aktioner sparas.
- [ ] **Martinelli's Ring** ska ta bort Dementation så länge man bär den (gd:395).
- [ ] **(M)Presence-stealth** ska vara den valda aktionens; observationen läser idag `def.stealth` (0) (K9).
- [ ] **Känd information i målval:** när motorn vet vad en spelare garanterat vet (kartvyn), sortera kända mål "i samma stad" överst (K3).
- [ ] **Regelbokens rubrik "Bottles wealth of the camarilla"** (gd:1047) ska vara Bottomless Wealth. "Presens"/"Pressens" och "Visisetude" är också felstavade.
- [ ] **Dold aktör per aktion:** Gustaf 2026-11-19: vissa actions har en gömd aktör (man får veta att något hänt men inte vem, om man inte lyckas med en rullning), och det skiljer sig mellan actions. Regelboken säger inte vilka. Lägg ett fält på `ActionDefinition` (t.ex. `actorHidden`) i katalogen och låt observationen (`observersOfAction`) läsa det, när listan över vilka actions det gäller finns.

### Olösta designfrågor från actionkatalogen (väntar på lead game designer)
Designern är inte tillgänglig live (Gustaf 2026-11-19). Motorn bygger på det provisoriska valet tills vidare.
- [ ] **Unresolved: mål "i samma stad" (K3).** Ska dropdownen för Attack!, Diablerie, Dominate m.fl. lista alla vampyrer och minions (provisoriskt, läcker inga positioner) eller bara de spelaren vet är där?
- [ ] **Unresolved: (M) Presence (K9).** Får den utföra andra sekters faction actions utan titelkrav? Provisoriskt ja.
- [ ] **Unresolved: Thaumaturgy bas (K10).** Får man ge vilken disciplin som helst, eller bara en man själv har? Provisoriskt vilken som helst.
- [ ] **Unresolved: upprepade val (K11).** Får Anarch Revolt, Build on the Master's Kingdom och Organize Resistance välja samma effekt flera gånger? Provisoriskt ja.
- [ ] **Unresolved: not-fixed-actions** (`docs/engine/not-fixed-actions.md`): Wait and Strike, Dementation, (M) Dementation, Investigate, Investigate Eye, Troublemaker, Orders from the Top, Crown of Malkav och Hunt for Me ska byggas om så att de kan lösas utan GM.
- [ ] **Unresolved: missions är borttagna ur spelet** (Gustaf 2026-11-19). Recruit an Archon, Archon-loyalty (gd:332) och Justicar-VP behöver nya regler.
- [ ] **Unresolved: Chimerstry och (M) Chimerstry** byggs om.

### Olösta designfrågor från effekterna (väntar på lead game designer)
Beslut i `docs/decisions/effects.md`, kod i `packages/engine/src/effects/`.
- [ ] **Unresolved: Bleed i okontrollerad stad (E6).** gd:1138 ger 2D10×5 i egen domän och 1D10×5 i "another vampire's domain". Provisoriskt 1D10×5 i alla städer som inte är ens domän, även okontrollerade. — `bleed` i `src/effects/index.ts`
- [ ] **Unresolved: tak för bleed (E7).** Gäller "can't gain more than the city's blood flow" alla bleeds? Provisoriskt ja (Bleed the Enemy, Aaron's Feeding Razor m.fl.). — `bleedCity` i `src/effects/blood.ts`
- [ ] **Unresolved: Picky eater (E8).** Bara aktionen Bleed, och staden tappar hela beloppet medan spelaren får 10 mindre? Provisoriskt ja. — `bleedPenalty` i `src/effects/index.ts`
- [ ] **Unresolved: controller i torpor (E10).** Får man stadens blood flow i torpor? Provisoriskt ja. — `payCityIncome` i `src/effects/income.ts`
- [ ] **Unresolved: Hide och Rule of Three (E15).** Hide säger +5 stealth men Rule of Three max +3 per källa. Gustaf 2026-11-19: behåll +5 tills vidare, men fråga designern om det var avsikten. Rule of Three gäller actions enligt gd:532 (Protean-exemplet). — `hide` i `src/effects/index.ts`

## Effekter (hittat under `docs/engine/effects-plan.md`)
- [ ] **Blood för förlorad stad:** "If you lose control of a city you will gain the city's full blood flow at the start of the next round" (gd:521–522). Byggs när något kan byta controller (steg 5).
- [ ] **Summon the Storm** ska ge storm *från nästa rond*. `SeaRegion.storm` har bara `untilEndOfRound`, så en storm som sätts under ronden blockerar Sail redan samma rond. Behöver en startrond (eller en OngoingEffect som sätter stormen i fas 2). Byggs med Summon the Storm (steg 2).
- [ ] **Brujah m.fl. klan-curses som rör blood** (Decadence −5, Ventrue wealth +10, Gangrel/Tzimisce-förluster) dras inte än. Byggs i steg 7; Picky eater och Monstrous är redan med eftersom de hör till Bleed och Move.
- [ ] **`bloodAtEndOfLastRound`** sätts aldrig. Lasombra-cursen (gd:785) behöver det. Sätt det i fas 5d när klanreglerna byggs.
- [ ] **Nosferatus boon (Always listening)** ska ge +1 intercept när de gör Obfuscate, Hide eller In the Shadows (gd:803). Byggs med klanreglerna (steg 7).

## Spelarens gränssnitt (hittat under Royal Privileges i UI)
- [ ] **Royal Privileges förbrukas även när de inte ger en action.** Motorn (`royalPrivilegesSpent`) drar det begärda antalet även om ett tak (torpor, Invite to the Camarilla) gör att de inte ger någon action. UI:t stoppar plus-knappen vid `maxUseful` och varnar, men motorn borde kanske klampa mot taket. Logikfråga till Gustaf.
- [ ] **Inlämnade Royal Privileges vid omladdning.** När serverporten returnerar en inlämnad lista måste den också returnera `royalPrivilegesToSpend`, annars visar panelen 0. Hör till serverkopplingen.

## Spelservern (hittat under `docs/backend/server-plan.md`, beslut P1–P20)
- [ ] **GM-gränssnitt i webben.** Idag skapas kampanjer, konton och upplösning med `packages/server/scripts/gm.ts`.
- [ ] **Pausad upplösning (strid) kan inte återupptas.** `gm_resolve` sparar `RoundResolution` och sätter ronden till `suspended`, men det finns ingen operation för interrupt-svar och `continueResolution`. Byggs med combat (B6).
- [ ] **Automatisk upplösning vid deadline** (M10): kräver `pg_cron` + `pg_net` eller en schemalagd funktion. Idag löser GM.
- [ ] **Realtime i stället för polling** (P6). Kräver en tabell per spelare som får läsas, t.ex. en "ny rond"-signal utan innehåll.
- [ ] **Content per kampanj** (B4): server och klient använder `DEFAULT_CONTENT`.
- [ ] **Invites:** spelare kopplas med e-post av GM (`gm_assign`). Den gamla `invites`-tabellen används inte.
- [ ] **Osparat utkast mellan omladdningar:** bara den inlämnade listan finns kvar. Ett halvfärdigt utkast försvinner.
- [ ] **Gamla tabeller i Supabase** (`characters`, `rounds`, `actions`, `combats` m.fl.) och funktionerna `submit_action`, `gm_advance_round`, `create_campaign_with_gm` används inte och läcker via RLS om de fylls. Ta bort eller stäng när Gustaf ok:at.
- [ ] **Migrationerna från juni 2026** finns bara i projektet (`supabase_migrations.schema_migrations`), inte som filer. Hämta in dem så att `supabase db reset` fungerar lokalt.
- [ ] **Deadline syns inte på första sidan** (gapanalysen 2A/11). Servern skickar `window.deadline` i `screen`, men UI:t visar den inte.
- [ ] **Latent fel i `ActionComposer`:** text-steget anropar `onDone` två gånger (rad ~98). Ingen action har text-parametrar just nu (Chimerstry är borttagen), så det går inte att återskapa i gränssnittet. Kontrollera när en text-action kommer tillbaka.
- [ ] **Gå med i en kampanj med en vampyr från kontot** (lobbyn, K12). Motorn har `lobby.ts`/`setup.ts`, men ingen serveroperation eller UI kopplar backloggen till en kampanj än. Idag kopplar GM en färdig spelare med `gm_assign`.
- [ ] **Lösenordsåterställning och e-post** kräver egen SMTP i Supabase (P20). Tills dess: admin byter lösenord i dashboarden.
- [ ] **Självregistrering är öppen för alla som hittar sidan** (P20). Inför skarp drift: stäng "Allow new users to sign up" eller lägg till inbjudningskod/CAPTCHA.
- [ ] **GM utan spelare har ingen vy i webben** (P18): startsidan visar kampanjen men inget att öppna. Hör ihop med GM-gränssnittet ovan.
