/**
 * Discipline actions (gd:1214–1281). Basaktionen kräver disciplinen, (M)-aktionen
 * att den är bemästrad.
 */
import { DISCIPLINES, type Discipline, type DisciplineLevel } from '../../state/enums.js';
import type { ActionDefinition } from '../../round/actions.js';
import type { MinionId } from '../../state/ids.js';
import type { CatalogContext, ParamSpec } from '../types.js';
import { define, movesTo, type Def } from '../define.js';
import {
  characterParam,
  choiceParam,
  citiesAdjacentTo,
  citiesWithin,
  cityParam,
  allCities,
  here,
  knownMinionLevel,
  laterEntries,
  listParam,
  ownMinion,
  ownMinions,
  othersMinions,
  playerParam,
  strParam,
  vampires,
} from '../options.js';
import { STAT_CHOICES } from './personal.js';

const disc = (key: Discipline, level: DisciplineLevel, d: Omit<Def, 'category' | 'performer' | 'requires'>): ActionDefinition =>
  define({ ...d, category: 'discipline', performer: 'vampire', requires: { discipline: { key, level } } });

const B = 'basic' as const;
const M = 'mastered' as const;

const DISCIPLINE_NAMES = (ctx: CatalogContext, d: Discipline) => ctx.content.disciplines[d].name;

/** Entries längre ner i listan som vampyren själv gör, i angivna kategorier. */
const ownLaterEntry = (key: string, label: string, categories: string[]): ParamSpec => ({
  key,
  label,
  kind: 'entry',
  options: (ctx) =>
    laterEntries(
      ctx,
      (a) => a.performer.kind === 'vampire' && categories.includes(ctx.registry[a.actionId]?.category ?? ''),
      (a, i) => `${i + 1}. ${ctx.registry[a.actionId]?.name ?? a.actionId}`,
    ),
});

