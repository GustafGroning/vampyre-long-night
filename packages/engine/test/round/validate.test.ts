import { describe, expect, it } from 'vitest';
import { SKELETON_ACTIONS } from '../../src/round/actions.js';
import { agreedSabbatScheme, computeBudget } from '../../src/round/budget.js';
import { normalizeSubmission, validateSubmission } from '../../src/round/validate.js';
import type { PlayerId } from '../../src/state/ids.js';
import { content, m, sub, subs, v, world, type PlayerSpec } from './fixtures.js';

const opts = { registry: SKELETON_ACTIONS, content };
const codes = (r: { errors: Array<{ code: string }> }) => r.errors.map((e) => e.code);

describe('aktionsbudget per titel (M6)', () => {
  const cases: Array<[string, PlayerSpec, number]> = [
    ['Inner Circle', { title: 'inner_circle' }, 6],
    ['Justicar', { title: 'justicar' }, 4],
    ['Prince', { title: 'prince' }, 4],
    ['Baron', { title: 'baron' }, 5],
    ['exponerad Archbishop', { title: 'archbishop' }, 4],
    ['Archbishop förklädd som Baron', { title: 'archbishop', disguise: { title: 'baron', faction: 'anarch' } }, 5],
    ['utan titel', { title: null }, 3],
    ['torpor', { status: 'torpor', title: 'inner_circle' }, 1],
  ];
  for (const [name, spec, expected] of cases) {
    it(`${name}: ${expected}`, () => {
      const { state, P } = world({ a: spec });
      expect(computeBudget(state, content, state.players[P.a!]!, undefined, 0).total).toBe(expected);
    });
  }

  it('Royal Privileges, scheme och bonus adderas; cap gäller över allt', () => {
    const bonus = { round: 1, kind: 'bonus' as const, amount: 1, source: 'call_a_crusade' };
    const other = { round: 2, kind: 'bonus' as const, amount: 5, source: 'annan rond' };
    const cap = { round: 1, kind: 'cap' as const, amount: 1, source: 'invite_to_the_camarilla' };
    const w1 = world({ a: { royalPrivileges: 2, actionBudgetModifiers: [bonus, other] } });
    const a1 = w1.P.a!;
    expect(computeBudget(w1.state, content, w1.state.players[a1]!, sub(a1, [], { royalPrivilegesToSpend: 2 }), 1).total).toBe(
      4 + 2 + 1 + 1,
    );
    const w2 = world({ a: { royalPrivileges: 2, actionBudgetModifiers: [bonus, cap] } });
    const a2 = w2.P.a!;
    expect(computeBudget(w2.state, content, w2.state.players[a2]!, sub(a2, [], { royalPrivilegesToSpend: 2 }), 1).total).toBe(1);
  });
});

