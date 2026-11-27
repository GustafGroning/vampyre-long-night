/**
 * Per-spelare-vy: det en spelare får veta om spelet (M2, M17, M18).
 *
 * Vyprincipen (001_motorbeslut.md): vyn **konstrueras** fält för fält från en
 * allowlist. Den kopierar aldrig ett state-objekt och tar bort fält. Ett nytt
 * fält i `GameState` syns därför inte här förrän någon lägger till det
 * explicit. Läck-testerna i `test/view/leak.test.ts` vaktar detta.
 *
 * Beslut: `docs/decisions/views.md` (V1–V14).
 */
import type { Content } from '../content/index.js';
import type { Clan, Discipline, DisciplineLevel, Faction, MinionType, RoundPhase, Title, VampireStatus } from '../state/enums.js';
import { STATS } from '../state/enums.js';
import type {
  ArtifactId,
  CityFeatureId,
  CityId,
  CombatId,
  DebateId,
  EffectId,
  MissionId,
  NpcId,
  PlayerId,
  SeaRegionId,
  MinionId,
} from '../state/ids.js';
import { cloneJson, compareIds, sortedValues } from '../state/json.js';
import { knownArtifactHolder } from '../state/knowledge.js';
import {
  apparentFaction,
  apparentTitle,
  baseActionBudget,
  baseSocietyVotes,
  cityStat,
  domainCityIds,
  isHiddenArchbishop,
  minionArtifact,
  minionEffectiveLevel,
  minionStat,
  minionUpkeep,
  playerStat,
  playerVp,
} from '../state/queries.js';
import type {
  ActionBudgetModifier,
  Artifact,
  City,
  CityFeature,
  Combat,
  CombatSide,
  Combatant,
  Disguise,
  GameState,
  GrantedArtifactAction,
  JsonObject,
  JsonValue,
  Minion,
  ObsessionTarget,
  Player,
  StatModifier,
  TemporaryDiscipline,
  TorporState,
  VpEntry,
} from '../state/types.js';
import type { Json, PhaseId, RoundEvent } from '../round/types.js';
import { eventVisibleTo } from './events.js';
import { buildMapView, type MapView } from './map.js';

// ---------------------------------------------------------------------------
// Typer

export type StatValues = { strength: number; stealth: number; intercept: number };

/** En annan vampyr som den syns för alla (M2). */
export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  clan: Clan;
  /** Skenbar titel: förklädnaden för en dold Archbishop. */
  title: Title | null;
  /** Skenbar sekt. */
  faction: Faction;
  /** Bränd vampyr (V4). Torpor syns inte. */
  burned: boolean;
  /** Aktiv blood hunt (M2). */
  bloodHunt: boolean;
  /**
   * Bara i en Sabbat-spelares vy, och bara för dolda Archbishops: den sanna
   * identiteten bakom förklädnaden (gd:637, SPEC A14.3).
   */
  sabbatIdentity?: { title: 'archbishop'; faction: 'sabbat' };
}

/** En minion som den syns i "player stats" (gd:403): namn, typ, level och ägare, inte position. */
export interface PublicMinionView {
  id: MinionId;
  name: string;
  ownerId: PlayerId;
  type: MinionType;
  level: number;
}

export interface OwnArtifactView {
  id: ArtifactId;
  definition: Artifact['definition'];
  boundDiscipline: Discipline | null;
  /** Vem av spelaren och dess minions som bär den. */
  holder: { kind: 'player' } | { kind: 'minion'; id: MinionId };
}

/** Vem som har en artefakt, så som spelaren garanterat vet det (V20). */
export type KnownArtifactHolderView =
  | { kind: 'self' }
  | { kind: 'own_minion'; minionId: MinionId }
  | { kind: 'player'; playerId: PlayerId }
  /** `ownerId` = null om minionen inte är spelarägd. */
  | { kind: 'minion'; minionId: MinionId; ownerId: PlayerId | null }
  | { kind: 'city'; cityId: CityId };

