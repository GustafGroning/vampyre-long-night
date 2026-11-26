/**
 * Invarianter för GameState. `validateState` returnerar alla brott i stället för
 * att kasta, så att tester och upplösningen kan rapportera exakt vad som är fel.
 *
 * Används (1) när state skapas, (2) i tester efter varje upplösning, och
 * (3) av plattformen innan ett state sparas.
 */
import type { Content } from '../content/index.js';
import { ARTIFACT_KEYS, requiresBoundDiscipline } from '../content/artifacts.js';
import { CLANS, DISCIPLINES, FACTIONS, MINION_LEVELS, MINION_TYPES, ROUND_PHASES, TITLES, VAMPIRE_STATUSES } from './enums.js';
import { GENERATED_ID_KINDS, type GeneratedIdKind } from './ids.js';
import { compareIds, findNonJson, sortedIds } from './json.js';
import type { GameState } from './types.js';
import { STATE_SCHEMA_VERSION } from './types.js';

export interface StateIssue {
  readonly path: string;
  readonly message: string;
}

const isNonNegInt = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function isSortedUnique(ids: readonly string[]): boolean {
  for (let i = 1; i < ids.length; i++) {
    if (compareIds(ids[i - 1] as string, ids[i] as string) >= 0) return false;
  }
  return true;
}

