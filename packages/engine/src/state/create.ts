/**
 * Skapar ett GameState för en ny kampanj från en kartmall och färdiga
 * karaktärer. Själva karaktärsskapandet (titelpaket, EXP, val av uppgraderingar,
 * SPEC B7) är ett eget flöde; här tas resultatet emot och valideras.
 */
import type { Content } from '../content/index.js';
import type { ArtifactKey } from '../content/artifacts.js';
import type { MapTemplate } from '../content/maps/types.js';
import type { Clan, Discipline, DisciplineLevel, Faction, MinionLevel, MinionType, Stat, Title } from './enums.js';
import {
  cityId as toCityId,
  emptyIdCounters,
  seaRegionId as toSeaRegionId,
  takeId,
  type ArtifactId,
  type CityId,
  type NpcId,
  type PlayerId,
  type SeaRegionId,
} from './ids.js';
import { compareIds } from './json.js';
import type {
  Artifact,
  ArtifactHolder,
  City,
  Disguise,
  GameState,
  Minion,
  Mutable,
  Npc,
  Player,
  SeaRegion,
  StatModifier,
  VpEntry,
} from './types.js';
import { STATE_SCHEMA_VERSION } from './types.js';
import { assertValidState } from './validate.js';

// ---------------------------------------------------------------------------
// Karta
// ---------------------------------------------------------------------------

const CITY_KEY = /^[a-z][a-z0-9_]*$/;

/** Kontrollerar en kartmall. Returnerar alla fel. */
export function validateMapTemplate(map: MapTemplate): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const seas = new Set(map.seaRegions.map((r) => r.key));
  if (seas.size !== map.seaRegions.length) errors.push('dubblerade havsregioner');
  for (const c of map.cities) {
    if (!CITY_KEY.test(c.key)) errors.push(`ogiltig stadsnyckel "${c.key}"`);
    if (keys.has(c.key)) errors.push(`dubblerad stad ${c.key}`);
    keys.add(c.key);
    if (c.isPort !== c.seaRegions.length > 0) errors.push(`${c.key}: hamn ⇔ minst en havsregion`);
    for (const r of c.seaRegions) if (!seas.has(r)) errors.push(`${c.key}: okänd havsregion ${r}`);
  }
  const pairs = new Set<string>();
  for (const [a, b] of map.adjacencies) {
    if (!keys.has(a) || !keys.has(b)) errors.push(`grannpar ${a}–${b}: okänd stad`);
    if (a === b) errors.push(`grannpar ${a}–${b}: samma stad`);
    const id = [a, b].sort().join('|');
    if (pairs.has(id)) errors.push(`grannpar ${a}–${b} förekommer två gånger`);
    pairs.add(id);
  }
  return errors;
}

/** Instansierar en kartmall till städer och havsregioner för state. */
export function instantiateMap(map: MapTemplate): {
  cities: Record<CityId, City>;
  seaRegions: Record<SeaRegionId, SeaRegion>;
} {
  const errors = validateMapTemplate(map);
  if (errors.length > 0) throw new Error(`Ogiltig karta ${map.key}:\n  ${errors.join('\n  ')}`);

  const neighbours = new Map<string, Set<string>>(map.cities.map((c) => [c.key, new Set<string>()]));
  for (const [a, b] of map.adjacencies) {
    neighbours.get(a)?.add(b);
    neighbours.get(b)?.add(a);
  }

  const cities = {} as Record<CityId, City>;
  for (const t of [...map.cities].sort((x, y) => compareIds(x.key, y.key))) {
    const id = toCityId(t.key);
    cities[id] = {
      id,
      name: t.name,
      adjacent: [...(neighbours.get(t.key) ?? [])].sort(compareIds).map(toCityId),
      isPort: t.isPort,
      seaRegions: [...t.seaRegions].sort(compareIds).map(toSeaRegionId),
      controllerId: null,
      contestants: [],
      stability: t.stability,
      masquerade: t.masquerade,
      intercept: t.intercept,
      bloodFlow: t.bloodFlow,
      modifiers: [],
      influence: 0,
      revoltCounters: 0,
      problems: [],
      specials: [],
      masqueradeViolation: null,
    };
  }
  const seaRegions = {} as Record<SeaRegionId, SeaRegion>;
  for (const r of [...map.seaRegions].sort((x, y) => compareIds(x.key, y.key))) {
    const id = toSeaRegionId(r.key);
    seaRegions[id] = { id, name: r.name, storm: null };
  }
  return { cities, seaRegions };
}

// ---------------------------------------------------------------------------
// Spelare
// ---------------------------------------------------------------------------

export interface MinionSetup {
  readonly name: string;
  readonly type: MinionType;
  readonly level: MinionLevel;
  /** Stadsnyckel. Standard: spelarens startstad. */
  readonly city?: string;
}

export interface ArtifactSetup {
  readonly definition: ArtifactKey;
  readonly boundDiscipline?: Discipline;
}

