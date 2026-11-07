# Beslut: spelets state och typer

**Datum:** 2026-11-07
**Status:** Provisoriska. Fattade av Claude utan Gustafs input (Gustaf offline). Varje beslut är ett standardval som motorn byggs mot och kan ändras.
**Kod:** `packages/engine/src/state/`, `packages/engine/src/content/`, `packages/engine/src/rng.ts`
**Bygger på:** `docs/engine/001_motorbeslut.md` (tråden "Förbered bygget av spelmotorn"), särskilt M1, M2, M3, M6, M9, C14 och avsnittet "Modellprinciper". Där det dokumentet redan bestämt något upprepas det inte här, bara hur det implementerats.

Regelboksreferenser anges som `gd:NNN` (radnummer i `docs/rules/game_design.txt`).

## Snabböversikt: de beslut som mest troligt behöver din granskning

| # | Fråga | Valt | Varför det spelar roll |
|---|---|---|---|
| S7 ✅ | Hur räknas Rule of Three? | Per källa: bonusar från samma källa summeras och kapas på +3. Avdrag kapas inte. Även permanenta bonusar (EXP, skapande, Diablerie) är källor. | Påverkar varje stat i spelet. "Greater strength max +3" blir samma regel som Rule of Three. |
| S8 ⏸️ | Räknas Scepter of Ventrues +1 level in i upkeep? | **Nej**, upkeep räknas på minionens egen level. | Regelboken säger inte. Annars blir artefakten en kostnad. |
| S16 ✅ | "Första violation i en Camarilla-stad ger ingen blood hunt": första i kampanjen eller per stad? | **En gång per kampanj.** | Per stad skulle ge Camarilla ett gratis-violation i varje stad. |
| S14 | Vad händer med brända saker i state? | Minions och artefakter tas bort. Vampyrer ligger kvar med `status: 'burned'`. | Avgör hur historik och referenser fungerar. |
| S12 | Standardkartan | British Isles finns som **provisorisk** mall med gissade startvärden och havsregioner. Tester använder en syntetisk karta. | Kartan måste bekräftas innan den används i spel. |

---

## Struktur

### S1. Paket och verktyg
**Beslut:** npm workspaces i roten, motorn i `packages/engine` (`@vampyre/engine`). TypeScript `strict` plus `noUncheckedIndexedAccess` och `exactOptionalPropertyTypes`, ESM, Vitest. Inga runtime-beroenden. Paketet exporterar TypeScript-källan direkt (inget byggsteg ännu); konsumenter (server, UI) kompilerar den själva.
**Mappar:** `src/state/` (typer, frågor, validering, skapande), `src/content/` (referensdata), `src/rng.ts`. Rondtråden äger `src/round/`.
**Motivering:** M1. De extra strikta flaggorna fångar `undefined` vid uppslag i `Record`, vilket är den vanligaste buggen i en motor där allt slås upp på id.

### S2. State är ren, oföränderlig JSON
**Beslut:** `GameState` innehåller bara JSON-värden (inga klasser, `Map`, `Set`, `Date`, `undefined`). Alla fält är `readonly` i typerna. Funktioner som tar ett state ändrar det aldrig; motorn gör en arbetskopia (`cloneJson`) och muterar den via typen `Mutable<T>`.
**Motivering:** Modellprinciperna i 001. Readonly-typer gör att en funktion som av misstag muterar indata inte kompilerar. `canonicalJson` (sorterade nycklar) gör det möjligt att jämföra två states byte för byte, vilket SPEC B1 kräver.

