/**
 * Hunt roll (Long Night 2.0, "Hunt" i ordlistan): jägaren slår D4 + sin
 * intercept, målet slår D4 + sin stealth. Jakten lyckas om jägarens resultat
 * är högre (E24). Används av Keep an Eye on Them nu och av strid och
 * informationsaktioner i steg 3–4.
 *
 * Modifiers som ännu inte är med (Apex predators, Animalism, Gangrel eye,
 * Pumping Heart, Orb of Ulain, (M)Obfuscate, Hide the Master) står i BACKLOG.
 */
import type { ActionContext } from '../round/actions.js';
import type { Json } from '../round/types.js';
import type { MinionId, PlayerId } from '../state/ids.js';
import { minionStat, playerStat } from '../state/queries.js';
import type { GameState } from '../state/types.js';

export type HuntParty = { kind: 'player'; id: PlayerId } | { kind: 'minion'; id: MinionId };

export interface HuntResult {
  success: boolean;
  hunter: { roll: number; total: number };
  target: { roll: number; total: number };
}

const stat = (ctx: ActionContext, p: HuntParty, s: 'intercept' | 'stealth'): number => {
  const state = ctx.state as GameState;
  return p.kind === 'player' ? playerStat(state, ctx.content, p.id, s) : minionStat(state, ctx.content, p.id, s);
};

/** Utföraren av entryn som jägare. */
export function performerParty(ctx: ActionContext): HuntParty {
  const p = ctx.entry.action.performer;
  return p.kind === 'vampire' ? { kind: 'player', id: ctx.player.id } : { kind: 'minion', id: p.minionId };
}

/** Slår en hunt roll med entryns delström. Två D4 per jakt, jägaren först. */
export function huntRoll(ctx: ActionContext, hunter: HuntParty, target: HuntParty): HuntResult {
  const h = ctx.rng.die(4);
  const t = ctx.rng.die(4);
  const ht = h + stat(ctx, hunter, 'intercept');
  const tt = t + stat(ctx, target, 'stealth');
  return { success: ht > tt, hunter: { roll: h, total: ht }, target: { roll: t, total: tt } };
}

/** Resultatet som JSON för events (bara till jägarens spelare). */
export const huntJson = (r: HuntResult): { [key: string]: Json } => ({
  success: r.success,
  hunter: { ...r.hunter },
  target: { ...r.target },
});
