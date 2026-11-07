import type { GameState, Minion, Player } from '../../src/round/deps.js';
import type { Submission, SubmittedAction } from '../../src/round/types.js';

export function player(id: string, over: Partial<Player> = {}): Player {
  return {
    id,
    faction: 'camarilla',
    title: 'prince',
    disguise: null,
    status: 'active',
    blood: 100,
    royalPrivileges: 0,
    actionBudgetModifiers: [],
    ...over,
  };
}

export function minion(id: string, ownerId: string, over: Partial<Minion> = {}): Minion {
  return { id, owner: { kind: 'player', id: ownerId }, type: 'ghoul', level: 1, acquiredRound: 0, ...over };
}

export function gameState(players: Player[], minions: Minion[] = [], over: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    maxRounds: 8,
    phase: 'submission',
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    minions: Object.fromEntries(minions.map((m) => [m.id, m])),
    ...over,
  };
}

export const v = (actionId: string, params?: SubmittedAction['params']): SubmittedAction =>
  params ? { actionId, performer: { kind: 'vampire' }, params } : { actionId, performer: { kind: 'vampire' } };

export const m = (actionId: string, minionId: string): SubmittedAction => ({
  actionId,
  performer: { kind: 'minion', minionId },
});

export function sub(playerId: string, actions: SubmittedAction[], over: Partial<Submission> = {}): Submission {
  return { playerId, actions, royalPrivilegesToSpend: 0, locked: false, updatedAt: 0, ...over };
}

/** Fryser ett objekt rekursivt så att tester fångar mutation av indata. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const val of Object.values(o)) deepFreeze(val);
  }
  return o;
}
