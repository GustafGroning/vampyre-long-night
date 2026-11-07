import { describe, expect, it } from 'vitest';
import { createRegistry, SKELETON_ACTIONS, type ActionDefinition } from '../../src/round/actions.js';
import { continueResolution, PHASES, resolveRound, type PhaseHook } from '../../src/round/resolve.js';
import type { Json, RoundResult } from '../../src/round/types.js';
import { deepFreeze, gameState, m, minion, player, sub, v } from './fixtures.js';

const log = (scratch: { [k: string]: Json }, item: string) => {
  const arr = (scratch.log ??= []) as Json[];
  arr.push(item);
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
      ctx.state.players[ctx.entry.action.params!.target as string]!.status = 'torpor';
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
      if (typeof result.loser === 'string') ctx.state.players[result.loser]!.status = 'torpor';
      return result.loser === ctx.player.id ? { status: 'failed', reason: 'förlorade' } : { status: 'resolved' };
    },
  },
];

const registry = createRegistry([...Object.values(SKELETON_ACTIONS), ...testActions]);
const opts = { registry };

const completed = (r: RoundResult) => {
  if (r.status !== 'completed') throw new Error(`väntade completed, fick ${r.status}`);
  return r;
};
const scratchLog = (r: RoundResult) => (r.resolution.scratch.log ?? []) as string[];

describe('resolveRound: grundflöde', () => {
  it('kör alla faser i ordning och går till nästa rond', () => {
    const seen: string[] = [];
    const hook: PhaseHook = (ctx) => seen.push(ctx.phase);
    const hooks = Object.fromEntries(PHASES.map((p) => [p, [hook]]));
    const r = completed(resolveRound(gameState([player('a')]), { a: sub('a', []) }, 'seed', { ...opts, hooks }));
    expect(seen).toEqual([...PHASES]);
    expect(r.state.round).toBe(2);
    expect(r.state.phase).toBe('submission');
  });

  it('sista ronden avslutar spelet', () => {
    const r = completed(resolveRound(gameState([player('a')], [], { round: 8 }), {}, 'seed', opts));
    expect(r.state.phase).toBe('finished');
    expect(r.state.round).toBe(8);
  });

  it('muterar aldrig indata', () => {
    const s = deepFreeze(gameState([player('a'), player('b')], [minion('g', 'a')]));
    const subs = deepFreeze({ a: sub('a', [v('probe'), m('minion_probe', 'g')]), b: sub('b', [v('fizzle')]) });
    expect(() => resolveRound(s, subs, 'seed', opts)).not.toThrow();
  });

  it('vägrar lösa en rond som inte är i submission-fasen', () => {
    expect(() => resolveRound(gameState([player('a')], [], { phase: 'resolving' }), {}, 'x', opts)).toThrow();
  });
});

