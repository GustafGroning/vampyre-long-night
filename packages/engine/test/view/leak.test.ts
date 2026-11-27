/**
 * Läck-tester (vyprincipen i 001_motorbeslut.md): unika kanarier planteras i
 * varje dolt fält. Ingen spelares serialiserade vy får innehålla en kanarie som
 * inte är hens egen.
 */
import { describe, expect, it } from 'vitest';
import {
  buildGmView,
  buildPlayerView,
  cloneJson,
  type ArtifactId,
  type CityId,
  type CombatId,
  type DebateId,
  type EffectId,
  type GameState,
  type MinionId,
  type MissionId,
  type Mutable,
  type PlayerId,
  type RoundEvent,
} from '../../src/index.js';
import { content, P, sampleState } from '../fixtures.js';

const ALL = Object.values(P);
/** Kanarie som syns för `owners` (tom = ingen spelare). */
interface Canary {
  text: string;
  owners: PlayerId[];
  /** Härlett värde som inte lagras i state (finns inte i GM-vyn). */
  derived?: true;
}

/** Ett tal som inte förekommer naturligt i state. */
const num = (base: number, i: number) => base + i;

function plant(): { state: GameState; events: RoundEvent[]; canaries: Canary[] } {
  const s = cloneJson(sampleState()) as Mutable<GameState>;
  s.round = 1;
  s.phase = 'submission';
  const canaries: Canary[] = [];
  const add = (text: string | number, owners: PlayerId[], derived = false) =>
    canaries.push(derived ? { text: String(text), owners, derived } : { text: String(text), owners });

  s.seed = 'CANARY_seed';
  add('CANARY_seed', []);

  ALL.forEach((pid, i) => {
    const p = s.players[pid]!;
    p.blood = num(910000, i);
    add(p.blood, [pid]);
    p.exp.unspent = num(911000, i);
    add(p.exp.unspent, [pid]);
    p.royalPrivileges = num(912000, i);
    add(p.royalPrivileges, [pid]);
    p.vpLedger.push({ round: 1, amount: num(913000, i * 10), rule: `CANARY_vprule_${i}`, ref: `CANARY_vpref_${i}` });
    add(`CANARY_vprule_${i}`, [pid]);
    add(`CANARY_vpref_${i}`, [pid]);
    add(p.vpLedger.reduce((a, e) => a + e.amount, 0), [pid], true); // VP-summan
    p.modifiers.push({ stat: 'strength', amount: 0, source: `CANARY_mod_${i}`, expiresAfterRound: null });
    add(`CANARY_mod_${i}`, [pid]);
    p.temporaryDisciplines.push({ discipline: 'auspex', level: 'basic', source: `CANARY_tmpdisc_${i}`, expiresAfterRound: 5 });
    add(`CANARY_tmpdisc_${i}`, [pid]);
    p.actionBudgetModifiers.push({ round: 1, kind: 'bonus', amount: 0, source: `CANARY_budget_${i}` });
    add(`CANARY_budget_${i}`, [pid]);
    p.bloodAtEndOfLastRound = num(914000, i);
    add(p.bloodAtEndOfLastRound, [pid]);

    // Egen effekt: bara ägaren.
    const eid = `effect-${i + 1}` as EffectId;
    s.effects[eid] = { id: eid, key: `CANARY_effect_${i}`, source: 'test', ownerId: pid, startsRound: 1, expiresAfterRound: null, data: { x: `CANARY_effectdata_${i}` } };
    add(`CANARY_effect_${i}`, [pid]);
    add(`CANARY_effectdata_${i}`, [pid]);

    // Egen artefakt: id:t får bara synas för ägaren.
    const aid = `artifact-${100 + i}` as ArtifactId;
    s.artifacts[aid] = { id: aid, definition: 'fog_flute', holder: { kind: 'player', id: pid }, boundDiscipline: null };
    add(aid, [pid]);
  });

  // Artefakt som bärs av en minion: bara minionens ägare.
  const jenny = Object.values(s.minions).find((m) => m.name === 'Jenny')!;
  s.artifacts['artifact-200' as ArtifactId] = { id: 'artifact-200' as ArtifactId, definition: 'bloodspot_dice', holder: { kind: 'minion', id: jenny.id }, boundDiscipline: null };
  add('artifact-200', [P.inner]);
  // Artefakter i stad och pool: ingen.
  s.artifacts['artifact-201' as ArtifactId] = { id: 'artifact-201' as ArtifactId, definition: 'fog_flute', holder: { kind: 'city', id: 'west' as CityId }, boundDiscipline: null };
  add('artifact-201', []);
  for (const a of Object.values(s.artifacts)) if (a.holder.kind === 'pool') add(a.id, []);

  // Kunskap om andras artefakter (S24, V20): bara den som lärt sig.
  s.artifacts['artifact-202' as ArtifactId] = { id: 'artifact-202' as ArtifactId, definition: 'the_evil_eye', holder: { kind: 'player', id: P.baron }, boundDiscipline: null };
  add('artifact-202', [P.baron, P.prince]);
  s.knowledge.artifacts[P.prince] = {
    ['artifact-202' as ArtifactId]: { holder: { kind: 'player', id: P.baron }, round: 1, source: 'CANARY_knowsrc' },
  };
  add('CANARY_knowsrc', [P.prince]);
  // Inaktuell kunskap (bäraren har bytts): syns inte ens för den som lärde sig.
  s.knowledge.artifacts[P.bishop] = {
    ['artifact-201' as ArtifactId]: { holder: { kind: 'player', id: P.inner }, round: 1, source: 'CANARY_stalesrc' },
  };
  add('CANARY_stalesrc', []);

  // Minionens loyalty och modifiers: bara ägaren.
  const archon = Object.values(s.minions).find((m) => m.type === 'archon')!;
  archon.loyaltyCounters = 915001;
  add(915001, [P.justicar]);
  archon.modifiers.push({ stat: 'stealth', amount: 0, source: 'CANARY_minionmod', expiresAfterRound: null });
  add('CANARY_minionmod', [P.justicar]);

  // NPC-ägd minion: ingen (V3).
  const npcId = Object.keys(s.npcs)[0]!;
  s.minions['minion-900' as MinionId] = { ...cloneJson(archon), id: 'minion-900' as MinionId, name: 'CANARY_npcminion', owner: { kind: 'npc', id: npcId as never }, modifiers: [] };
  add('CANARY_npcminion', []);

  // Sabbat-baser: bara Sabbat (bishop).
  s.sabbat.bases['east' as CityId] = { level: 2, builtRound: 916001 };
  add(916001, [P.bishop]);

  // Debattröster: bara den som röstat.
  const did = 'debate-1' as DebateId;
  s.debates[did] = {
    id: did, round: 1, kind: 'regular', templateKey: 't', title: 'Debatt',
    options: [{ id: 'a', name: 'A', text: 'A', effect: null, innerCircleVp: false }],
    votes: Object.fromEntries(ALL.map((pid, i) => [pid, { a: num(917000, i) }])),
    result: null,
  };
  ALL.forEach((pid, i) => add(num(917000, i), [pid]));

  // Mission: bara justicaren.
  const mid = 'mission-1' as MissionId;
  s.missions[mid] = { id: mid, justicarId: P.justicar, templateKey: 'CANARY_missionkey', title: 'CANARY_mission', condition: null, reward: { blood: 0, vp: 0 }, assignedRound: 1, status: 'active', completedRound: null };
  add('CANARY_mission', [P.justicar]);
  add('CANARY_missionkey', [P.justicar]);

  // Stadsdata: featurens detaljer och modifiers källa syns för ingen (V5, V6).
  const west = s.cities['west' as CityId]!;
  west.problems.push({ id: 'feature-90' as never, key: 'riot', name: 'Riot', createdRound: 1, expiresAfterRound: null, data: { secret: 'CANARY_featuredata' } });
  add('CANARY_featuredata', []);
  west.modifiers.push({ stat: 'stability', amount: 0, source: 'CANARY_citymod', expiresAfterRound: null });
  add('CANARY_citymod', []);

  // Strid mellan baron och untitled: bara parterna; Charge-blood bara egen sida.
  const cid = 'combat-1' as CombatId;
  s.combats[cid] = {
    id: cid, cityId: 'west' as CityId, createdRound: 1,
    trigger: { kind: 'action', actionKey: 'attack', slot: 1 },
    attacker: { combatant: { kind: 'player', id: P.baron }, assistingMinions: [], chargeBlood: 918001, ambush: false },
    defender: { combatant: { kind: 'player', id: P.untitled }, assistingMinions: [], chargeBlood: 918002, ambush: false },
    step: 'charge', pressCount: 0, rolls: [{ attacker: [919001], defender: [919002] }], outcome: null,
  };
  add(918001, [P.baron]);
  add(918002, [P.untitled]);
  add(919001, [P.baron, P.untitled]);

  // Events: privata, GM och publika.
  const ev = (seq: number, data: string, audience: RoundEvent['audience']): RoundEvent => ({
    seq, round: 1, phase: '3a_actions', kind: 'test', data: { c: data }, audience,
  });
  const events: RoundEvent[] = [
    ...ALL.map((pid, i) => ev(i, `CANARY_event_${i}`, { kind: 'players', ids: [pid] })),
    ev(50, 'CANARY_event_pair', { kind: 'players', ids: [P.inner, P.prince] }),
    ev(51, 'CANARY_event_gm', { kind: 'gm' }),
    ev(52, 'CANARY_event_public', { kind: 'public' }),
  ];
  ALL.forEach((pid, i) => add(`CANARY_event_${i}`, [pid]));
  add('CANARY_event_pair', [P.inner, P.prince]);
  add('CANARY_event_gm', []);
  add('CANARY_event_public', ALL);

  return { state: s as GameState, events, canaries };
}

