/**
 * Grundläggande uppräkningar. Värdena är stabila strängar (ren JSON) och används
 * både i state och i content.
 */

export const FACTIONS = ['camarilla', 'anarch', 'sabbat'] as const;
export type Faction = (typeof FACTIONS)[number];

export const TITLES = ['inner_circle', 'justicar', 'prince', 'baron', 'archbishop'] as const;
export type Title = (typeof TITLES)[number];

/** Titlar en dold Archbishop kan bära som förklädnad (gd:635). */
export const DISGUISE_TITLES = ['prince', 'baron'] as const;
export type DisguiseTitle = (typeof DISGUISE_TITLES)[number];

export const CLANS = [
  'banu_haqim',
  'brujah',
  'ministry',
  'gangrel',
  'hecata',
  'lasombra',
  'malkavian',
  'nosferatu',
  'ravnos',
  'salubri',
  'toreador',
  'tremere',
  'tzimisce',
  'ventrue',
] as const;
export type Clan = (typeof CLANS)[number];

export const DISCIPLINES = [
  'animalism',
  'auspex',
  'celerity',
  'chimerstry',
  'dementation',
  'dominate',
  'fortitude',
  'obfuscate',
  'oblivion',
  'potence',
  'presence',
  'protean',
  'thaumaturgy',
  'vicissitude',
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** En disciplin kan man ha på basnivå eller bemästrad, (M). */
export type DisciplineLevel = 'basic' | 'mastered';

export const MINION_TYPES = ['ghoul', 'harpy', 'eye', 'primogen', 'archon'] as const;
export type MinionType = (typeof MINION_TYPES)[number];

export const MINION_LEVELS = [1, 2, 3] as const;
export type MinionLevel = (typeof MINION_LEVELS)[number];

/** De tre personliga stats som modifiers och Rule of Three gäller. */
export const STATS = ['strength', 'stealth', 'intercept'] as const;
export type Stat = (typeof STATS)[number];

export type StatBlock = Record<Stat, number>;

/** Stadens stats som kan ändras temporärt eller permanent. */
export const CITY_STATS = ['stability', 'masquerade', 'intercept', 'bloodFlow'] as const;
export type CityStat = (typeof CITY_STATS)[number];

export const VAMPIRE_STATUSES = ['active', 'torpor', 'burned'] as const;
export type VampireStatus = (typeof VAMPIRE_STATUSES)[number];

/**
 * Kampanjens fas. `awaitingCombat` betyder att upplösningen pausat efter en slot
 * med combat (M11) och väntar på combat-inputs.
 */
export const ROUND_PHASES = ['setup', 'submission', 'resolving', 'awaitingCombat', 'finished'] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];

/**
 * En aktions eller artefakts stealth: en modifier, Undetectable eller Can't be hidden.
 * Delas av content (artefakter) och aktionsdefinitioner.
 */
export type StealthValue =
  | { readonly kind: 'modifier'; readonly value: number }
  | { readonly kind: 'undetectable' }
  | { readonly kind: 'cant_be_hidden' };

export const stealthMod = (value: number): StealthValue => ({ kind: 'modifier', value });
export const UNDETECTABLE: StealthValue = { kind: 'undetectable' };
export const CANT_BE_HIDDEN: StealthValue = { kind: 'cant_be_hidden' };