export const DISCIPLINE_ACTIONS: ActionDefinition[] = [
  // --- Animalism
  disc('animalism', B, { id: 'animalism', name: 'Animalism', stealth: 'undetectable', cost: 0 }),
  disc('animalism', M, {
    id: 'animalism_m',
    name: '(M) Animalism',
    stealth: 2,
    cost: 10,
    params: (ctx) => {
      const specs: ParamSpec[] = [
        choiceParam('mode', 'Choose', [
          ['wolves', 'Wolves hunt blood in all adjacent cities'],
          ['birds', 'Birds: +2 intercept for the rest of the round'],
          ['rats', 'Rats: adjacent city −1 intercept'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'rats') specs.push(cityParam('city', 'Adjacent city', (c) => citiesAdjacentTo(c, here(c))));
      return specs;
    },
  }),
  // --- Auspex
  disc('auspex', B, {
    id: 'auspex',
    name: 'Auspex',
    stealth: 'undetectable',
    cost: 10,
    trifle: true,
    params: [
      playerParam('target', 'Vampire'),
      {
        key: 'learn',
        label: 'Choose two',
        kind: 'choice',
        multiple: { min: 2, max: 2 },
        options: () => [
          { value: 'lowest_faction', label: 'Lowest stealth on a faction action' },
          { value: 'highest_personal', label: 'Highest stealth on a personal action' },
          { value: 'minions_here', label: 'All actions by the vampire\'s minions in your city' },
        ],
      },
    ],
  }),
  disc('auspex', M, {
    id: 'auspex_m',
    name: '(M) Auspex',
    stealth: 'undetectable',
    cost: 10,
    params: (ctx) => {
      const specs: ParamSpec[] = [
        choiceParam('mode', 'Choose', [
          ['track', 'Follow a vampire\'s path this round'],
          ['locate', 'Find up to 5 vampires, minions or artifacts'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'track') specs.push(playerParam('target', 'Vampire'));
      if (strParam(ctx, 'mode') === 'locate') {
        specs.push({
          key: 'targets',
          label: 'Vampires and minions',
          kind: 'character',
          multiple: { min: 0, max: 5 },
          options: (c) => [...vampires(c), ...othersMinions(c)],
        });
        specs.push({
          key: 'artifacts',
          label: 'Artifacts',
          kind: 'artifact_key',
          multiple: { min: 0, max: 5 },
          options: (c) =>
            Object.values(c.content.artifacts)
              .filter((a) => a.key !== 'thaumaturgic_creation')
              .map((a) => ({ value: a.key, label: a.name })),
        });
      }
      return specs;
    },
    eligible: (ctx) => {
      if (strParam(ctx, 'mode') !== 'locate') return null;
      const n = listParam(ctx, 'targets').length + listParam(ctx, 'artifacts').length;
      return n >= 1 && n <= 5 ? null : 'Choose 1–5 to find';
    },
  }),
  // --- Celerity
  disc('celerity', B, {
    id: 'celerity',
    name: 'Celerity',
    stealth: 0,
    cost: 10,
    resolve: (ctx) => {
      ctx.resolveImmediately(2);
      return { status: 'resolved' };
    },
  }),
  disc('celerity', M, {
    id: 'celerity_m',
    name: '(M) Celerity',
    stealth: 0,
    cost: 20,
    params: [cityParam('to', 'City at most 3 steps away', (ctx) => citiesWithin(ctx, here(ctx), 3))],
    moves: movesTo(),
  }),
  // Chimerstry och (M) Chimerstry byggs om och är borttagna (docs/engine/not-fixed-actions.md).
  // Dementation och (M) Dementation kräver GM och är borttagna (docs/engine/not-fixed-actions.md).
  // --- Dominate
  disc('dominate', B, {
    id: 'dominate',
    name: 'Dominate',
    stealth: 1,
    cost: 0,
    params: [characterParam('target', 'Vampire or minion in the same city'), cityParam('to', 'To city', (ctx) => allCities(ctx))],
  }),
  disc('dominate', M, {
    id: 'dominate_m',
    name: '(M) Dominate',
    stealth: 0,
    cost: (ctx) => {
      const level = knownMinionLevel(ctx.view, strParam(ctx, 'target') ?? '');
      return level === null ? 0 : ([25, 50, 100][level - 1] ?? 100);
    },
    params: [{ key: 'target', label: 'Another player\'s minion', kind: 'minion', options: (ctx) => othersMinions(ctx) }],
  }),
  // --- Fortitude
  disc('fortitude', B, { id: 'fortitude', name: 'Fortitude', stealth: 'undetectable', cost: 10 }),
  disc('fortitude', M, { id: 'fortitude_m', name: '(M) Fortitude', stealth: 'undetectable', cost: 0, trifle: true }),
  // --- Obfuscate
  disc('obfuscate', B, {
    id: 'obfuscate',
    name: 'Obfuscate',
    stealth: 'undetectable',
    cost: 0,
    params: [ownLaterEntry('entry', 'Personal or discipline action further down', ['personal', 'discipline'])],
  }),
  disc('obfuscate', M, { id: 'obfuscate_m', name: '(M) Obfuscate', stealth: 'undetectable', cost: 10 }),
  // --- Oblivion
  disc('oblivion', B, {
    id: 'oblivion',
    name: 'Oblivion',
    stealth: 1,
    cost: 10,
    params: [playerParam('target', 'Vampire', { includeSelf: true })],
  }),
  disc('oblivion', M, {
    id: 'oblivion_m',
    name: '(M) Oblivion',
    stealth: 2,
    cost: 15,
    params: [
      {
        key: 'entries',
        label: 'Up to 2 minion actions further down',
        kind: 'entry',
        multiple: { min: 1, max: 2 },
        options: (ctx) =>
          laterEntries(
            ctx,
            (a) => a.performer.kind === 'minion',
            (a, i) => `${i + 1}. ${ctx.registry[a.actionId]?.name ?? a.actionId}`,
          ),
      },
    ],
  }),
  // --- Potence
  disc('potence', B, { id: 'potence', name: 'Potence', stealth: 'undetectable', cost: 0 }),
  disc('potence', M, {
    id: 'potence_m',
    name: '(M) Potence',
    stealth: 0,
    cost: 10,
    params: [{ key: 'target', label: 'Minion LV2 or lower in the same city', kind: 'minion', options: (ctx) => othersMinions(ctx, { maxLevel: 2 }) }],
  }),
  // --- Presence
  disc('presence', B, {
    id: 'presence',
    name: 'Presence',
    stealth: 'undetectable',
    cost: 0,
    params: (ctx) => {
      const specs: ParamSpec[] = [
        choiceParam('mode', 'Whose faction action', [
          ['own', 'My own, further down the list'],
          ['other', 'Another vampire\'s'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'own') specs.push(ownLaterEntry('entry', 'Faction action further down', ['faction']));
      if (strParam(ctx, 'mode') === 'other') specs.push(playerParam('target', 'Vampire'));
      return specs;
    },
  }),
  // (M) Presence definieras i catalog/index.ts eftersom den behöver hela katalogen.
  // --- Protean
  disc('protean', B, {
    id: 'protean',
    name: 'Protean',
    stealth: 'undetectable',
    cost: 10,
    params: [choiceParam('stat', '+1 to', STAT_CHOICES)],
  }),
  disc('protean', M, {
    id: 'protean_m',
    name: '(M) Protean',
    stealth: 'undetectable',
    cost: 10,
    params: [
      {
        key: 'arrangement',
        label: 'New distribution of base stats',
        kind: 'choice',
        options: (ctx) => {
          const base = { strength: 0, stealth: 0, intercept: 0 };
          for (const m of ctx.view.me.modifiers) if (m.expiresAfterRound === null) base[m.stat] += m.amount;
          const values = [base.strength, base.stealth, base.intercept];
          const seen = new Set<string>();
          const out = [];
          for (const [a, b, c] of [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
          ] as const) {
            const v = `${values[a]}/${values[b]}/${values[c]}`;
            if (seen.has(v)) continue;
            seen.add(v);
            out.push({ value: v, label: `Strength ${values[a]}, Stealth ${values[b]}, Intercept ${values[c]}` });
          }
          return out;
        },
      },
    ],
  }),
  // --- Thaumaturgy
  disc('thaumaturgy', B, {
    id: 'thaumaturgy',
    name: 'Thaumaturgy',
    stealth: -1,
    cost: 10,
    trifle: true,
    params: [
      playerParam('target', 'Vampire', { includeSelf: true }),
      {
        key: 'discipline',
        label: 'Discipline (basic action)',
        kind: 'choice',
        options: (ctx) => DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_NAMES(ctx, d) })),
      },
    ],
  }),
  disc('thaumaturgy', M, {
    id: 'thaumaturgy_m',
    name: '(M) Thaumaturgy',
    stealth: 0,
    cost: 50,
    params: (ctx) => {
      const specs: ParamSpec[] = [
        choiceParam('mode', 'Choose', [
          ['burn_artifact', 'Burn an artifact and give its action to a vampire'],
          ['create', 'Create an artifact with one of your basic disciplines'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'burn_artifact') {
        specs.push({
          key: 'artifact',
          label: 'Own artifact',
          kind: 'artifact',
          options: (c) => c.view.me.artifacts.map((a) => ({ value: a.id, label: c.content.artifacts[a.definition].name })),
        });
        specs.push(playerParam('target', 'Vampire in the same city', { includeSelf: true }));
      }
      if (strParam(ctx, 'mode') === 'create') {
        specs.push({
          key: 'discipline',
          label: 'Discipline',
          kind: 'choice',
          options: (c) =>
            DISCIPLINES.filter((d) => c.view.me.disciplines[d] !== undefined).map((d) => ({
              value: d,
              label: DISCIPLINE_NAMES(c, d),
            })),
        });
      }
      return specs;
    },
  }),
  // --- Vicissitude
  disc('vicissitude', B, {
    id: 'vicissitude',
    name: 'Vicissitude',
    stealth: 0,
    cost: 10,
    params: (ctx) => {
      const specs: ParamSpec[] = [
        choiceParam('mode', 'Choose', [
          ['gain_ghoul', 'Gain a LV1 Ghoul'],
          ['gain_harpy', 'Gain a LV1 Harpy'],
          ['gain_eye', 'Gain a LV1 Eye'],
          ['merge', 'Burn two identical minions, gain one a level higher'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'merge')
        specs.push({
          key: 'minions',
          label: 'Two minions of the same type and level in your city',
          kind: 'minion',
          multiple: { min: 2, max: 2 },
          options: (c) => ownMinions(c, { maxLevel: 2, types: ['ghoul', 'harpy', 'eye'], inCity: c.positions.vampire }),
        });
      return specs;
    },
    eligible: (ctx) => {
      if (strParam(ctx, 'mode') !== 'merge') return null;
      const [a, b] = listParam(ctx, 'minions').map((id) => ownMinion(ctx.view, id as MinionId));
      if (!a || !b) return 'Choose two of your own minions';
      return a.type === b.type && a.effectiveLevel === b.effectiveLevel ? null : 'The minions must have the same type and level';
    },
  }),
  disc('vicissitude', M, {
    id: 'vicissitude_m',
    name: '(M) Vicissitude',
    stealth: 1,
    cost: 0,
    params: [
      { key: 'minionId', label: 'Minion', kind: 'minion', options: (ctx) => ownMinions(ctx, { types: ['ghoul', 'harpy', 'eye'] }) },
      {
        key: 'type',
        label: 'New type',
        kind: 'choice',
        options: (ctx) => {
          const current = ownMinion(ctx.view, strParam(ctx, 'minionId') as MinionId)?.type;
          return (
            [
              ['ghoul', 'Ghoul'],
              ['harpy', 'Harpy'],
              ['eye', 'Eye'],
            ] as const
          )
            .filter(([t]) => t !== current)
            .map(([value, label]) => ({ value, label }));
        },
      },
    ],
  }),
];
