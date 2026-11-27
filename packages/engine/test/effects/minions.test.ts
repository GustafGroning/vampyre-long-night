import { describe, expect, it } from 'vitest';
import { ACTION_CATALOG, stubbedActionIds } from '../../src/catalog/registry.js';
import { resolveRound } from '../../src/round/resolve.js';
import type { RoundEvent, RoundResult, SubmittedAction } from '../../src/round/types.js';
import type { CityFeatureId, CityId, MinionId, PlayerId } from '../../src/state/ids.js';
import { cloneJson } from '../../src/state/json.js';
import { minionStat } from '../../src/state/queries.js';
import type { GameState, Mutable } from '../../src/state/types.js';
import { assertValidState } from '../../src/state/validate.js';
import { content, e, sub, subs, v, world, type World } from '../round/fixtures.js';

const opts = { content, registry: ACTION_CATALOG };

function run(
  w: World,
  lists: Record<string, SubmittedAction[]>,
  state: GameState = w.state,
  seed = 'r1',
): RoundResult & { status: 'completed' } {
  const s = subs(...Object.entries(lists).map(([k, actions]) => sub(w.P[k]!, actions)));
  const r = resolveRound(state, s, seed, opts);
  if (r.status !== 'completed') throw new Error('väntade completed');
  assertValidState(r.state, content);
  return r;
}

const mp = (actionId: string, minionId: MinionId, params?: SubmittedAction['params']): SubmittedAction => ({
  actionId,
  performer: { kind: 'minion', minionId },
  ...(params ? { params } : {}),
});
const events = (r: RoundResult, kind: string): RoundEvent[] => r.resolution.events.filter((ev) => ev.kind === kind);
const status = (r: RoundResult, pid: PlayerId, i: number) => r.resolution.entries[e(pid, i)]!.status;
const city = (s: GameState, id: string) => s.cities[id as CityId]!;
const edit = (s: GameState, f: (m: Mutable<GameState>) => void): GameState => {
  const c = cloneJson(s) as Mutable<GameState>;
  f(c);
  return c as GameState;
};

describe('Ghoul', () => {
  it('Sabotage: minionens stad får −1 stability eller −1 intercept, permanent', () => {
    const w = world({ a: { title: null } }, { gh: { owner: 'a', type: 'ghoul', location: 'east' } });
    const r = run(w, { a: [mp('ghoul_sabotage', w.M.gh!, { stat: 'stability' })] });
    expect(city(r.state, 'east').stability).toBe(2);
    const r2 = run(w, { a: [mp('ghoul_sabotage', w.M.gh!, { stat: 'intercept' })] });
    expect(city(r2.state, 'east').intercept).toBe(1);
  });

  it('Partner in Crime: vampyrens senare aktioner får +level stealth om ghoulen är i samma stad (E26)', () => {
    const seenBy = (w: World, lists: SubmittedAction[], observer: PlayerId) =>
      events(run(w, { a: lists }), 'action_observed').filter(
        (ev) => ev.data!.actionId === 'bleed' && ev.audience.kind === 'players' && ev.audience.ids.includes(observer),
      ).length;
    const here = world({ a: { title: null }, o: { title: null } }, { gh: { owner: 'a', type: 'ghoul', level: 1 } });
    expect(seenBy(here, [v('bleed')], here.P.o!)).toBe(1);
    expect(seenBy(here, [mp('partner_in_crime', here.M.gh!), v('bleed')], here.P.o!)).toBe(0);
    // Ghoulen i en annan stad hjälper inte.
    const away = world({ a: { title: null }, o: { title: null } }, { gh: { owner: 'a', type: 'ghoul', level: 1, location: 'east' } });
    expect(seenBy(away, [mp('partner_in_crime', away.M.gh!), v('bleed')], away.P.o!)).toBe(1);
  });

  it('Move the Master: vampyren i torpor flyttas till ghoulens stad; misslyckas om vampyren är vaken', () => {
    const w = world({ a: { title: null, status: 'torpor' } }, { gh: { owner: 'a', type: 'ghoul', location: 'isle' } });
    const r = run(w, { a: [mp('move_the_master', w.M.gh!)] });
    expect(r.state.players[w.P.a!]!.location).toBe('isle');
    const awake = world({ a: { title: null } }, { gh: { owner: 'a', type: 'ghoul', location: 'isle' } });
    const r2 = run(awake, { a: [mp('move_the_master', awake.M.gh!)] });
    expect(status(r2, awake.P.a!, 0)).toBe('failed');
    expect(r2.state.players[awake.P.a!]!.location).toBe('north');
  });
});

