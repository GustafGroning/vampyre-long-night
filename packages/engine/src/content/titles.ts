/**
 * Titlar: sekt, aktionsbudget, röster i Ivory Tower, domänregel och startpaket
 * (gd:566–745, SPEC A1/A3). Budgetvärdena för kantfall följer beslut M6.
 */
import type { Faction, MinionLevel, MinionType, Stat, Title } from '../state/enums.js';

/** Hur titelns domän räknas (gd:534). */
export type DomainRule =
  /** Städer vampyren kontrollerar (Prince, Baron, Archbishop). */
  | 'controlled_cities'
  /** Alla Camarilla-städer (Justicar, Inner Circle). */
  | 'camarilla_cities';

/**
 * Ett startminion-val: en lista platser, där varje plats ger en minion av en av
 * de tillåtna typerna på angiven level. Spelaren väljer typ per plats.
 */
export interface MinionSlot {
  readonly types: readonly MinionType[];
  readonly level: MinionLevel;
}
export type MinionPackage = readonly MinionSlot[];

/** Startuppgraderingar man väljer 2 av 4 (gd:687–745). */
export type StartingUpgrade =
  | { readonly kind: 'extra_discipline' }
  | { readonly kind: 'stat'; readonly stats: readonly Stat[] }
  | { readonly kind: 'minion'; readonly types: readonly MinionType[]; readonly level: MinionLevel }
  | { readonly kind: 'blood'; readonly amount: number }
  | { readonly kind: 'city_blood_flow'; readonly amount: number }
  | { readonly kind: 'city_intercept'; readonly amount: number }
  | { readonly kind: 'city_special'; readonly specials: readonly string[] };

export interface StartingPackage {
  readonly blood: number;
  readonly masteredDisciplines: number;
  readonly startingExp: number;
  /** Man väljer exakt ett av paketen. */
  readonly minionOptions: readonly MinionPackage[];
  /** Man väljer 2 av dessa. */
  readonly upgradeOptions: readonly StartingUpgrade[];
  readonly randomArtifacts: number;
  readonly vp: number;
  readonly royalPrivileges: number;
  readonly missions: number;
  readonly startsWithCity: boolean;
}

export interface TitleDefinition {
  readonly key: Title;
  readonly name: string;
  readonly faction: Faction;
  /** Vampyraktioner per rond (gd:566, 568, 570, 615, 635). */
  readonly actionsPerRound: number;
  /** Röster i Ivory Tower (gd:582–585). 0 för titlar utanför Camarilla. */
  readonly ivoryTowerVotes: number;
  readonly domain: DomainRule;
  /** `null` för Archbishop: skapas med förklädnadens paket (SPEC A3). */
  readonly startingPackage: StartingPackage | null;
}

const ANY_BASIC_MINION: readonly MinionType[] = ['ghoul', 'harpy', 'eye'];

export const TITLE_DEFINITIONS: Readonly<Record<Title, TitleDefinition>> = {
  inner_circle: {
    key: 'inner_circle',
    name: 'Inner Circle',
    faction: 'camarilla',
    actionsPerRound: 6,
    ivoryTowerVotes: 4,
    domain: 'camarilla_cities',
    startingPackage: {
      blood: 200,
      masteredDisciplines: 3,
      startingExp: 6,
      // Två LV2 (Ghoul/Harpy/Eye, får skilja sig) och två LV1 Ghouls (gd:688).
      minionOptions: [
        [
          { types: ANY_BASIC_MINION, level: 2 },
          { types: ANY_BASIC_MINION, level: 2 },
          { types: ['ghoul'], level: 1 },
          { types: ['ghoul'], level: 1 },
        ],
      ],
      upgradeOptions: [
        { kind: 'extra_discipline' },
        { kind: 'stat', stats: ['strength', 'stealth', 'intercept'] },
        { kind: 'minion', types: ANY_BASIC_MINION, level: 3 },
        { kind: 'blood', amount: 100 },
      ],
      randomArtifacts: 1,
      vp: 3,
      royalPrivileges: 0,
      missions: 0,
      startsWithCity: false,
    },
  },
  justicar: {
    key: 'justicar',
    name: 'Justicar',
    faction: 'camarilla',
    actionsPerRound: 4,
    ivoryTowerVotes: 3,
    domain: 'camarilla_cities',
    startingPackage: {
      blood: 150,
      masteredDisciplines: 2,
      startingExp: 4,
      minionOptions: [
        [{ types: ['archon'], level: 2 }],
        [
          { types: ['eye'], level: 1 },
          { types: ['eye'], level: 1 },
          { types: ['eye'], level: 1 },
        ],
      ],
      upgradeOptions: [
        { kind: 'extra_discipline' },
        { kind: 'stat', stats: ['strength', 'intercept'] },
        { kind: 'minion', types: ['archon'], level: 2 },
        { kind: 'blood', amount: 100 },
      ],
      randomArtifacts: 1,
      vp: 0,
      royalPrivileges: 0,
      missions: 2,
      startsWithCity: false,
    },
  },
  prince: {
    key: 'prince',
    name: 'Prince',
    faction: 'camarilla',
    actionsPerRound: 4,
    ivoryTowerVotes: 2,
    domain: 'controlled_cities',
    startingPackage: {
      blood: 100,
      masteredDisciplines: 1,
      startingExp: 4,
      minionOptions: [
        [{ types: ['primogen'], level: 1 }],
        [{ types: ANY_BASIC_MINION, level: 2 }],
      ],
      upgradeOptions: [
        { kind: 'extra_discipline' },
        { kind: 'stat', stats: ['stealth', 'strength'] },
        { kind: 'city_blood_flow', amount: 25 },
        { kind: 'city_intercept', amount: 2 },
      ],
      randomArtifacts: 0,
      vp: 0,
      royalPrivileges: 2,
      missions: 0,
      startsWithCity: true,
    },
  },
  baron: {
    key: 'baron',
    name: 'Baron',
    faction: 'anarch',
    actionsPerRound: 5,
    ivoryTowerVotes: 0,
    domain: 'controlled_cities',
    startingPackage: {
      blood: 150,
      masteredDisciplines: 1,
      startingExp: 4,
      minionOptions: [
        [
          { types: ['harpy'], level: 1 },
          { types: ['ghoul'], level: 1 },
        ],
        [
          { types: ['eye'], level: 1 },
          { types: ['ghoul'], level: 1 },
        ],
      ],
      upgradeOptions: [
        { kind: 'extra_discipline' },
        { kind: 'stat', stats: ['strength', 'intercept'] },
        { kind: 'city_special', specials: ['anarch_stronghold'] },
        { kind: 'city_special', specials: ['anarch_political_hub', 'anarch_free_press'] },
      ],
      randomArtifacts: 0,
      vp: 0,
      royalPrivileges: 0,
      missions: 0,
      startsWithCity: true,
    },
  },
  archbishop: {
    key: 'archbishop',
    name: 'Archbishop',
    faction: 'sabbat',
    // Gäller exponerad Archbishop (gd:635). Dold: förklädnadens budget (M6).
    actionsPerRound: 4,
    ivoryTowerVotes: 0,
    domain: 'controlled_cities',
    startingPackage: null,
  },
};

/** Budget och röster för en vampyr utan titel (M6; gd:582 "No title - 1 Vote"). */
export const UNTITLED = {
  actionsPerRound: 3,
  /** Gäller bara om vampyren tillhör Camarilla. */
  camarillaIvoryTowerVotes: 1,
} as const;
