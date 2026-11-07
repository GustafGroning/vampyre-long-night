# Research & plan: rondens skelett

**Datum:** 2026-11-07
**Scope:** Punkt 2 i motorplanen. `resolveRound(state, submissions, seed) → resultat` som ren funktion, aktionsinlämning med deadline, validering av aktionsbudget per titel och rondens faser. Inga konkreta aktionseffekter (stubbar), ingen databas, inget UI.
**Beroende:** Tråden "Bygg spelets state och typer" äger `GameState`, spelar-/minion-typerna och den seedade RNG:n. Beslut som tagits utan Gustafs input finns i [`docs/decisions/round.md`](../decisions/round.md).

---

## 1. Research: vad reglerna säger

### Rondens livscykel (game_design.txt rad 10, SPEC B5)
1. Ett inlämningsfönster öppnas med en deadline.
2. Spelare lämnar in en **ordnad lista** av aktioner. De får ändra fritt tills de låser eller deadline passerar.
3. Ronden upplöses när alla har lämnat in eller deadline har passerat.
4. Resultat: ny state, personliga uppdateringar, publika nyheter, GM-logg.

### Fasordning (game_design.txt rad 935–960, SPEC A16)
| Fas | Innehåll |
|---|---|
| 1a | Spelare betalar aktionskostnader (allt i förskott). |
| 1b | Minion-upkeep. Obetald minion bränns. Ingen upkeep rundan man fick minionen. |
| 2a–2c | Start-of-round: stadseffekter, event-effekter, övrigt (t.ex. Ventrue +10). |
| 3a | Aktion #1 för alla spelare i slumpad ordning, sedan #2 osv. Celerity ger prioritet inom en position. Strider löses i den ordning de uppstod. |
| 4a–4d | End-of-round: Fight for Control, spelar-effekter (Dominate, klan-curses), Justicar-missions, masquerade-kollaps. |
| 5a–5c | Income: stadens blood flow, bleed-blod, övrig inkomst. Sedan rondräknaren +1. |

> **Avvikelse att flagga:** game_design.txt numrerar income som "4a/4b/4c" (en andra gång) och hoppar över "4d" i end-of-round ("4e - Check for a masquerade collapse"). SPEC A16 har normaliserat detta till fas 5 och 4d. Detta ser ut som stavfel i regelboken; motorn följer SPEC:s numrering eftersom ordningen är densamma.

### Aktionsbudget (SPEC A1, A6, A14, A15)
- Bas per titel: Inner Circle 6, Justicar 4, Prince 4, Baron 5, exponerad Archbishop 4. Dold Archbishop använder sin förklädnads budget.
- **Gratis aktioner:** första Trifle-aktionen per rond, Give, Buy Votes, Tremeres enda Thaumaturgy-aktion.
- **Extra:** Royal Privilege (+1 per förbrukad), Sabbat scheme (X+1 delas av Sabbat), Call a Crusade (+1 nästa rond), Anarch Mission (+1 för en minion).
- **Begränsningar:** torpor ⇒ max 1 aktion och bara Awaken; Invite to the Camarilla ⇒ max 1 aktion nästa rond; Go Anarch måste vara enda aktionen; efter Hide får man inte göra fler aktioner.
- Minions: 1 minion-aktion var, bara av sin egen typ.

### Strider mitt i ronden
Reglerna säger att en strid som skickar dig i torpor gör att dina senare aktioner misslyckas och återbetalas. Strider har förhandling med 6-timmarstimer (A12). Alltså måste upplösningen kunna **pausa mitt i fas 3** och fortsätta när striden är avgjord.

### Prototypen
`docs/prototype/research/004_resolve_round_engine.md` lade start-of-round utanför resolve-round och antog ingen återbetalning. Båda avfärdas: SPEC A16 lägger fas 2 inuti upplösningen och Part C #11 väljer kanonisk återbetalning.

---

## 2. Plan: modulstruktur (`packages/engine/src/round/`)

| Fil | Ansvar |
|---|---|
| `types.ts` | `Submission`, `SubmittedAction`, `RoundWindow`, `RoundEvent`, `ActionOutcome`, `Resolution`. |
| `actions.ts` | `ActionDefinition` (kategori, kostnad, Trifle, slot-regel, per-rond-gräns, begränsningar) och `ActionRegistry`. Stubbar för de aktioner skelettet behöver för att testa budgetreglerna. |
| `budget.ts` | `computeActionBudget(player, state, submission, scheme)` och `countSlots(actions)`. |
| `validate.ts` | `validateSubmission(...)` → `{ ok, errors[], warnings[] }`. Ren funktion, återanvänds vid inlämning och vid upplösning. |
| `window.ts` | Livscykel: `openRound`, `submitActions`, `lockSubmission`, `isReadyToResolve`, `closeRound`. Tar alltid `now` som argument (ingen klocka i motorn). |
| `order.ts` | Ordningen inom en position: Celerity-prioritet först, sedan seedad shuffle. |
| `phases.ts` | Faserna som en ordnad lista av `PhaseHook`. 1a och 1b implementerade, övriga är tomma krokar som senare aktioner/regler registrerar sig i. |
| `resolve.ts` | `resolveRound`, `continueResolution`. Resumable state machine med en serialiserbar markör. |

### Kärnidéer
1. **Inlämningar ligger utanför `GameState`.** Hemliga aktioner hör inte hemma i det delade tillståndet. `RoundWindow` är en egen struktur och `resolveRound` får inlämningarna som argument.
2. **Upplösningen är en pausbar state machine.** `resolveRound` kör tills ronden är klar eller tills en aktion begär extern input (strid). Då returneras `{ status: 'suspended', resolution }`. `continueResolution(resolution, input)` fortsätter. All mellanstate, inklusive RNG-state, är ren data, så samma inputs ger samma resultat oavsett hur många pauser det blir.
3. **Aktioner är data + handler.** En handler returnerar `resolved`, `failed` (⇒ automatisk återbetalning) eller `interrupt`. Skelettet har bara stubb-handlers.
4. **Event-sourcing från start.** Varje fas och aktion skriver `RoundEvent` med fas, aktör och actionRef så att vy-tråden (punkt 4) kan filtrera.

### Tester (Vitest)
- Budget per titel, dold/exponerad Archbishop, Royal Privilege, Sabbat scheme, torpor, Invite-cap, Trifle/Give gratis.
- Validering: okänd aktion, fel titel, minion av fel typ, för många aktioner, Hide följt av aktion, Go Anarch inte ensam, ej råd, per-rond-gräns.
- Livscykel: inlämning efter deadline nekas, låsning, `isReadyToResolve`.
- Upplösning: fasordning, position-för-position-ordning, determinism (samma seed ⇒ identiskt resultat, annan seed ⇒ annan ordning), Celerity-prioritet, misslyckad aktion återbetalas, torpor mitt i ronden ⇒ senare aktioner misslyckas och återbetalas, upkeep bränner minion, paus och återupptagning ger samma resultat som en körning utan paus, indata muteras aldrig.

### Utanför scope (→ BACKLOG.md)
Konkreta aktionseffekter, strid, Fight for Control över rondgränser, vyer per spelare, income-beräkning från städer.