### S3. Content är separat, men kartan kopieras in i state
**Beslut:** Klaner, discipliner, titlar, minion-typer, artefaktdefinitioner och regelkonstanter (`RulesConfig`) ligger i `Content` och skickas in som argument. Kartan är en `MapTemplate` i content, men **instansieras in i state** när kampanjen skapas: varje `City` har sina grannar, hamnstatus och havsregioner.
**Motivering:** SPEC B4/B11 vill att content är data som kan justeras per kampanj. Kartan är annorlunda: GM redigerar den per kampanj (SPEC B8) och upplösningen läser grannskap hela tiden, så den hör till kampanjens state. Content kan då delas mellan kampanjer oförändrat.
**Även regelkonstanter** (max ronder, Rule of Three-taket, EXP-taket 12, contest-kostnad 50 m.fl.) ligger i content så att de kan justeras utan kodändring.

### S4. Id:n
**Beslut:** Genererade id:n har formen `<typ>-<n>` (`player-1`, `minion-12`) och tas från räknare i `state.counters` med `takeId`. Städer och havsregioner använder kartmallens nycklar (`london`, `irish_sea`). Id-typerna är "brandade" i TypeScript, så en `MinionId` kan inte skickas där en `PlayerId` krävs.
**Sortering:** `sortedIds` och `compareIds` sorterar löpnummer numeriskt (`minion-2` före `minion-10`), annars i kodpunktsordning (inte `localeCompare`, som kan bero på miljön). Sorterad ordning blir alltså skapandeordning, vilket regler som "nyast först" (M7) kan använda.
**Motivering:** Deterministiska id:n (001). Läsbara stads-id gör testerna och loggarna begripliga.

### S5. Härledda värden lagras inte
**Beslut:** Följande räknas fram i `src/state/queries.ts` i stället för att lagras: VP (summan av `vpLedger`), domän, stadens sekt, effektiva stats för vampyrer, minions och städer, aktionsbudget och Ivory Tower-röster.
**Motivering:** Ett värde som lagras på två ställen kommer förr eller senare att skilja sig. VP-ledgern ger samtidigt spårbarheten som SPEC A13 kräver.

## Slump

### S6. RNG: sfc32 seedad med cyrb128
**Beslut:** `createRng(seed)` hashar seed-strängen med cyrb128 till 128 bitar, kör sfc32 och kastar de 15 första värdena. Tillståndet (`getState()`) är fyra uint32 och kan sparas som JSON och återupptas med `restoreRng`. `int(min, max)` använder rejection sampling (ingen modulo-bias). Delströmmar skapas med `deriveSeed(base, ...delar)`, där delarna JSON-kodas så att `('a/b')` och `('a', 'b')` inte krockar.
**Verifiering:** De första värdena för seed `vampyre` är kontrollerade mot bryc:s referensimplementation och ligger som snapshot i `test/rng.test.ts`. Ändras de har algoritmen ändrats, vilket bryter replays av gamla kampanjer.
**Alternativ som valdes bort:** mulberry32 (bara 32 bitars tillstånd, kortare period); xoshiro128** (likvärdig, men sfc32 är enklare och snabbare i JavaScript); `Math.random` (inte seedbar).
**Motivering:** M9. Bara 32-bitars heltalsaritmetik, så resultatet är identiskt på alla JavaScript-motorer.

## Spelare och stats

