/**
 * Testfixturer: en liten kampanj på testkartan med en spelare per titel,
 * inklusive en dold Archbishop.
 */
import {
  DEFAULT_CONTENT,
  TEST_MAP,
  createGameState,
  type CreateGameInput,
  type GameState,
  type PlayerId,
} from '../src/index.js';

export const content = DEFAULT_CONTENT;

export const SAMPLE_INPUT: CreateGameInput = {
  campaignId: 'test-campaign',
  seed: 'test-seed',
  map: TEST_MAP,
  npcs: [{ name: 'King George V' }],
  players: [
    {
      name: 'Lady Inner',
      clan: 'ventrue',
      faction: 'camarilla',
      title: 'inner_circle',
      location: 'south',
      blood: 200,
      disciplines: { dominate: 'mastered', fortitude: 'mastered', presence: 'mastered' },
      minions: [
        { name: 'Ron', type: 'ghoul', level: 2 },
        { name: 'Jenny', type: 'eye', level: 2 },
        { name: 'G1', type: 'ghoul', level: 1 },
        { name: 'G2', type: 'ghoul', level: 1 },
      ],
      artifacts: [{ definition: 'black_gloves' }],
      startingVp: 3,
    },
    {
      name: 'Justicar Judge',
      clan: 'banu_haqim',
      faction: 'camarilla',
      title: 'justicar',
      location: 'north',
      blood: 150,
      disciplines: { celerity: 'mastered', obfuscate: 'mastered', thaumaturgy: 'basic' },
      minions: [{ name: 'Mary Stuart', type: 'archon', level: 2 }],
      artifacts: [{ definition: 'ring_of_tremere', boundDiscipline: 'auspex' }],
    },
    {
      name: 'Prince North',
      clan: 'hecata',
      faction: 'camarilla',
      title: 'prince',
      location: 'north',
      controls: ['north'],
      blood: 100,
      disciplines: { auspex: 'basic', fortitude: 'basic', oblivion: 'mastered' },
      statBonuses: [
        { stat: 'strength', amount: 1, source: 'creation:stat_upgrade' },
        { stat: 'stealth', amount: 1, source: 'exp:unseen' },
      ],
      minions: [{ name: 'Enzo Romano', type: 'primogen', level: 1 }],
      royalPrivileges: 2,
      expSpent: 4,
    },
    {
      name: 'Baron West',
      clan: 'brujah',
      faction: 'anarch',
      title: 'baron',
      location: 'west',
      controls: ['west'],
      blood: 150,
      disciplines: { celerity: 'basic', potence: 'mastered', presence: 'basic' },
      minions: [
        { name: 'Gang', type: 'harpy', level: 1 },
        { name: 'Rat', type: 'ghoul', level: 1 },
      ],
    },
    {
      name: 'Secret Bishop',
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
      name: 'Nobody',
      clan: 'malkavian',
      faction: 'anarch',
      title: null,
      location: 'isle',
      blood: 40,
      disciplines: { auspex: 'basic', dementation: 'basic', obfuscate: 'basic' },
    },
  ],
  artifactPool: [{ definition: 'bloodspot_dice' }, { definition: 'fog_flute' }],
};

export function sampleState(): GameState {
  return createGameState(SAMPLE_INPUT, content);
}

/** Spelar-id enligt indataordning: player-1 = Inner Circle … player-6 = utan titel. */
export const P = {
  inner: 'player-1' as PlayerId,
  justicar: 'player-2' as PlayerId,
  prince: 'player-3' as PlayerId,
  baron: 'player-4' as PlayerId,
  bishop: 'player-5' as PlayerId,
  untitled: 'player-6' as PlayerId,
};
