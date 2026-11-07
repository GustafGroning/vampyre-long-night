# Beslut: rondens skelett

**Datum:** 2026-11-07
**Status:** Fattade av Claude utan Gustafs input (Gustaf offline). Provisoriska standardval; ändra raden här och koden i `packages/engine/src/round/` om du vill annorlunda. Numreringen R# är egen för ronden; M#/C# kommer från motorbeslutsdokumentet.
**Bygger på:** [`docs/engine/001_motorbeslut.md`](../engine/001_motorbeslut.md) (M4–M11, C2, C11), som skelettet följer. Nedan står bara beslut som *inte* redan finns där, plus en avvikelse.
**Plan:** [`docs/engine/round-skeleton-plan.md`](../engine/round-skeleton-plan.md) · **State-beslut:** [`state.md`](state.md)

## Snabböversikt: de beslut som påverkar spelet mest

| # | Fråga | Valt |
|---|---|---|
| R3 ✅ | Vad händer med en lista som blivit ogiltig mellan inlämning och upplösning? | Ogiltiga entries stryks, sedan stryks bakifrån tills listan går ihop. Strukna entries kostar inget. |
| R6 | Vilka aktioner får en dold Archbishop göra? | Både Archbishop-aktioner och förklädnadens titel- och sektaktioner. |
| R8 | Hide och Go Anarch: gäller "inga fler aktioner" minions också? | Nej, bara vampyren. Minions agerar som vanligt. |
| R12 | Vad räknas som Celerity:s "next two actions"? | Spelarens två nästa entries som fortfarande väntar, även minionaktioner. |

---

## R1. Inlämningar och pausläge ligger utanför `GameState`
**Beslut:** Inlämnade listor ligger i `RoundWindow` under inlämningen och i `RoundResolution` under upplösningen, inte i `GameState`. Pausläget vid strid (cursor, entries, events, väntande interrupts) är ett eget serialiserbart objekt, `RoundResolution`. `state.phase` sätts till `'resolving'` respektive `'awaitingCombat'`.
**Motivering:** Inlämningar är bland det mest hemliga i spelet. Hålls de utanför det delade tillståndet kan vy-steget (punkt 4) aldrig råka läcka dem genom att utgå från state.
**Avvikelse från M11:** M11 säger att cursorn ligger *i* state. Utfallet är detsamma (ren funktion, återupptagbar); bara förpackningen skiljer. Plattformen sparar `RoundResolution` medan ronden är pausad.

## R2. Strukna entries lämnar en tom slot
**Beslut:** Om en entry stryks (ogiltig, ej råd) eller redan har lösts via Celerity behåller spelarens övriga entries sina slotnummer.
**Motivering:** Samma princip som M5. Spelaren planerade sin ordning mot andras slots; att flytta fram allt efter en struken entry skulle ändra planen mer än strykningen själv.

## R3. Listor som blivit ogiltiga vid upplösning
**Status:** ✅ Bekräftat av Gustaf 2026-11-07: "Vi körde exakt som det provisoriska" i Discord-spelet.
**Beslut:** Vid upplösning (fas 1a) valideras varje lista igen mot aktuell state. Entries som är ogiltiga i sig (fel titel, okänd minion, torpor) stryks direkt. Därefter, så länge listan bryter mot en listregel (budget, minionbudget, once-per-turn, Go Anarch ensam, efter Hide, kostnad), stryks den **högsta flaggade entryn**. För kostnad stryks sista entry med kostnad > 0. Strukna entries betalas inte och får status `rejected` och ett event.
**Motivering:** Utvidgar M7:s "stryk bakifrån" till alla listregler, så att utfallet är förutsägbart. Att stryka en entry med kostnad 0 hjälper inte mot underskott.

## R4. Inlämning avvisas helt vid fel
**Beslut:** `submitActions` sparar bara en lista som är helt giltig mot aktuell state; annars returneras felen och fönstret är oförändrat. En ny inlämning ersätter den gamla och tar bort låsningen. Varningar (t.ex. "kostnad + upkeep överstiger blood") stoppar inte.
**Motivering:** Spelaren ska få veta direkt (SPEC B5). R3 tar hand om det som ändras efter inlämning.

## R5. Sabbat schemes vid inlämning
**Beslut:** Vid inlämning räknas spelarens eget förslag som om det gällde (med en varning). Vid upplösning avgörs schemes av C2; blir det ingen överenskommelse krymper budgeten och R3 stryker bakifrån. Sabbat-spelare = sekt `sabbat` (även dolda Archbishops) som inte är brända; torpida räknas och måste också skicka förslag. Fördelningen får inte ge actions till icke-Sabbat och summan får vara högst X+1.
**Motivering:** Vid inlämning vet man inte vad de andra Sabbat-spelarna skickar. Att torpida räknas följer av att de fortfarande är Sabbat-spelare (X = antal Sabbat-spelare, gd:645).

## R6. Effektiv titel och sekt för Archbishop
**Beslut:** En dold Archbishop får göra Archbishop-aktioner, Sabbat-aktioner **och** förklädnadens titel- och sektaktioner (en Archbishop förklädd som Prince kan alltså göra Camarilla-aktioner). En exponerad Archbishop har bara Archbishop och Sabbat.
**Motivering:** "They can use all the actions of the title they masquerade as" (gd:635) och vid exponering "lose the ability to use the actions of the sect they had infiltrated" (gd:640), vilket förutsätter att de hade den förmågan innan. Build the Base och Call a Crusade måste gå att göra medan man är dold.