/** En artefakt vars bärare spelaren vet: egen ägo eller giltig kunskap (V20). */
export interface KnownArtifactView {
  id: ArtifactId;
  definition: Artifact['definition'];
  /** Bara för egna artefakter (Ring of Tremeres val är dolt för andra). */
  boundDiscipline: Discipline | null;
  holder: KnownArtifactHolderView;
  /** `own` för egen ägo, annars aktions-id som gav kunskapen. */
  source: string;
  /** Ronden då det lärdes; null för egen ägo. */
  learnedRound: number | null;
}

export interface OwnMinionView {
  id: MinionId;
  name: string;
  type: MinionType;
  level: number;
  /** Level efter Scepter of Ventrue (gd:215). */
  effectiveLevel: number;
  location: CityId;
  stats: StatValues;
  upkeep: number;
  loyaltyCounters: number | null;
  acquiredRound: number;
  origin: Minion['origin'];
  modifiers: StatModifier[];
  artifactId: ArtifactId | null;
}

export interface MissionView {
  id: MissionId;
  templateKey: string;
  title: string;
  condition: JsonValue;
  reward: { blood: number; vp: number };
  assignedRound: number;
  status: 'active' | 'completed' | 'failed';
  completedRound: number | null;
}

export interface OwnEffectView {
  id: EffectId;
  key: string;
  source: string;
  startsRound: number;
  expiresAfterRound: number | null;
  data: JsonObject;
}

/** Allt spelaren vet om sin egen vampyr. */
export interface SelfView {
  id: PlayerId;
  name: string;
  clan: Clan;
  /** Sann sekt och titel. */
  faction: Faction;
  title: Title | null;
  disguise: Disguise | null;
  /** Hur omvärlden ser en: förklädnaden om den finns. */
  apparent: { title: Title | null; faction: Faction };
  status: VampireStatus;
  torpor: TorporState | null;
  location: CityId | null;
  blood: number;
  bloodAtEndOfLastRound: number | null;
  exp: { unspent: number; spentTotal: number };
  vp: number;
  vpLedger: VpEntry[];
  scoredCities: CityId[];
  stats: StatValues;
  modifiers: StatModifier[];
  disciplines: Partial<Record<Discipline, DisciplineLevel>>;
  temporaryDisciplines: TemporaryDiscipline[];
  grantedArtifactActions: GrantedArtifactAction[];
  royalPrivileges: number;
  bloodHunt: { calledRound: number } | null;
  hasCommittedDiablerie: boolean;
  obsession: ObsessionTarget | null;
  actionBudgetModifiers: ActionBudgetModifier[];
  /** Grundbudget för vampyraktioner (M6), före Royal Privileges och schemes. */
  baseActionBudget: number;
  domain: CityId[];
  /** Röster i Vampiric Society (V18). */
  societyVotes: number;
  minions: OwnMinionView[];
  artifacts: OwnArtifactView[];
  missions: MissionView[];
  effects: OwnEffectView[];
}

/** Problem eller special: att den finns och vad den heter, inte detaljerna (M2, V6). */
export interface CityFeatureView {
  id: CityFeatureId;
  key: string;
  name: string;
  createdRound: number;
  expiresAfterRound: number | null;
}

export type CityStatValues = { stability: number; masquerade: number; intercept: number; bloodFlow: number };

export interface CityView {
  id: CityId;
  name: string;
  adjacent: CityId[];
  isPort: boolean;
  seaRegions: SeaRegionId[];
  controllerId: PlayerId | null;
  contestants: { playerId: PlayerId; sinceRound: number }[];
  /** Permanenta värden. */
  base: CityStatValues;
  /** Med aktiva modifiers (V5: modifiernas källor syns inte). */
  effective: CityStatValues;
  influence: number;
  revoltCounters: number;
  problems: CityFeatureView[];
  specials: CityFeatureView[];
  masqueradeViolation: { sinceRound: number } | null;
}