### S7. Stats och Rule of Three
**Status:** ✅ Bekräftat av Gustaf 2026-11-07, med en ändring: **Diablerie har ingen gräns** (undantag från Rule of Three, som Charge). Startuppgradering och EXP är olika källor (+4 möjligt). Avdrag kapas inte.
**Beslut:**
- En vampyrs basvärde i varje stat är **0**. Allt annat, även permanenta bonusar, är `StatModifier { stat, amount, source, expiresAfterRound }`. Permanenta har `expiresAfterRound: null`.
- Källor namnges `<typ>:<nyckel>`: `creation:stat_upgrade` (startuppgraderingen +1), `exp:greater_strength` / `exp:unseen` / `exp:eyes_of_the_night`, `diablerie`, `clan:banu_haqim`, `discipline:protean`, `artifact:black_gloves`, `action:blood_for_blood` osv.
- **Effektivt värde = bas + Σ per källa min(källans summa, 3).** Inom en källa nettas bonus och avdrag först.
- **Avdrag kapas inte.** Regeln säger "never gain more than +3" (gd:530) och säger inget om avdrag.
- Strength köpt i Charge (gd:162) och bonusar från Diablerie har `ignoresRuleOfThree` och läggs till okapat.
**Konsekvenser:**
- EXP-uppgraderingens "max +3 from this upgrade" (gd:857–859) följer automatiskt: tre köp med samma källa ger +3, ett fjärde ger inget. Validering vid köp (att inte låta någon betala för en meningslös fjärde) hör till skapandeflödet.
- Startuppgraderingen "+1 in any stat" och EXP-köpet "Greater strength" är **olika källor**. En Prince kan alltså ha +1 (skapande) + 3 (EXP) = +4 Strength.
- Diablerie (+1 för resten av spelet, gd:1173) har **ingen gräns**: varje lyckad Diablerie ger +1, utan tak (Gustaf 2026-11-07).
**Öppet:** (M)Protean "rearrange your basic stats" (gd:1252). Med basvärde 0 betyder "basic stats" här summan av permanenta modifiers. Hur omfördelningen representeras bestäms när aktionen byggs.

### S8. Minions stats och upkeep
**Status:** ⏸️ Pausad av Gustaf 2026-11-07 (om Scepter of Ventrue höjer upkeep). Provisoriskt beslut gäller tills vidare.
**Beslut:** En minions bas i alla tre stats är dess **effektiva level** (gd:215): level plus Scepter of Ventrue (+1, max 3). En buren artefakts minionbonus (t.ex. Fog Flute +1 stealth) är en egen källa. **Upkeep räknas på minionens egen level**, utan Scepter.
**Motivering:** Regelboken säger inte om Scepter höjer upkeep. Att det inte gör det håller artefakten som en ren bonus.

### S9. Förklädnad och titlar
**Beslut:** `Player.faction` och `Player.title` är de **sanna** värdena. En dold Archbishop har `faction: 'sabbat'`, `title: 'archbishop'` och `disguise: { title: 'prince' | 'baron', faction }`. Exponering = `disguise` sätts till `null`. Hjälpfunktioner:
- `apparentTitle` / `apparentFaction`: vad omvärlden ser.
- `actingTitle`: titeln som styr titelaktioner och budget. Dold Archbishop = förklädnaden (gd:635), exponerad = Archbishop.
- Ivory Tower-röster följer skenbar sekt och titel: en Archbishop förklädd till Prince har 2 röster, förklädd till Baron 0.
**Motivering:** De sanna värdena behövs för Sabbat-regler och vy-filtrering, de skenbara för allt annat. Att lagra båda som separata fält gör att vy-lagret aldrig behöver räkna ut något för att dölja identiteten (M2).

### S10. Domän
**Status:** ⚠️ Domän för titellösa är olöst, hör ihop med M6 (Gustaf 2026-11-07).
**Beslut:** `domainCityIds` följer gd:534: Prince, Baron och Archbishop har kontrollerade städer; Justicar och Inner Circle har alla Camarilla-städer (stadens sekt enligt M3). En vampyr **utan titel** har sina kontrollerade städer som domän, i praktiken oftast ingen.
**Motivering:** Regelboken säger att alla vampyrer har en domän men definierar den inte för titellösa.

### S11. Fält på spelaren som regler kräver
**Beslut:** Utöver det rondtråden behöver finns: `bloodAtEndOfLastRound` (Lasombra-cursen), `hasCommittedDiablerie` (Sword of Judgment, Banu Haqim), `obsession` (Toreador, C8), `temporaryDisciplines` (Thaumaturgy, Vial of Elder Blood), `grantedArtifactActions` ((M)Thaumaturgy), `bloodHunt`, `scoredCities` (once-per-city VP per spelare och stad) och `actionBudgetModifiers` (Call a Crusade, Invite to the Camarilla; formen är rondtrådens).
`Player.exp.spentTotal` har taket 12 (gd:861) som invariant.

