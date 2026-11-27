/**
 * Minionernas aktioner och traits (Long Night 2.0, MINIONS). Beslut E22–E33 i
 * docs/decisions/effects.md, plan i docs/engine/minions-plan.md.
 *
 * Aktioner som kräver strid (Bodyguard, Guard the Master, Archons Attack) och
 * Hide the Master (gäller bara hunt rolls för Diablerie) väntar på steg 3.
 */
import { MASTERS_WILL_LOYALTY, PRIMOGEN_SPECIALS } from '../content/minions.js';
import type { ActionContext, ActionOutcome } from '../round/actions.js';
import { burnMinion } from '../round/deps.js';
import type { PhaseContext } from '../round/resolve.js';
import type { Json } from '../round/types.js';
import type { MinionLevel, MinionType } from '../state/enums.js';
import type { CityId, MinionId, PlayerId } from '../state/ids.js';
import { takeId } from '../state/ids.js';
import { compareIds, sortedIds } from '../state/json.js';
import {
  actingTitle,
  apparentFaction,
  cityStat,
  domainCityIds,
  minionEffectiveLevel,
  playerVp,
} from '../state/queries.js';
import type { City, GameState, Minion, Mutable, Player } from '../state/types.js';
import type { WorkingState } from '../round/deps.js';
import type { Content } from '../content/index.js';
import { registerFollower, triggerFollowers } from './follow.js';
import { huntJson, huntRoll, performerParty, type HuntParty } from './hunt.js';
import { arg, cityArg, fail, ok, performerMinion, strArg } from './util.js';

const gs = (ctx: { state: WorkingState }): GameState => ctx.state as GameState;
const curse = (ctx: ActionContext): string => ctx.content.clans[ctx.player.clan].curse.key;
const level = (ctx: ActionContext, m: Minion): number => minionEffectiveLevel(gs(ctx), ctx.content, m.id);

// ---------------------------------------------------------------------------
// Gemensamt

/**
 * Skapar en minion åt spelaren. Ingen upkeep rundan den fås (gd:217). Namnet är
 * genererat ("Ghoul 7", E16).
 */
export function createMinion(ctx: ActionContext, type: MinionType, lvl: MinionLevel, location: CityId): Minion {
  const id = takeId(ctx.state.counters, 'minion');
  const def = ctx.content.minionTypes[type];
  const minion: Minion = {
    id,
    name: `${def.name} ${id.slice('minion-'.length)}`,
    owner: { kind: 'player', id: ctx.player.id },
    type,
    level: lvl,
    location,
    modifiers: [],
    loyaltyCounters: def.startingLoyalty,
    acquiredRound: ctx.state.round,
    origin: { kind: 'standard' },
  };
  ctx.state.minions[id] = minion as Mutable<Minion>;
  ctx.emit('minion_recruited', { minionId: id, type, level: lvl, at: location });
  return minion;
}

/** Utförande minion som spelaren fortfarande äger, eller ett fel. */
function ownPerformer(ctx: ActionContext): Mutable<Minion> | ActionOutcome {
  const m = performerMinion(ctx);
  if (!m) return fail('The minion no longer exists');
  return m;
}
const isOutcome = (x: unknown): x is ActionOutcome => typeof x === 'object' && x !== null && 'status' in x;

const clampCity = (content: Content, v: number): number => Math.max(0, Math.min(content.rules.cityStatMax, v));

// ---------------------------------------------------------------------------
// Ghoul

/** Sabotage (Ghoul): minionens stad får −1 Stability eller −1 Intercept, permanent (E25). */
export const ghoulSabotage = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const stat = strArg(ctx, 'stat');
  if (stat !== 'stability' && stat !== 'intercept') return fail('Choose Stability or Intercept');
  const city = ctx.state.cities[m.location]!;
  if (stat === 'stability') city.stability = clampCity(ctx.content, city.stability - 1);
  else city.intercept = Math.max(0, city.intercept - 1);
  ctx.emit('city_sabotaged', { cityId: m.location, stat, value: cityStat(gs(ctx), ctx.content, m.location, stat) });
  return ok();
};

/**
 * Partner in Crime (Ghoul): resten av ronden får varje vampyraktion spelaren
 * gör +X stealth, X = minionens level, om vampyren och ghoulen är i samma stad
 * när aktionen observeras (E26). Ligger i `scratch.partnerInCrime`.
 */
export const partnerInCrime = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const all = (ctx.scratch.partnerInCrime ??= {}) as Record<string, Json>;
  const list = (all[ctx.player.id] ??= []) as MinionId[];
  if (!list.includes(m.id)) list.push(m.id);
  ctx.emit('partner_in_crime', { minionId: m.id });
  return ok();
};