export interface SeaRegionView {
  id: SeaRegionId;
  name: string;
  storm: { untilEndOfRound: number } | null;
}

export interface DebateView {
  id: DebateId;
  round: number;
  kind: 'regular' | 'replacement';
  title: string;
  options: { id: string; name: string; text: string; effect: JsonValue; innerCircleVp: boolean }[];
  /** Bara spelarens egna röster (gd:578). */
  myVotes: Record<string, number>;
  result: null | { totals: Record<string, number>; winningOptionId: string };
}

export interface CombatSideView {
  combatant: Combatant;
  assistingMinions: MinionId[];
  ambush: boolean;
  /** Bara den egna sidans Charge-blood (V8). */
  chargeBlood?: number;
}

export interface CombatView {
  id: CombatId;
  cityId: CityId;
  createdRound: number;
  /** Vilken sida spelaren är på. */
  mySide: 'attacker' | 'defender';
  attacker: CombatSideView;
  defender: CombatSideView;
  step: Combat['step'];
  pressCount: number;
  rolls: { attacker: number[]; defender: number[] }[];
  outcome: Combat['outcome'];
}

/** Ett event som spelaren fick se, utan publikinformation (V10). */
export interface EventView {
  round: number;
  phase: PhaseId;
  kind: string;
  playerId?: PlayerId;
  entryId?: string;
  data?: { [key: string]: Json };
}

/** Resursraden överst på huvudskärmen (V18). Allt är spelarens egna värden. */
export interface ResourcesView {
  blood: number;
  vp: number;
  /** Egna artefakter, både de vampyren och egna minions bär. */
  artifacts: number;
  minions: number;
  /** Röster i Vampiric Society från skenbar titel (V18), utan Buy Votes för ronden. */
  votes: number;
}

export interface PlayerView {
  viewerId: PlayerId;
  campaignId: string;
  round: number;
  maxRounds: number;
  phase: RoundPhase;
  me: SelfView;
  resources: ResourcesView;
  /**
   * Kartan: städer, kopplingar och bara de positioner spelaren garanterat vet
   * (V15–V17). Andras positioner kräver att `events` från senast upplösta ronden skickas in.
   */
  map: MapView;
  /** Alla vampyrer inklusive en själv, i id-ordning. */
  players: PublicPlayerView[];
  npcs: { id: NpcId; name: string }[];
  /** Alla spelarägda minions, utan position (gd:403). */
  minions: PublicMinionView[];
  /**
   * Artefakter vars bärare spelaren garanterat vet (V20): egna, och andras som
   * spelaren lärt sig och som inte bytt bärare sedan dess. Övriga är okända.
   */
  knownArtifacts: KnownArtifactView[];
  cities: CityView[];
  seaRegions: SeaRegionView[];
  debates: DebateView[];
  combats: CombatView[];
  /** Bara för Sabbat-spelare (sann sekt): Sabbat-baser per stad (M2). */
  sabbat: { bases: Record<CityId, { level: 1 | 2 | 3; builtRound: number }> } | null;
  flags: { masqueradeCollapsed: boolean; camarillaViolationGraceUsed: boolean };
  events: EventView[];
}

export interface PlayerViewOptions {
  /** Events från en eller flera ronders upplösning. Filtreras på `audience`. */
  events?: readonly RoundEvent[];
}

// ---------------------------------------------------------------------------
// Byggare

