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
| `src/round/` | Rondens skelett (egen tråd) |
| `test/` | Tester och fixturer (`test/fixtures.ts` har en kampanj med en spelare per titel) |

Besluten bakom modellen står i `docs/decisions/state.md`.

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
