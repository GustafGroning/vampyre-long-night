// Allt round/ använder från state, content och rng går via den här filen, så att
// gränsen mot state-paketet syns på ett ställe.

export type { Content } from '../content/index.js';
export type { Faction, MinionType, Title } from '../state/enums.js';
export type { MinionId, PlayerId } from '../state/ids.js';
export type { GameState, Minion, Mutable, Player } from '../state/types.js';
export type { Rng } from '../rng.js';
export { createRng, deriveSeed } from '../rng.js';
export { baseActionBudget, minionUpkeep } from '../state/queries.js';
export { cloneJson, compareIds, sortedIds } from '../state/json.js';

import type { GameState, Mutable } from '../state/types.js';
import type { MinionId } from '../state/ids.js';

/** Arbetskopia av state under upplösning. Muteras bara inuti motorn. */
export type WorkingState = Mutable<GameState>;

/**
 * Bränner en minion: tas bort ur state. En artefakt den bar hamnar i minionens
 * stad, där den kan hittas (beslut R20).
 */
export function burnMinion(state: WorkingState, id: MinionId): void {
  const minion = state.minions[id];
  if (!minion) return;
  for (const a of Object.values(state.artifacts)) {
    if (a.holder.kind === 'minion' && a.holder.id === id) a.holder = { kind: 'city', id: minion.location };
  }
  delete state.minions[id];
}