export function buildPlayerView(
  state: GameState,
  content: Content,
  viewerId: PlayerId,
  opts: PlayerViewOptions = {},
): PlayerView {
  const viewer = state.players[viewerId];
  if (!viewer) throw new Error(`buildPlayerView: okänd spelare ${viewerId}`);
  const isSabbat = viewer.faction === 'sabbat';
  const me = selfView(state, content, viewer);
  const events = opts.events ?? [];

  return {
    viewerId,
    campaignId: state.campaignId,
    round: state.round,
    maxRounds: state.maxRounds,
    phase: state.phase,
    me,
    resources: {
      blood: me.blood,
      vp: me.vp,
      artifacts: me.artifacts.length,
      minions: me.minions.length,
      votes: me.societyVotes,
    },
    map: buildMapView(state, content, viewerId, events),
    players: sortedValues(state.players).map((p) => publicPlayer(p, isSabbat)),
    npcs: sortedValues(state.npcs).map((n) => ({ id: n.id, name: n.name })),
    minions: sortedValues(state.minions).flatMap((m) =>
      m.owner.kind === 'player'
        ? [{ id: m.id, name: m.name, ownerId: m.owner.id, type: m.type, level: m.level }]
        : [],
    ),
    knownArtifacts: knownArtifactsView(state, viewerId, me),
    cities: sortedValues(state.cities).map((c) => cityView(state, content, c)),
    seaRegions: sortedValues(state.seaRegions).map((s) => ({
      id: s.id,
      name: s.name,
      storm: s.storm ? { untilEndOfRound: s.storm.untilEndOfRound } : null,
    })),
    debates: sortedValues(state.debates).map((d) => ({
      id: d.id,
      round: d.round,
      kind: d.kind,
      title: d.title,
      options: d.options.map((o) => ({
        id: o.id,
        name: o.name,
        text: o.text,
        effect: cloneJson(o.effect),
        innerCircleVp: o.innerCircleVp,
      })),
      myVotes: { ...(d.votes[viewerId] ?? {}) },
      result: d.result ? { totals: { ...d.result.totals }, winningOptionId: d.result.winningOptionId } : null,
    })),
    combats: sortedValues(state.combats).flatMap((c) => combatView(state, c, viewerId)),
    sabbat: isSabbat
      ? {
          bases: Object.fromEntries(
            Object.entries(state.sabbat.bases).map(([cityId, b]) => [cityId, { level: b.level, builtRound: b.builtRound }]),
          ),
        }
      : null,
    flags: {
      masqueradeCollapsed: state.flags.masqueradeCollapsed,
      camarillaViolationGraceUsed: state.flags.camarillaViolationGraceUsed,
    },
    events: events.filter((e) => eventVisibleTo(e, viewerId)).map(eventView),
  };
}

function knownArtifactsView(state: GameState, viewerId: PlayerId, me: SelfView): KnownArtifactView[] {
  const own: KnownArtifactView[] = me.artifacts.map((a) => ({
    id: a.id,
    definition: a.definition,
    boundDiscipline: a.boundDiscipline,
    holder: a.holder.kind === 'player' ? { kind: 'self' } : { kind: 'own_minion', minionId: a.holder.id },
    source: 'own',
    learnedRound: null,
  }));
  const ownIds = new Set(own.map((a) => a.id));
  const learned = state.knowledge?.artifacts[viewerId] ?? {};
  const others = (Object.keys(learned) as ArtifactId[]).sort(compareIds).flatMap((id): KnownArtifactView[] => {
    if (ownIds.has(id)) return [];
    const k = knownArtifactHolder(state, viewerId, id);
    const a = state.artifacts[id];
    if (!k || !a) return [];
    let holder: KnownArtifactHolderView;
    switch (k.holder.kind) {
      case 'player':
        holder = { kind: 'player', playerId: k.holder.id };
        break;
      case 'minion': {
        const m = state.minions[k.holder.id];
        holder = { kind: 'minion', minionId: k.holder.id, ownerId: m?.owner.kind === 'player' ? m.owner.id : null };
        break;
      }
      case 'city':
        holder = { kind: 'city', cityId: k.holder.id };
        break;
    }
    return [{ id, definition: a.definition, boundDiscipline: null, holder, source: k.source, learnedRound: k.round }];
  });
  return [...own, ...others].sort((x, y) => compareIds(x.id, y.id));
}

