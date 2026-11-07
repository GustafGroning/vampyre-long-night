/**
 * Id-typer för alla entiteter i en kampanj.
 *
 * Id:n är vanliga strängar i runtime (ren JSON), men "brandade" i typsystemet så
 * att en MinionId inte kan skickas där en PlayerId förväntas.
 *
 * Id:n som motorn skapar under spelets gång kommer från räknare i state
 * (`state.counters`), aldrig från uuid eller klockan, så att upplösningen är
 * deterministisk (beslut S4).
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type NpcId = Brand<string, 'NpcId'>;
export type CityId = Brand<string, 'CityId'>;
export type SeaRegionId = Brand<string, 'SeaRegionId'>;
export type MinionId = Brand<string, 'MinionId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type CityFeatureId = Brand<string, 'CityFeatureId'>;
export type CombatId = Brand<string, 'CombatId'>;
export type MissionId = Brand<string, 'MissionId'>;
export type DebateId = Brand<string, 'DebateId'>;
export type EffectId = Brand<string, 'EffectId'>;

/** Typer av id som motorn genererar med räknare. */
export const GENERATED_ID_KINDS = [
  'player',
  'npc',
  'minion',
  'artifact',
  'feature',
  'combat',
  'mission',
  'debate',
  'effect',
] as const;
export type GeneratedIdKind = (typeof GENERATED_ID_KINDS)[number];

export interface GeneratedIdMap {
  player: PlayerId;
  npc: NpcId;
  minion: MinionId;
  artifact: ArtifactId;
  feature: CityFeatureId;
  combat: CombatId;
  mission: MissionId;
  debate: DebateId;
  effect: EffectId;
}

/** Nästa lediga löpnummer per id-typ. Del av GameState. */
export type IdCounters = Record<GeneratedIdKind, number>;

export function emptyIdCounters(): IdCounters {
  return {
    player: 1,
    npc: 1,
    minion: 1,
    artifact: 1,
    feature: 1,
    combat: 1,
    mission: 1,
    debate: 1,
    effect: 1,
  };
}

/** Formatet för genererade id:n: `<kind>-<n>`, t.ex. `minion-12`. */
export function formatId<K extends GeneratedIdKind>(kind: K, n: number): GeneratedIdMap[K] {
  return `${kind}-${n}` as GeneratedIdMap[K];
}

/**
 * Tar nästa id av en viss typ och räknar upp räknaren. Muterar `counters`;
 * används på en arbetskopia av state under upplösning.
 */
export function takeId<K extends GeneratedIdKind>(counters: IdCounters, kind: K): GeneratedIdMap[K] {
  const n = counters[kind];
  counters[kind] = n + 1;
  return formatId(kind, n);
}

/** Id för städer och havsregioner kommer från kartmallens nycklar, t.ex. `london`. */
export const cityId = (key: string): CityId => key as CityId;
export const seaRegionId = (key: string): SeaRegionId => key as SeaRegionId;
