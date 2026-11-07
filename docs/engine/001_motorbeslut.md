# 001 — Beslut som blockerar spelmotorn

**Datum:** 2026-11-07
**Status:** Fattade av Claude utan Gustafs input (Gustaf offline). Varje beslut är ett **provisoriskt standardval** som motorn byggs mot; Gustaf går igenom och ändrar i efterhand. Ändra ett beslut genom att uppdatera raden här och i SPEC.md Part C.
**Källor:** `docs/rules/game_design.txt` (kanonisk, radnummer anges som `gd:NNN`), `docs/rules/SPEC.md`, `docs/playtest-logs/`, `docs/prototype/research/004_resolve_round_engine.md`.

Motorn byggs i fyra steg: (1) state och typer, (2) rondens skelett, (3) en aktionstyp hela vägen, (4) per-spelare-vyer. Nedan listas besluten per steg de blockerar. Beslut märkta **C#** kommer från SPEC Part C. Beslut märkta **M#** är nya: luckor eller motsägelser i regelboken som Part C inte tar upp.

## Snabböversikt: de beslut som påverkar spelet mest

| # | Fråga | Valt | Varför det spelar roll |
|---|---|---|---|
| M11 ✅ | När löses combat i förhållande till aktionsordningen? | **Bekräftat av Gustaf.** Rundan pausar efter den **slot** där combat uppstod; alla combats från samma slot förhandlas parallellt. | Kanoniskt måste torpor från combat kunna stoppa senare aktioner (gd:95, gd:946). Detta är det enda valet som håller regeln utan att rundan pausar per combat. |
| M16 ✅ | Ser man en aktion när intercept **=** stealth? | **Ja** (≥). Bekräftat av Gustaf. | Regelboken säger emot sig själv (se nedan). Påverkar varje informationsberäkning. |
| M2 ✅ | Vilken state är publik? | Allowlist i tabellen under M2. Bekräftat av Gustaf. | Grunden för alla vyer och läck-tester. |
| M6 ⚠️ | Hur många aktioner har en vampyr utan titel? | **3** (provisoriskt). **Olöst, ska diskuteras.** | Odefinierat i regelboken men inträffar (förlorad enda stad). |

---

## Steg 1 — state och typer

### M1. Stack för motorn
**Beslut:** Ett fristående TypeScript-paket (`strict`), inga runtime-beroenden, Vitest för tester. Ingen databas, inget UI.
**Motivering:** Koordinatorns förslag, och SPEC B12 (portabilitet) kräver att motorn är oberoende av lagring. TypeScript ger diskriminerade unioner som passar aktions- och eventtyper.

### M2. Vad är publikt, vad är dolt
**Status:** ✅ Bekräftat av Gustaf 2026-11-07: hela tabellen stämmer. Klan, minions (antal, namn, typ, level) och alla stadsvärden syns för alla. Positioner syns bara för ägaren, om de inte upptäckts (t.ex. via Auspex).
**Beslut:** Vyer byggs från en **allowlist**: allt som inte står som publikt här är dolt.

