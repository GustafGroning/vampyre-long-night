import { describe, expect, it } from 'vitest';
import { createRegistry, SKELETON_ACTIONS, type ActionContext, type ActionDefinition } from '../../src/round/actions.js';
import { continueResolution, PHASES, resolveRound, type PhaseHook } from '../../src/round/resolve.js';
import type { Json, RoundResult } from '../../src/round/types.js';
import type { PlayerId } from '../../src/state/ids.js';
import { canonicalJson } from '../../src/state/json.js';
import { assertValidState } from '../../src/state/validate.js';
import { content, deepFreeze, e, m, sub, subs, v, world } from './fixtures.js';

const log = (scratch: { [k: string]: Json }, item: string) => {
  const arr = (scratch.log ??= []) as Json[];
  arr.push(item);
};

const toTorpor = (ctx: ActionContext, id: string) => {
  const p = ctx.state.players[id as PlayerId]!;
  p.status = 'torpor';
  p.torpor = { progress: 0, required: 3, sinceRound: ctx.state.round };
};

const testActions: ActionDefinition[] = [
  {
    id: 'probe',
    name: 'Probe',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 1,
    resolve: (ctx) => {
      log(ctx.scratch, ctx.entry.id);
      return { status: 'resolved' };
    },
  },
  {
    id: 'minion_probe',
    name: 'Minion probe',
    category: 'minion',
    performer: 'minion',
    stealth: 0,
    cost: 2,
    resolve: (ctx) => {
      log(ctx.scratch, ctx.entry.id);
      return { status: 'resolved' };
    },
  },
  {
    id: 'knockout',
    name: 'Knockout',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 0,
    resolve: (ctx) => {
      log(ctx.scratch, ctx.entry.id);
      toTorpor(ctx, ctx.entry.action.params!.target as string);
      return { status: 'resolved' };
    },
  },
  {
    id: 'fizzle',
    name: 'Fizzle',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 7,
    resolve: () => ({ status: 'failed', reason: 'målet var i fel stad' }),
  },
  {
    id: 'dice',
    name: 'Dice',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 0,
    resolve: (ctx) => {
      log(ctx.scratch, `${ctx.entry.id}=${ctx.rng.int(1, 1_000_000)}`);
      return { status: 'resolved' };
    },
  },
  {
    id: 'duel',
    name: 'Duel',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: 3,
    resolve: (ctx) => {
      log(ctx.scratch, ctx.entry.id);
      return { status: 'interrupt', kind: 'combat', data: { target: ctx.entry.action.params!.target! } };
    },
    resume: (ctx, result) => {
      log(ctx.scratch, `resume:${ctx.entry.id}`);
      if (typeof result.loser === 'string') toTorpor(ctx, result.loser);
      return result.loser === ctx.player.id ? { status: 'failed', reason: 'förlorade' } : { status: 'resolved' };
    },
  },
];

const registry = createRegistry([...Object.values(SKELETON_ACTIONS), ...testActions]);
const opts = { registry, content };

const completed = (r: RoundResult) => {
  if (r.status !== 'completed') throw new Error(`väntade completed, fick ${r.status}`);
  assertValidState(r.state, content);
  return r;
};
const suspended = (r: RoundResult) => {
  if (r.status !== 'suspended') throw new Error(`väntade suspended, fick ${r.status}`);
  return r;
};
const scratchLog = (r: RoundResult) => (r.resolution.scratch.log ?? []) as string[];

