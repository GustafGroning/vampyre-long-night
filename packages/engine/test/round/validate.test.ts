import { describe, expect, it } from 'vitest';
import { SKELETON_ACTIONS } from '../../src/round/actions.js';
import { agreedSabbatScheme, computeBudget } from '../../src/round/budget.js';
import { normalizeSubmission, validateSubmission } from '../../src/round/validate.js';
import { gameState, m, minion, player, sub, v } from './fixtures.js';

const opts = { registry: SKELETON_ACTIONS };
const codes = (r: { errors: Array<{ code: string }> }) => r.errors.map((e) => e.code);

describe('aktionsbudget per titel (M6)', () => {
  const cases: Array<[string, Parameters<typeof player>[1], number]> = [
    ['Inner Circle', { title: 'inner_circle' }, 6],
    ['Justicar', { title: 'justicar' }, 4],
    ['Prince', { title: 'prince' }, 4],
    ['Baron', { title: 'baron', faction: 'anarch' }, 5],
    ['exponerad Archbishop', { title: 'archbishop', faction: 'sabbat' }, 4],
    ['Archbishop förklädd som Baron', { title: 'archbishop', faction: 'sabbat', disguise: { title: 'baron', faction: 'anarch' } }, 5],
    ['utan titel', { title: null }, 3],
    ['torpor', { status: 'torpor', title: 'inner_circle' }, 1],
  ];
  for (const [name, over, expected] of cases) {
    it(`${name}: ${expected}`, () => {
      const p = player('a', over);
      expect(computeBudget(gameState([p]), p, undefined, 0).total).toBe(expected);
    });
  }

  it('Royal Privileges, scheme och bonus adderas; cap gäller över allt', () => {
    const p = player('a', {
      royalPrivileges: 2,
      actionBudgetModifiers: [
        { round: 1, kind: 'bonus', amount: 1, source: 'call_a_crusade' },
        { round: 2, kind: 'bonus', amount: 5, source: 'annan rond' },
      ],
    });
    const s = gameState([p]);
    expect(computeBudget(s, p, sub('a', [], { royalPrivilegesToSpend: 2 }), 1).total).toBe(4 + 2 + 1 + 1);
    p.actionBudgetModifiers.push({ round: 1, kind: 'cap', amount: 1, source: 'invite_to_the_camarilla' });
    expect(computeBudget(s, p, sub('a', [], { royalPrivilegesToSpend: 2 }), 1).total).toBe(1);
  });
});

