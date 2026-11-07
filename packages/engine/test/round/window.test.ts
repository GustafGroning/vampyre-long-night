import { describe, expect, it } from 'vitest';
import { SKELETON_ACTIONS } from '../../src/round/actions.js';
import { closeRound, isReadyToResolve, openRound, setLocked, submitActions } from '../../src/round/window.js';
import { gameState, player, v } from './fixtures.js';

const opts = { registry: SKELETON_ACTIONS };
const state = gameState([player('a'), player('b'), player('dead', { status: 'burned' })]);
const base = { royalPrivilegesToSpend: 0 };

describe('inlämningsfönster', () => {
  it('sparar giltiga listor och avvisar ogiltiga utan att ändra fönstret', () => {
    const w = openRound(state, { seed: 's', deadline: 1000 });
    const ok = submitActions(w, state, { ...base, playerId: 'a', actions: [v('move')] }, 10, opts);
    expect(ok.ok).toBe(true);
    expect(ok.window.submissions.a?.actions).toHaveLength(1);
    expect(w.submissions).toEqual({});

    const bad = submitActions(ok.window, state, { ...base, playerId: 'a', actions: [v('reward_loyalty')] }, 20, opts);
    expect(bad.ok).toBe(false);
    expect(bad.window).toBe(ok.window);
  });

  it('nekar inlämning efter deadline och i stängt fönster', () => {
    const w = openRound(state, { seed: 's', deadline: 1000 });
    expect(submitActions(w, state, { ...base, playerId: 'a', actions: [] }, 1000, opts).validation.errors[0]?.code).toBe(
      'deadline_passed',
    );
    const closed = closeRound(w, state).window;
    expect(submitActions(closed, state, { ...base, playerId: 'a', actions: [] }, 1, opts).validation.errors[0]?.code).toBe(
      'window_closed',
    );
  });

  it('klar att lösa när alla levande har låst eller deadline har passerat', () => {
    let w = openRound(state, { seed: 's', deadline: 1000 });
    for (const id of ['a', 'b']) {
      const r = submitActions(w, state, { ...base, playerId: id, actions: [] }, 5, opts);
      w = r.window;
    }
    expect(isReadyToResolve(w, state, 10)).toBe(false);
    w = setLocked(w, 'a', true, 11);
    expect(isReadyToResolve(w, state, 12)).toBe(false);
    w = setLocked(w, 'b', true, 13);
    expect(isReadyToResolve(w, state, 14)).toBe(true);

    const fresh = openRound(state, { seed: 's', deadline: 1000 });
    expect(isReadyToResolve(fresh, state, 999)).toBe(false);
    expect(isReadyToResolve(fresh, state, 1000)).toBe(true);
  });

  it('ny inlämning tar bort låsningen', () => {
    let w = submitActions(openRound(state, { seed: 's', deadline: 1000 }), state, { ...base, playerId: 'a', actions: [] }, 1, opts).window;
    w = setLocked(w, 'a', true, 2);
    w = submitActions(w, state, { ...base, playerId: 'a', actions: [v('bleed')] }, 3, opts).window;
    expect(w.submissions.a?.locked).toBe(false);
  });

  it('vid stängning gäller senaste sparade lista; saknad lista blir tom; brända ingår inte', () => {
    const w = submitActions(openRound(state, { seed: 's', deadline: 1000 }), state, { ...base, playerId: 'a', actions: [v('bleed')] }, 1, opts).window;
    const { window, submissions } = closeRound(w, state);
    expect(window.status).toBe('closed');
    expect(Object.keys(submissions)).toEqual(['a', 'b']);
    expect(submissions.a?.actions).toHaveLength(1);
    expect(submissions.b?.actions).toEqual([]);
  });

  it('kan bara öppnas i submission-fasen', () => {
    expect(() => openRound({ ...state, phase: 'resolving' }, { seed: 's', deadline: 1 })).toThrow();
  });
});
