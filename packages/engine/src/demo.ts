/**
 * Demokampanj för gränssnittet: en liten, giltig kampanj på testkartan som går
 * att rendera direkt. Inte en regelreferens. Justicars är utelämnade eftersom
 * rollen inte finns i V1.
 */
import { DEFAULT_CONTENT, TEST_MAP, type Content } from './content/index.js';
import type { PlayerId } from './state/ids.js';
import { createGameState, type CreateGameInput } from './state/create.js';
import type { GameState } from './state/types.js';
import { startGame } from './round/window.js';
import { resolveRound } from './round/resolve.js';
import type { RoundEvent, Submission } from './round/types.js';

export const DEMO_INPUT: CreateGameInput = {
  campaignId: 'demo',
  seed: 'demo-seed',
  map: TEST_MAP,
  npcs: [{ name: 'King George V' }],
  players: [
    {
      name: 'Lady Margaret Ashworth',
      clan: 'ventrue',
      faction: 'camarilla',
      title: 'inner_circle',
      location: 'south',
      blood: 200,
      disciplines: { dominate: 'mastered', fortitude: 'mastered', presence: 'mastered' },
      minions: [
        { name: 'Ronald', type: 'ghoul', level: 2 },
        { name: 'Jenny Wren', type: 'eye', level: 2 },
      ],
      artifacts: [{ definition: 'black_gloves' }],
      startingVp: 3,
    },
    {
      name: 'Prince Edmund Hale',
      clan: 'hecata',
      faction: 'camarilla',
      title: 'prince',
      location: 'north',
      controls: ['north'],
      blood: 100,
      disciplines: { auspex: 'basic', fortitude: 'basic', oblivion: 'mastered' },
      statBonuses: [{ stat: 'intercept', amount: 1, source: 'creation:stat_upgrade' }],
      minions: [{ name: 'Enzo Romano', type: 'primogen', level: 1 }],
      royalPrivileges: 2,
    },
    {
      name: 'Baron Jack Carver',
      clan: 'brujah',
      faction: 'anarch',
      title: 'baron',
      location: 'west',
      controls: ['west'],
      blood: 150,
      disciplines: { celerity: 'basic', potence: 'mastered', presence: 'basic' },
      minions: [{ name: 'The Dockers', type: 'harpy', level: 1 }],
    },
    {
      name: 'Count Viktor Szabo',
      clan: 'tzimisce',
      faction: 'sabbat',
      title: 'archbishop',
      disguise: { title: 'prince', faction: 'camarilla' },
      location: 'east',
      controls: ['east'],
      blood: 100,
      disciplines: { animalism: 'basic', dominate: 'basic', vicissitude: 'mastered' },
      minions: [{ name: 'Szlachta', type: 'harpy', level: 2 }],
    },
    {
      name: 'Molly Finch',
      clan: 'malkavian',
      faction: 'anarch',
      title: null,
      location: 'south',
      blood: 40,
      disciplines: { auspex: 'basic', dementation: 'basic', obfuscate: 'basic' },
      statBonuses: [{ stat: 'intercept', amount: 1, source: 'creation:stat_upgrade' }],
    },
  ],
  artifactPool: [{ definition: 'bloodspot_dice' }, { definition: 'fog_flute' }],
};

/** Spelar-id i demokampanjen. */
export const DEMO_PLAYERS = {
  innerCircle: 'player-1' as PlayerId,
  prince: 'player-2' as PlayerId,
  baron: 'player-3' as PlayerId,
  hiddenArchbishop: 'player-4' as PlayerId,
  untitled: 'player-5' as PlayerId,
};

/** Demokampanjen i rond 1, öppen för inlämning. */
export function createDemoGame(content: Content = DEFAULT_CONTENT): GameState {
  return startGame(createGameState(DEMO_INPUT, content));
}

/**
 * Demokampanjen efter en löst rond 1 (skelettets stubbaktioner, så inga effekter
 * utöver betalning), med events att visa. Staten står i rond 2.
 */
export function createDemoRound(content: Content = DEFAULT_CONTENT): { state: GameState; events: RoundEvent[] } {
  const state = createDemoGame(content);
  const sub = (playerId: PlayerId, actions: Submission['actions']): Submission => ({
    playerId,
    actions,
    royalPrivilegesToSpend: 0,
    locked: true,
    updatedAt: 0,
  });
  const v = { kind: 'vampire' } as const;
  const submissions: Record<PlayerId, Submission> = {
    [DEMO_PLAYERS.innerCircle]: sub(DEMO_PLAYERS.innerCircle, [{ actionId: 'bleed', performer: v }]),
    [DEMO_PLAYERS.prince]: sub(DEMO_PLAYERS.prince, [{ actionId: 'bleed', performer: v }]),
    [DEMO_PLAYERS.baron]: sub(DEMO_PLAYERS.baron, [{ actionId: 'hide', performer: v }]),
    [DEMO_PLAYERS.hiddenArchbishop]: sub(DEMO_PLAYERS.hiddenArchbishop, [{ actionId: 'bleed', performer: v }]),
    [DEMO_PLAYERS.untitled]: sub(DEMO_PLAYERS.untitled, [{ actionId: 'bleed', performer: v }]),
  };
  const result = resolveRound(state, submissions, 'demo-round-1', { content });
  if (result.status !== 'completed') throw new Error('The demo round paused unexpectedly');
  return { state: result.state, events: result.resolution.events };
}