describe('ordning (M4) och determinism (M9)', () => {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id));
  const subs = Object.fromEntries(players.map((p) => [p.id, sub(p.id, [v('probe'), v('probe'), v('dice')])]));

  it('alla spelares slot 1 löses före någon slot 2', () => {
    const order = scratchLog(completed(resolveRound(gameState(players), subs, 'seed', opts)));
    const slotOf = (e: string) => Number(e.split('#')[1]!.split('=')[0]);
    const slots = order.map(slotOf);
    expect(slots).toEqual([...slots].sort((x, y) => x - y));
    expect(slots.filter((s) => s === 0)).toHaveLength(6);
  });

  it('samma seed ger identiskt resultat, byte för byte', () => {
    const a = resolveRound(gameState(players), subs, 'seed-1', opts);
    const b = resolveRound(gameState(players), subs, 'seed-1', opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('annan seed ger annan ordning', () => {
    const orders = new Set(
      ['s1', 's2', 's3', 's4', 's5'].map((seed) => scratchLog(resolveRound(gameState(players), subs, seed, opts)).join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('en entrys tärningar beror bara på seed och entry, inte på andra aktioner (delströmmar)', () => {
    const dice = (log: string[]) => log.filter((x) => x.includes('='));
    const withExtra = { ...subs, a: sub('a', [v('probe'), v('dice'), v('dice')]) };
    const base = dice(scratchLog(resolveRound(gameState(players), subs, 'seed', opts)));
    const other = dice(scratchLog(resolveRound(gameState(players), withExtra, 'seed', opts)));
    const forB = (l: string[]) => l.find((x) => x.startsWith('b#2='));
    expect(forB(other)).toBe(forB(base));
  });
});

describe('betalning (1a, 1b) och återbetalning (C11)', () => {
  it('drar alla kostnader i förskott och återbetalar misslyckade aktioner', () => {
    const r = completed(resolveRound(gameState([player('a', { blood: 50 })]), { a: sub('a', [v('probe'), v('fizzle')]) }, 's', opts));
    expect(r.state.players.a!.blood).toBe(49);
    const paid = r.resolution.events.find((e) => e.kind === 'actions_paid');
    expect(paid?.data).toMatchObject({ amount: 8 });
    const failed = r.resolution.events.find((e) => e.kind === 'action_failed');
    expect(failed?.data).toMatchObject({ refund: 7, reason: 'målet var i fel stad' });
    expect(r.resolution.entries['a#1']!.status).toBe('failed');
  });

  it('förbrukar Royal Privileges och ger extra slot', () => {
    const s = gameState([player('a', { royalPrivileges: 1 })]);
    const five = [v('probe'), v('probe'), v('probe'), v('probe'), v('probe')];
    const r = completed(resolveRound(s, { a: sub('a', five, { royalPrivilegesToSpend: 1 }) }, 's', opts));
    expect(r.state.players.a!.royalPrivileges).toBe(0);
    expect(Object.values(r.resolution.entries).every((e) => e.status === 'resolved')).toBe(true);
  });

  it('lista som blivit ogiltig sedan inlämning: entries stryks bakifrån, obetalda (M7)', () => {
    const s = gameState([player('a', { blood: 2 })]);
    const r = completed(resolveRound(s, { a: sub('a', [v('probe'), v('probe'), v('probe')]) }, 's', opts));
    expect(r.resolution.lists.a!.map((id) => r.resolution.entries[id]!.status)).toEqual(['resolved', 'resolved', 'rejected']);
    expect(r.state.players.a!.blood).toBe(0);
  });

  it('upkeep: betalas inte rundan minionen fås; obetalda bränns högst upkeep först (M7)', () => {
    const s = gameState(
      [player('a', { blood: 20 })],
      [
        minion('g1', 'a'), // 5
        minion('h1', 'a', { type: 'harpy' }), // 15
        minion('e2', 'a', { type: 'eye', level: 2 }), // 10
        minion('new', 'a', { type: 'harpy', level: 3, acquiredRound: 1 }), // fås denna rond: gratis
      ],
    );
    const r = completed(resolveRound(s, { a: sub('a', []) }, 's', opts));
    expect(Object.keys(r.state.minions).sort()).toEqual(['e2', 'g1', 'new']);
    expect(r.state.players.a!.blood).toBe(5);
  });

  it('minion som bränns i upkeep: dess aktion misslyckas och återbetalas', () => {
    const s = gameState([player('a', { blood: 2 })], [minion('h1', 'a', { type: 'harpy' })]);
    const r = completed(resolveRound(s, { a: sub('a', [m('minion_probe', 'h1')]) }, 's', opts));
    expect(r.resolution.entries['a#0']!.status).toBe('failed');
    expect(r.state.players.a!.blood).toBe(2);
  });
});

describe('tillstånd mitt i ronden', () => {
  it('torpor mitt i ronden: senare vampyraktioner misslyckas och återbetalas, minions fortsätter', () => {
    const s = gameState([player('a'), player('b', { blood: 10 })], [minion('gb', 'b')]);
    const subs = {
      a: sub('a', [v('knockout', { target: 'b' })]),
      b: sub('b', [v('probe'), v('probe'), m('minion_probe', 'gb')]),
    };
    const r = completed(resolveRound(s, subs, 's', opts));
    expect(r.resolution.entries['b#1']!.status).toBe('failed');
    expect(r.resolution.entries['b#2']!.status).toBe('resolved');
    // b#0 kan ha hunnit före knockout beroende på slotordningen; b#1 återbetalas alltid.
    const paidBack = r.resolution.events.filter((e) => e.playerId === 'b' && e.kind === 'action_failed');
    expect(paidBack.length).toBeGreaterThanOrEqual(1);
  });

  it('Celerity: spelarens två nästa entries löses direkt i samma slot (M5)', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => player(id));
    const subs = Object.fromEntries(players.map((p) => [p.id, sub(p.id, [v('probe'), v('probe'), v('probe'), v('probe')])]));
    subs.a = sub('a', [v('celerity'), v('probe'), v('probe'), v('probe')]);
    for (const seed of ['x1', 'x2', 'x3']) {
      const order = scratchLog(resolveRound(gameState(players), subs, seed, opts));
      const firstSlot2 = order.findIndex((e) => e.endsWith('#1') && !e.startsWith('a'));
      expect(order.indexOf('a#1')).toBeLessThan(firstSlot2);
      expect(order.indexOf('a#2')).toBeLessThan(firstSlot2);
      expect(order.indexOf('a#3')).toBeGreaterThan(order.lastIndexOf('b#2'));
    }
  });

  it('en krok kan avsluta spelet (masquerade-kollaps) och resten av faserna hoppas över', () => {
    const seen: string[] = [];
    const hooks = {
      '4d_masquerade_collapse': [((ctx) => ctx.endGame('masquerade collapse')) as PhaseHook],
      '5a_city_income': [((ctx) => seen.push(ctx.phase)) as PhaseHook],
    };
    const r = completed(resolveRound(gameState([player('a')]), {}, 's', { ...opts, hooks }));
    expect(r.state.phase).toBe('finished');
    expect(seen).toEqual([]);
    expect(r.resolution.events.at(-1)?.kind).toBe('game_over');
  });
});

describe('paus och återupptagning (M11)', () => {
  const players = ['a', 'b', 'c'].map((id) => player(id));
  const subs = {
    a: sub('a', [v('duel', { target: 'b' }), v('probe')]),
    b: sub('b', [v('probe'), v('probe')]),
    c: sub('c', [v('duel', { target: 'a' }), v('probe')]),
  };

  it('pausar efter sloten där striden startade; resten av sloten hinner lösas', () => {
    const r = resolveRound(gameState(players), subs, 'seed', opts);
    expect(r.status).toBe('suspended');
    if (r.status !== 'suspended') return;
    expect(r.interrupts.map((i) => i.kind)).toEqual(['combat', 'combat']);
    expect(r.resolution.state.phase).toBe('awaitingCombat');
    expect(r.resolution.entries['b#0']!.status).toBe('resolved');
    expect(r.resolution.entries['b#1']!.status).toBe('pending');
  });

  it('väntar tills alla strider i sloten är besvarade, och utfallet påverkar senare slots', () => {
    const r1 = resolveRound(gameState(players), subs, 'seed', opts);
    if (r1.status !== 'suspended') throw new Error();
    const [i1, i2] = r1.interrupts;
    const aDuel = r1.interrupts.find((i) => i.entryId === 'a#0')!;
    const cDuel = r1.interrupts.find((i) => i.entryId === 'c#0')!;
    const r2 = continueResolution(r1.resolution, [{ interruptId: aDuel.id, result: { loser: 'b' } }], opts);
    expect(r2.status).toBe('suspended');
    if (r2.status !== 'suspended') throw new Error();
    const r3 = completed(continueResolution(r2.resolution, [{ interruptId: cDuel.id, result: { loser: 'c' } }], opts));
    expect([i1, i2]).toHaveLength(2);
    expect(r3.resolution.entries['b#1']!.status).toBe('failed'); // b i torpor
    expect(r3.resolution.entries['c#0']!.status).toBe('failed'); // c förlorade sin duel: återbetald
    expect(r3.resolution.entries['c#1']!.status).toBe('failed');
    expect(r3.resolution.entries['a#1']!.status).toBe('resolved');
    expect(r3.state.players.c!.blood).toBe(100);
    expect(r3.state.round).toBe(2);
  });

  it('samma svar ger samma resultat, oavsett om svaren kommer på en gång eller ett i taget', () => {
    const r1 = resolveRound(gameState(players), subs, 'seed', opts);
    if (r1.status !== 'suspended') throw new Error();
    const answers = r1.interrupts.map((i) => ({ interruptId: i.id, result: { loser: i.entryId === 'a#0' ? 'b' : 'c' } }));
    const together = completed(continueResolution(r1.resolution, answers, opts));
    const step = continueResolution(r1.resolution, [answers[0]!], opts);
    if (step.status !== 'suspended') throw new Error();
    const oneByOne = completed(continueResolution(JSON.parse(JSON.stringify(step.resolution)), [answers[1]!], opts));
    expect(JSON.stringify(oneByOne.state)).toBe(JSON.stringify(together.state));
    expect(oneByOne.resolution.entries).toEqual(together.resolution.entries);
  });

  it('okänd interrupt avvisas och den pausade upplösningen muteras inte', () => {
    const r1 = resolveRound(gameState(players), subs, 'seed', opts);
    if (r1.status !== 'suspended') throw new Error();
    const before = JSON.stringify(r1.resolution);
    expect(() => continueResolution(r1.resolution, [{ interruptId: 'nope', result: {} }], opts)).toThrow();
    const ok = r1.interrupts[0]!;
    continueResolution(r1.resolution, [{ interruptId: ok.id, result: { loser: 'b' } }], opts);
    expect(JSON.stringify(r1.resolution)).toBe(before);
  });
});