| Data | Synlighet | Belägg |
|---|---|---|
| Vampyrens namn, (skenbar) titel, (skenbar) sekt | Publikt | Titlar och sekter används öppet i regeltexten; Archbishops döljs bakom disguise (gd:635). |
| Sann sekt för Archbishop, Sabbat-baser | Endast Sabbat-spelare (+ exponering) | gd:637, SPEC A14.3 |
| Klan | Publikt | Inget i regelboken döljer den. (Prototyp-backloggen funderade på att dölja den; flaggat i BACKLOG.) |
| Blood, VP, EXP, stats, disciplines, artifacts, Royal Privileges | Endast ägaren | VP dolt: Eye-frågan "Do they have more VP than me?" (gd:304). Artifacts: Possession (gd:921). |
| Antal minions och deras namn, typ, level | Publikt ("player stats") | gd:403: "Players will still see the minion in player stats". |
| Minions position | Endast ägaren (och den som observerar dem) | Positioner upptäcks via intercept/Search. |
| Vampyrens position | Endast ägaren (och den som observerar) | Auspex (M), Iron Fist, Search finns för att hitta positioner. |
| Stadens controller, stability, blood flow, MS, intercept, influence, problems, specials, revolt counters, port/sea region, storm | Publikt | Influence uttryckligen publikt (gd:911); övriga visades öppet i prototypens stadsvy och i Discord-spelet. Investigate ger *detaljer* om problems/specials, inte deras existens. |
| Contest: vilka som contestar en stad | Publikt | Contest är ett öppet anspråk (Conquer new territory är "Can't be hidden"). |
| Ivory Tower: röstsiffror per alternativ | Publikt efter rundan; vem som röstat vad är dolt | gd:578 |
| Blood hunt-flagga | Publikt | Alla Justicars får mission att jaga, andra får belöning (gd:899): måste vara känt. |
| Masquerade violation (aktiv) | Publikt | Påverkar grannstäder öppet. |

### M3. Vilken sekt en stad tillhör
**Beslut:** En stads sekt = controllerns **skenbara** sekt (disguise räknas). Okontrollerad stad har ingen sekt. Contested stad behåller den tidigare controllerns sekt tills den byter controller.
**Motivering:** Build the Base kräver "the same sect that matches your disguise" (gd:1104), så skenbar sekt är det som avgör.

### C14. Kartan
**Beslut:** Kartan är data per kampanj. Motorn testas mot en **syntetisk minikarta** (4–6 städer) tills riktiga kartdata finns.
**Motivering:** Prototypens kartdata (`seed.js`) följde inte med. Det som finns i `docs/prototype/plans/001_map_improvement.md` är namn, hamnstatus och en adjacency-lista med **37** par, medan samma dokument säger 36 och `007_campaign_setup.md` säger 34. Startvärden (blood flow, stability, MS, intercept) och sea regions per hamn saknas helt. Flaggat i BACKLOG.

### Modellprinciper som följer av besluten (bindande för state-tråden)
- **All state är ren JSON**: `Record<Id, T>`, inga klasser, `Map`, `Set` eller `Date`. Iterera alltid i sorterad id-ordning.
- **Id:n genereras deterministiskt** från en räknare i state, aldrig uuid.
- **Referensdata (clans, disciplines, action-/artifact-/minion-definitioner) är separat `Content`** som skickas in till motorn, inte del av state (SPEC B4/B11).
- **Stat-bonusar lagras per källa** (`{stat, amount, source, expires}`) så Rule of Three kan räknas: effektivt värde = bas + Σ per källa min(3, summa). Charge-strength är undantaget och räknas utanför (gd:162).
- **VP-ändringar sparas i en ledger** med regel och event, och "VP för stad tagen" sparas per (spelare, stad) för once-per-city (gd:519).

---

## Steg 2 — rondens skelett

### M4. Aktionslistan och slots
**Beslut:** Varje spelare lämnar **en** ordnad lista som innehåller vampyrens aktioner, minionaktioner och aktioner som inte kostar en action (Give, Buy Votes, Bag of Gifts, Evil Eye). **Slot = position i listan (1, 2, 3 …).** Alla spelares slot 1 löses först i seedad slumpordning, sedan slot 2 osv.
**Motivering:** Regelbokens exempel blandar minionaktioner i samma numrerade lista (gd:97–103), och båda playtest-loggarna gör likadant.
**Budgetvalidering** räknar separat: vampyrens actions (≤ budget, första Trifle gratis, gratis-aktioner räknas inte) och minionaktioner (1 per minion, +1 via Anarch Mission).

### M5. Celerity
**Beslut:** "Your next two actions will be resolved immediately" (gd:1212) = spelarens **två nästa entries i listan efter Celerity** löses direkt efter Celerity, i samma slot, innan andra spelare fortsätter i den sloten. Spelarens övriga entries behåller sina slotnummer (de två flyttade lämnar tomma slots efter sig).
**Motivering:** Den bokstavliga läsningen; den enda som ger Celerity ett värde utan att skriva om ordningen för andra.