/** Stealth-bonus från Partner in Crime för en vampyraktion just nu (E26). */
export function partnerInCrimeBonus(
  state: GameState,
  content: Content,
  scratch: { [key: string]: Json },
  playerId: PlayerId,
): number {
  const all = scratch.partnerInCrime as Record<string, MinionId[]> | undefined;
  const player = state.players[playerId];
  if (!all || !player || player.location === null) return 0;
  let bonus = 0;
  for (const id of all[playerId] ?? []) {
    const m = state.minions[id];
    if (!m || m.owner.kind !== 'player' || m.owner.id !== playerId || m.location !== player.location) continue;
    bonus += Math.min(minionEffectiveLevel(state, content, id), content.rules.statCapPerSource);
  }
  return bonus;
}

/** Flyttar en vampyr och triggar Follow Them. */
export function relocatePlayer(ctx: ActionContext, player: Mutable<Player>, to: CityId): void {
  player.location = to;
  triggerFollowers(ctx, { kind: 'player', id: player.id }, to);
}

/** Move the Master (Ghoul): controllern i torpor flyttas till ghoulens stad. */
export const moveTheMaster = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  if (ctx.player.status !== 'torpor') return fail('Your vampire is not in torpor');
  const from = ctx.player.location;
  if (from === null) return fail('Your vampire is not on the map');
  if (from === m.location) return fail('Your vampire is already in that city');
  relocatePlayer(ctx, ctx.player, m.location);
  ctx.emit('moved', { performer: { kind: 'vampire' }, from, to: m.location, by: m.id });
  return ok();
};

// ---------------------------------------------------------------------------
// Harpy

/**
 * Suicide Mission (Harpy): namnge en special i minionens stad och slå en D4.
 * Resultat ≤ level tar bort specialen; annars bränns minionen.
 */
export const suicideMission = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const featureId = strArg(ctx, 'feature');
  const city = ctx.state.cities[m.location]!;
  const special = city.specials.find((f) => f.id === featureId);
  if (!special) return fail('The special is not in the minion’s city');
  const roll = ctx.rng.die(4);
  const lvl = level(ctx, m);
  if (roll <= lvl) {
    city.specials = city.specials.filter((f) => f.id !== special.id);
    ctx.emit('special_removed', { cityId: m.location, featureId: special.id, key: special.key, roll, level: lvl });
  } else {
    const minionId = m.id;
    burnMinion(ctx.state, minionId);
    ctx.emit('minion_burned', { minionId, reason: 'suicide_mission', roll, level: lvl });
  }
  return ok();
};

// ---------------------------------------------------------------------------
// Eye

/** Källan som Hide and Spy lägger på minionen. Används för att spärra nästa rond. */
export const HIDE_AND_SPY_SOURCE = 'action:hide_and_spy';

/**
 * Hide and Spy (Eye): +2 stealth och +2 intercept denna och nästa rond. Nästa
 * rond kan minionen inte agera (E27, `minionIsResting`).
 */
export const hideAndSpy = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const until = ctx.state.round + 1;
  for (const stat of ['stealth', 'intercept'] as const) {
    m.modifiers.push({ stat, amount: 2, source: HIDE_AND_SPY_SOURCE, expiresAfterRound: until });
  }
  ctx.emit('hide_and_spy', { minionId: m.id, untilEndOfRound: until, restingRound: until });
  return ok();
};

/**
 * Keep an Eye on Them (Eye): hunt roll mot en vampyr i minionens stad. Lyckas
 * den får spelaren svar på den valda frågan. Är målet inte där räknas det som
 * en misslyckad jakt, så att svaret inte avslöjar var målet är (E29).
 */
export const keepAnEyeOnThem = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const targetId = strArg(ctx, 'target') as PlayerId | null;
  const target = targetId ? ctx.state.players[targetId] : undefined;
  if (!target || target.status === 'burned' || target.id === ctx.player.id) return fail('Unknown vampire');
  const question = strArg(ctx, 'question');
  if (question !== 'blood' && question !== 'artifacts' && question !== 'vp') return fail('Unknown question');

  const hunt = huntRoll(ctx, performerParty(ctx), { kind: 'player', id: target.id });
  const success = hunt.success && target.location === m.location;
  // Tärningarna loggas bara för GM; spelaren får bara utfallet (E29).
  ctx.emit('hunt_rolled', { ...huntJson(hunt), present: target.location === m.location }, { kind: 'gm' });
  const data: { [key: string]: Json } = { minionId: m.id, target: target.id, question, success };
  if (success) data.answer = keepAnEyeAnswer(ctx, target, question);
  ctx.emit('keep_an_eye_result', data);
  return ok();
};