describe('Harpy', () => {
  it('Suicide Mission: D4 ≤ level tar bort specialen, annars bränns minionen', () => {
    const w = world({ a: { title: null } }, { hp: { owner: 'a', type: 'harpy', level: 2 } });
    const featureId = 'feature-900' as CityFeatureId;
    const s = edit(w.state, (c) => {
      c.cities['north' as CityId]!.specials = [
        { id: featureId, key: 'secure_haven', name: 'Secure Haven', createdRound: 0, expiresAfterRound: null, data: {} },
      ];
      c.counters.feature = 901;
    });
    const outcomes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = run(w, { a: [mp('suicide_mission', w.M.hp!, { feature: featureId })] }, s, `seed-${i}`);
      const removed = city(r.state, 'north').specials.length === 0;
      const burned = !(w.M.hp! in r.state.minions);
      expect(removed !== burned).toBe(true);
      const ev = events(r, removed ? 'special_removed' : 'minion_burned')[0]!;
      expect((ev.data!.roll as number) <= 2).toBe(removed);
      outcomes.add(removed ? 'removed' : 'burned');
    }
    expect(outcomes).toEqual(new Set(['removed', 'burned']));
  });
});

describe('Eye', () => {
  it('Hide and Spy: +2 stealth och intercept denna och nästa rond; nästa rond kan minionen inte agera (E27)', () => {
    const w = world({ a: { title: null } }, { eye: { owner: 'a', type: 'eye', level: 1 } });
    const r1 = run(w, { a: [mp('hide_and_spy', w.M.eye!)] });
    expect(minionStat(r1.state, content, w.M.eye!, 'stealth')).toBe(3);
    expect(minionStat(r1.state, content, w.M.eye!, 'intercept')).toBe(3);
    const r2 = run(w, { a: [mp('minion_move', w.M.eye!, { to: 'east' })] }, r1.state);
    expect(status(r2, w.P.a!, 0)).toBe('rejected');
    expect(r2.state.minions[w.M.eye!]!.location).toBe('north');
    expect(minionStat(r2.state, content, w.M.eye!, 'stealth')).toBe(1);
    const r3 = run(w, { a: [mp('minion_move', w.M.eye!, { to: 'east' })] }, r2.state);
    expect(status(r3, w.P.a!, 0)).toBe('resolved');
  });

  it('Keep an Eye on Them: lyckad hunt roll ger svaret; bara Eyens spelare ser det', () => {
    const w = world({ a: { title: null }, t: { title: null, blood: 77 } }, { eye: { owner: 'a', type: 'eye', level: 3 } });
    let answered = 0;
    for (let i = 0; i < 10; i++) {
      const r = run(w, { a: [mp('keep_an_eye_on_them', w.M.eye!, { target: w.P.t!, question: 'blood' })] }, w.state, `k-${i}`);
      const [ev] = events(r, 'keep_an_eye_result');
      expect(ev!.audience).toEqual({ kind: 'players', ids: [w.P.a!] });
      expect(ev!.data).not.toHaveProperty('hunter');
      if (ev!.data!.success) {
        answered += 1;
        expect(ev!.data!.answer).toBe(77);
      }
      expect(events(r, 'hunt_rolled')[0]!.audience).toEqual({ kind: 'gm' });
    }
    // D4+3 mot D4+0 misslyckas bara på 1 mot 4.
    expect(answered).toBeGreaterThan(5);
  });

  it('Keep an Eye on Them: målet i en annan stad ger samma svar som en misslyckad jakt (E29)', () => {
    const w = world({ a: { title: null }, t: { title: null, location: 'east' } }, { eye: { owner: 'a', type: 'eye', level: 3 } });
    for (let i = 0; i < 5; i++) {
      const r = run(w, { a: [mp('keep_an_eye_on_them', w.M.eye!, { target: w.P.t!, question: 'vp' })] }, w.state, `x-${i}`);
      expect(status(r, w.P.a!, 0)).toBe('resolved');
      expect(events(r, 'keep_an_eye_result')[0]!.data).toEqual({ minionId: w.M.eye!, target: w.P.t!, question: 'vp', success: false });
    }
  });
});