function publicPlayer(p: Player, viewerIsSabbat: boolean): PublicPlayerView {
  const view: PublicPlayerView = {
    id: p.id,
    name: p.name,
    clan: p.clan,
    title: apparentTitle(p),
    faction: apparentFaction(p),
    burned: p.status === 'burned',
    bloodHunt: p.bloodHunt !== null,
  };
  if (viewerIsSabbat && isHiddenArchbishop(p)) view.sabbatIdentity = { title: 'archbishop', faction: 'sabbat' };
  return view;
}

const statValues = (get: (stat: (typeof STATS)[number]) => number): StatValues => ({
  strength: get('strength'),
  stealth: get('stealth'),
  intercept: get('intercept'),
});

function selfView(state: GameState, content: Content, p: Player): SelfView {
  const ownMinions = sortedValues(state.minions).filter((m) => m.owner.kind === 'player' && m.owner.id === p.id);
  const ownMinionIds = new Set(ownMinions.map((m) => m.id));
  const artifacts: OwnArtifactView[] = sortedValues(state.artifacts).flatMap((a): OwnArtifactView[] => {
    if (a.holder.kind === 'player' && a.holder.id === p.id) {
      return [{ id: a.id, definition: a.definition, boundDiscipline: a.boundDiscipline, holder: { kind: 'player' } }];
    }
    if (a.holder.kind === 'minion' && ownMinionIds.has(a.holder.id)) {
      return [
        { id: a.id, definition: a.definition, boundDiscipline: a.boundDiscipline, holder: { kind: 'minion', id: a.holder.id } },
      ];
    }
    return [];
  });

  return {
    id: p.id,
    name: p.name,
    clan: p.clan,
    faction: p.faction,
    title: p.title,
    disguise: p.disguise ? { title: p.disguise.title, faction: p.disguise.faction } : null,
    apparent: { title: apparentTitle(p), faction: apparentFaction(p) },
    status: p.status,
    torpor: p.torpor ? { ...p.torpor } : null,
    location: p.location,
    blood: p.blood,
    bloodAtEndOfLastRound: p.bloodAtEndOfLastRound,
    exp: { unspent: p.exp.unspent, spentTotal: p.exp.spentTotal },
    vp: playerVp(p),
    vpLedger: p.vpLedger.map((e) => cloneJson(e)),
    scoredCities: [...p.scoredCities],
    stats: statValues((s) => playerStat(state, content, p.id, s)),
    modifiers: p.modifiers.map((m) => cloneJson(m)),
    disciplines: { ...p.disciplines },
    temporaryDisciplines: p.temporaryDisciplines.map((d) => cloneJson(d)),
    grantedArtifactActions: p.grantedArtifactActions.map((g) => cloneJson(g)),
    royalPrivileges: p.royalPrivileges,
    bloodHunt: p.bloodHunt ? { calledRound: p.bloodHunt.calledRound } : null,
    hasCommittedDiablerie: p.hasCommittedDiablerie,
    obsession: p.obsession ? cloneJson(p.obsession) : null,
    actionBudgetModifiers: p.actionBudgetModifiers.map((m) => cloneJson(m)),
    baseActionBudget: baseActionBudget(state, content, p.id),
    domain: p.status === 'burned' ? [] : domainCityIds(state, content, p.id),
    societyVotes: baseSocietyVotes(content, p),
    minions: ownMinions.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      level: m.level,
      effectiveLevel: minionEffectiveLevel(state, content, m.id),
      location: m.location,
      stats: statValues((s) => minionStat(state, content, m.id, s)),
      upkeep: minionUpkeep(content, m),
      loyaltyCounters: m.loyaltyCounters,
      acquiredRound: m.acquiredRound,
      origin: cloneJson(m.origin),
      modifiers: m.modifiers.map((x) => cloneJson(x)),
      artifactId: minionArtifact(state, m.id)?.id ?? null,
    })),
    artifacts,
    missions: sortedValues(state.missions)
      .filter((m) => m.justicarId === p.id)
      .map((m) => ({
        id: m.id,
        templateKey: m.templateKey,
        title: m.title,
        condition: cloneJson(m.condition),
        reward: { blood: m.reward.blood, vp: m.reward.vp },
        assignedRound: m.assignedRound,
        status: m.status,
        completedRound: m.completedRound,
      })),
    effects: sortedValues(state.effects)
      .filter((e) => e.ownerId === p.id)
      .map((e) => ({
        id: e.id,
        key: e.key,
        source: e.source,
        startsRound: e.startsRound,
        expiresAfterRound: e.expiresAfterRound,
        data: cloneJson(e.data),
      })),
  };
}