describe('validateSubmission', () => {
  it('godkänner en normal lista inklusive minionaktion', () => {
    const { state, P, M } = world({ a: {} }, { g1: { owner: 'a' } });
    const r = validateSubmission(state, sub(P.a!, [v('move'), m('minion_move', M.g1!), v('bleed')]), opts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('för många vampyraktioner ger over_budget på den entry som går över', () => {
    const { state, P } = world({ a: {} });
    const r = validateSubmission(state, sub(P.a!, [v('bleed'), v('bleed'), v('bleed'), v('bleed'), v('bleed')]), opts);
    expect(r.errors).toEqual([expect.objectContaining({ code: 'over_budget', entryIndex: 4 })]);
  });

  it('första Trifle och gratisaktioner kostar ingen slot, andra Trifle gör det', () => {
    const { state, P } = world({ a: { blood: 1000 } });
    const four = [v('bleed'), v('bleed'), v('bleed'), v('bleed')];
    const extra = [v('control_the_masquerade'), v('give'), v('buy_votes', { blood: 20 })];
    expect(validateSubmission(state, sub(P.a!, [...four, ...extra]), opts).ok).toBe(true);
    const r = validateSubmission(state, sub(P.a!, [...four, v('control_the_masquerade'), v('control_the_masquerade')]), opts);
    expect(codes(r)).toEqual(['over_budget']);
  });

  it('Move är Trifle bara för Justicar', () => {
    const list = [v('move'), v('bleed'), v('bleed'), v('bleed'), v('bleed')];
    const j = world({ a: { title: 'justicar' } });
    expect(validateSubmission(j.state, sub(j.P.a!, list), opts).ok).toBe(true);
    const p = world({ a: {} });
    expect(validateSubmission(p.state, sub(p.P.a!, list), opts).ok).toBe(false);
  });

  it('Royal Privileges ger extra aktioner men inte fler än man har', () => {
    const { state, P } = world({ a: { royalPrivileges: 1 } });
    const five = [v('bleed'), v('bleed'), v('bleed'), v('bleed'), v('bleed')];
    expect(validateSubmission(state, sub(P.a!, five, { royalPrivilegesToSpend: 1 }), opts).ok).toBe(true);
    expect(codes(validateSubmission(state, sub(P.a!, five, { royalPrivilegesToSpend: 2 }), opts))).toContain('royal_privileges');
  });

  it('kontrollerar titel och sekt, inklusive förklädd Archbishop (R6)', () => {
    const { state, P } = world({
      pr: {},
      ab: { title: 'archbishop', disguise: { title: 'prince', faction: 'camarilla' } },
      exp: { title: 'archbishop' },
    });
    expect(codes(validateSubmission(state, sub(P.pr!, [v('reward_loyalty')]), opts))).toEqual(['not_eligible']);
    expect(validateSubmission(state, sub(P.ab!, [v('control_the_masquerade'), v('call_a_crusade')]), opts).ok).toBe(true);
    expect(codes(validateSubmission(state, sub(P.exp!, [v('control_the_masquerade')]), opts))).toEqual(['not_eligible']);
  });

  it('torpor: bara Awaken, en gång, men minions agerar', () => {
    const { state, P, M } = world({ a: { status: 'torpor' } }, { g1: { owner: 'a' } });
    expect(validateSubmission(state, sub(P.a!, [v('awaken'), m('minion_move', M.g1!)]), opts).ok).toBe(true);
    expect(codes(validateSubmission(state, sub(P.a!, [v('bleed')]), opts))).toEqual(['torpor_only_awaken']);
    expect(codes(validateSubmission(state, sub(P.a!, [v('awaken'), v('awaken')]), opts))).toEqual(['over_budget']);
  });

  it('minions: ägare, typ och en aktion var; Anarch Mission ger en till om den står före (R7)', () => {
    const { state, P, M } = world(
      { a: { title: 'baron' }, b: {} },
      { g1: { owner: 'a' }, h1: { owner: 'a', type: 'harpy' }, gb: { owner: 'b' } },
    );
    const a = P.a!;
    expect(codes(validateSubmission(state, sub(a, [m('minion_move', M.gb!)]), opts))).toEqual(['not_your_minion']);
    expect(codes(validateSubmission(state, sub(a, [m('bleed_the_enemy', M.h1!)]), opts))).toEqual(['wrong_minion_type']);
    expect(codes(validateSubmission(state, sub(a, [m('minion_move', 'minion-99')]), opts))).toEqual(['unknown_minion']);
    expect(codes(validateSubmission(state, sub(a, [m('minion_move', M.g1!), m('bleed_the_enemy', M.g1!)]), opts))).toEqual([
      'minion_over_budget',
    ]);
    const withMission = [v('anarch_mission', { minionId: M.g1! }), m('minion_move', M.g1!), m('bleed_the_enemy', M.g1!)];
    expect(validateSubmission(state, sub(a, withMission), opts).ok).toBe(true);
    const missionAfter = [m('minion_move', M.g1!), m('bleed_the_enemy', M.g1!), v('anarch_mission', { minionId: M.g1! })];
    expect(codes(validateSubmission(state, sub(a, missionAfter), opts))).toEqual(['minion_over_budget']);
  });

  it('vampyraktion av minion och minionaktion av vampyr avvisas', () => {
    const { state, P, M } = world({ a: {} }, { g1: { owner: 'a' } });
    expect(codes(validateSubmission(state, sub(P.a!, [m('bleed', M.g1!)]), opts))).toEqual(['vampire_only']);
    expect(codes(validateSubmission(state, sub(P.a!, [v('minion_move')]), opts))).toEqual(['minion_only']);
    expect(codes(validateSubmission(state, sub(P.a!, [v('nonsense')]), opts))).toEqual(['unknown_action']);
  });

  it('Hide avslutar vampyrens tur; Go Anarch måste vara ensam; once per turn (R8)', () => {
    const { state, P, M } = world({ a: {}, ic: { title: 'inner_circle' } }, { g1: { owner: 'a' } });
    const a = P.a!;
    expect(codes(validateSubmission(state, sub(a, [v('hide'), v('bleed')]), opts))).toEqual(['after_ends_turn']);
    expect(validateSubmission(state, sub(a, [v('bleed'), v('hide'), m('minion_move', M.g1!)]), opts).ok).toBe(true);
    expect(codes(validateSubmission(state, sub(a, [v('go_anarch'), v('bleed')]), opts))).toEqual(['exclusive_action']);
    expect(validateSubmission(state, sub(a, [v('go_anarch'), m('minion_move', M.g1!)]), opts).ok).toBe(true);
    expect(codes(validateSubmission(state, sub(P.ic!, [v('reward_loyalty'), v('reward_loyalty')]), opts))).toEqual([
      'max_per_round',
    ]);
  });

  it('kostnad över blood avvisas; kostnad + upkeep över blood ger bara varning', () => {
    const { state, P } = world({ a: { blood: 25 } }, { h1: { owner: 'a', type: 'harpy' } });
    const r1 = validateSubmission(state, sub(P.a!, [v('move'), v('move'), v('move')]), opts);
    expect(r1.errors).toEqual([expect.objectContaining({ code: 'unaffordable', entryIndex: 2 })]);
    const r2 = validateSubmission(state, sub(P.a!, [v('move'), v('move')]), opts);
    expect(r2.ok).toBe(true);
    expect(r2.warnings.map((w) => w.code)).toEqual(['unaffordable']);
  });
});

describe('normalizeSubmission vid upplösning (R3)', () => {
  it('stryker ogiltiga entries och sedan bakifrån tills listan är giltig; positioner behålls', () => {
    const rich = world({ a: { blood: 30 } });
    const n = normalizeSubmission(rich.state, sub(rich.P.a!, [v('move'), v('reward_loyalty'), v('move'), v('move'), v('bleed')]), opts);
    // reward_loyalty är ogiltig för Prince; tre Move à 10 = 30 går precis.
    expect(n.kept).toEqual([0, 2, 3, 4]);
    expect(n.rejected.map((r) => r.index)).toEqual([1]);

    const poor = world({ a: { blood: 15 } });
    const n2 = normalizeSubmission(poor.state, sub(poor.P.a!, [v('move'), v('move'), v('bleed')]), opts);
    expect(n2.kept).toEqual([0, 2]);
  });
});

describe('Sabbat schemes (C2, R5)', () => {
  const { state, P } = world({ s1: { title: 'archbishop' }, s2: { title: 'archbishop' }, c: {} });
  const s1 = P.s1!;
  const s2 = P.s2!;
  const alloc = (pairs: Array<[PlayerId, number]>) => Object.fromEntries(pairs) as Record<PlayerId, number>;

  it('identiska förslag från alla Sabbat gäller', () => {
    const r = agreedSabbatScheme(
      state,
      subs(
        sub(s1, [], { sabbatScheme: { allocation: alloc([[s1, 2], [s2, 1]]) } }),
        sub(s2, [], { sabbatScheme: { allocation: alloc([[s2, 1], [s1, 2]]) } }),
      ),
    );
    expect(r).toEqual(alloc([[s1, 2], [s2, 1]]));
  });

  it('olika förslag, saknat förslag eller för många actions ger ingenting', () => {
    expect(
      agreedSabbatScheme(
        state,
        subs(sub(s1, [], { sabbatScheme: { allocation: alloc([[s1, 3]]) } }), sub(s2, [], { sabbatScheme: { allocation: alloc([[s2, 3]]) } })),
      ),
    ).toEqual({});
    expect(agreedSabbatScheme(state, subs(sub(s1, [], { sabbatScheme: { allocation: alloc([[s1, 3]]) } })))).toEqual({});
    const tooMany = { allocation: alloc([[s1, 2], [s2, 2]]) };
    expect(agreedSabbatScheme(state, subs(sub(s1, [], { sabbatScheme: tooMany }), sub(s2, [], { sabbatScheme: tooMany })))).toEqual({});
  });

  it('fördelning till en icke-Sabbat avvisas redan vid inlämning', () => {
    const r = validateSubmission(state, sub(s1, [], { sabbatScheme: { allocation: alloc([[P.c!, 1]]) } }), opts);
    expect(r.ok).toBe(false);
  });
});