describe('resolveRound: grundflöde', () => {
  it('kör alla faser i ordning och går till nästa rond', () => {
    const { state, P } = world({ a: {} });
    const seen: string[] = [];
    const hook: PhaseHook = (ctx) => seen.push(ctx.phase);
    const hooks = Object.fromEntries(PHASES.map((p) => [p, [hook]]));
    const r = completed(resolveRound(state, subs(sub(P.a!, [])), 'seed', { ...opts, hooks }));
    expect(seen).toEqual([...PHASES]);
    expect(r.state.round).toBe(2);
    expect(r.state.phase).toBe('submission');
  });

  it('sista ronden avslutar spelet (R14)', () => {
    const { state } = world({ a: {} }, {}, { round: 8 });
    const r = completed(resolveRound(state, {}, 'seed', opts));
    expect(r.state.phase).toBe('finished');
    expect(r.state.round).toBe(8);
  });

  it('muterar aldrig indata', () => {
    const { state, P, M } = world({ a: {}, b: {} }, { g: { owner: 'a' } });
    deepFreeze(state);
    const s = deepFreeze(subs(sub(P.a!, [v('probe'), m('minion_probe', M.g!)]), sub(P.b!, [v('fizzle')])));
    expect(() => resolveRound(state, s, 'seed', opts)).not.toThrow();
  });

  it('vägrar lösa en rond som inte är i submission-fasen', () => {
    const { state } = world({ a: {} });
    expect(() => resolveRound({ ...state, phase: 'resolving' }, {}, 'x', opts)).toThrow();
  });
});