export function validateState(state: GameState, content: Content): StateIssue[] {
  const issues: StateIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  const nonJson = findNonJson(state);
  if (nonJson) add('$', `state is not pure JSON: ${nonJson}`);

  if (state.schemaVersion !== STATE_SCHEMA_VERSION) add('schemaVersion', `unknown version ${state.schemaVersion}`);
  if (!ROUND_PHASES.includes(state.phase)) add('phase', `unknown phase ${state.phase}`);
  if (!isNonNegInt(state.round) || state.round > state.maxRounds) {
    add('round', `round ${state.round} outside 0..${state.maxRounds}`);
  }
  if (state.phase === 'setup' && state.round !== 0) add('phase', 'setup requires round 0');
  if (state.phase !== 'setup' && state.phase !== 'finished' && state.round === 0) {
    add('phase', `${state.phase} requires round ≥ 1`);
  }

  // Record-nycklar ska vara lika med entitetens id.
  const collections = ['players', 'npcs', 'minions', 'artifacts', 'cities', 'seaRegions', 'combats', 'missions', 'debates', 'effects'] as const;
  for (const name of collections) {
    const rec = state[name] as Readonly<Record<string, { readonly id: string }>>;
    for (const key of Object.keys(rec)) {
      if (rec[key]?.id !== key) add(`${name}.${key}`, `id ${String(rec[key]?.id)} does not match the key`);
    }
  }

  // Genererade id:n ska ligga under räknaren, så att nya id:n aldrig krockar.
  const generated: Record<GeneratedIdKind, readonly string[]> = {
    player: Object.keys(state.players),
    npc: Object.keys(state.npcs),
    minion: Object.keys(state.minions),
    artifact: Object.keys(state.artifacts),
    feature: Object.values(state.cities).flatMap((c) => [...c.problems, ...c.specials].map((f) => f.id)),
    combat: Object.keys(state.combats),
    mission: Object.keys(state.missions),
    debate: Object.keys(state.debates),
    effect: Object.keys(state.effects),
  };
  for (const kind of GENERATED_ID_KINDS) {
    const counter = state.counters[kind];
    if (!isNonNegInt(counter) || counter < 1) {
      add(`counters.${kind}`, `invalid counter ${counter}`);
      continue;
    }
    for (const id of generated[kind]) {
      const m = new RegExp(`^${kind}-(\\d+)$`).exec(id);
      if (!m) add(`${kind}:${id}`, `id does not follow the format ${kind}-<n>`);
      else if (Number(m[1]) >= counter) add(`${kind}:${id}`, `id ≥ the counter ${counter}`);
    }
  }

  const cityExists = (id: string): boolean => id in state.cities;
  const playerExists = (id: string): boolean => id in state.players;

  // Spelare
  for (const id of sortedIds(state.players)) {
    const p = state.players[id];
    if (!p) continue;
    const at = `players.${id}`;
    if (!CLANS.includes(p.clan)) add(at, `unknown clan ${p.clan}`);
    if (!FACTIONS.includes(p.faction)) add(at, `unknown sect ${p.faction}`);
    if (p.title !== null && !TITLES.includes(p.title)) add(at, `unknown title ${p.title}`);
    if (p.title !== null && content.titles[p.title].faction !== p.faction) {
      add(at, `the title ${p.title} belongs to ${content.titles[p.title].faction}, not ${p.faction}`);
    }
    if (p.disguise !== null && (p.title !== 'archbishop' || p.faction !== 'sabbat')) {
      add(at, 'disguise requires a Sabbat Archbishop');
    }
    if (p.disguise !== null && content.titles[p.disguise.title].faction !== p.disguise.faction) {
      add(at, `the disguise title ${p.disguise.title} does not belong to ${p.disguise.faction}`);
    }
    if (!VAMPIRE_STATUSES.includes(p.status)) add(at, `unknown status ${p.status}`);
    if ((p.status === 'torpor') !== (p.torpor !== null)) add(at, 'the torpor field does not match the status');
    if (p.torpor && (!isNonNegInt(p.torpor.progress) || !isNonNegInt(p.torpor.required) || p.torpor.required < 1)) {
      add(at, 'invalid torpor state');
    }
    if (p.status === 'burned' ? p.location !== null : p.location === null || !cityExists(p.location)) {
      add(at, `invalid position ${String(p.location)} for status ${p.status}`);
    }
    if (!isNonNegInt(p.blood)) add(at, `blood must be an integer ≥ 0, is ${p.blood}`);
    if (!isNonNegInt(p.royalPrivileges)) add(at, 'royalPrivileges must be an integer ≥ 0');
    if (!isNonNegInt(p.exp.unspent) || !isNonNegInt(p.exp.spentTotal)) add(at, 'EXP must be an integer ≥ 0');
    if (p.exp.spentTotal > content.rules.expLifetimeCap) {
      add(at, `spent EXP ${p.exp.spentTotal} > cap ${content.rules.expLifetimeCap}`);
    }
    for (const d of Object.keys(p.disciplines)) {
      if (!(DISCIPLINES as readonly string[]).includes(d)) add(at, `unknown discipline ${d}`);
    }
    for (const m of p.modifiers) {
      if (!Number.isInteger(m.amount)) add(at, `modifier from ${m.source} is not an integer`);
    }
    if (!isSortedUnique(p.scoredCities)) add(at, 'scoredCities must be sorted and unique');
    for (const c of p.scoredCities) if (!cityExists(c)) add(at, `scoredCities: unknown city ${c}`);
    for (const e of p.vpLedger) if (!Number.isInteger(e.amount)) add(at, `VP row ${e.rule} is not an integer`);
    if (p.obsession) {
      const o = p.obsession;
      const ok = o.kind === 'city' ? cityExists(o.id) : o.kind === 'minion' ? o.id in state.minions : o.id in state.artifacts;
      if (!ok) add(at, `obsession points to unknown ${o.kind} ${o.id}`);
    }
  }

  // Minions
  for (const id of sortedIds(state.minions)) {
    const m = state.minions[id];
    if (!m) continue;
    const at = `minions.${id}`;
    if (!MINION_TYPES.includes(m.type)) add(at, `unknown type ${m.type}`);
    if (!(MINION_LEVELS as readonly number[]).includes(m.level)) add(at, `level ${m.level} outside 1..3`);
    if (!cityExists(m.location)) add(at, `unknown city ${m.location}`);
    if (m.owner.kind === 'player') {
      const owner = state.players[m.owner.id];
      if (!owner) add(at, `unknown owner ${m.owner.id}`);
      else if (owner.status === 'burned') add(at, `the owner ${m.owner.id} is burned`);
    } else if (!(m.owner.id in state.npcs)) add(at, `unknown NPC owner ${m.owner.id}`);
    const loyal = content.minionTypes[m.type]?.startingLoyalty ?? null;
    if ((loyal === null) !== (m.loyaltyCounters === null)) add(at, 'loyaltyCounters does not match the type');
    if (m.loyaltyCounters !== null && !isNonNegInt(m.loyaltyCounters)) add(at, 'loyaltyCounters must be an integer ≥ 0');
    if (!isNonNegInt(m.acquiredRound)) add(at, 'acquiredRound must be an integer ≥ 0');
    if (m.origin.kind === 'vestment_zombie' && !(m.origin.artifactId in state.artifacts)) {
      add(at, `the zombie's artifact ${m.origin.artifactId} does not exist`);
    }
  }

  // Artefakter
  const carriedByMinion = new Map<string, string>();
  for (const id of sortedIds(state.artifacts)) {
    const a = state.artifacts[id];
    if (!a) continue;
    const at = `artifacts.${id}`;
    if (!ARTIFACT_KEYS.includes(a.definition)) add(at, `unknown definition ${a.definition}`);
    if (requiresBoundDiscipline(a.definition) !== (a.boundDiscipline !== null)) {
      add(at, `boundDiscipline should ${requiresBoundDiscipline(a.definition) ? '' : 'not '}be set for ${a.definition}`);
    }
    const h = a.holder;
    switch (h.kind) {
      case 'player':
        if (!playerExists(h.id)) add(at, `unknown carrier ${h.id}`);
        else if (state.players[h.id]?.status === 'burned') add(at, `the carrier ${h.id} is burned`);
        break;
      case 'minion':
        if (!(h.id in state.minions)) add(at, `unknown minion ${h.id}`);
        if (carriedByMinion.has(h.id)) add(at, `minion ${h.id} already carries ${carriedByMinion.get(h.id)} (max one, gd:379)`);
        carriedByMinion.set(h.id, id);
        break;
      case 'npc':
        if (!(h.id in state.npcs)) add(at, `unknown NPC ${h.id}`);
        break;
      case 'city':
        if (!cityExists(h.id)) add(at, `unknown city ${h.id}`);
        break;
      case 'pool':
        break;
    }
  }

  // Städer och karta
  const max = content.rules.cityStatMax;
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (!c) continue;
    const at = `cities.${id}`;
    if (!isSortedUnique(c.adjacent)) add(at, 'adjacent must be sorted and unique');
    for (const n of c.adjacent) {
      if (n === id) add(at, 'the city is adjacent to itself');
      else if (!cityExists(n)) add(at, `unknown neighbour ${n}`);
      else if (!state.cities[n]?.adjacent.includes(id)) add(at, `the adjacency with ${n} is not symmetric`);
    }
    if (c.isPort !== c.seaRegions.length > 0) add(at, 'ports must have at least one sea region, inland cities none');
    for (const r of c.seaRegions) if (!(r in state.seaRegions)) add(at, `unknown sea region ${r}`);
    if (c.controllerId !== null) {
      const ctrl = state.players[c.controllerId];
      if (!ctrl) add(at, `unknown controller ${c.controllerId}`);
      else if (ctrl.status === 'burned') add(at, `the controller ${c.controllerId} is burned`);
    }
    const contestantIds = c.contestants.map((x) => x.playerId);
    if (!isSortedUnique(contestantIds)) add(at, 'contestants must be sorted and unique');
    for (const x of c.contestants) {
      if (!playerExists(x.playerId)) add(at, `unknown contestant ${x.playerId}`);
      if (x.playerId === c.controllerId) add(at, 'the controller cannot contest its own city');
    }
    for (const [name, v] of [['stability', c.stability], ['masquerade', c.masquerade]] as const) {
      if (!isNonNegInt(v) || v > max) add(at, `${name} ${v} outside 0..${max}`);
    }
    if (!isNonNegInt(c.intercept)) add(at, `intercept ${c.intercept} must be an integer ≥ 0`);
    if (!isNonNegInt(c.bloodFlow)) add(at, `bloodFlow ${c.bloodFlow} must be an integer ≥ 0`);
    if (!isNonNegInt(c.influence)) add(at, 'influence must be an integer ≥ 0');
    if (!isNonNegInt(c.revoltCounters) || c.revoltCounters > content.rules.revoltCountersForTakeover) {
      add(at, `revoltCounters ${c.revoltCounters} outside 0..${content.rules.revoltCountersForTakeover}`);
    }
  }

  // Sabbat-baser
  for (const cid of Object.keys(state.sabbat.bases)) {
    const b = state.sabbat.bases[cid as keyof typeof state.sabbat.bases];
    if (!cityExists(cid)) add(`sabbat.bases.${cid}`, 'unknown city');
    if (!b || !Number.isInteger(b.level) || b.level < 1 || b.level > content.rules.sabbatBaseMaxLevel) {
      add(`sabbat.bases.${cid}`, `level outside 1..${content.rules.sabbatBaseMaxLevel}`);
    }
  }

  // Combats, missions, debatter, effekter: referenser
  for (const id of sortedIds(state.combats)) {
    const c = state.combats[id];
    if (!c) continue;
    if (!cityExists(c.cityId)) add(`combats.${id}`, `unknown city ${c.cityId}`);
    for (const side of [c.attacker, c.defender]) {
      const k = side.combatant;
      const ok = k.kind === 'player' ? playerExists(k.id) : k.id in state.minions;
      if (!ok) add(`combats.${id}`, `unknown participant ${k.id}`);
    }
  }
  for (const id of sortedIds(state.missions)) {
    const m = state.missions[id];
    if (m && !playerExists(m.justicarId)) add(`missions.${id}`, `unknown Justicar ${m.justicarId}`);
  }
  for (const id of sortedIds(state.debates)) {
    const d = state.debates[id];
    if (!d) continue;
    const optionIds = new Set(d.options.map((o) => o.id));
    if (optionIds.size !== d.options.length) add(`debates.${id}`, 'duplicate option ids');
    for (const [pid, votes] of Object.entries(d.votes)) {
      if (!playerExists(pid)) add(`debates.${id}`, `vote from unknown player ${pid}`);
      for (const [oid, n] of Object.entries(votes)) {
        if (!optionIds.has(oid)) add(`debates.${id}`, `vote for unknown option ${oid}`);
        if (!isNonNegInt(n)) add(`debates.${id}`, 'votes must be integers ≥ 0');
      }
    }
  }
  for (const id of sortedIds(state.effects)) {
    const e = state.effects[id];
    if (e && e.ownerId !== null && !playerExists(e.ownerId)) add(`effects.${id}`, `unknown owner ${e.ownerId}`);
  }

  return issues;
}

/** Kastar med en samlad lista om state bryter mot någon invariant. */
export function assertValidState(state: GameState, content: Content): void {
  const issues = validateState(state, content);
  if (issues.length > 0) {
    throw new Error(`Invalid state:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  }
}