function keepAnEyeAnswer(ctx: ActionContext, target: Player, question: 'blood' | 'artifacts' | 'vp'): Json {
  switch (question) {
    case 'blood':
      return target.blood;
    case 'artifacts':
      return sortedIds(ctx.state.artifacts)
        .map((id) => ctx.state.artifacts[id]!)
        .filter((a) => a.holder.kind === 'player' && a.holder.id === target.id)
        .map((a) => ({ id: a.id, definition: a.definition, name: ctx.content.artifacts[a.definition].name }));
    case 'vp':
      return playerVp(target) > playerVp(ctx.player);
  }
}

// ---------------------------------------------------------------------------
// Primogen

const PRIMOGEN_CHOICES = ['stability', 'intercept', 'masquerade', 'influence', 'elysium', 'camarilla_order', 'secure_haven'] as const;
type PrimogenChoice = (typeof PRIMOGEN_CHOICES)[number];

/**
 * Build on the Master's Kingdom (Primogen): minionens stad får ett val per
 * level (`choice1` …). Samma val får tas flera gånger (K11). Stability och
 * masquerade stannar vid 5 (E30).
 */
export const buildOnTheMastersKingdom = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const n = level(ctx, m);
  const picks: PrimogenChoice[] = [];
  for (let i = 1; i <= n; i++) {
    const c = strArg(ctx, `choice${i}`);
    if (c === null || !(PRIMOGEN_CHOICES as readonly string[]).includes(c)) return fail(`Choose improvement ${i}`);
    picks.push(c as PrimogenChoice);
  }
  const city = ctx.state.cities[m.location]!;
  for (const p of picks) applyPrimogenChoice(ctx, city, p);
  ctx.emit('kingdom_built', { cityId: city.id, picks: [...picks], by: m.id });
  return ok();
};

function applyPrimogenChoice(ctx: ActionContext, city: Mutable<City>, pick: PrimogenChoice): void {
  const max = ctx.content.rules.cityStatMax;
  switch (pick) {
    case 'stability':
      city.stability = Math.min(max, city.stability + 1);
      return;
    case 'intercept':
      city.intercept += 1;
      return;
    case 'masquerade':
      city.masquerade = Math.min(max, city.masquerade + 1);
      if (city.masqueradeViolation && cityStat(gs(ctx), ctx.content, city.id, 'masquerade') >= max) {
        city.masqueradeViolation = null;
        ctx.emit('masquerade_violation_mended', { cityId: city.id }, { kind: 'public' });
      }
      return;
    case 'influence':
      city.influence += 1;
      return;
    default: {
      const def = PRIMOGEN_SPECIALS[pick];
      city.specials = [
        ...city.specials,
        {
          id: takeId(ctx.state.counters, 'feature'),
          key: pick,
          name: def.name,
          createdRound: ctx.state.round,
          expiresAfterRound: null,
          data: { origin: 'build_on_the_masters_kingdom', ownerId: ctx.player.id, text: def.text },
        },
      ];
    }
  }
}

/** Recruit a Primogen (Prince): en Lvl X Primogen i en stad i domänen. */
export const recruitAPrimogen = (ctx: ActionContext): ActionOutcome => {
  const cityId = cityArg(ctx, 'city');
  if (cityId === null) return fail('Unknown city');
  if (!domainCityIds(gs(ctx), ctx.content, ctx.player.id).includes(cityId)) return fail('The city is not in your domain');
  const lvl = arg(ctx, 'level');
  if (lvl !== 1 && lvl !== 2 && lvl !== 3) return fail('Level must be 1–3');
  if (lvl === 3 && curse(ctx) === 'the_broken_pyramid') return fail('The broken pyramid: cannot have Lvl 3 minions');
  createMinion(ctx, 'primogen', lvl, cityId);
  return ok();
};

// ---------------------------------------------------------------------------
// Archon

/**
 * Follow Them (Archon): namnge en vampyr eller minion i samma stad. Resten av
 * ronden följer Archonen efter varje gång målet förflyttar sig (E28). Är målet
 * inte i staden händer inget, och spelaren får inte veta varför (samma skäl
 * som E29).
 */
export const followThem = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const raw = strArg(ctx, 'target');
  const target = parseCharacter(ctx, raw);
  if (!target || (target.kind === 'minion' && target.id === m.id)) return fail('Unknown target');
  const where = target.kind === 'player' ? ctx.state.players[target.id]?.location : ctx.state.minions[target.id]?.location;
  if (where === m.location) registerFollower(ctx, target, m.id);
  ctx.emit('follow_them', { minionId: m.id, target: raw });
  return ok();
};