describe('validateSubmission', () => {
  it('godkänner en normal lista inklusive minionaktion', () => {
    const s = gameState([player('a')], [minion('g1', 'a')]);
    const r = validateSubmission(s, sub('a', [v('move'), m('minion_move', 'g1'), v('bleed')]), opts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('för många vampyraktioner ger over_budget på den entry som går över', () => {
    const s = gameState([player('a')]);
    const r = validateSubmission(s, sub('a', [v('bleed'), v('bleed'), v('bleed'), v('bleed'), v('bleed')]), opts);
    expect(r.errors).toEqual([expect.objectContaining({ code: 'over_budget', entryIndex: 4 })]);
  });

  it('första Trifle och gratisaktioner kostar ingen slot, andra Trifle gör det', () => {
    const s = gameState([player('a', { blood: 1000 })]);
    const four = [v('bleed'), v('bleed'), v('bleed'), v('bleed')];
    expect(validateSubmission(s, sub('a', [...four, v('control_the_masquerade'), v('give'), v('buy_votes', { blood: 20 })]), opts).ok).toBe(true);
    const r = validateSubmission(s, sub('a', [...four, v('control_the_masquerade'), v('control_the_masquerade')]), opts);
    expect(codes(r)).toEqual(['over_budget']);
  });

  it('Move är Trifle bara för Justicar', () => {
    const j = gameState([player('a', { title: 'justicar' })]);
    expect(validateSubmission(j, sub('a', [v('move'), v('bleed'), v('bleed'), v('bleed'), v('bleed')]), opts).ok).toBe(true);
    const p = gameState([player('a')]);
    expect(validateSubmission(p, sub('a', [v('move'), v('bleed'), v('bleed'), v('bleed'), v('bleed')]), opts).ok).toBe(false);
  });

  it('Royal Privileges ger extra aktioner men inte fler än man har', () => {
    const s = gameState([player('a', { royalPrivileges: 1 })]);
    const five = [v('bleed'), v('bleed'), v('bleed'), v('bleed'), v('bleed')];
    expect(validateSubmission(s, sub('a', five, { royalPrivilegesToSpend: 1 }), opts).ok).toBe(true);
    expect(codes(validateSubmission(s, sub('a', five, { royalPrivilegesToSpend: 2 }), opts))).toContain('royal_privileges');
  });

  it('kontrollerar titel och sekt, inklusive förklädd Archbishop', () => {
    const s = gameState([
      player('pr'),
      player('ab', { title: 'archbishop', faction: 'sabbat', disguise: { title: 'prince', faction: 'camarilla' } }),
      player('exp', { title: 'archbishop', faction: 'sabbat' }),
    ]);
    expect(codes(validateSubmission(s, sub('pr', [v('reward_loyalty')]), opts))).toEqual(['not_eligible']);
    expect(validateSubmission(s, sub('ab', [v('control_the_masquerade'), v('call_a_crusade')]), opts).ok).toBe(true);
    expect(codes(validateSubmission(s, sub('exp', [v('control_the_masquerade')]), opts))).toEqual(['not_eligible']);
  });

  it('torpor: bara Awaken, en gång, men minions agerar', () => {
    const s = gameState([player('a', { status: 'torpor' })], [minion('g1', 'a')]);
    expect(validateSubmission(s, sub('a', [v('awaken'), m('minion_move', 'g1')]), opts).ok).toBe(true);
    expect(codes(validateSubmission(s, sub('a', [v('bleed')]), opts))).toEqual(['torpor_only_awaken']);
    expect(codes(validateSubmission(s, sub('a', [v('awaken'), v('awaken')]), opts))).toEqual(['over_budget']);
  });

  it('minions: ägare, typ och en aktion var; Anarch Mission ger en till om den står före', () => {
    const s = gameState(
      [player('a', { title: 'baron', faction: 'anarch' }), player('b')],
      [minion('g1', 'a'), minion('h1', 'a', { type: 'harpy' }), minion('gb', 'b')],
    );
    expect(codes(validateSubmission(s, sub('a', [m('minion_move', 'gb')]), opts))).toEqual(['not_your_minion']);
    expect(codes(validateSubmission(s, sub('a', [m('bleed_the_enemy', 'h1')]), opts))).toEqual(['wrong_minion_type']);
    expect(codes(validateSubmission(s, sub('a', [m('minion_move', 'nope')]), opts))).toEqual(['unknown_minion']);
    expect(codes(validateSubmission(s, sub('a', [m('minion_move', 'g1'), m('bleed_the_enemy', 'g1')]), opts))).toEqual([
      'minion_over_budget',
    ]);
    const withMission = [v('anarch_mission', { minionId: 'g1' }), m('minion_move', 'g1'), m('bleed_the_enemy', 'g1')];
    expect(validateSubmission(s, sub('a', withMission), opts).ok).toBe(true);
    const missionAfter = [m('minion_move', 'g1'), m('bleed_the_enemy', 'g1'), v('anarch_mission', { minionId: 'g1' })];
    expect(codes(validateSubmission(s, sub('a', missionAfter), opts))).toEqual(['minion_over_budget']);
  });

  it('vampyraktion av minion och minionaktion av vampyr avvisas', () => {
    const s = gameState([player('a')], [minion('g1', 'a')]);
    expect(codes(validateSubmission(s, sub('a', [m('bleed', 'g1')]), opts))).toEqual(['vampire_only']);
    expect(codes(validateSubmission(s, sub('a', [v('minion_move')]), opts))).toEqual(['minion_only']);
    expect(codes(validateSubmission(s, sub('a', [v('nonsense')]), opts))).toEqual(['unknown_action']);
  });

  it('Hide avslutar vampyrens tur; Go Anarch måste vara ensam; once per turn', () => {
    const s = gameState([player('a'), player('ic', { title: 'inner_circle' })], [minion('g1', 'a')]);
    expect(codes(validateSubmission(s, sub('a', [v('hide'), v('bleed')]), opts))).toEqual(['after_ends_turn']);
    expect(validateSubmission(s, sub('a', [v('bleed'), v('hide'), m('minion_move', 'g1')]), opts).ok).toBe(true);
    expect(codes(validateSubmission(s, sub('a', [v('go_anarch'), v('bleed')]), opts))).toEqual(['exclusive_action']);
    expect(validateSubmission(s, sub('a', [v('go_anarch'), m('minion_move', 'g1')]), opts).ok).toBe(true);
    expect(codes(validateSubmission(s, sub('ic', [v('reward_loyalty'), v('reward_loyalty')]), opts))).toEqual([
      'max_per_round',
    ]);
  });

  it('kostnad över blood avvisas; kostnad + upkeep över blood ger bara varning', () => {
    const s = gameState([player('a', { blood: 25 })], [minion('h1', 'a', { type: 'harpy' })]);
    const r1 = validateSubmission(s, sub('a', [v('move'), v('move'), v('move')]), opts);
    expect(r1.errors).toEqual([expect.objectContaining({ code: 'unaffordable', entryIndex: 2 })]);
    const r2 = validateSubmission(s, sub('a', [v('move'), v('move')]), opts);
    expect(r2.ok).toBe(true);
    expect(r2.warnings.map((w) => w.code)).toEqual(['unaffordable']);
  });
});

describe('normalizeSubmission (vid upplösning)', () => {
  it('stryker ogiltiga entries och sedan bakifrån tills listan är giltig; positioner behålls', () => {
    const s = gameState([player('a', { blood: 30 })]);
    const n = normalizeSubmission(s, sub('a', [v('move'), v('reward_loyalty'), v('move'), v('move'), v('bleed')]), opts);
    // reward_loyalty är ogiltig för Prince; tre Move à 10 = 30 går precis.
    expect(n.kept).toEqual([0, 2, 3, 4]);
    expect(n.rejected.map((r) => r.index)).toEqual([1]);

    const poor = gameState([player('a', { blood: 15 })]);
    const n2 = normalizeSubmission(poor, sub('a', [v('move'), v('move'), v('bleed')]), opts);
    expect(n2.kept).toEqual([0, 2]);
  });
});

describe('Sabbat schemes (C2)', () => {
  const sabbat = (id: string) => player(id, { faction: 'sabbat', title: 'archbishop' });
  const s = gameState([sabbat('s1'), sabbat('s2'), player('c')]);

  it('identiska förslag från alla Sabbat gäller', () => {
    const alloc = { s1: 2, s2: 1 };
    const r = agreedSabbatScheme(s, {
      s1: sub('s1', [], { sabbatScheme: { allocation: alloc } }),
      s2: sub('s2', [], { sabbatScheme: { allocation: { s2: 1, s1: 2 } } }),
    });
    expect(r).toEqual({ s1: 2, s2: 1 });
  });

  it('olika förslag, saknat förslag eller för många actions ger ingenting', () => {
    expect(
      agreedSabbatScheme(s, {
        s1: sub('s1', [], { sabbatScheme: { allocation: { s1: 3 } } }),
        s2: sub('s2', [], { sabbatScheme: { allocation: { s2: 3 } } }),
      }),
    ).toEqual({});
    expect(agreedSabbatScheme(s, { s1: sub('s1', [], { sabbatScheme: { allocation: { s1: 3 } } }) })).toEqual({});
    const tooMany = { allocation: { s1: 2, s2: 2 } };
    expect(
      agreedSabbatScheme(s, { s1: sub('s1', [], { sabbatScheme: tooMany }), s2: sub('s2', [], { sabbatScheme: tooMany }) }),
    ).toEqual({});
  });
});