const featureView = (f: CityFeature): CityFeatureView => ({
  id: f.id,
  key: f.key,
  name: f.name,
  createdRound: f.createdRound,
  expiresAfterRound: f.expiresAfterRound,
});

function cityView(state: GameState, content: Content, c: City): CityView {
  return {
    id: c.id,
    name: c.name,
    adjacent: [...c.adjacent],
    isPort: c.isPort,
    seaRegions: [...c.seaRegions],
    controllerId: c.controllerId,
    contestants: c.contestants.map((x) => ({ playerId: x.playerId, sinceRound: x.sinceRound })),
    base: { stability: c.stability, masquerade: c.masquerade, intercept: c.intercept, bloodFlow: c.bloodFlow },
    effective: {
      stability: cityStat(state, content, c.id, 'stability'),
      masquerade: cityStat(state, content, c.id, 'masquerade'),
      intercept: cityStat(state, content, c.id, 'intercept'),
      bloodFlow: cityStat(state, content, c.id, 'bloodFlow'),
    },
    influence: c.influence,
    revoltCounters: c.revoltCounters,
    problems: c.problems.map(featureView),
    specials: c.specials.map(featureView),
    masqueradeViolation: c.masqueradeViolation ? { sinceRound: c.masqueradeViolation.sinceRound } : null,
  };
}

function combatantOwner(state: GameState, c: Combatant): PlayerId | null {
  if (c.kind === 'player') return c.id;
  const m = state.minions[c.id];
  return m && m.owner.kind === 'player' ? m.owner.id : null;
}

function combatView(state: GameState, c: Combat, viewerId: PlayerId): CombatView[] {
  const mySide =
    combatantOwner(state, c.attacker.combatant) === viewerId
      ? 'attacker'
      : combatantOwner(state, c.defender.combatant) === viewerId
        ? 'defender'
        : null;
  if (!mySide) return [];
  const side = (s: CombatSide, mine: boolean): CombatSideView => {
    const v: CombatSideView = {
      combatant: cloneJson(s.combatant),
      assistingMinions: [...s.assistingMinions],
      ambush: s.ambush,
    };
    if (mine) v.chargeBlood = s.chargeBlood;
    return v;
  };
  return [
    {
      id: c.id,
      cityId: c.cityId,
      createdRound: c.createdRound,
      mySide,
      attacker: side(c.attacker, mySide === 'attacker'),
      defender: side(c.defender, mySide === 'defender'),
      step: c.step,
      pressCount: c.pressCount,
      rolls: c.rolls.map((r) => ({ attacker: [...r.attacker], defender: [...r.defender] })),
      outcome: cloneJson(c.outcome),
    },
  ];
}

function eventView(e: RoundEvent): EventView {
  const v: EventView = { round: e.round, phase: e.phase, kind: e.kind };
  if (e.playerId !== undefined) v.playerId = e.playerId;
  if (e.entryId !== undefined) v.entryId = e.entryId;
  if (e.data !== undefined) v.data = cloneJson(e.data);
  return v;
}
