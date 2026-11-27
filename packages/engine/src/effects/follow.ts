/**
 * Follow Them (Archon, Long Night 2.0): minionen följer efter en namngiven
 * vampyr eller minion varje gång den förflyttar sig resten av ronden, hur många
 * gånger som helst (E28).
 *
 * Vem som följer vem ligger i `RoundResolution.scratch.follow` (JSON, överlever
 * en paus) och gäller bara den ronden. Varje förflyttning som går via
 * `moveEffect` eller `relocatePlayer` triggar följarna; Dominate m.fl. ska göra
 * samma sak när de byggs (BACKLOG).
 */
import type { ActionContext } from '../round/actions.js';
import type { Json } from '../round/types.js';
import type { CityId, MinionId } from '../state/ids.js';
import type { HuntParty } from './hunt.js';

type FollowMap = Record<string, MinionId[]>;

export const partyKey = (p: HuntParty): string => `${p.kind}:${p.id}`;

function followMap(scratch: { [key: string]: Json }): FollowMap {
  return (scratch.follow ??= {}) as unknown as FollowMap;
}

/** `minionId` följer `target` resten av ronden. */
export function registerFollower(ctx: ActionContext, target: HuntParty, minionId: MinionId): void {
  const map = followMap(ctx.scratch);
  const list = (map[partyKey(target)] ??= []);
  if (!list.includes(minionId)) list.push(minionId);
}

/**
 * `moved` har just flyttat till `to`. Följarna flyttar dit också, och deras
 * egna följare efter dem. En följare som redan är i `to` flyttar inte, så en
 * kedja som går runt (A följer B, B följer A) tar slut.
 */
export function triggerFollowers(ctx: ActionContext, moved: HuntParty, to: CityId): void {
  const map = ctx.scratch.follow as unknown as FollowMap | undefined;
  if (!map) return;
  const queue: HuntParty[] = [moved];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const id of map[partyKey(current)] ?? []) {
      const m = ctx.state.minions[id];
      if (!m || m.owner.kind !== 'player' || m.location === to) continue;
      const from = m.location;
      m.location = to;
      ctx.notify(
        'follow_triggered',
        { minionId: id, from, to, target: { kind: current.kind, id: current.id } },
        { kind: 'players', ids: [m.owner.id] },
      );
      queue.push({ kind: 'minion', id });
    }
  }
}