describe('per-spelare-vyer läcker inte', () => {
  const { state, events, canaries } = plant();

  it.each(ALL)('vyn för %s innehåller bara egna kanarier', (viewer) => {
    const json = JSON.stringify(buildPlayerView(state, content, viewer, { events }));
    for (const c of canaries) {
      const shouldSee = c.owners.includes(viewer);
      expect.soft(json.includes(c.text), `${c.text} (ägare: ${c.owners.join(',') || 'ingen'})`).toBe(shouldSee);
    }
  });

  it('dold Archbishop: bara Sabbat-spelare ser värdena archbishop eller sabbat', () => {
    for (const viewer of ALL) {
      const json = JSON.stringify(buildPlayerView(state, content, viewer, { events }));
      const sabbat = viewer === P.bishop;
      expect(json.includes('"archbishop"'), viewer).toBe(sabbat);
      expect(json.includes(':"sabbat"'), viewer).toBe(sabbat);
    }
  });

  it('andras position och minions position syns inte', () => {
    for (const viewer of ALL) {
      const view = buildPlayerView(state, content, viewer, { events });
      for (const p of view.players) expect(Object.keys(p)).not.toContain('location');
      for (const m of view.minions) expect(Object.keys(m)).not.toContain('location');
      expect(view.me.location).toBe(state.players[viewer]!.location);
    }
  });

  it('publika vampyrfält är exakt allowlisten (M2)', () => {
    const view = buildPlayerView(state, content, P.bishop);
    const keys = new Set(view.players.flatMap((p) => Object.keys(p)));
    expect([...keys].sort()).toEqual(['bloodHunt', 'burned', 'clan', 'faction', 'id', 'name', 'sabbatIdentity', 'title']);
  });

  it('nya fält i GameState syns inte automatiskt', () => {
    const s = cloneJson(state) as Mutable<GameState> & Record<string, unknown>;
    s['CANARY_newtop'] = 'x';
    (s.players[P.inner] as unknown as Record<string, unknown>)['CANARY_newplayerfield'] = 'x';
    (s.cities['north' as CityId] as unknown as Record<string, unknown>)['CANARY_newcityfield'] = 'x';
    const json = JSON.stringify(buildPlayerView(s as GameState, content, P.inner));
    expect(json).not.toContain('CANARY_new');
  });

  it('GM-vyn innehåller allt, och är en kopia', () => {
    const gm = buildGmView(state, events);
    const json = JSON.stringify(gm);
    for (const c of canaries.filter((x) => !x.derived)) expect.soft(json.includes(c.text), c.text).toBe(true);
    (gm.state.players[P.inner] as Mutable<GameState['players'][PlayerId]>).blood = 0;
    expect(state.players[P.inner]!.blood).not.toBe(0);
  });

  it('vyn är en kopia: att mutera den ändrar inte state', () => {
    const view = buildPlayerView(state, content, P.inner, { events });
    view.me.vpLedger.push({ round: 9, amount: 9, rule: 'x' });
    view.me.minions[0]!.modifiers.push({ stat: 'strength', amount: 1, source: 'x', expiresAfterRound: null });
    expect(buildPlayerView(state, content, P.inner, { events })).not.toEqual(view);
  });
});