### M6. Aktionsbudget i kantfall
**Status:** ⚠️ **Olöst.** Gustaf 2026-11-07: "Det här måste diskuteras, notera att frågan inte är löst." Gäller allt om titellösa vampyrer: budget (3), domän (S10), titelaktioner, VP-källor och om man kan få en ny titel. Motorn använder raden nedan som platshållare tills frågan är avgjord. Övriga rader i tabellen är inte ifrågasatta.
**Beslut:**
| Läge | Budget |
|---|---|
| Inner Circle / Justicar / Prince / Baron | 6 / 4 / 4 / 5 (gd:566–615) |
| Dold Archbishop | Disguise-titelns budget (Prince 4, Baron 5) |
| Exponerad Archbishop | 4 (gd:635) |
| **Utan titel** | **3** (odefinierat i regelboken) |
| Torpor | 1 vampyraktion, endast Awaken (eller artifacts som uttryckligen tillåts i torpor: Giants' Blood, Soul Gem); minionaktioner som vanligt (gd:203) |
| Rundan efter Invite to the Camarilla (accepterad) | 1 vampyraktion (gd:993) |
| Extra | +1 per spenderat Royal Privilege, +1 rundan efter Call a Crusade!, Sabbat schemes (C2) |

**Motivering för 3:** Lägre än alla titlar (titeln ska vara värd något), men tillräckligt för att kunna Move + Conquer New Territory + en aktion till och ta sig tillbaka.

### C2. Sabbat schemes
**Beslut:** Varje Sabbat-spelare skickar med en **föreslagen fördelning** av X+1 extra actions i sin inlämning. Är alla Sabbat-spelares förslag identiska gäller fördelningen; annars får ingen några extra actions. Inget separat steg före rundan.
**Motivering:** Uppfyller "alla måste vara överens, annars ingen" (gd:645) utan ett extra inmatningssteg. Ersätter SPEC:s förslag med en enklare variant med samma utfall.

### C11. Refund av misslyckade aktioner
**Beslut:** Kanonisk regel: kostnaden återbetalas om aktionen inte kan lösas (gd:95). Prototypens no-refund gäller inte.

### M7. Betalning i kantfall
**Beslut:**
- **Submission valideras** så att total aktionskostnad ≤ blood. I fas 1a dras hela kostnaden. Kan det ändå inte betalas (blood ändrats sedan inlämning) stryks entries bakifrån tills listan går att betala; strukna entries räknas som misslyckade.
- **Upkeep (1b):** räcker blood inte bränns minions tills resten går att betala, i ordningen **högst upkeep först, sedan nyast först, sedan id**. Inget spelarval.
- **Blood kan inte gå under 0.** Förluster (Evil Eye, Punish Treason, curses) klampas vid 0.
- **Kostnadsändringar som uppstår mitt i rundan** (t.ex. Brujah-rabatten efter vunnen combat) ges som **refund vid fas 5 (income)**, eftersom kostnaden redan betalats i 1a.

### M8. Val som målet (inte aktören) gör
**Beslut:** Val som en *annan* spelare måste göra (fight eller flee vid Fight for Control, acceptera Invite to the Camarilla, återvända till sin contestade stad) blir **pending choices** som besvaras i nästa rundas inlämning. Obesvarat vid deadline ger standardvärdet: **fight**, **decline**, **återvänd**.
**Motivering:** Fight for Control löses ändå "at the end of the next round" (gd:973), och Invite påverkar först nästa runda (gd:993). Då behöver rundan inte pausa för dessa.

### M9. Seed och slump
**Beslut:** Seeden genereras av servern **när rundan öppnar**, lagras dold och används för upplösningen. Slumpen delas upp i **namngivna delströmmar** (t.ex. `slotOrder/3`, `action/<entryId>`, `combat/<id>/round/<n>`) härledda från seeden, så att en extra tärning i en aktion inte flyttar alla andra slag. PRNG: en liten, välkänd algoritm (t.ex. sfc32 eller xoshiro128**) implementerad i paketet.
**Motivering:** Seed fast före upplösningen hindrar att någon kör om rundan tills tärningarna faller rätt; delströmmar gör tester och replays stabila.

### M10. Deadline och klocka
**Beslut:** Motorn känner inte till klockan. Deadlines och combat-timers ligger i plattformen, som skickar in en `Timeout`-input. Vid deadline gäller spelarens **senast sparade lista**; ingen lista = tom lista (upkeep dras ändå).

---

## Steg 3 — första aktionstypen (combat)

### M11. När combat löses
**Status:** ✅ Bekräftat av Gustaf 2026-11-07: "alla combats i action 1 hanteras innan action 2 körs alls, etc till rundan är slut." GM har hanterat 5–6 parallella combats per runda i Discord-spelet utan problem, så parallell förhandling per slot är beprövad.
**Beslut:** När en aktion i slot *N* startar en combat fortsätter resten av slot *N* att lösas. Därefter **pausar upplösningen**. Alla combats som startat i slot *N* förhandlas **parallellt**. Är samma vampyr i flera combats i samma slot körs de i den ordning de startade. När alla är klara fortsätter upplösningen med slot *N+1*. Fight for Control-combats löses i fas 4a.
**Alternativ som valdes bort:**
- *Pausa per combat:* kanoniskt men kan ge flera dygns väntan per runda (varje combat upp till 18 h + press).
- *Lös alla combats efter aktionsfasen:* snabbast, men då kan torpor från combat inte stoppa senare aktioner, vilket regelboken uttryckligen säger (gd:95).
**Konsekvens för modellen:** Upplösningen måste vara **återupptagbar**: state innehåller en `cursor` (slot, ordning, index, RNG-läge) och fasen `awaitingCombat`. Motorn blir `step(state, input) → {state, events}` med inputs som `resolveRound`, `combatInput` och `timeout`. Det är fortfarande en ren funktion.

### M12. Lika i combat
**Beslut:** Lika totalsumma ⇒ båda slår om (ny D4, samma Strength) tills det skiljer. Regelboken säger bara "the side with the highest result wins" (gd:166).

### M13. Ambush
**Beslut:** Ambush jämför **aktionens totala stealth** (personlig stealth + aktionens modifier + buffar, t.ex. Obfuscate) mot målets personliga intercept, strikt större (gd:893, gd:1150).
**Motivering:** Annars är Obfuscate på Attack! meningslöst för ambush.

### M14. Timers och spelarval i combat
**Beslut:** Stegens timers (standardvärde 6 h, gd:156–170) är kampanjinställningar. Timeout ⇒ standardval: ingen deal, Charge = 0 blood, ingen press. Förloraren väljer plats på wound table; timeout ⇒ **stridsstaden** (4–6), **stridsstaden** (7–9), **första staden i domänen sorterad på id** (10–12).

### M15. Deals i combat
**Beslut:** Motorn verkställer bara **strukturerade överföringar** (blood, artifacts, minions, städer) som båda sidor accepterar i identisk form. Fritext-löften hanteras i chatten och verkställs inte (gd:156).

### Rekommendation om första aktionstypen
Koordinatorn föreslog combat. Jag rekommenderar **Move + Bleed (inkl. upkeep och income)** som första vertikala skiva och combat som andra, eftersom combat kräver den återupptagbara upplösningen (M11) och flera inputs, medan Move + Bleed testar ordning, betalning, synlighet och income på en gång. Playtest-loggarna innehåller inga tärningsslag eller seeds, så de kan användas som scenarier för flöde och format, inte som exakta regressionstester.

---

## Steg 4 — per-spelare-vyer

### M16. ≥ eller > vid intercept mot stealth
**Status:** ✅ Bekräftat av Gustaf 2026-11-07: "Har man lika så syns handling, stealth måste vara HÖGRE för att gömmas." Gäller både spelare och städer.
**Beslut:** **intercept ≥ stealth** ⇒ man ser aktionen (som SPEC A11).
**Avvikelse att flagga:** Regelboken säger emot sig själv. "Higher or equal" (gd:114), "lower or equal" (gd:115) och gd:925 (man missar bara om stealth är *högre*) talar för ≥. "Lower stealth than the city's intercept" (gd:498) och "lower stealth than your intercept" (gd:913) talar för >. Majoriteten och huvudregeltexten (Actions-kapitlet) säger ≥.

### M17. Vad en observatör får veta
**Beslut:** Den som ser en aktion får: **vem** (för minion: minionen och dess controller), **vilken aktion**, och **mål** (stad/vampyr/minion). Inte kostnad, tärningsslag, buffens källa eller dolda parametrar (t.ex. vilken fråga en Eye ställde). Utfall syns bara om utfallet i sig är publikt (t.ex. stadsstats) eller observatören är part.
**Belägg:** Playtest-loggen (Birmingham) visar exakt den nivån: "the justiciar Countess Violet de Grey has grown in power", "King George Vs minion Muppet (LV 2 eye) has happened in Birmingham".

### M18. När och var synlighet räknas
**Beslut:** Synlighet räknas **i ögonblicket aktionen löses**, med positioner och modifiers just då, och sparas på eventet (`audience`). Vyerna filtrerar bara på den sparade listan och räknar aldrig om.
- **Samma stad** = aktörens stad när aktionen startar. För Move/Sail är det **avreseorten**.
- **Controller-sikt** gäller städer aktionen **startar i eller riktar sig mot** (gd:115). För Move är destinationen mål ⇒ destinationens controller kan se ankomsten.
- Torpida vampyrer observerar inte.

### M19. Minions som observatörer
**Beslut:** Bara **Informant**-minions (Eye, Archon) observerar och rapporterar till sin controller, med intercept = level + modifiers, enligt samma regler som en vampyr i samma stad. Ghouls, Harpies och Primogen observerar inget.

### Vyprincip (bindande för vy-steget)
Vyer **konstrueras** från allowlistade fält (M2) och events där spelaren finns i `audience`; de skapas aldrig genom att kopiera state och ta bort fält. Läck-tester planterar unika "kanariesträngar" i dolda fält och kontrollerar att de aldrig finns i fel spelares serialiserade vy.

---

## Kan vänta (blockerar inte steg 1–4)

Dessa behövs innan respektive mekanik byggs. Jag föreslår att SPEC Part C:s rekommendationer gäller tills Gustaf säger annat. State-modellen lämnar plats för dem (problems/specials som data, missions, debatt).

| # | Mekanik | Provisoriskt beslut |
|---|---|---|
| C1 | Wait and Strike-villkor | Strukturerad villkorsgrammatik enligt SPEC. |
| C3 | Troublemaker | Problemtabell per stability-nivå, seedat val. |
| C4 | Investigate / Search | Strukturerade fält på problems/specials + förskriven hint. |
| C5 | Malkavian Prophecy | Förskriven pool, endast flavor tills vidare. |
| C6 | Dementation / Crown of Malkav | Utdrag ur en publik eller egen sektkanal; aldrig privat innehåll. |
| C7 | (M)Chimerstry | Publikt "information highway"-flöde, spelaren skriver själv (≤ 250 ord). |
| C8 | Toreador Obsession | Seedat val vid skapande, lagras på karaktären. |
| C9 | Ivory Tower-debatter | Mallbibliotek, GM kan kurera. |
| C10 | Justicar Missions | Missionsbibliotek med maskinkontrollerbara villkor. |
| C12 | Tiebreak vid slutpoäng | Föreslag: mest blood, sedan flest kontrollerade städer, sedan delad seger. |
| C13 | "Hunt for Me" (zombie) | Ghoulens Bleed the Enemy på level 1 tills definierat. |
| M20 | Inner Circle "+3 VP every second round" | Vid start av runda 2, 4, 6 och 8. |