export interface PlayerSetup {
  readonly name: string;
  readonly clan: Clan;
  readonly faction: Faction;
  readonly title: Title | null;
  /** Krävs för en dold Archbishop. */
  readonly disguise?: Disguise;
  /** Stadsnyckel där vampyren börjar. */
  readonly location: string;
  /** Städer vampyren kontrollerar vid start (stadstitlar). */
  readonly controls?: readonly string[];
  readonly blood: number;
  readonly disciplines: Readonly<Partial<Record<Discipline, DisciplineLevel>>>;
  /** Permanenta stat-bonusar från skapandet, per källa (t.ex. `exp:greater_strength`). */
  readonly statBonuses?: readonly { readonly stat: Stat; readonly amount: number; readonly source: string }[];
  readonly expSpent?: number;
  readonly minions?: readonly MinionSetup[];
  readonly artifacts?: readonly ArtifactSetup[];
  readonly royalPrivileges?: number;
  /** Start-VP (Inner Circle 3, gd:699). Bokförs i ledgern som `start`. */
  readonly startingVp?: number;
}

export interface CreateGameInput {
  readonly campaignId: string;
  readonly seed: string;
  readonly map: MapTemplate;
  readonly players: readonly PlayerSetup[];
  readonly npcs?: readonly { readonly name: string }[];
  /** Artefakter som inte delats ut: läggs i poolen för slumpdragning. */
  readonly artifactPool?: readonly ArtifactSetup[];
  readonly maxRounds?: number;
}

/**
 * Bygger kampanjens starttillstånd (round 0, phase `setup`). Kastar om indata är
 * ogiltiga eller om resultatet bryter mot någon invariant.
 *
 * Regler som tillämpas automatiskt:
 * - Banu Haqim-cursen ger en permanent −1 Strength (`clan:banu_haqim`, gd:752).
 * - Archons får startantal loyalty counters från content (gd:332).
 * - Id:n delas ut i indataordning: `player-1`, `minion-1` …
 */
export function createGameState(input: CreateGameInput, content: Content): GameState {
  const { cities, seaRegions } = instantiateMap(input.map);
  const counters = emptyIdCounters();
  const players = {} as Record<PlayerId, Player>;
  const npcs = {} as Record<NpcId, Npc>;
  const minions = {} as Record<string, Minion>;
  const artifacts = {} as Record<ArtifactId, Artifact>;

  const city = (key: string, who: string): CityId => {
    const id = toCityId(key);
    if (!(id in cities)) throw new Error(`${who}: okänd stad "${key}"`);
    return id;
  };

  const addArtifact = (a: ArtifactSetup, holder: ArtifactHolder): void => {
    const id = takeId(counters, 'artifact');
    artifacts[id] = { id, definition: a.definition, holder, boundDiscipline: a.boundDiscipline ?? null };
  };

  for (const n of input.npcs ?? []) {
    const id = takeId(counters, 'npc');
    npcs[id] = { id, name: n.name };
  }

  for (const s of input.players) {
    const id = takeId(counters, 'player');
    const who = `spelare ${s.name}`;
    const location = city(s.location, who);

    const modifiers: StatModifier[] = (s.statBonuses ?? []).map((b) => ({
      stat: b.stat,
      amount: b.amount,
      source: b.source,
      expiresAfterRound: null,
    }));
    if (s.clan === 'banu_haqim') {
      modifiers.push({ stat: 'strength', amount: -1, source: 'clan:banu_haqim', expiresAfterRound: null });
    }

    const vpLedger: VpEntry[] = s.startingVp ? [{ round: 0, amount: s.startingVp, rule: 'start' }] : [];

    players[id] = {
      id,
      name: s.name,
      clan: s.clan,
      faction: s.faction,
      title: s.title,
      disguise: s.disguise ?? null,
      status: 'active',
      torpor: null,
      location,
      blood: s.blood,
      bloodAtEndOfLastRound: null,
      exp: { unspent: 0, spentTotal: s.expSpent ?? 0 },
      modifiers,
      disciplines: { ...s.disciplines },
      temporaryDisciplines: [],
      grantedArtifactActions: [],
      royalPrivileges: s.royalPrivileges ?? 0,
      bloodHunt: null,
      vpLedger,
      scoredCities: [],
      hasCommittedDiablerie: false,
      obsession: null,
      actionBudgetModifiers: [],
    };

    for (const key of s.controls ?? []) {
      const cid = city(key, who);
      const c = cities[cid] as unknown as Mutable<City>;
      if (c.controllerId !== null) throw new Error(`${who}: ${key} kontrolleras redan av ${c.controllerId}`);
      c.controllerId = id;
    }

    for (const m of s.minions ?? []) {
      const mid = takeId(counters, 'minion');
      minions[mid] = {
        id: mid,
        name: m.name,
        owner: { kind: 'player', id },
        type: m.type,
        level: m.level,
        location: m.city ? city(m.city, `${who}, minion ${m.name}`) : location,
        modifiers: [],
        loyaltyCounters: content.minionTypes[m.type].startingLoyalty,
        acquiredRound: 0,
        origin: { kind: 'standard' },
      };
    }

    for (const a of s.artifacts ?? []) addArtifact(a, { kind: 'player', id });
  }

  for (const a of input.artifactPool ?? []) addArtifact(a, { kind: 'pool' });

  const state: GameState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    campaignId: input.campaignId,
    seed: input.seed,
    round: 0,
    maxRounds: input.maxRounds ?? content.rules.maxRounds,
    phase: 'setup',
    counters,
    players,
    npcs,
    minions: minions as GameState['minions'],
    artifacts,
    cities,
    seaRegions,
    sabbat: { bases: {} },
    combats: {},
    missions: {},
    debates: {},
    effects: {},
    flags: { camarillaViolationGraceUsed: false, masqueradeCollapsed: false },
  };

  assertValidState(state, content);
  return state;
}
