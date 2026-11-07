import { DEFAULT_CONTENT, TEST_MAP } from '../../src/content/index.js';
import { createGameState, type PlayerSetup } from '../../src/state/create.js';
import type { Faction, MinionLevel, MinionType, Title } from '../../src/state/enums.js';
import type { MinionId, PlayerId } from '../../src/state/ids.js';
import { cloneJson } from '../../src/state/json.js';
import type { ActionBudgetModifier, Disguise, GameState, Mutable } from '../../src/state/types.js';
import { assertValidState } from '../../src/state/validate.js';
import type { Submission, SubmittedAction } from '../../src/round/types.js';

export const content = DEFAULT_CONTENT;

export interface PlayerSpec {
  title?: Title | null;
  faction?: Faction;
  disguise?: Disguise;
  status?: 'active' | 'torpor' | 'burned';
  blood?: number;
  royalPrivileges?: number;
  actionBudgetModifiers?: ActionBudgetModifier[];
}

export interface MinionSpec {
  owner: string;
  type?: MinionType;
  level?: MinionLevel;
  acquiredRound?: number;
}

export interface World {
  state: GameState;
  /** Testnyckel → riktigt PlayerId (`player-1` …). */
  P: Record<string, PlayerId>;
  M: Record<string, MinionId>;
}

/**
 * Bygger ett giltigt GameState via state-paketets createGameState (testkartan),
 * startar rond 1 (eller `round`) och lägger på status, blood m.m. per spelare.
 */
export function world(
  players: Record<string, PlayerSpec>,
  minions: Record<string, MinionSpec> = {},
  over: { round?: number; maxRounds?: number } = {},
): World {
  const keys = Object.keys(players);
  const minionKeys = Object.keys(minions);
  const setups: PlayerSetup[] = keys.map((k) => {
    const s = players[k]!;
    const faction = s.faction ?? (s.title === 'baron' ? 'anarch' : s.title === 'archbishop' ? 'sabbat' : 'camarilla');
    return {
      name: k,
      clan: 'ventrue',
      faction,
      title: s.title === undefined ? 'prince' : s.title,
      ...(s.disguise ? { disguise: s.disguise } : {}),
      location: 'north',
      blood: s.blood ?? 100,
      disciplines: {},
      royalPrivileges: s.royalPrivileges ?? 0,
      minions: minionKeys
        .filter((mk) => minions[mk]!.owner === k)
        .map((mk) => ({ name: mk, type: minions[mk]!.type ?? 'ghoul', level: minions[mk]!.level ?? 1 })),
    };
  });
  const created = createGameState(
    { campaignId: 'test', seed: 'campaign', map: TEST_MAP, players: setups, ...(over.maxRounds ? { maxRounds: over.maxRounds } : {}) },
    content,
  );
  const state = cloneJson(created) as Mutable<GameState>;
  state.round = over.round ?? 1;
  state.phase = 'submission';

  const P: Record<string, PlayerId> = {};
  for (const p of Object.values(state.players)) P[p.name] = p.id;
  const M: Record<string, MinionId> = {};
  for (const m of Object.values(state.minions)) M[m.name] = m.id;

  for (const k of keys) {
    const s = players[k]!;
    const p = state.players[P[k]!]!;
    p.actionBudgetModifiers = cloneJson(s.actionBudgetModifiers ?? []);
    if (s.status === 'torpor') {
      p.status = 'torpor';
      p.torpor = { progress: 0, required: 3, sinceRound: 0 };
    } else if (s.status === 'burned') {
      p.status = 'burned';
      p.location = null;
    }
  }
  for (const mk of minionKeys) {
    const m = state.minions[M[mk]!]!;
    m.acquiredRound = minions[mk]!.acquiredRound ?? 0;
  }
  assertValidState(state as GameState, content);
  return { state: state as GameState, P, M };
}

export const v = (actionId: string, params?: SubmittedAction['params']): SubmittedAction =>
  params ? { actionId, performer: { kind: 'vampire' }, params } : { actionId, performer: { kind: 'vampire' } };

export const m = (actionId: string, minionId: MinionId | string): SubmittedAction => ({
  actionId,
  performer: { kind: 'minion', minionId: minionId as MinionId },
});

export function sub(playerId: PlayerId, actions: SubmittedAction[], over: Partial<Submission> = {}): Submission {
  return { playerId, actions, royalPrivilegesToSpend: 0, locked: false, updatedAt: 0, ...over };
}

/** Bygger submissions-recorden från en lista. */
export function subs(...list: Submission[]): Record<PlayerId, Submission> {
  const out = {} as Record<PlayerId, Submission>;
  for (const s of list) out[s.playerId] = s;
  return out;
}

/** Entry-id för en spelares entry på `index`. */
export const e = (playerId: PlayerId, index: number): string => `${playerId}#${index}`;

/** Fryser ett objekt rekursivt så att tester fångar mutation av indata. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const val of Object.values(o)) deepFreeze(val);
  }
  return o;
}
