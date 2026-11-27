# @vampyre/engine

Deterministisk spelmotor för Vampire: The Long Night. Ingen databas, inget UI, ingen klocka.
Kärnprincip: `spelstatus + spelaraktioner -> ny spelstatus`.

```sh
npm install          # i repots rot
npm test             # alla tester (Vitest)
npm run typecheck    # tsc --noEmit
```

## Innehåll

| Mapp | Innehåll |
|---|---|
| `src/state/` | `GameState`-typer, id:n, härledda värden (`queries.ts`), invarianter (`validate.ts`), skapande av kampanj (`create.ts`), JSON-hjälpare |
| `src/content/` | Referensdata: klaner, discipliner, titlar, minion-typer, artefakter, regelkonstanter, kartmallar |
| `src/rng.ts` | Seedad RNG (sfc32), serialiserbar, med delströmmar |
| `src/round/` | Rondens skelett: inlämning, budget, `resolveRound` |
| `src/catalog/` | Actionkatalogen (`ACTION_CATALOG`): alla aktioner som data, meny, målval och utkastanalys (`docs/decisions/catalog.md`) |
| `src/effects/` | Aktionernas effekter (`EFFECTS`) och inkomstfaserna 5a–5c (`docs/decisions/effects.md`). `stubbedActionIds()` listar aktioner som ännu saknar effekt. Minionernas aktioner och traits i `minions.ts`, hunt roll i `hunt.ts`, Follow Them i `follow.ts` (`docs/engine/minions-plan.md`) |
| `src/view/` | Per-spelare-vyer (`buildPlayerView`), GM-vy och observation (`observersOfAction`) |
| `src/demo.ts` | Demokampanj för gränssnittet (`createDemoGame`, `createDemoRound`) |
| `src/characters/` | Karaktärsskapande, backlog, lobby och kampanjstart (`docs/decisions/characters.md`) |
| `test/` | Tester och fixturer (`test/fixtures.ts` har en kampanj med en spelare per titel) |

Besluten bakom modellen står i `docs/decisions/state.md`, `round.md`, `views.md`, `catalog.md` och `effects.md`.

## Gränssnittet

UI:t ska bara rendera `PlayerView`, aldrig `GameState`:

```ts
import { buildPlayerView, createDemoRound, DEFAULT_CONTENT, DEMO_PLAYERS } from '@vampyre/engine';

const { state, events } = createDemoRound();
const view = buildPlayerView(state, DEFAULT_CONTENT, DEMO_PLAYERS.prince, { events });
// view.me = allt om den egna vampyren, view.players/cities/minions = det som är publikt,
// view.events = det spelaren fick se under ronden.
// view.map = karta med bara garanterade positioner (skicka förra rondens events),
// view.resources = resursraden (blood, VP, artefakter, minions, Vampiric Society-röster).
```

## Actionpanelen

Allt räknas från `PlayerView`, så klienten kan köra det direkt:

```ts
import { analyzeDraft, listAvailableActions, nextParam } from '@vampyre/engine';

const menu = listAvailableActions(view, DEFAULT_CONTENT, actions, {}); // en rad per action + utförare
const list = [...actions, { actionId: 'move', performer: { kind: 'vampire' }, key: 'e5' }];
const req = nextParam(view, DEFAULT_CONTENT, list, list.length - 1); // { key: 'to', options: grannstäder }
const draft = analyzeDraft(view, DEFAULT_CONTENT, { actions: list, royalPrivilegesToSpend: 0 }, {});
// draft.ap = { used, total }, draft.totalCost, draft.totalIncome, draft.entries[i].errors, draft.canConfirm
```

## Exempel

```ts
import { DEFAULT_CONTENT, TEST_MAP, createGameState, createRng, deriveSeed, playerVp } from '@vampyre/engine';

const state = createGameState(
  {
    campaignId: 'demo',
    seed: 'demo-seed',
    map: TEST_MAP,
    players: [
      { name: 'Victor', clan: 'nosferatu', faction: 'camarilla', title: 'prince',
        location: 'north', controls: ['north'], blood: 100,
        disciplines: { animalism: 'mastered', obfuscate: 'basic', potence: 'basic' } },
    ],
  },
  DEFAULT_CONTENT,
);

const rng = createRng(deriveSeed(state.seed, 'round', 1));
rng.die(4); // D4
```
