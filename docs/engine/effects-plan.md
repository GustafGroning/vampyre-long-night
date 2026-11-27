# Plan: aktionernas effekter

**Datum:** 2026-11-19
**Mål:** Varje aktion i `ACTION_CATALOG` gör det regelboken säger när den löses. Motorns definition of done för V1 (Gustaf 2026-11-19): inga aktioner som inte löses automatiskt, alltså inga stubbar kvar.
**Beslut:** [`docs/decisions/effects.md`](../decisions/effects.md) (E#) · **Bygger på:** [`catalog.md`](../decisions/catalog.md) (K#), [`round.md`](../decisions/round.md) (R#), [`views.md`](../decisions/views.md) (V#), [`001_motorbeslut.md`](001_motorbeslut.md) (M#)

## Struktur

- Katalogen (`src/catalog/`) är data: kostnad, val, krav, förflyttningar.
- Effekterna ligger i `src/effects/`: en `Effect` (`resolve`, ev. `resume`) per aktions-id i `EFFECTS`. `ACTION_CATALOG` kopplar ihop dem med `withEffects`.
- `stubbedActionIds()` listar aktioner som fortfarande saknar effekt. DoD = tom lista.
- Gemensamma primitiver växer fram här (SPEC B11, R19): `moveEffect`, `bleedCity`, `addIncome` först; hunt roll, stat-buffar, stadsstats och strid sedan.
- Allt som spelaren får veta om en effekt är ett event med rätt publik (M18, V10). Standard är bara den agerande spelaren. Andra ser aktionen via `action_observed`, och effekter på publika värden (stadens blood flow, stability) syns i vyn.

## Ordning (en PR per steg)

| Steg | Innehåll | Status |
|---|---|---|
| 1 | Ramverk (`src/effects/`), Move, Sail, minionernas Move/Sail, Archon Movement, Bleed, Bleed the Enemy, Aaron's Feeding Razor, inkomstfaserna 5a–5c, Bottomless Wealth, Diamond of Toreador, (M)Presence delegerar. Monstrous och Picky eater. | ✅ PR #10 |
| 2 | Enkla effekter utan hunt roll: stat-buffar (Watchful Eyes, In the Shadows, Blood for Blood, Potence, Fortitude …), Get a Minion, Bestow Gifts, Grow in Power, Give, Awaken, Summon the Storm, stadsstats (Sabotage-varianterna, Control the Masquerade, Build my Kingdom, Build on the Master's Kingdom), Reward Loyalty, Buy Votes. | Del 1 (PR #11): Watchful Eyes, In the Shadows, Blood for Blood, Hide, Get a Minion, Bestow Gifts, Awaken, Control the Masquerade (E14–E21). Resten nästa PR. |
| 3 | Hunt roll och strid (M11): Attack!, Archon Attack, Diablerie, Steal an Artifact, Look for Artifacts (anropar `learnArtifactsOf`, S24), Bodyguard, Guard the Master, torpor och brända minions. Pausläget finns redan. | |
| 4 | Stealth per entry (Obfuscate, Partner in Crime, (M)Oblivion) in i observationen, och informationsaktioner (Auspex, Search, Keep an Eye on Them, Sabbat Interrogations) med en modell för "känd information" (BACKLOG). Artefaktkunskapen finns redan (`src/state/knowledge.ts`, S24/V20). | |
| 5 | Territorium: contest och contest-kostnad, Fight for Control (fas 4a), Conquer New Territory, Expansion, Second Tradition, Anarch Revolt, Go Anarch, Invite to the Camarilla, VP för tagna städer, Claim Credit, blood för förlorad stad. | |
| 6 | Resten av sekt- och titelaktionerna (Sabbat, Anarch, Justicar, Inner Circle) och artefakterna. | |
| 7 | Klanernas boons och curses, fas 4b och 4d (masquerade-kollaps), start-of-round-effekter (2a–2c). | |

Ordningen kan ändras om ett senare steg blockerar ett tidigare. Sidofynd går till `BACKLOG.md`, designfrågor under "Olösta designerfrågor".

## Steg 1 i detalj

1. `src/effects/util.ts`: läsa val ur entryn, utförarens stad, `ok`/`fail`.
2. `src/effects/movement.ts`: `moveEffect(rule)` med regler `adjacent`, `within(n)`, `sail`. Kontrollen görs igen vid upplösning mot var utföraren faktiskt är (K4).
3. `src/effects/blood.ts`: `bleedCity` (modifier på stadens blood flow som gäller ronden, inkomst i 5b) och `addIncome` (5c). Väntande inkomst ligger i `RoundResolution.scratch.income`, så den överlever en paus.
4. `src/effects/income.ts`: faserna 5a (stadernas blood flow till controllern, inte contested), 5b (bleeds), 5c (annan inkomst). Inbyggda i `resolveRound`, före hooks.
5. Fas 5d tar bort utgångna stadsmodifiers.
6. Tester i `test/effects/`.
