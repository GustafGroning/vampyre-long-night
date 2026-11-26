/**
 * Förflyttningar: Move, Sail, minionernas Move/Sail och Archon Movement.
 *
 * Målet kontrolleras igen vid upplösning mot var utföraren faktiskt är just då
 * (K4): misslyckades en tidigare Move i listan är nästa Move kanske inte längre
 * till en grannstad, och då misslyckas den och kostnaden återbetalas (gd:95).
 * Beslut: docs/decisions/effects.md (E3–E5).
 */
import type { ActionContext, ActionOutcome } from '../round/actions.js';
import type { CityId } from '../state/ids.js';
import type { WorkingState } from '../round/deps.js';
import { sharedSeaRegions } from '../state/queries.js';
import { cityArg, fail, ok, performerCity, performerJson, performerMinion } from './util.js';

export type MoveRule =
  /** En grannstad (Move, minionens Move). */
  | { kind: 'adjacent' }
  /** Högst `steps` steg bort längs grannskap (Archon Movement: 2). */
  | { kind: 'within'; steps: number }
  /** En annan hamn som delar en havsregion utan storm (Sail, gd:1184). */
  | { kind: 'sail' };

/** Avstånd i steg mellan två städer, eller null om de inte hänger ihop. */
export function cityDistance(state: WorkingState, from: CityId, to: CityId): number | null {
  if (from === to) return 0;
  const seen = new Set<CityId>([from]);
  let frontier: CityId[] = [from];
  for (let d = 1; frontier.length > 0; d++) {
    const next: CityId[] = [];
    for (const id of frontier) {
      for (const n of state.cities[id]?.adjacent ?? []) {
        if (n === to) return d;
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** Havsregioner som båda hamnarna ligger vid och som inte har storm denna rond. */
export function calmSharedRegions(state: WorkingState, from: CityId, to: CityId): string[] {
  return sharedSeaRegions(state, from, to).filter((r) => {
    const storm = state.seaRegions[r as keyof typeof state.seaRegions]?.storm;
    return !storm || storm.untilEndOfRound < state.round;
  });
}

/** Varför förflyttningen inte går, eller null. */
export function moveBlocked(state: WorkingState, from: CityId, to: CityId, rule: MoveRule): string | null {
  if (from === to) return 'The performer is already in the city';
  switch (rule.kind) {
    case 'adjacent':
      return state.cities[from]!.adjacent.includes(to) ? null : `${to} is not adjacent to ${from}`;
    case 'within': {
      const d = cityDistance(state, from, to);
      return d !== null && d <= rule.steps ? null : `${to} is more than ${rule.steps} steps from ${from}`;
    }
    case 'sail': {
      if (!state.cities[from]!.isPort) return `${from} is not a port`;
      if (!state.cities[to]!.isPort) return `${to} is not a port`;
      if (sharedSeaRegions(state, from, to).length === 0) return `${from} and ${to} share no sea region`;
      return calmSharedRegions(state, from, to).length > 0 ? null : 'Storm in the sea region';
    }
  }
}

/**
 * Flyttar utföraren (vampyr eller minion) till `params[key]` enligt regeln.
 * Event `moved` till spelaren; andra ser förflyttningen via `action_observed`.
 */
export function moveEffect(rule: MoveRule, key = 'to') {
  return (ctx: ActionContext): ActionOutcome => {
    const to = cityArg(ctx, key);
    if (to === null) return fail('Unknown city');
    const from = performerCity(ctx);
    if (from === null) return fail('The performer is not on the map');
    const blocked = moveBlocked(ctx.state, from, to, rule);
    if (blocked) return fail(blocked);
    const minion = performerMinion(ctx);
    if (minion) minion.location = to;
    else ctx.player.location = to;
    ctx.emit('moved', { performer: performerJson(ctx), from, to });
    return ok();
  };
}
