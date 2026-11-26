/**
 * Personal actions (gd:1150–1212). Regeltexten citeras inte här; se game_design.txt.
 */
import { ARTIFACT_KEYS } from '../../content/artifacts.js';
import type { ActionDefinition } from '../../round/actions.js';
import { define, movesTo } from '../define.js';
import {
  characterParam,
  citiesAdjacentTo,
  cityParam,
  here,
  numParam,
  ownMinions,
  playerParam,
  sailDestinations,
  vampires,
} from '../options.js';

const RECRUITABLE = [
  ['ghoul', 'Ghoul'],
  ['harpy', 'Harpy'],
  ['eye', 'Eye'],
] as const;

export const PERSONAL_ACTIONS: ActionDefinition[] = [
  define({
    id: 'move',
    name: 'Move',
    category: 'personal',
    performer: 'vampire',
    stealth: 2,
    // Justicar 5, annars 10 (gd:1135). Monstrous (Nosferatu-curse, gd:804): +5.
    cost: ({ view, content }) =>
      (view.me.title === 'justicar' ? 5 : 10) + (content.clans[view.me.clan].curse.key === 'monstrous' ? 5 : 0),
    trifle: (me) => me.title === 'justicar',
    params: [cityParam('to', 'To city', (ctx) => citiesAdjacentTo(ctx, here(ctx)))],
    moves: movesTo(),
  }),
  define({ id: 'bleed', name: 'Bleed', category: 'personal', performer: 'vampire', stealth: 0, cost: 0 }),
  define({
    id: 'watchful_eyes',
    name: 'Watchful Eyes',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 10,
    maxPerRound: 1,
  }),
  define({
    id: 'in_the_shadows',
    name: 'In the Shadows',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 10,
    maxPerRound: 1,
  }),
  define({
    id: 'blood_for_blood',
    name: 'Blood for Blood',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 10,
    maxPerRound: 1,
  }),
  define({
    id: 'attack',
    name: 'Attack!',
    category: 'personal',
    performer: 'vampire',
    stealth: -1,
    cost: 0,
    params: [characterParam('target', 'Target (vampire or minion in the same city)')],
    // Stubb: startar en strid som pausar ronden (M11). Striden byggs i ett senare steg.
    resolve: (ctx) => ({
      status: 'interrupt',
      kind: 'combat',
      data: { attackerId: ctx.player.id, target: ctx.entry.action.params?.target ?? null },
    }),
    resume: () => ({ status: 'resolved' }),
  }),
  define({
    id: 'bestow_gifts',
    name: 'Bestow Gifts',
    category: 'personal',
    performer: 'vampire',
    stealth: 1,
    cost: 25,
    params: [{ key: 'minionId', label: 'Minion', kind: 'minion', options: (ctx) => ownMinions(ctx, { maxLevel: 2 }) }],
  }),
  define({
    id: 'get_a_minion',
    name: 'Get a Minion',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: ({ content, action }) => {
      const type = action.params?.type;
      const level = action.params?.level;
      if ((type !== 'ghoul' && type !== 'harpy' && type !== 'eye') || typeof level !== 'number') return 0;
      return content.minionTypes[type].recruitCost[level - 1] ?? 0;
    },
    params: [
      {
        key: 'type',
        label: 'Type',
        kind: 'choice',
        options: ({ content }) =>
          RECRUITABLE.map(([value, label]) => ({
            value,
            label,
            hint: content.minionTypes[value].recruitCost.join('/'),
          })),
      },
      { key: 'level', label: 'Level', kind: 'number', range: () => ({ min: 1, max: 3, step: 1 }) },
    ],
    // The broken pyramid (Tremere-curse, gd:832): inga Lvl 3-minions.
    eligible: ({ view, content, action }) =>
      action.params?.level === 3 && content.clans[view.me.clan].curse.key === 'the_broken_pyramid'
        ? 'The broken pyramid: cannot have Lvl 3 minions'
        : null,
  }),
  define({
    id: 'grow_in_power',
    name: 'Grow in Power',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: (ctx) => 50 * numParam(ctx, 'exp'),
    trifle: true,
    params: [
      {
        key: 'exp',
        label: 'EXP (50 blood each)',
        kind: 'number',
        range: ({ view, content }) => ({
          min: 1,
          max: Math.max(1, content.rules.expLifetimeCap - view.me.exp.spentTotal),
          step: 1,
        }),
      },
    ],
    eligible: ({ view, content }) =>
      view.me.exp.spentTotal >= content.rules.expLifetimeCap ? `Max ${content.rules.expLifetimeCap} EXP per campaign` : null,
  }),
  define({
    id: 'awaken',
    name: 'Awaken',
    category: 'personal',
    performer: 'vampire',
    stealth: 3,
    cost: 0,
    allowedInTorpor: true,
    params: [
      {
        key: 'target',
        label: 'Who is awakened',
        kind: 'player',
        // I torpor kan man bara väcka sig själv. Annars andra (torpor syns inte, V4).
        options: (ctx) =>
          ctx.view.me.status === 'torpor'
            ? [{ value: ctx.view.me.id, label: ctx.view.me.name }]
            : vampires(ctx),
      },
    ],
  }),
  define({
    id: 'diablerie',
    name: 'Diablerie',
    category: 'personal',
    performer: 'vampire',
    stealth: -1,
    cost: 0,
    params: [playerParam('target', 'Vampire in torpor in the same city')],
  }),
  define({
    id: 'hide',
    name: 'Hide',
    category: 'personal',
    performer: 'vampire',
    stealth: 'undetectable',
    cost: 10,
    endsTurn: true,
  }),
  define({
    id: 'steal_an_artifact',
    name: 'Steal an Artifact',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 15,
    params: [
      {
        key: 'artifact',
        label: 'Artifact in the same city',
        kind: 'artifact_key',
        options: ({ view, content }) => {
          const mine = new Set(view.me.artifacts.map((a) => a.definition));
          return ARTIFACT_KEYS.filter((k) => !mine.has(k) && k !== 'thaumaturgic_creation').map((k) => ({
            value: k,
            label: content.artifacts[k].name,
          }));
        },
      },
    ],
  }),
  define({
    id: 'look_for_artifacts',
    name: 'Look for Artifacts',
    category: 'personal',
    performer: 'vampire',
    stealth: 1,
    cost: 10,
    trifle: true,
    params: [playerParam('target', 'Vampire')],
  }),
  define({
    id: 'sail',
    name: 'Sail',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 15,
    params: [cityParam('to', 'To port', (ctx) => sailDestinations(ctx, here(ctx)))],
    moves: movesTo(),
  }),
  define({
    id: 'summon_the_storm',
    name: 'Summon the Storm',
    category: 'personal',
    performer: 'vampire',
    stealth: 1,
    cost: 100,
    params: [
      {
        key: 'seaRegion',
        label: 'Sea region',
        kind: 'sea_region',
        options: ({ view }) => view.seaRegions.map((s) => ({ value: s.id, label: s.name })),
      },
    ],
  }),
];

export const STAT_CHOICES = [
  ['strength', 'Strength'],
  ['stealth', 'Stealth'],
  ['intercept', 'Intercept'],
] as const;

export const CITY_STAT_STABILITY_INTERCEPT = [
  ['stability', '−1 Stability'],
  ['intercept', '−1 Intercept'],
] as const;