/** Ett vampyr- eller minion-id från ett characterParam. */
function parseCharacter(ctx: ActionContext, raw: string | null): HuntParty | null {
  if (raw === null) return null;
  if (raw in ctx.state.players && ctx.state.players[raw as PlayerId]!.status !== 'burned') return { kind: 'player', id: raw as PlayerId };
  if (raw in ctx.state.minions) return { kind: 'minion', id: raw as MinionId };
  return null;
}

/**
 * Sabbat Interrogations (Archon): har minionens stad en Sabbat-bas tappar den
 * en level (Lvl 1 förstörs). Annars får staden −1 stability. Spelaren får veta
 * vilket som hände (E31).
 */
export const sabbatInterrogations = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  const bases = ctx.state.sabbat.bases as Record<CityId, { level: 1 | 2 | 3; builtRound: number }>;
  const base = bases[m.location];
  let outcome: string;
  if (base && base.level > 1) {
    base.level = (base.level - 1) as 1 | 2;
    outcome = 'base_reduced';
  } else if (base) {
    delete bases[m.location];
    outcome = 'base_destroyed';
  } else {
    const city = ctx.state.cities[m.location]!;
    city.stability = clampCity(ctx.content, city.stability - 1);
    outcome = 'stability_lowered';
  }
  ctx.emit('sabbat_interrogations', { cityId: m.location, outcome });
  return ok();
};

/** The Master's Will (Archon): +3 loyalty counters. */
export const theMastersWill = (ctx: ActionContext): ActionOutcome => {
  const m = ownPerformer(ctx);
  if (isOutcome(m)) return m;
  if (m.loyaltyCounters === null) return fail('Only Archons have loyalty counters');
  m.loyaltyCounters += MASTERS_WILL_LOYALTY;
  ctx.emit('loyalty_gained', { minionId: m.id, loyaltyCounters: m.loyaltyCounters });
  return ok();
};

// ---------------------------------------------------------------------------
// Traits i rondens faser

/** Spelaren får äga en Primogen: effektiv titel Prince och skenbar sekt Camarilla (E32). */
const servesPrimogen = (p: Player): boolean => actingTitle(p) === 'prince' && apparentFaction(p) === 'camarilla';
/** Spelaren får äga en Archon: effektiv titel Justicar (E32). */
const servesArchon = (p: Player): boolean => actingTitle(p) === 'justicar';

function burnWithEvent(ctx: PhaseContext, m: Minion, reason: string): void {
  burnMinion(ctx.state, m.id);
  if (m.owner.kind === 'player') ctx.emit('minion_burned', { minionId: m.id, reason }, m.owner.id);
  else ctx.emit('minion_burned', { minionId: m.id, reason });
}

const minionsOfType = (state: WorkingState, type: MinionType): Minion[] =>
  sortedIds(state.minions)
    .map((id) => state.minions[id]!)
    .filter((m) => m.type === type)
    .sort((a, b) => compareIds(a.id, b.id));

/**
 * Fas 4b: Loyal to the Prince och Camarilla Loyal. En Primogen vars ägare inte
 * är Camarilla Prince bränns, liksom en Archon vars ägare inte är Justicar.
 */
export function minionAllegiancePhase(ctx: PhaseContext): void {
  const owner = (m: Minion): Player | null => (m.owner.kind === 'player' ? (ctx.state.players[m.owner.id] ?? null) : null);
  for (const m of minionsOfType(ctx.state, 'primogen')) {
    const p = owner(m);
    if (!p || p.status === 'burned' || !servesPrimogen(p)) burnWithEvent(ctx, m, 'loyal_to_the_prince');
  }
  for (const m of minionsOfType(ctx.state, 'archon')) {
    const p = owner(m);
    if (!p || p.status === 'burned' || !servesArchon(p)) burnWithEvent(ctx, m, 'camarilla_loyal');
  }
}

/**
 * Fas 4c: varje Archon tappar en loyalty counter. Missions är borttagna ur
 * spelet, så inget stoppar det (E33). Vid 0 bränns Archonen.
 */
export function archonLoyaltyPhase(ctx: PhaseContext): void {
  for (const m of minionsOfType(ctx.state, 'archon')) {
    const live = ctx.state.minions[m.id]!;
    const left = Math.max(0, (live.loyaltyCounters ?? 0) - 1);
    live.loyaltyCounters = left;
    if (left === 0) burnWithEvent(ctx, live, 'loyalty_lost');
    else if (live.owner.kind === 'player') ctx.emit('loyalty_lost', { minionId: live.id, loyaltyCounters: left }, live.owner.id);
  }
}
