import { actionBudgetBase, type GameState, type Player, type PlayerId } from './deps.js';
import type { Submission } from './types.js';

export interface BudgetBreakdown {
  base: number;
  royalPrivileges: number;
  sabbatScheme: number;
  /** Summa av 'bonus'-modifierare för ronden (t.ex. Call a Crusade). */
  bonus: number;
  /** Lägsta 'cap' för ronden (torpor, Invite to the Camarilla), eller null. */
  cap: number | null;
  /** Antal vampyraktioner (slots) spelaren får använda. */
  total: number;
}

/** Antal Royal Privileges som faktiskt förbrukas: begärt, klampat till [0, innehav]. */
export function royalPrivilegesSpent(player: Player, submission: Submission | undefined): number {
  const wanted = submission?.royalPrivilegesToSpend ?? 0;
  return Math.max(0, Math.min(wanted, player.royalPrivileges));
}

/**
 * Vampyrens aktionsbudget för ronden `state.round` (M6).
 * `schemeActions` = spelarens andel av Sabbat schemes (C2), redan avgjord.
 */
export function computeBudget(
  state: GameState,
  player: Player,
  submission: Submission | undefined,
  schemeActions: number,
): BudgetBreakdown {
  const base = actionBudgetBase(player);
  const royalPrivileges = royalPrivilegesSpent(player, submission);
  const mods = player.actionBudgetModifiers.filter((m) => m.round === state.round);
  const bonus = mods.filter((m) => m.kind === 'bonus').reduce((s, m) => s + m.amount, 0);
  const caps = mods.filter((m) => m.kind === 'cap').map((m) => m.amount);
  // Torpor: en enda vampyraktion (gd:203). Att den måste vara Awaken kontrolleras i validate.
  if (player.status === 'torpor') caps.push(1);
  const cap = caps.length ? Math.min(...caps) : null;
  const uncapped = base + royalPrivileges + schemeActions + bonus;
  return {
    base,
    royalPrivileges,
    sabbatScheme: schemeActions,
    bonus,
    cap,
    total: cap === null ? uncapped : Math.min(uncapped, cap),
  };
}

/** Spelare som räknas som Sabbat för schemes: Sabbat-sekt (även dolda), inte brända. */
export function sabbatPlayers(state: GameState): PlayerId[] {
  return Object.keys(state.players)
    .sort()
    .filter((id) => {
      const p = state.players[id]!;
      return p.faction === 'sabbat' && p.status !== 'burned';
    });
}

function canonicalAllocation(alloc: Record<PlayerId, number>): string {
  return JSON.stringify(
    Object.keys(alloc)
      .sort()
      .filter((k) => alloc[k] !== 0)
      .map((k) => [k, alloc[k]]),
  );
}

/** Kontrollerar att en fördelning är giltig i sig (oavsett om alla är överens). */
export function schemeAllocationProblem(state: GameState, alloc: Record<PlayerId, number>): string | null {
  const members = new Set(sabbatPlayers(state));
  let sum = 0;
  for (const [id, n] of Object.entries(alloc)) {
    if (!Number.isInteger(n) || n < 0) return `Ogiltigt antal för ${id}`;
    if (n > 0 && !members.has(id)) return `${id} är inte Sabbat`;
    sum += n;
  }
  const max = members.size + 1;
  return sum > max ? `Fördelningen ger ${sum} aktioner, max är ${max}` : null;
}

/**
 * C2: varje Sabbat-spelare skickar ett förslag. Är alla förslag identiska och
 * giltiga gäller fördelningen, annars får ingen några extra actions.
 * Returnerar antal extra actions per spelare (tomt objekt om ingen överenskommelse).
 */
export function agreedSabbatScheme(
  state: GameState,
  submissions: Record<PlayerId, Submission>,
): Record<PlayerId, number> {
  const members = sabbatPlayers(state);
  if (members.length === 0) return {};
  const proposals = members.map((id) => submissions[id]?.sabbatScheme?.allocation);
  const first = proposals[0];
  if (!first) return {};
  const key = canonicalAllocation(first);
  for (const p of proposals) {
    if (!p || canonicalAllocation(p) !== key) return {};
  }
  if (schemeAllocationProblem(state, first) !== null) return {};
  const out: Record<PlayerId, number> = {};
  for (const id of members) if ((first[id] ?? 0) > 0) out[id] = first[id]!;
  return out;
}
