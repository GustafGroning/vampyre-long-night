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
  if (nonJson) add('$', `state är inte ren JSON: ${nonJson}`);

  if (state.schemaVersion !== STATE_SCHEMA_VERSION) add('schemaVersion', `okänd version ${state.schemaVersion}`);
  if (!ROUND_PHASES.includes(state.phase)) add('phase', `okänd fas ${state.phase}`);
  if (!isNonNegInt(state.round) || state.round > state.maxRounds) {
    add('round', `round ${state.round} utanför 0..${state.maxRounds}`);
  }
  if (state.phase === 'setup' && state.round !== 0) add('phase', 'setup kräver round 0');
  if (state.phase !== 'setup' && state.phase !== 'finished' && state.round === 0) {
    add('phase', `${state.phase} kräver round ≥ 1`);
  }

  // Record-nycklar ska vara lika med entitetens id.
  const collections = ['players', 'npcs', 'minions', 'artifacts', 'cities', 'seaRegions', 'combats', 'missions', 'debates', 'effects'] as const;
  for (const name of collections) {
    const rec = state[name] as Readonly<Record<string, { readonly id: string }>>;
    for (const key of Object.keys(rec)) {
      if (rec[key]?.id !== key) add(`${name}.${key}`, `id ${String(rec[key]?.id)} matchar inte nyckeln`);
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
      add(`counters.${kind}`, `ogiltig räknare ${counter}`);
      continue;
    }
    for (const id of generated[kind]) {
      const m = new RegExp(`^${kind}-(\\d+)$`).exec(id);
      if (!m) add(`${kind}:${id}`, `id följer inte formatet ${kind}-<n>`);
      else if (Number(m[1]) >= counter) add(`${kind}:${id}`, `id ≥ räknaren ${counter}`);
    }
  }

  const cityExists = (id: string): boolean => id in state.cities;
  const playerExists = (id: string): boolean => id in state.players;

  // Spelare
  for (const id of sortedIds(state.players)) {
    const p = state.players[id];
    if (!p) continue;
    const at = `players.${id}`;
    if (!CLANS.includes(p.clan)) add(at, `okänd klan ${p.clan}`);
    if (!FACTIONS.includes(p.faction)) add(at, `okänd sekt ${p.faction}`);
    if (p.title !== null && !TITLES.includes(p.title)) add(at, `okänd titel ${p.title}`);
    if (p.title !== null && content.titles[p.title].faction !== p.faction) {
      add(at, `titeln ${p.title} hör till ${content.titles[p.title].faction}, inte ${p.faction}`);
    }
    if (p.disguise !== null && (p.title !== 'archbishop' || p.faction !== 'sabbat')) {
      add(at, 'disguise kräver en Sabbat Archbishop');
    }
    if (p.disguise !== null && content.titles[p.disguise.title].faction !== p.disguise.faction) {
      add(at, `förklädnadens titel ${p.disguise.title} hör inte till ${p.disguise.faction}`);
    }
    if (!VAMPIRE_STATUSES.includes(p.status)) add(at, `okänd status ${p.status}`);
    if ((p.status === 'torpor') !== (p.torpor !== null)) add(at, 'torpor-fältet stämmer inte med status');
    if (p.torpor && (!isNonNegInt(p.torpor.progress) || !isNonNegInt(p.torpor.required) || p.torpor.required < 1)) {
      add(at, 'ogiltigt torpor-läge');
    }
    if (p.status === 'burned' ? p.location !== null : p.location === null || !cityExists(p.location)) {
      add(at, `ogiltig position ${String(p.location)} för status ${p.status}`);
    }
    if (!isNonNegInt(p.blood)) add(at, `blood måste vara heltal ≥ 0, är ${p.blood}`);
    if (!isNonNegInt(p.royalPrivileges)) add(at, 'royalPrivileges måste vara heltal ≥ 0');
    if (!isNonNegInt(p.exp.unspent) || !isNonNegInt(p.exp.spentTotal)) add(at, 'EXP måste vara heltal ≥ 0');
    if (p.exp.spentTotal > content.rules.expLifetimeCap) {
      add(at, `spenderad EXP ${p.exp.spentTotal} > tak ${content.rules.expLifetimeCap}`);
    }
    for (const d of Object.keys(p.disciplines)) {
      if (!(DISCIPLINES as readonly string[]).includes(d)) add(at, `okänd disciplin ${d}`);
    }
    for (const m of p.modifiers) {
      if (!Number.isInteger(m.amount)) add(at, `modifier från ${m.source} är inte ett heltal`);
    }
    if (!isSortedUnique(p.scoredCities)) add(at, 'scoredCities måste vara sorterad och unik');
    for (const c of p.scoredCities) if (!cityExists(c)) add(at, `scoredCities: okänd stad ${c}`);
    for (const e of p.vpLedger) if (!Number.isInteger(e.amount)) add(at, `VP-rad ${e.rule} är inte ett heltal`);
    if (p.obsession) {
      const o = p.obsession;
      const ok = o.kind === 'city' ? cityExists(o.id) : o.kind === 'minion' ? o.id in state.minions : o.id in state.artifacts;
      if (!ok) add(at, `obsession pekar på okänd ${o.kind} ${o.id}`);
    }
  }

  // Minions
  for (const id of sortedIds(state.minions)) {
    const m = state.minions[id];
    if (!m) continue;
    const at = `minions.${id}`;
    if (!MINION_TYPES.includes(m.type)) add(at, `okänd typ ${m.type}`);
    if (!(MINION_LEVELS as readonly number[]).includes(m.level)) add(at, `level ${m.level} utanför 1..3`);
    if (!cityExists(m.location)) add(at, `okänd stad ${m.location}`);
    if (m.owner.kind === 'player') {
      const owner = state.players[m.owner.id];
      if (!owner) add(at, `okänd ägare ${m.owner.id}`);
      else if (owner.status === 'burned') add(at, `ägaren ${m.owner.id} är bränd`);
    } else if (!(m.owner.id in state.npcs)) add(at, `okänd NPC-ägare ${m.owner.id}`);
    const loyal = content.minionTypes[m.type]?.startingLoyalty ?? null;
    if ((loyal === null) !== (m.loyaltyCounters === null)) add(at, 'loyaltyCounters stämmer inte med typen');
    if (m.loyaltyCounters !== null && !isNonNegInt(m.loyaltyCounters)) add(at, 'loyaltyCounters måste vara heltal ≥ 0');
    if (!isNonNegInt(m.acquiredRound)) add(at, 'acquiredRound måste vara heltal ≥ 0');
    if (m.origin.kind === 'vestment_zombie' && !(m.origin.artifactId in state.artifacts)) {
      add(at, `zombiens artefakt ${m.origin.artifactId} finns inte`);
    }
  }

  // Artefakter
  const carriedByMinion = new Map<string, string>();
  for (const id of sortedIds(state.artifacts)) {
    const a = state.artifacts[id];
    if (!a) continue;
    const at = `artifacts.${id}`;
    if (!ARTIFACT_KEYS.includes(a.definition)) add(at, `okänd definition ${a.definition}`);
    if (requiresBoundDiscipline(a.definition) !== (a.boundDiscipline !== null)) {
      add(at, `boundDiscipline ska ${requiresBoundDiscipline(a.definition) ? '' : 'inte '}vara satt för ${a.definition}`);
    }
    const h = a.holder;
    switch (h.kind) {
      case 'player':
        if (!playerExists(h.id)) add(at, `okänd bärare ${h.id}`);
        else if (state.players[h.id]?.status === 'burned') add(at, `bäraren ${h.id} är bränd`);
        break;
      case 'minion':
        if (!(h.id in state.minions)) add(at, `okänd minion ${h.id}`);
        if (carriedByMinion.has(h.id)) add(at, `minion ${h.id} bär redan ${carriedByMinion.get(h.id)} (max en, gd:379)`);
        carriedByMinion.set(h.id, id);
        break;
      case 'npc':
        if (!(h.id in state.npcs)) add(at, `okänd NPC ${h.id}`);
        break;
      case 'city':
        if (!cityExists(h.id)) add(at, `okänd stad ${h.id}`);
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
    if (!isSortedUnique(c.adjacent)) add(at, 'adjacent måste vara sorterad och unik');
    for (const n of c.adjacent) {
      if (n === id) add(at, 'staden är granne med sig själv');
      else if (!cityExists(n)) add(at, `okänd granne ${n}`);
      else if (!state.cities[n]?.adjacent.includes(id)) add(at, `grannskapet med ${n} är inte symmetriskt`);
    }
    if (c.isPort !== c.seaRegions.length > 0) add(at, 'hamnar ska ha minst en havsregion, inlandsstäder ingen');
    for (const r of c.seaRegions) if (!(r in state.seaRegions)) add(at, `okänd havsregion ${r}`);
    if (c.controllerId !== null) {
      const ctrl = state.players[c.controllerId];
      if (!ctrl) add(at, `okänd controller ${c.controllerId}`);
      else if (ctrl.status === 'burned') add(at, `controllern ${c.controllerId} är bränd`);
    }
    const contestantIds = c.contestants.map((x) => x.playerId);
    if (!isSortedUnique(contestantIds)) add(at, 'contestants måste vara sorterade och unika');
    for (const x of c.contestants) {
      if (!playerExists(x.playerId)) add(at, `okänd contestant ${x.playerId}`);
      if (x.playerId === c.controllerId) add(at, 'controllern kan inte contesta sin egen stad');
    }
    for (const [name, v] of [['stability', c.stability], ['masquerade', c.masquerade]] as const) {
      if (!isNonNegInt(v) || v > max) add(at, `${name} ${v} utanför 0..${max}`);
    }
    if (!isNonNegInt(c.intercept)) add(at, `intercept ${c.intercept} måste vara heltal ≥ 0`);
    if (!isNonNegInt(c.bloodFlow)) add(at, `bloodFlow ${c.bloodFlow} måste vara heltal ≥ 0`);
    if (!isNonNegInt(c.influence)) add(at, 'influence måste vara heltal ≥ 0');
    if (!isNonNegInt(c.revoltCounters) || c.revoltCounters > content.rules.revoltCountersForTakeover) {
      add(at, `revoltCounters ${c.revoltCounters} utanför 0..${content.rules.revoltCountersForTakeover}`);
    }
  }

  // Sabbat-baser
  for (const cid of Object.keys(state.sabbat.bases)) {
    const b = state.sabbat.bases[cid as keyof typeof state.sabbat.bases];
    if (!cityExists(cid)) add(`sabbat.bases.${cid}`, 'okänd stad');
    if (!b || !Number.isInteger(b.level) || b.level < 1 || b.level > content.rules.sabbatBaseMaxLevel) {
      add(`sabbat.bases.${cid}`, `level utanför 1..${content.rules.sabbatBaseMaxLevel}`);
    }
  }

  // Combats, missions, debatter, effekter: referenser
  for (const id of sortedIds(state.combats)) {
    const c = state.combats[id];
    if (!c) continue;
    if (!cityExists(c.cityId)) add(`combats.${id}`, `okänd stad ${c.cityId}`);
    for (const side of [c.attacker, c.defender]) {
      const k = side.combatant;
      const ok = k.kind === 'player' ? playerExists(k.id) : k.id in state.minions;
      if (!ok) add(`combats.${id}`, `okänd deltagare ${k.id}`);
    }
  }
  for (const id of sortedIds(state.missions)) {
    const m = state.missions[id];
    if (m && !playerExists(m.justicarId)) add(`missions.${id}`, `okänd Justicar ${m.justicarId}`);
  }
  for (const id of sortedIds(state.debates)) {
    const d = state.debates[id];
    if (!d) continue;
    const optionIds = new Set(d.options.map((o) => o.id));
    if (optionIds.size !== d.options.length) add(`debates.${id}`, 'dubblerade alternativ-id');
    for (const [pid, votes] of Object.entries(d.votes)) {
      if (!playerExists(pid)) add(`debates.${id}`, `röst från okänd spelare ${pid}`);
      for (const [oid, n] of Object.entries(votes)) {
        if (!optionIds.has(oid)) add(`debates.${id}`, `röst på okänt alternativ ${oid}`);
        if (!isNonNegInt(n)) add(`debates.${id}`, 'röster måste vara heltal ≥ 0');
      }
    }
  }
  for (const id of sortedIds(state.effects)) {
    const e = state.effects[id];
    if (e && e.ownerId !== null && !playerExists(e.ownerId)) add(`effects.${id}`, `okänd ägare ${e.ownerId}`);
  }

  return issues;
}

/** Kastar med en samlad lista om state bryter mot någon invariant. */
export function assertValidState(state: GameState, content: Content): void {
  const issues = validateState(state, content);
  if (issues.length > 0) {
    throw new Error(`Ogiltigt state:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  }
}