describe('ordning (M4) och determinism (M9, R17)', () => {
  const w = world({ a: {}, b: {}, c: {}, d: {}, e: {}, f: {} });
  const ids = Object.values(w.P);
  const all = subs(...ids.map((id) => sub(id, [v('probe'), v('probe'), v('dice')])));

  it('alla spelares slot 1 löses före någon slot 2', () => {
    const order = scratchLog(completed(resolveRound(w.state, all, 'seed', opts)));
    const slots = order.map((x) => Number(x.split('#')[1]!.split('=')[0]));
    expect(slots).toEqual([...slots].sort((x, y) => x - y));
    expect(slots.filter((s) => s === 0)).toHaveLength(6);
  });

  it('samma seed ger identiskt resultat, byte för byte', () => {
    const a = resolveRound(w.state, all, 'seed-1', opts);
    const b = resolveRound(w.state, all, 'seed-1', opts);
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('annan seed ger annan ordning', () => {
    const orders = new Set(['s1', 's2', 's3', 's4', 's5'].map((seed) => scratchLog(resolveRound(w.state, all, seed, opts)).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('en entrys tärningar beror bara på seed och entry, inte på andra aktioner (delströmmar)', () => {
    const b = w.P.b!;
    const withExtra = { ...all, [w.P.a!]: sub(w.P.a!, [v('probe'), v('dice'), v('dice')]) };
    const forB = (r: RoundResult) => scratchLog(r).find((x) => x.startsWith(`${e(b, 2)}=`));
    expect(forB(resolveRound(w.state, withExtra, 'seed', opts))).toBe(forB(resolveRound(w.state, all, 'seed', opts)));
  });
});

describe('betalning (1a, 1b) och återbetalning (C11)', () => {
  it('drar alla kostnader i förskott och återbetalar misslyckade aktioner', () => {
    const { state, P } = world({ a: { blood: 50 } });
    const a = P.a!;
    const r = completed(resolveRound(state, subs(sub(a, [v('probe'), v('fizzle')])), 's', opts));
    expect(r.state.players[a]!.blood).toBe(49);
    expect(r.resolution.events.find((x) => x.kind === 'actions_paid')?.data).toMatchObject({ amount: 8 });
    expect(r.resolution.events.find((x) => x.kind === 'action_failed')?.data).toMatchObject({
      refund: 7,
      reason: 'målet var i fel stad',
    });
    expect(r.resolution.entries[e(a, 1)]!.status).toBe('failed');
  });

  it('förbrukar Royal Privileges och ger extra slot', () => {
    const { state, P } = world({ a: { royalPrivileges: 1 } });
    const a = P.a!;
    const five = [v('probe'), v('probe'), v('probe'), v('probe'), v('probe')];
    const r = completed(resolveRound(state, subs(sub(a, five, { royalPrivilegesToSpend: 1 })), 's', opts));
    expect(r.state.players[a]!.royalPrivileges).toBe(0);
    expect(Object.values(r.resolution.entries).every((x) => x.status === 'resolved')).toBe(true);
  });

  it('lista som blivit ogiltig sedan inlämning: entries stryks bakifrån, obetalda (M7, R3)', () => {
    const { state, P } = world({ a: { blood: 2 } });
    const a = P.a!;
    const r = completed(resolveRound(state, subs(sub(a, [v('probe'), v('probe'), v('probe')])), 's', opts));
    expect(r.resolution.lists[a]!.map((id) => r.resolution.entries[id]!.status)).toEqual(['resolved', 'resolved', 'rejected']);
    expect(r.state.players[a]!.blood).toBe(0);
  });

  it('upkeep: betalas inte rundan minionen fås; obetalda bränns högst upkeep först (M7, R15)', () => {
    const { state, P, M } = world(
      { a: { blood: 20 } },
      {
        g1: { owner: 'a' }, // 5
        h1: { owner: 'a', type: 'harpy' }, // 15
        e2: { owner: 'a', type: 'eye', level: 2 }, // 10
        fresh: { owner: 'a', type: 'harpy', level: 3, acquiredRound: 1 }, // fås denna rond: gratis
      },
    );
    const r = completed(resolveRound(state, subs(sub(P.a!, [])), 's', opts));
    expect(Object.keys(r.state.minions).sort()).toEqual([M.g1!, M.e2!, M.fresh!].sort());
    expect(r.state.players[P.a!]!.blood).toBe(5);
  });

  it('minion som bränns i upkeep: dess aktion misslyckas och återbetalas', () => {
    const { state, P, M } = world({ a: { blood: 2 } }, { h1: { owner: 'a', type: 'harpy' } });
    const r = completed(resolveRound(state, subs(sub(P.a!, [m('minion_probe', M.h1!)])), 's', opts));
    expect(r.resolution.entries[e(P.a!, 0)]!.status).toBe('failed');
    expect(r.state.players[P.a!]!.blood).toBe(2);
  });
});

describe('tillstånd mitt i ronden', () => {
  it('torpor mitt i ronden: senare vampyraktioner misslyckas och återbetalas, minions fortsätter (R9)', () => {
    const { state, P, M } = world({ a: {}, b: { blood: 10 } }, { gb: { owner: 'b' } });
    const b = P.b!;
    const s = subs(sub(P.a!, [v('knockout', { target: b })]), sub(b, [v('probe'), v('probe'), m('minion_probe', M.gb!)]));
    const r = completed(resolveRound(state, s, 's', opts));
    expect(r.resolution.entries[e(b, 1)]!.status).toBe('failed');
    expect(r.resolution.entries[e(b, 2)]!.status).toBe('resolved');
    expect(r.resolution.events.find((x) => x.entryId === e(b, 1) && x.kind === 'action_failed')?.data).toMatchObject({ refund: 1 });
  });

  it('Celerity: spelarens två nästa entries löses direkt i samma slot (M5, R12)', () => {
    const w = world({ a: {}, b: {}, c: {}, d: {} });
    const four = [v('probe'), v('probe'), v('probe'), v('probe')];
    const a = w.P.a!;
    const s = subs(...Object.values(w.P).map((id) => sub(id, id === a ? [v('celerity'), v('probe'), v('probe'), v('probe')] : four)));
    for (const seed of ['x1', 'x2', 'x3']) {
      const order = scratchLog(resolveRound(w.state, s, seed, opts));
      const firstOtherSlot2 = order.findIndex((x) => x.endsWith('#1') && !x.startsWith(`${a}#`));
      expect(order.indexOf(e(a, 1))).toBeLessThan(firstOtherSlot2);
      expect(order.indexOf(e(a, 2))).toBeLessThan(firstOtherSlot2);
      expect(order.indexOf(e(a, 3))).toBeGreaterThan(order.lastIndexOf(e(w.P.b!, 2)));
    }
  });

  it('en krok kan avsluta spelet (masquerade-kollaps) och resten av faserna hoppas över (R14)', () => {
    const { state } = world({ a: {} });
    const seen: string[] = [];
    const hooks = {
      '4d_masquerade_collapse': [((ctx) => ctx.endGame('masquerade collapse')) as PhaseHook],
      '5a_city_income': [((ctx) => seen.push(ctx.phase)) as PhaseHook],
    };
    const r = completed(resolveRound(state, {}, 's', { ...opts, hooks }));
    expect(r.state.phase).toBe('finished');
    expect(seen).toEqual([]);
    expect(r.resolution.events.at(-1)?.kind).toBe('game_over');
  });
});

describe('paus och återupptagning (M11, R13)', () => {
  const w = world({ a: {}, b: {}, c: {} });
  const [a, b, c] = [w.P.a!, w.P.b!, w.P.c!];
  const s = subs(
    sub(a, [v('duel', { target: b }), v('probe')]),
    sub(b, [v('probe'), v('probe')]),
    sub(c, [v('duel', { target: a }), v('probe')]),
  );
  const loserFor = (entryId: string) => (entryId === e(a, 0) ? b : c);

  it('pausar efter sloten där striden startade; resten av sloten hinner lösas', () => {
    const r = suspended(resolveRound(w.state, s, 'seed', opts));
    expect(r.interrupts.map((i) => i.kind)).toEqual(['combat', 'combat']);
    expect(r.resolution.state.phase).toBe('awaitingCombat');
    expect(r.resolution.entries[e(b, 0)]!.status).toBe('resolved');
    expect(r.resolution.entries[e(b, 1)]!.status).toBe('pending');
  });

  it('väntar tills alla strider i sloten är besvarade, och utfallet påverkar senare slots', () => {
    const r1 = suspended(resolveRound(w.state, s, 'seed', opts));
    const aDuel = r1.interrupts.find((i) => i.entryId === e(a, 0))!;
    const cDuel = r1.interrupts.find((i) => i.entryId === e(c, 0))!;
    const r2 = suspended(continueResolution(r1.resolution, [{ interruptId: aDuel.id, result: { loser: b } }], opts));
    const r3 = completed(continueResolution(r2.resolution, [{ interruptId: cDuel.id, result: { loser: c } }], opts));
    expect(r3.resolution.entries[e(b, 1)]!.status).toBe('failed'); // b i torpor
    expect(r3.resolution.entries[e(c, 0)]!.status).toBe('failed'); // c förlorade sin duel: återbetald
    expect(r3.resolution.entries[e(c, 1)]!.status).toBe('failed');
    expect(r3.resolution.entries[e(a, 1)]!.status).toBe('resolved');
    expect(r3.state.players[c]!.blood).toBe(100);
    expect(r3.state.round).toBe(2);
  });

  it('samma svar ger samma resultat, oavsett om svaren kommer på en gång eller ett i taget', () => {
    const r1 = suspended(resolveRound(w.state, s, 'seed', opts));
    const answers = r1.interrupts.map((i) => ({ interruptId: i.id, result: { loser: loserFor(i.entryId) } }));
    const together = completed(continueResolution(r1.resolution, answers, opts));
    const step = suspended(continueResolution(r1.resolution, [answers[0]!], opts));
    const oneByOne = completed(continueResolution(JSON.parse(JSON.stringify(step.resolution)), [answers[1]!], opts));
    expect(canonicalJson(oneByOne.state)).toBe(canonicalJson(together.state));
    expect(oneByOne.resolution.entries).toEqual(together.resolution.entries);
  });

  it('okänd interrupt avvisas och den pausade upplösningen muteras inte', () => {
    const r1 = suspended(resolveRound(w.state, s, 'seed', opts));
    const before = canonicalJson(r1.resolution);
    expect(() => continueResolution(r1.resolution, [{ interruptId: 'nope', result: {} }], opts)).toThrow();
    continueResolution(r1.resolution, [{ interruptId: r1.interrupts[0]!.id, result: { loser: b } }], opts);
    expect(canonicalJson(r1.resolution)).toBe(before);
  });
});