describe('Primogen', () => {
  it("Build on the Master's Kingdom: ett val per level i minionens stad", () => {
    const w = world({ p: { title: 'prince', controls: ['north'] } }, { pg: { owner: 'p', type: 'primogen', level: 2 } });
    const r = run(w, { p: [mp('build_on_the_masters_kingdom', w.M.pg!, { choice1: 'stability', choice2: 'elysium' })] });
    expect(city(r.state, 'north').stability).toBe(5);
    expect(city(r.state, 'north').specials.map((f) => f.key)).toEqual(['elysium']);
    expect(r.state.minions[w.M.pg!]).toBeDefined();
  });

  it('Recruit a Primogen: ny Primogen i en stad i domänen; A cursed kiss kostar +10 (E23)', () => {
    const w = world({ p: { title: 'prince', controls: ['north', 'east'], blood: 100 } });
    const r = run(w, { p: [v('recruit_a_primogen', { city: 'east', level: 1 })] });
    const [m] = Object.values(r.state.minions);
    expect(m).toMatchObject({ type: 'primogen', level: 1, location: 'east', acquiredRound: 1 });
    const paid = (x: RoundResult) => events(x, 'actions_paid')[0]!.data!.amount;
    expect(paid(r)).toBe(40);
    const h = world({ p: { title: 'prince', clan: 'hecata', controls: ['north'], blood: 100 } });
    expect(paid(run(h, { p: [v('recruit_a_primogen', { city: 'north', level: 1 })] }))).toBe(50);
    expect(paid(run(h, { p: [v('get_a_minion', { type: 'eye', level: 1 })] }))).toBe(30);
  });

  it('Loyal to the Prince: en Primogen hos någon som inte är Camarilla Prince bränns i fas 4b', () => {
    const w = world({ u: { title: null } }, { pg: { owner: 'u', type: 'primogen' } });
    const r = run(w, {});
    expect(r.state.minions[w.M.pg!]).toBeUndefined();
    const [ev] = events(r, 'minion_burned');
    expect(ev).toMatchObject({ phase: '4b_player_end_effects', data: { reason: 'loyal_to_the_prince' } });
    expect(ev!.audience).toEqual({ kind: 'players', ids: [w.P.u!] });
    const ok = world({ p: { title: 'prince', controls: ['north'] } }, { pg: { owner: 'p', type: 'primogen' } });
    expect(run(ok, {}).state.minions[ok.M.pg!]).toBeDefined();
  });
});

