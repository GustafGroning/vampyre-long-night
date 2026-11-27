# Plan: minions

**Datum:** 2026-11-27
**Källa:** Google Doc "Vampire the long night 2.0", avsnittet MINIONS (plus Hunt i ordlistan, Recruit a Primogen/Archon under Camarilla och Round Break down). Kontrollerat mot 2.0 den 2026-11-27: typer, levels, upkeep (Ghoul 5, Harpy 15, Eye 5, Primogen 20, Archon 0 per level), rekryteringskostnader, traits och alla minionaktioners kostnad och stealth stämmer med `content/minions.ts` och `catalog/actions/minion.ts`. Ingen avvikelse mot `game_design.txt` hittades i det avsnittet.
**Beslut:** E22–E33 i [`docs/decisions/effects.md`](../decisions/effects.md) · **Trello:** kortet "Minions"

## Vad som redan fanns

- Typerna, levels 1–3, stats = level, upkeep i fas 1b (bränner obetalda, M7), ingen upkeep rundan minionen fås.
- Get a Minion, Bestow Gifts, minionernas Move/Sail, Archon Movement, Bleed the Enemy (steg 1–2).
- Informant (Eye, Archon) i observationen (M19).

## Vad den här PR:en bygger

| Del | Var | Beslut |
|---|---|---|
| Hunt roll (D4 + intercept mot D4 + stealth) | `src/effects/hunt.ts` | E24 |
| Ghoul: Sabotage, Partner in Crime, Move the Master | `src/effects/minions.ts` | E25, E26 |
| Harpy: Suicide Mission | `src/effects/minions.ts` | E22 |
| Eye: Hide and Spy (med vila nästa rond), Keep an Eye on Them | `src/effects/minions.ts`, `minionIsResting` i `state/queries.ts` | E27, E29 |
| Primogen: Build on the Master's Kingdom, Recruit a Primogen | `src/effects/minions.ts`, `content/minions.ts` (`PRIMOGEN_SPECIALS`) | E30, E23 |
| Archon: Follow Them, Sabbat Interrogations, The Master's Will | `src/effects/minions.ts`, `src/effects/follow.ts` | E28, E31 |
| Traits: Loyal to the Prince och Camarilla Loyal (fas 4b), Archon-loyalty (fas 4c) | `minionAllegiancePhase`, `archonLoyaltyPhase` | E32, E33 |
| A cursed kiss (+10 på rekrytering), The broken pyramid för Primogen | `src/catalog/recruit.ts` | E23 |

## Vad som väntar

- **Strid (steg 3):** Bodyguard, Guard the Master, Archons Attack och Hide the Master (stealth mot hunt rolls för Diablerie). Traits Meek och Trained gäller bara i strid. De är kvar som stubbar.
- **Not-fixed:** Wait and Strike (Harpy) och Investigate Eye kräver GM och är borttagna (`docs/engine/not-fixed-actions.md`). Recruit an Archon kräver en avklarad mission och är borttagen tills missions byggts om.
- Hunt roll-modifiers från klaner, discipliner och artefakter (BACKLOG).