## Städer och karta

### S12. Kartor
**Beslut:**
- `TEST_MAP`: syntetisk karta med fem städer och två havsregioner, där varje stad har olika startvärden så att förväxlade fält syns i tester. Alla tester använder den (C14).
- `BRITISH_ISLES_MAP`: de 18 städerna och de **37** grannparen ur `docs/prototype/plans/001_map_improvement.md`, märkt `provisional: true`. Kartan är sammanhängande över land (testat).
- **Startvärden är gissade:** prototypens databasdefaults (stability 3, MS 3, intercept 1, blood flow 100) för alla städer.
- **Havsregioner är gissade** utifrån geografin; källorna saknar dem helt. En hamn kan ligga vid flera regioner:

| Region | Hamnar |
|---|---|
| North Sea | Edinburgh, Middlesbrough, London |
| Irish Sea | Glasgow, Belfast, Dublin, Liverpool, Waterford, Cardiff |
| Atlantic | Donegal, Galway, Cork |
| English Channel | London, Cardiff, Cork |

**Motivering:** Kartan behövs som data för UI och manuell testning, men får inte förväxlas med bekräftade värden. Flaggan `provisional` gör det synligt i koden.

### S13. Contest och controller
**Beslut:** En contested stad **behåller** sin `controllerId` (gd:507: "not uncontrolled"). Contestants ligger i en egen sorterad lista med `sinceRound`. Controllern kan inte stå bland sina egna contestants. En okontrollerad stad kan ha contestants (Conquer New Territory).

### S14. Brända entiteter
**Beslut:** När en **minion** eller **artefakt** bränns tas den bort ur state; historiken finns i rondens events. En bränd **vampyr** ligger kvar med `status: 'burned'` och `location: null`.
**Motivering:** Brända vampyrer behövs för slutpoäng (0 VP), Soul Gem of Etrius (gd:438) och för att spelarlistan ska vara stabil. För minions och artefakter skulle en `burned`-flagga betyda att varje regel måste filtrera bort dem, vilket är lätt att glömma.
**Invariant:** en bränd vampyr kan inte kontrollera städer, bära artefakter eller äga minions.

### S15. Stadsstats och tillfälliga ändringar
**Beslut:** `City.stability`, `masquerade`, `intercept` och `bloodFlow` är permanenta värden. Tillfälliga ändringar (Free Press, Fog Flute, Bleed, Shovelhead −25 i 2 ronder) är `CityModifier` med källa och slutrond. `cityStat` lägger ihop och klämmer stability och MS till 0..5, intercept och blood flow till ≥ 0.
**Konvention för varaktighet:** `expiresAfterRound` = **sista ronden effekten gäller**; `null` = permanent eller tills den tas bort. Samma konvention för stat-modifiers, problems/specials och pågående effekter.

### S16. Camarillas första violation
**Status:** ✅ Bekräftat av Gustaf 2026-11-07: en gång per kampanj.
**Beslut:** "The first time a masquerade violation triggers in a Camarilla city no blood hunt is called" (gd:915) gäller **en gång per kampanj**, inte en gång per stad. Spåras i `state.flags.camarillaViolationGraceUsed`.
**Motivering:** Läsningen "the first time" i bestämd form talar för en enda händelse. Per stad skulle göra violations nästan riskfria för Camarilla.

### S17. Sabbat-baser ligger utanför städerna
**Beslut:** Baserna ligger i `state.sabbat.bases`, inte på `City`.
**Motivering:** M2: allt på `City` är publikt. Med baserna i ett eget fält kan vy-lagret allowlista hela stadsobjektet utan risk.

## Artefakter, minions och övrigt