describe('Archon', () => {
  const justicar = () =>
    world({ j: { title: 'justicar' }, t: { title: null } }, { ar: { owner: 'j', type: 'archon', level: 2 } });

  it('Follow Them: Archonen följer målet när det förflyttar sig; följarens spelare får veta det utan entry-koppling', () => {
    const w = justicar();
    const r = run(w, {
      j: [mp('follow_them', w.M.ar!, { target: w.P.t! })],
      t: [v('watchful_eyes'), v('move', { to: 'east' }), v('move', { to: 'south' })],
    });
    expect(r.state.minions[w.M.ar!]!.location).toBe('south');
    const evs = events(r, 'follow_triggered');
    expect(evs.map((ev) => ev.data!.to)).toEqual(['east', 'south']);
    for (const ev of evs) {
      expect(ev.audience).toEqual({ kind: 'players', ids: [w.P.j!] });
      expect(ev.playerId).toBeUndefined();
      expect(ev.entryId).toBeUndefined();
    }
  });

  it('Follow Them: ett mål i en annan stad följs inte', () => {
    const w = world({ j: { title: 'justicar' }, t: { title: null, location: 'west' } }, { ar: { owner: 'j', type: 'archon' } });
    const r = run(w, { j: [mp('follow_them', w.M.ar!, { target: w.P.t! })], t: [v('watchful_eyes'), v('move', { to: 'south' })] });
    expect(r.state.minions[w.M.ar!]!.location).toBe('north');
  });

  it('Sabbat Interrogations: basen tappar en level, Lvl 1 förstörs; utan bas −1 stability', () => {
    const w = justicar();
    const withBase = (level: 1 | 2) =>
      edit(w.state, (c) => {
        (c.sabbat.bases as Record<string, { level: 1 | 2 | 3; builtRound: number }>).north = { level, builtRound: 0 };
      });
    const act = { j: [mp('sabbat_interrogations', w.M.ar!)] };
    const r2 = run(w, act, withBase(2));
    expect(r2.state.sabbat.bases['north' as CityId]!.level).toBe(1);
    expect(events(r2, 'sabbat_interrogations')[0]!.data!.outcome).toBe('base_reduced');
    const r1 = run(w, act, withBase(1));
    expect(r1.state.sabbat.bases['north' as CityId]).toBeUndefined();
    const r0 = run(w, act);
    expect(city(r0.state, 'north').stability).toBe(3);
    expect(events(r0, 'sabbat_interrogations')[0]!.data!.outcome).toBe('stability_lowered');
  });

  it("Camarilla Loyal: en counter per rond i fas 4c, bränd vid 0; The Master's Will ger +3 (E33)", () => {
    const w = justicar();
    const r1 = run(w, {});
    expect(r1.state.minions[w.M.ar!]!.loyaltyCounters).toBe(2);
    const r2 = run(w, { j: [mp('the_masters_will', w.M.ar!)] }, r1.state);
    expect(r2.state.minions[w.M.ar!]!.loyaltyCounters).toBe(4);
    const low = edit(w.state, (c) => {
      c.minions[w.M.ar!]!.loyaltyCounters = 1;
    });
    const r3 = run(w, {}, low);
    expect(r3.state.minions[w.M.ar!]).toBeUndefined();
    expect(events(r3, 'minion_burned')[0]).toMatchObject({ phase: '4c_missions', data: { reason: 'loyalty_lost' } });
  });

  it('Camarilla Loyal: en Archon hos någon som inte är Justicar bränns', () => {
    const w = world({ p: { title: 'prince' } }, { ar: { owner: 'p', type: 'archon' } });
    const r = run(w, {});
    expect(r.state.minions[w.M.ar!]).toBeUndefined();
    expect(events(r, 'minion_burned')[0]!.data!.reason).toBe('camarilla_loyal');
  });
});

it('minionaktionerna som inte kräver strid är inte stubbar', () => {
  const stubs = new Set(stubbedActionIds());
  for (const id of [
    'ghoul_sabotage',
    'partner_in_crime',
    'move_the_master',
    'suicide_mission',
    'hide_and_spy',
    'keep_an_eye_on_them',
    'build_on_the_masters_kingdom',
    'recruit_a_primogen',
    'follow_them',
    'sabbat_interrogations',
    'the_masters_will',
  ]) {
    expect(stubs.has(id), id).toBe(false);
  }
});
