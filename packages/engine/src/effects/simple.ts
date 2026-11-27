/**
 * Effekter utan hunt roll (steg 2 i docs/engine/effects-plan.md): personliga
 * buffar, minions, Awaken och stadens masquerade. Beslut E14–E21 i
 * docs/decisions/effects.md.
 */
import type { ActionContext, ActionOutcome } from '../round/actions.js';
import type { MinionLevel, Stat } from '../state/enums.js';
import type { MinionId, PlayerId } from '../state/ids.js';
import { cityStat } from '../state/queries.js';
import type { GameState } from '../state/types.js';
import { createMinion } from './minions.js';
import { arg, cityArg, fail, ok, strArg } from './util.js';

const curse = (ctx: ActionContext): string => ctx.content.clans[ctx.player.clan].curse.key;
const boon = (ctx: ActionContext): string => ctx.content.clans[ctx.player.clan].boon.key;

/**
 * Personlig stat-buff som gäller resten av ronden (Watchful Eyes, In the Shadows,
 * Blood for Blood, Hide). Källan är aktionen, så Rule of Three räknas per aktion
 * (gd:530, E14). Senare aktioner samma rond observeras med den nya staten (M18).
 */
export const statBuff =
  (stat: Stat, amount: number, opts: { ignoresRuleOfThree?: true } = {}) =>
  (ctx: ActionContext): ActionOutcome => {
    ctx.player.modifiers.push({
      stat,
      amount,
      source: `action:${ctx.entry.action.actionId}`,
      expiresAfterRound: ctx.state.round,
      ...opts,
    });
    ctx.emit('stat_buffed', { stat, amount, untilEndOfRound: ctx.state.round });
    return ok();
  };

const RECRUITABLE = ['ghoul', 'harpy', 'eye'] as const;
type Recruitable = (typeof RECRUITABLE)[number];

/** Get a Minion (gd:1161): ny minion i vampyrens stad. Ingen upkeep rundan den fås (gd:217). */
export const getAMinion = (ctx: ActionContext): ActionOutcome => {
  const type = strArg(ctx, 'type');
  const level = arg(ctx, 'level');
  if (!RECRUITABLE.includes(type as Recruitable)) return fail('Okänd miniontyp');
  if (level !== 1 && level !== 2 && level !== 3) return fail('Level måste vara 1–3');
  if (level === 3 && curse(ctx) === 'the_broken_pyramid') return fail("The broken pyramid: kan inte ha Lvl 3-minions");
  const location = ctx.player.location;
  if (location === null) return fail('Vampyren är inte på kartan');
  createMinion(ctx, type as Recruitable, level as MinionLevel, location);
  return ok();
};

/** Bestow Gifts (gd:1158): egen minion får +1 level permanent, högst 3. */
export const bestowGifts = (ctx: ActionContext): ActionOutcome => {
  const id = strArg(ctx, 'minionId') as MinionId | null;
  const minion = id ? ctx.state.minions[id] : undefined;
  if (!minion || minion.owner.kind !== 'player' || minion.owner.id !== ctx.player.id) return fail('Minionen är inte din');
  const max = curse(ctx) === 'the_broken_pyramid' ? 2 : ctx.content.rules.minionMaxLevel;
  if (minion.level >= max) return fail(`Minionen har redan högsta level (${max})`);
  minion.level = (minion.level + 1) as MinionLevel;
  ctx.emit('minion_leveled', { minionId: minion.id, level: minion.level });
  return ok();
};

/**
 * Awaken (gd:1170): en tick mot att lämna torpor, två för Salubri (Healers and
 * scholars). Andra får väcka en vampyr i samma stad. Är målet inte i torpor
 * eller inte där misslyckas aktionen (E18).
 */
export const awaken = (ctx: ActionContext): ActionOutcome => {
  const targetId = strArg(ctx, 'target') as PlayerId | null;
  const target = targetId ? ctx.state.players[targetId] : undefined;
  if (!target || target.status === 'burned') return fail('Okänd vampyr');
  const self = target.id === ctx.player.id;
  if (!self && (ctx.player.location === null || target.location !== ctx.player.location)) {
    return fail('Vampyren är inte i samma stad');
  }
  if (target.status !== 'torpor' || !target.torpor) return fail('Vampyren är inte i torpor');
  const ticks = boon(ctx) === 'healers_and_scholars' ? 2 : 1;
  const progress = target.torpor.progress + ticks;
  const required = target.torpor.required;
  if (progress >= required) {
    target.status = 'active';
    target.torpor = null;
  } else {
    target.torpor = { ...target.torpor, progress };
  }
  const woke = target.status === 'active';
  // Målet får veta hur långt det har kommit, inte vem som hjälpte (E19).
  ctx.emit('torpor_progress', { progress: Math.min(progress, required), required, awake: woke }, { kind: 'players', ids: [target.id] });
  if (!self) ctx.emit('awaken_done', { target: target.id });
  return ok();
};

/**
 * Control the Masquerade (gd:984): staden får +1 masquerade status permanent,
 * högst 5. Når den 5 lagas en aktiv masquerade violation (gd:915, E21).
 */
export const controlTheMasquerade = (ctx: ActionContext): ActionOutcome => {
  const cityId = cityArg(ctx, 'city');
  if (cityId === null) return fail('Okänd stad');
  const city = ctx.state.cities[cityId]!;
  const max = ctx.content.rules.cityStatMax;
  city.masquerade = Math.min(max, city.masquerade + 1);
  const now = cityStat(ctx.state as GameState, ctx.content, cityId, 'masquerade');
  if (now >= max && city.masqueradeViolation) {
    city.masqueradeViolation = null;
    ctx.emit('masquerade_violation_mended', { cityId }, { kind: 'public' });
  }
  ctx.emit('masquerade_raised', { cityId, masquerade: now });
  return ok();
};
