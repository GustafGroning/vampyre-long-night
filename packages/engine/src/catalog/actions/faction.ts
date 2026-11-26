/**
 * Faction actions: gemensamma, Camarilla, Anarch och Sabbat (gd:962–1139).
 */
import type { ActionDefinition } from '../../round/actions.js';
import type { CityId, MinionId, PlayerId } from '../../state/ids.js';
import type { ParamSpec } from '../types.js';
import { define, movesTo } from '../define.js';
import {
  allCities,
  characterParam,
  choiceParam,
  cityById,
  cityParam,
  citiesAdjacentTo,
  citiesOfSect,
  citySect,
  controlledCities,
  domainCities,
  here,
  listParam,
  numParam,
  ownMinion,
  ownMinions,
  playerParam,
  sabbatBaseCities,
  strParam,
  vampires,
} from '../options.js';

const STABILITY_OR_INTERCEPT = [
  ['stability', '−1 Stability'],
  ['intercept', '−1 Intercept'],
] as const;

const anyCity = (key: string, label: string): ParamSpec => cityParam(key, label, (ctx) => allCities(ctx));

// ---------------------------------------------------------------------------
// Gemensamma (alla sekter)

const COMMON: ActionDefinition[] = [
  define({
    id: 'give',
    name: 'Give',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    // Blodet som ges bort räknas som kostnad: det lämnar spelaren och återbetalas om aktionen misslyckas (K6).
    cost: (ctx) => numParam(ctx, 'blood'),
    slot: 'free',
    params: [
      {
        key: 'recipient',
        label: 'Recipient',
        kind: 'player',
        options: (ctx) => [...vampires(ctx), ...ctx.view.npcs.map((n) => ({ value: n.id, label: n.name }))],
      },
      { key: 'blood', label: 'Blood', kind: 'number', range: ({ view }) => ({ min: 0, max: Math.max(0, view.me.blood), step: 1 }) },
      { key: 'minions', label: 'Minions', kind: 'minion', multiple: { min: 0, max: 99 }, options: (ctx) => ownMinions(ctx) },
      {
        key: 'artifacts',
        label: 'Artifacts',
        kind: 'artifact',
        multiple: { min: 0, max: 99 },
        options: ({ view, content }) =>
          view.me.artifacts.map((a) => ({ value: a.id, label: content.artifacts[a.definition].name })),
      },
    ],
    eligible: (ctx) =>
      numParam(ctx, 'blood') === 0 && listParam(ctx, 'minions').length === 0 && listParam(ctx, 'artifacts').length === 0
        ? 'Give must give something'
        : null,
  }),
  define({
    id: 'fight_for_control',
    name: 'Fight for Control',
    category: 'faction',
    performer: 'vampire',
    stealth: -3,
    cost: 25,
    params: [
      cityParam('city', 'City you contest', (ctx) =>
        allCities(ctx, (c) => c.contestants.some((x) => x.playerId === ctx.view.me.id)),
      ),
    ],
  }),
  define({
    id: 'search',
    name: 'Search',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 20,
    params: [cityParam('city', 'City in your domain', domainCities)],
  }),
  define({
    id: 'conquer_new_territory',
    name: 'Conquer New Territory',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 150,
    requires: { noTitle: true },
  }),
  define({
    id: 'buy_votes',
    name: 'Buy Votes',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: (ctx) => numParam(ctx, 'blood'),
    slot: 'free',
    // Även icke-Camarilla kan köpa röster (gd:572), så inget sektkrav.
    params: [
      {
        key: 'blood',
        label: 'Blood (10 per vote)',
        kind: 'number',
        range: ({ view }) => ({ min: 10, max: Math.max(10, view.me.blood - (view.me.blood % 10)), step: 10 }),
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Camarilla

const KINGDOM_PICKS = [
  ['intercept', '+1 Intercept', 10],
  ['stability', '+1 Stability', 10],
  ['blood_flow', '+25 Blood flow', 50],
  ['camarilla_order', 'Special: Camarilla Order', 15],
  ['secure_haven', 'Special: Secure Haven', 10],
  ['camarilla_ball', 'Special: Camarilla Ball', 25],
  ['influence', '+2 Influence', 15],
] as const;
const KINGDOM_COST = new Map<string, number>(KINGDOM_PICKS.map(([k, , c]) => [k, c]));

const CAMARILLA: ActionDefinition[] = [
  define({
    id: 'control_the_masquerade',
    name: 'Control the Masquerade',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 10,
    trifle: true,
    factions: ['camarilla'],
    params: [anyCity('city', 'City')],
  }),
  define({
    id: 'claim_credit',
    name: 'Claim Credit',
    category: 'faction',
    performer: 'vampire',
    stealth: -2,
    cost: ({ view }) => (view.me.title === 'inner_circle' ? 0 : 25),
    factions: ['camarilla'],
    maxPerRound: 1,
    params: [playerParam('target', 'Prince or Justicar', { titles: ['prince', 'justicar'] })],
  }),
  define({
    id: 'invite_to_the_camarilla',
    name: 'Invite to the Camarilla',
    category: 'faction',
    performer: 'vampire',
    stealth: -2,
    cost: 10,
    factions: ['camarilla'],
    params: [playerParam('target', 'Anarch', { factions: ['anarch'] })],
  }),
  define({
    id: 'go_anarch',
    name: 'Go Anarch',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 0,
    factions: ['camarilla'],
    exclusive: true,
  }),
  // --- Prince
  define({
    id: 'build_my_kingdom',
    name: 'Build My Kingdom',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: (ctx) => listParam(ctx, 'picks').reduce((s, k) => s + (KINGDOM_COST.get(k) ?? 0), 0),
    titles: ['prince'],
    oncePerRoundPer: 'city',
    params: [
      cityParam('city', 'City you control', controlledCities),
      {
        key: 'picks',
        label: 'Three improvements',
        kind: 'choice',
        multiple: { min: 3, max: 3 },
        options: () => KINGDOM_PICKS.map(([value, label, cost]) => ({ value, label, hint: `${cost} blood` })),
      },
    ],
  }),
  define({
    id: 'second_tradition',
    name: 'Second Tradition',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 15,
    titles: ['prince'],
    params: [
      characterParam('target', 'Vampire or minion in your domain'),
      {
        key: 'harpies',
        label: 'Harpies that come along',
        kind: 'minion',
        multiple: { min: 0, max: 99 },
        options: (ctx) => {
          const domain = new Set(ctx.view.me.domain);
          return ownMinions(ctx, { types: ['harpy'] }).filter((o) => {
            const at = ctx.positions.minions[o.value as MinionId];
            return at === null || (at !== undefined && domain.has(at));
          });
        },
      },
    ],
    // Man flyttar till målets stad, som spelaren inte vet var den är (K4).
    moves: (ctx) => [
      { performer: { kind: 'vampire' }, to: null },
      ...listParam(ctx, 'harpies').map((id) => ({ performer: { kind: 'minion' as const, minionId: id as MinionId }, to: null })),
    ],
    locksMinions: (ctx) => listParam(ctx, 'harpies') as MinionId[],
    // Vid upplösning är målets stad känd: utföraren hamnar där (V16).
    destination: ({ state, entry }) => {
      const t = entry.action.params?.['target'];
      if (typeof t !== 'string') return null;
      return state.players[t as PlayerId]?.location ?? state.minions[t as MinionId]?.location ?? null;
    },
  }),
  define({
    id: 'expansion',
    name: 'Expansion',
    category: 'faction',
    performer: 'vampire',
    stealth: -2,
    variableCost: true,
    cost: (ctx) => {
      if (strParam(ctx, 'mode') !== 'pay') return 50;
      const city = cityById(ctx.view, strParam(ctx, 'city') as CityId);
      return 50 + 10 * (city?.effective.bloodFlow ?? 0);
    },
    titles: ['prince'],
    params: (ctx) => {
      const base: ParamSpec[] = [
        cityParam('city', 'City adjacent to one you control', (c) => {
          const mine = c.view.cities.filter((x) => x.controllerId === c.view.me.id);
          const near = new Set(mine.flatMap((x) => x.adjacent));
          return allCities(c, (x) => near.has(x.id) && x.controllerId !== c.view.me.id);
        }),
        choiceParam('mode', 'How', [
          ['pay', 'Pay blood flow × 10 and take the city'],
          ['contest', 'Move there and contest'],
        ]),
      ];
      if (strParam(ctx, 'mode') === 'contest')
        base.push({
          key: 'minions',
          label: 'Minions that come along',
          kind: 'minion',
          multiple: { min: 0, max: 99 },
          options: (c) => ownMinions(c, { inCity: c.positions.vampire }),
        });
      return base;
    },
    moves: (ctx) =>
      strParam(ctx, 'mode') === 'contest'
        ? [
            ...movesTo('city')(ctx),
            ...listParam(ctx, 'minions').map((id) => ({
              performer: { kind: 'minion' as const, minionId: id as MinionId },
              to: strParam(ctx, 'city') as CityId,
            })),
          ]
        : [],
    locksMinions: (ctx) => (strParam(ctx, 'mode') === 'contest' ? (listParam(ctx, 'minions') as MinionId[]) : []),
  }),
  define({
    id: 'recruit_a_primogen',
    name: 'Recruit a Primogen',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: ({ content, action }) => {
      const l = action.params?.level;
      return typeof l === 'number' ? (content.minionTypes.primogen.recruitCost[l - 1] ?? 0) : 0;
    },
    titles: ['prince'],
    params: [
      cityParam('city', 'City in your domain', domainCities),
      { key: 'level', label: 'Level', kind: 'number', range: () => ({ min: 1, max: 3, step: 1 }) },
    ],
  }),
  define({
    id: 'sabotage',
    name: 'Sabotage',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 20,
    titles: ['prince'],
    params: [anyCity('city', 'City'), choiceParam('stat', 'Effect', STABILITY_OR_INTERCEPT)],
  }),
  // --- Justicar
  define({
    id: 'iron_fist_of_the_camarilla',
    name: 'Iron Fist of the Camarilla',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 20,
    titles: ['justicar'],
    params: [characterParam('target', 'Vampire or minion')],
  }),
  define({
    id: 'investigate_the_sabbat',
    name: 'Investigate the Sabbat',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 10,
    titles: ['justicar'],
    params: [anyCity('city', 'City')],
  }),
  define({
    id: 'expose_the_sabbat',
    name: 'Expose the Sabbat!',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 50,
    titles: ['justicar'],
    maxPerRound: 1,
    params: [playerParam('target', 'Prince or Baron in the same city', { titles: ['prince', 'baron'] })],
  }),
  // --- Inner Circle
  define({
    id: 'bottomless_wealth_of_the_camarilla',
    name: 'Bottomless Wealth of the Camarilla',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 0,
    income: 250,
    titles: ['inner_circle'],
    maxPerRound: 1,
    forbidsMovement: true,
  }),
  define({
    id: 'reward_loyalty',
    name: 'Reward Loyalty',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 25,
    trifle: true,
    titles: ['inner_circle'],
    maxPerRound: 1,
    params: [playerParam('target', 'Prince or Justicar', { titles: ['prince', 'justicar'] })],
  }),
  define({
    id: 'fifth_tradition',
    name: 'Fifth Tradition',
    category: 'faction',
    performer: 'vampire',
    stealth: -1,
    cost: 30,
    titles: ['inner_circle'],
  }),
  define({
    id: 'punish_treason',
    name: 'Punish Treason',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 0,
    titles: ['inner_circle'],
    oncePerRoundPer: 'target',
    params: [playerParam('target', 'Camarilla vampire', { factions: ['camarilla'] })],
  }),
  define({
    id: 'pardon',
    name: 'Pardon',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 25,
    titles: ['inner_circle'],
    params: [playerParam('target', 'Vampire with a blood hunt', { bloodHunt: true, includeSelf: true })],
  }),
];

// ---------------------------------------------------------------------------
// Anarch

const REVOLT_CHOICES = [
  ['burn_minions', 'D4 against each Camarilla and Sabbat minion in the city'],
  ['oust_ruler', 'Drive out the city\'s ruler (−D100 blood)'],
  ['bleed', 'Bleed half the blood flow, the city −10 blood flow'],
  ['ghouls', 'Gain 2 LV1 Ghouls in the city'],
  ['harpies', 'Gain 2 LV1 Harpies in the city'],
  ['move_and_contest', 'Move there and contest'],
  ['take_control', 'Take control (5 revolt counters)'],
] as const;

const RESISTANCE_CHOICES = [
  ['anarch_stability', 'Anarch city +1 Stability'],
  ['anarch_intercept', 'Anarch city +1 Intercept'],
  ['anarch_masquerade', 'Anarch city +1 Masquerade'],
  ['gain_blood', 'Own city: +50 blood, −1 Masquerade'],
  ['special_stronghold', 'Own city: Anarch Stronghold'],
  ['special_political_hub', 'Own city: Anarch Political Hub'],
  ['special_free_press', 'Own city: Anarch Free Press'],
] as const;

const ANARCH: ActionDefinition[] = [
  define({
    id: 'anarch_highway',
    name: 'Anarch Highway',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 10,
    factions: ['anarch'],
    params: [
      { key: 'minions', label: 'Minions (at most 2)', kind: 'minion', multiple: { min: 1, max: 2 }, options: (ctx) => ownMinions(ctx) },
      cityParam('to', 'To city', (ctx) => {
        const from = listParam(ctx, 'minions').map((id) => ctx.positions.minions[id as MinionId] ?? null);
        if (from.length === 0) return [];
        const sets = from.map((c) => new Set(citiesAdjacentTo(ctx, c).map((o) => o.value)));
        return allCities(ctx, (c) => sets.every((s) => s.has(c.id)));
      }),
    ],
    moves: (ctx) =>
      listParam(ctx, 'minions').map((id) => ({
        performer: { kind: 'minion' as const, minionId: id as MinionId },
        to: strParam(ctx, 'to') as CityId,
      })),
  }),
  define({
    id: 'anarch_free_press',
    name: 'Anarch Free Press',
    category: 'faction',
    performer: 'vampire',
    stealth: 2,
    cost: 10,
    trifle: true,
    factions: ['anarch'],
    params: [anyCity('city', 'City')],
  }),
  define({
    id: 'anarch_mission',
    name: 'Anarch Mission',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 15,
    factions: ['anarch'],
    grantsMinionAction: true,
    params: [{ key: 'minionId', label: 'Minion', kind: 'minion', options: (ctx) => ownMinions(ctx) }],
  }),
  define({
    id: 'anarch_sabotage',
    name: 'Anarch Sabotage',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 15,
    trifle: true,
    factions: ['anarch'],
    params: [anyCity('city', 'City'), choiceParam('stat', 'Effect', STABILITY_OR_INTERCEPT)],
  }),
  // --- Baron
  define({
    id: 'anarch_revolt',
    name: 'Anarch Revolt',
    category: 'faction',
    performer: 'vampire',
    stealth: -3,
    cost: 50,
    titles: ['baron'],
    oncePerRoundPer: 'city',
    params: (ctx) => {
      const specs: ParamSpec[] = [
        cityParam('city', 'City with Stability 1 or lower', (c) => allCities(c, (x) => x.effective.stability <= 1)),
      ];
      const city = cityById(ctx.view, strParam(ctx, 'city') as CityId);
      if (!city) return specs;
      // En revolt counter läggs först; sedan ett val per counter på staden (gd:1078).
      const counters = city.revoltCounters + 1;
      const takeover = ctx.content.rules.revoltCountersForTakeover;
      const list = REVOLT_CHOICES.filter(([k]) => k !== 'take_control' || counters >= takeover);
      for (let i = 1; i <= counters; i++) specs.push(choiceParam(`choice${i}`, `Choice ${i} of ${counters}`, list));
      return specs;
    },
    moves: (ctx) =>
      Object.entries(ctx.action.params ?? {}).some(([k, v]) => k.startsWith('choice') && v === 'move_and_contest')
        ? movesTo('city')(ctx)
        : [],
  }),
  define({
    id: 'organize_resistance',
    name: 'Organize Resistance',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 25,
    income: (ctx) =>
      50 * Object.entries(ctx.action.params ?? {}).filter(([k, v]) => k.startsWith('effect') && v === 'gain_blood').length,
    titles: ['baron'],
    params: (ctx) => {
      const domain = new Set(ctx.view.me.domain);
      const specs: ParamSpec[] = [
        {
          key: 'minionId',
          label: 'Minion in your domain to burn',
          kind: 'minion',
          options: (c) =>
            ownMinions(c).filter((o) => {
              const at = c.positions.minions[o.value as MinionId];
              return at === null || (at !== undefined && domain.has(at));
            }),
        },
      ];
      const minion = ownMinion(ctx.view, strParam(ctx, 'minionId') as MinionId);
      if (!minion) return specs;
      for (let i = 1; i <= minion.effectiveLevel; i++) {
        specs.push(choiceParam(`effect${i}`, `Effect ${i}`, RESISTANCE_CHOICES));
        const effect = strParam(ctx, `effect${i}`);
        specs.push(
          cityParam(`city${i}`, `City for effect ${i}`, (c) =>
            effect?.startsWith('anarch_') ? citiesOfSect(c, 'anarch') : controlledCities(c),
          ),
        );
      }
      return specs;
    },
    locksMinions: (ctx) => {
      const id = strParam(ctx, 'minionId');
      return id ? [id as MinionId] : [];
    },
  }),
];

// ---------------------------------------------------------------------------
// Sabbat

const SABBAT: ActionDefinition[] = [
  define({
    id: 'sabbat_sabotage',
    name: 'Sabbat Sabotage',
    category: 'faction',
    performer: 'vampire',
    stealth: 2,
    cost: 15,
    factions: ['sabbat'],
    params: [
      anyCity('city', 'City'),
      choiceParam('stat', 'Effect', [
        ['masquerade', '−1 Masquerade'],
        ['intercept', '−1 Intercept'],
      ]),
    ],
  }),
  // --- Archbishop
  define({
    id: 'build_the_base',
    name: 'Build the Base',
    category: 'faction',
    performer: 'vampire',
    stealth: 3,
    cost: 25,
    titles: ['archbishop'],
    params: [
      cityParam('city', 'City', (ctx) => {
        const bases = ctx.view.sabbat?.bases ?? {};
        const sect = ctx.view.me.disguise?.faction ?? null;
        return allCities(
          ctx,
          (c) => (bases[c.id]?.level ?? 0) < 3 && (c.id in bases || (sect !== null && citySect(ctx.view, c) === sect)),
        );
      }),
    ],
  }),
  define({
    id: 'burn_the_weak',
    name: 'Burn the Weak!',
    category: 'faction',
    performer: 'vampire',
    stealth: 2,
    cost: 10,
    titles: ['archbishop'],
    params: [cityParam('city', 'City with a Sabbat base', (ctx) => sabbatBaseCities(ctx))],
  }),
  define({
    id: 'spreading_the_truth_of_cain',
    name: 'Spreading the Truth of Cain',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 20,
    titles: ['archbishop'],
    maxPerRound: 1,
    params: [
      {
        key: 'cities',
        label: 'Up to 3 cities with a Sabbat base',
        kind: 'city',
        multiple: { min: 1, max: 3 },
        options: (ctx) => sabbatBaseCities(ctx),
      },
    ],
  }),
  define({
    id: 'shovelhead_attack',
    name: 'Shovelhead Attack!',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: 50,
    titles: ['archbishop'],
    maxPerRound: 1,
    params: [cityParam('city', 'City with a LV3 base', (ctx) => sabbatBaseCities(ctx, 3))],
  }),
  define({
    id: 'esbat',
    name: 'Esbat',
    category: 'faction',
    performer: 'vampire',
    stealth: 2,
    cost: 10,
    titles: ['archbishop'],
    maxPerRound: 1,
    params: [
      cityParam('city', 'City with a Sabbat base', (ctx) => sabbatBaseCities(ctx)),
      choiceParam('reward', 'Reward', [
        ['blood', 'Blood'],
        ['vp', '1 VP per 20 blood'],
      ]),
    ],
  }),
  define({
    id: 'call_a_crusade',
    name: 'Call a Crusade!',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 0,
    income: 250,
    titles: ['archbishop'],
    requires: { archbishop: 'hidden' },
  }),
  define({
    id: 'conquer_in_the_name_of_cain',
    name: 'Conquer in the Name of Cain!',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 100,
    titles: ['archbishop'],
    requires: { archbishop: 'exposed' },
    // En stad med Sabbat-bas räknas som granne för Sabbat-aktioner (gd:1108).
    params: [
      cityParam('city', 'Adjacent city', (ctx) => {
        const near = new Set([...citiesAdjacentTo(ctx, here(ctx)), ...sabbatBaseCities(ctx)].map((o) => o.value));
        near.delete(here(ctx) ?? '');
        return allCities(ctx, (c) => near.has(c.id));
      }),
    ],
    moves: movesTo('city'),
  }),
];

export const FACTION_ACTIONS: ActionDefinition[] = [...COMMON, ...CAMARILLA, ...ANARCH, ...SABBAT];