## R7. Anarch Mission måste stå före minionens extra aktion
**Beslut:** En minions andra aktion är bara giltig om en Anarch Mission som namnger minionen står tidigare i listan. Max en extra per minion.
**Motivering:** "Buffs and modifiers need to be applied before the action they target" (gd:95).

## R8. Hide och Go Anarch gäller bara vampyren
**Beslut:** Efter Hide får vampyren inte göra fler aktioner, men minions agerar. Go Anarch måste vara rondens enda **vampyr**aktion; minions får agera.
**Motivering:** Båda texterna säger "you" (gd:1023, Hide), och minionaktioner räknas separat i regelboken (gd:203 gör samma åtskillnad för torpor).

## R9. Torpor mitt i ronden
**Beslut:** En vampyr som hamnar i torpor eller bränns under fas 3a får sina återstående vampyraktioner (utom de som är tillåtna i torpor) misslyckade och återbetalade när deras slot kommer. Minionaktioner fortsätter. En minion som bränts eller bytt ägare (Dominate) får sin aktion misslyckad och återbetalad.
**Motivering:** gd:95 (combat som skickar dig i torpor), C11.

## R10. Vilka som förväntas lämna in
**Beslut:** Alla spelare som inte är brända, även torpida. `isReadyToResolve` blir sann när alla dessa har låst eller deadline har passerat.
**Motivering:** Torpida kan göra Awaken och minionaktioner (gd:203).

## R11. Kostnaden räknas en gång, i fas 1a
**Beslut:** Variabla kostnader (Grow in Power, Buy Votes) räknas från listans parametrar och state i fas 1a. Återbetalning ger tillbaka exakt det som drogs.

## R12. Celerity: "nästa två"
**Beslut:** Celerity löser spelarens två nästa entries som fortfarande har status `pending`, i listordning, även minionentries. Strukna och redan lösta entries hoppas över. En Celerity bland de två ger två till (kedjan fungerar).
**Motivering:** M5 säger "entries". Att hoppa över strukna gör att Celerity inte slösas på något som ändå inte händer.

## R13. Svar på strider kan komma ett i taget
**Beslut:** `continueResolution` tar ett eller flera svar. Ronden fortsätter med nästa slot först när alla interrupts från sloten är besvarade. En handler får returnera en ny interrupt när den återupptas (t.ex. Press!). Svar på okänd interrupt är ett fel.
**Motivering:** Strider i samma slot förhandlas parallellt (M11) men blir klara vid olika tider. Testat: samma svar ger samma resultat oavsett om de kommer samtidigt eller ett i taget.

## R14. Slutet av spelet
**Beslut:** Efter upplösningen av sista ronden (`round === maxRounds`) blir `phase = 'finished'` och `round` står kvar. En regel i fas 2–4 kan avsluta spelet (`endGame`, t.ex. masquerade-kollaps i 4d); då hoppas resterande faser över, även income.
**Motivering:** "If more than half of all cities have an active violation, the game ends" (SPEC A15). Income efter spelslut påverkar inte VP.

## R15. Upkeep i kantfall
**Beslut:** Upkeep dras även för torpida spelare. Minions med 0 upkeep (Archon) bränns aldrig för obetald upkeep. Upkeep betalas inte rundan minionen fås (`acquiredRound === round`).

## R16. Royal Privileges klampas vid upplösning
**Beslut:** Om spelaren har färre Royal Privileges vid upplösningen än när listan lämnades in förbrukas det man har; R3 stryker det som inte längre ryms.

## R17. Slumpens delströmmar
**Beslut:** `slotOrder/<slot>` för spelarordningen per slot, `action/<entryId>` för varje entrys tärningar, `phase/<fas>/<…>` för regler i faserna. Spelarordningen dras när sloten börjar och omfattar bara spelare med en väntande entry i den sloten.
**Motivering:** Följer M9. Att dra ordningen när sloten börjar gör att pauser och Celerity inte påverkar andra slots ordning.

## R18. Tider är epoch-millisekunder
**Beslut:** Deadline och `now` är tal (ms), inte `Date`, så att allt är JSON (modellprinciperna i 001).

## R19. Aktionsdefinitioner är data plus en handler
**Beslut:** `ActionDefinition` beskriver kostnad, stealth, Trifle, slotregel, titel/sekt/miniontyp, torpor, once-per-turn osv. som data, plus en `resolve`-funktion i TypeScript. Skelettets definitioner är stubbar utan effekt.
**Motivering:** SPEC B11 vill ha "data + effektprimitiver". Att hitta rätt primitiver kräver att några aktioner byggts på riktigt först (steg 3). Valideringen läser redan bara datafälten.

## R20. Bränd minion som bär en artefakt
**Beslut:** När en minion bränns (t.ex. obetald upkeep) tas den bort ur state och en artefakt den bar hamnar i minionens stad (`holder: city`), där den kan hittas med Search.
**Motivering:** Regelboken säger inget. Att artefakten försvinner vore en tyst förlust av en unik resurs; att den går tillbaka till ägaren skulle göra det riskfritt att utrusta minions.

## R21. Content skickas in, inte globalt
**Beslut:** `resolveRound`, `continueResolution`, `submitActions` och valideringen tar `content` (titlar, miniontyper osv.) i sina options, liksom aktionsregistret. Utan registry används skelettets stubbar.
**Motivering:** Följer modellprinciperna i 001 (content är separat från state, SPEC B4/B11).

---

## Avvikelse i regelboken (flaggad)
- game_design.txt numrerar income-stegen "4a/4b/4c" en andra gång och hoppar från "4c" till "4e" i end-of-round (rad 949–955). SPEC A16 har normaliserat till 4d och fas 5. Ordningen är densamma; motorn använder SPEC:s numrering (`PhaseId`).
