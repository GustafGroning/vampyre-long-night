/**
 * Aktionernas effekter. Katalogen (`src/catalog/`) beskriver aktionerna som
 * data; här ligger vad de gör när de löses. `ACTION_CATALOG` kopplar ihop dem
 * (`withEffects` i catalog/registry.ts).
 *
 * En aktion utan post här löses utan effekt (stubb, R19). `stubbedActionIds`
 * listar dem, så att det syns vad som återstår för motorns definition of done.
 * Beslut: docs/decisions/effects.md. Plan: docs/engine/effects-plan.md.
 */
import type { ActionContext, ActionDefinition, ActionOutcome } from '../round/actions.js';
import type { Json } from '../round/types.js';
import { domainCityIds, minionEffectiveLevel } from '../state/queries.js';
import type { GameState } from '../state/types.js';
import { addIncome, bleedCity, rollSum } from './blood.js';
import { moveEffect } from './movement.js';
import { awaken, bestowGifts, controlTheMasquerade, getAMinion, statBuff } from './simple.js';
import { fail, ok, performerCity, performerMinion } from './util.js';

export type Effect = Pick<ActionDefinition, 'resolve'> & Partial<Pick<ActionDefinition, 'resume'>>;

const state = (ctx: ActionContext): GameState => ctx.state as GameState;

/** Picky eater (Ventrue-curse, gd:845): −10 blood på varje Bleed (E8). */
const bleedPenalty = (ctx: ActionContext): number =>
  ctx.content.clans[ctx.player.clan].curse.key === 'picky_eater' ? 10 : 0;

/**
 * Bleed (gd:1138): bleeda staden man är i. I egen domän 2D10×5, annars 1D10×5
 * (E6). Högst stadens kvarvarande blood flow.
 */
const bleed = (ctx: ActionContext): ActionOutcome => {
  const city = performerCity(ctx);
  if (city === null) return fail('The vampire is not in any city');
  const inDomain = domainCityIds(state(ctx), ctx.content, ctx.player.id).includes(city);
  const { dice, total } = rollSum(ctx, inDomain ? 2 : 1, 10);
  bleedCity(ctx, city, total * 5, { penalty: bleedPenalty(ctx), dice });
  return ok();
};

/** Bleed the Enemy (gd:236): ghoulen bleedar sin stad för X D10 × 2, X = level. */
const bleedTheEnemy = (ctx: ActionContext): ActionOutcome => {
  const minion = performerMinion(ctx);
  if (!minion) return fail('The minion does not exist');
  const level = minionEffectiveLevel(state(ctx), ctx.content, minion.id);
  const { dice, total } = rollSum(ctx, level, 10);
  bleedCity(ctx, minion.location, total * 2, { dice });
  return ok();
};

/** Aaron's Feeding Razor (gd:385): bleeda staden man är i för 2D10 × 2. */
const aaronsFeedingRazor = (ctx: ActionContext): ActionOutcome => {
  const city = performerCity(ctx);
  if (city === null) return fail('The vampire is not in any city');
  const { dice, total } = rollSum(ctx, 2, 10);
  bleedCity(ctx, city, total * 2, { dice });
  return ok();
};

const income =
  (amount: number) =>
  (ctx: ActionContext): ActionOutcome => {
    addIncome(ctx, amount);
    return ok();
  };

const BASE_EFFECTS: Record<string, Effect> = {
  // Förflyttning
  move: { resolve: moveEffect({ kind: 'adjacent' }) },
  sail: { resolve: moveEffect({ kind: 'sail' }) },
  minion_move: { resolve: moveEffect({ kind: 'adjacent' }) },
  minion_sail: { resolve: moveEffect({ kind: 'sail' }) },
  archon_movement: { resolve: moveEffect({ kind: 'within', steps: 2 }) },
  // Bleed
  bleed: { resolve: bleed },
  bleed_the_enemy: { resolve: bleedTheEnemy },
  artifact_aarons_feeding_razor: { resolve: aaronsFeedingRazor },
  // Personliga buffar resten av ronden (E14, E15)
  watchful_eyes: { resolve: statBuff('intercept', 1) },
  in_the_shadows: { resolve: statBuff('stealth', 1) },
  blood_for_blood: { resolve: statBuff('strength', 1) },
  hide: { resolve: statBuff('stealth', 5, { ignoresRuleOfThree: true }) },
  // Minions och torpor
  get_a_minion: { resolve: getAMinion },
  bestow_gifts: { resolve: bestowGifts },
  awaken: { resolve: awaken },
  // Städer
  control_the_masquerade: { resolve: controlTheMasquerade },
  // Inkomst (fas 5c)
  bottomless_wealth_of_the_camarilla: { resolve: income(250) },
  artifact_diamond_of_toreador: { resolve: income(25) },
};

/**
 * (M)Presence (gd:1260, K9) utför den valda faction actionen: dess effekt körs
 * med samma entry (valen ligger i samma params).
 */
const presenceM = (effects: Record<string, Effect>): Effect => ({
  resolve: (ctx) => {
    const chosen = ctx.entry.action.params?.action as Json;
    const effect = typeof chosen === 'string' ? effects[chosen] : undefined;
    return effect ? effect.resolve(ctx) : ok();
  },
});

export const EFFECTS: Readonly<Record<string, Effect>> = {
  ...BASE_EFFECTS,
  presence_m: presenceM(BASE_EFFECTS),
};

/** Lägger på effekterna på katalogens definitioner. */
export function withEffects(defs: readonly ActionDefinition[]): ActionDefinition[] {
  return defs.map((d) => {
    const e = EFFECTS[d.id];
    return e ? { ...d, ...e } : d;
  });
}

export { addIncome, bleedCity } from './blood.js';
export { moveEffect, moveBlocked, cityDistance } from './movement.js';