### S18. Artefakter
**Beslut:**
- Alla 30 artefakter finns som data med kostnad, stealth, minionbonus (strukturerad), `burnsOnUse`, om de får användas i torpor, om de är gratisaktioner och om de ingår i slumppoolen.
- **Namn normaliserade** mot regelbokens stavfel: "Ring of Tremer" → Ring of Tremere, "Ravanos boots" → Ravnos Boots, "Vispers in a bottle" → Whispers in a Bottle, "Scepter of Venture" → Scepter of Ventrue.
- En extra definition, `thaumaturgic_creation`, för artefakter som skapas med (M)Thaumaturgy (gd:1270). Den ingår inte i slumppoolen.
- `Artifact.boundDiscipline` krävs för Ring of Tremere och skapade artefakter, och är förbjuden för övriga.
- `Artifact.holder` är en spelare, minion, NPC, stad (ligger och kan hittas) eller `pool` (inte utdelad, för slumpdragning). Platsen räknas fram via bäraren. En minion bär högst en artefakt (invariant).

### S19. Minions
**Beslut:** `Minion.owner` är `{ kind: 'player' | 'npc', id }`, eftersom regelboken och playtest-loggen har NPC-minions (King George V:s minions, gd:964 "vampire or NPC"). `acquiredRound` (0 = vid start) styr att upkeep inte betalas samma rond (gd:217). `loyaltyCounters` är satt för Archons och `null` för andra (invariant). `origin` skiljer ut Vestment-zombien (ingen upkeep, begränsade aktioner).
**NPC:er** är en minimal entitet (id och namn) tills vidare.

### S20. Rond och fas
**Beslut:** `round` är 0 under setup och 1..`maxRounds` under spel. `phase` är `'setup' | 'submission' | 'resolving' | 'awaitingCombat' | 'finished'`. **Ingen resolution-cursor i GameState**: rondtråden håller pausläget i ett eget objekt så att dolda inlämningar aldrig ligger i det delade state:t.
**Avvikelse från 001 (M11):** 001 föreslog att cursorn ligger i state. Utfallet är detsamma.

### S21. Skapande av kampanj
**Beslut:** `createGameState` tar emot **färdiga** karaktärer (klan, discipliner, stat-bonusar per källa, minions, artefakter) och en kartmall, och kastar om resultatet bryter mot en invariant. Titlarnas startpaket finns som data i `content/titles.ts` men valideras inte här; det hör till karaktärsskapandet (SPEC B7). Två regler tillämpas automatiskt: Banu Haqim får permanent −1 Strength och Archons får 3 loyalty counters.
**Inte med än:** Toreador-obsessionen (C8) dras inte vid skapande ännu; fältet finns och är `null`.

### S22. Validering
**Beslut:** `validateState` returnerar en lista med alla brott (sökväg och meddelande) i stället för att kasta. Den kontrollerar bl.a.: ren JSON, att nycklar matchar id, att genererade id ligger under räknaren, referenser mellan entiteter, symmetriskt och sorterat grannskap, hamn ⇔ havsregion, stadsstats inom intervall, titel och sekt hänger ihop, disguise bara på Archbishops, blood ≥ 0, EXP ≤ 12, max en artefakt per minion, Sabbat-baser level 1–3.
**Motivering:** Rondtrådens och kommande trådars tester kan köra `validateState` efter varje upplösning och få exakt besked om vad som gått sönder.

### S23. Skelett som byggs ut senare
**Beslut:** `Combat`, `Mission`, `Debate` och `OngoingEffect` finns som typer så att state kan hålla dem, men formen är preliminär och ägs av de trådar som bygger respektive mekanik (combat i steg 3, missions C10, debatter C9). Problems och specials är `CityFeature { key, name, data }` tills problemtabellen (C3, C4) finns.

---

## Sidofynd

Sidofynd från det här arbetet ligger i `BACKLOG.md` under "State och typer".
