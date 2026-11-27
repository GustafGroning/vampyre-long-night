/**
 * Vem som ser en aktion (gd:114–115, gd:913, gd:925; beslut M16–M19).
 *
 * Räknas i ögonblicket aktionen löses och sparas på eventet (M18). Vyerna
 * räknar aldrig om synlighet i efterhand.
 */
import type { Content } from '../content/index.js';
import type { CityId, PlayerId } from '../state/ids.js';
import { compareIds, sortedValues } from '../state/json.js';
import { cityStat, minionStat, playerStat } from '../state/queries.js';
import type { GameState } from '../state/types.js';
import type { ActionStealth } from '../round/actions.js';
import type { Audience, Performer } from '../round/types.js';

export interface ObservedAction {
  /** Spelaren som äger aktionen (vampyren, eller minionens controller). */
  playerId: PlayerId;
  performer: Performer;
  /** Aktionens stealth-modifier enligt definitionen. */
  stealth: ActionStealth;
  /** Städer aktionen riktar sig mot (controller-sikt, gd:115). För Move: destinationen. */
  targetCities: readonly CityId[];
  /**
   * Staden utföraren hamnar i om aktionen lyckas (Move, Sail). Utelämnad = utföraren
   * stannar i startstaden. Destinationens controller ser då *var* utföraren är (V16).
   */
  destination?: CityId | null;
  /** Extra stealth för just den här aktionen (Partner in Crime, E26). */
  stealthBonus?: number;
}

/**
 * Observatörer uppdelade efter vad de vet om utförarens position (V16):
 * - `located`: ser aktionen på plats (samma stad, Informant, startstadens controller)
 *   eller som controller av destinationen. Vet att utföraren är i `destination ?? origin`.
 * - `targetOnly`: ser aktionen bara som controller av en målstad. Vet vem och vad,
 *   inte var utföraren är.
 */
export type ObserverGroups =
  | { kind: 'public' }
  | { kind: 'players'; located: PlayerId[]; targetOnly: PlayerId[] };

/** Var aktionen startar (M18): utförarens stad just nu. `null` om utföraren saknas eller är bränd. */
export function actionOrigin(state: GameState, action: Pick<ObservedAction, 'playerId' | 'performer'>): CityId | null {
  if (action.performer.kind === 'vampire') return state.players[action.playerId]?.location ?? null;
  return state.minions[action.performer.minionId]?.location ?? null;
}

/**
 * Aktionens totala stealth: utförarens stealth + aktionens modifier (gd:114).
 * `null` för undetectable och can't be hidden, som inte jämförs med intercept.
 */
export function totalStealth(state: GameState, content: Content, action: ObservedAction): number | null {
  if (typeof action.stealth !== 'number') return null;
  const own =
    action.performer.kind === 'vampire'
      ? playerStat(state, content, action.playerId, 'stealth')
      : minionStat(state, content, action.performer.minionId, 'stealth');
  return own + action.stealth + (action.stealthBonus ?? 0);
}

/**
 * Spelare som får veta om aktionen, utom den som utför den.
 *
 * - **Undetectable:** ingen.
 * - **Can't be hidden:** alla (`public`).
 * - **Vampyrer i startstaden** med intercept ≥ total stealth (M16).
 * - **Informant-minions** (Eye, Archon) i startstaden med intercept ≥ stealth
 *   rapporterar till sin ägare (M19). Andra minions observerar inget.
 * - **Controllern** av startstaden och av varje målstad, om stadens intercept ≥ stealth (gd:115).
 *
 * Bara aktiva vampyrer får veta något: torpida och brända observerar inte, inte
 * heller via sina minions eller städer (M18, V12).
 */
export function observersOfAction(state: GameState, content: Content, action: ObservedAction): Audience {
  const groups = observerGroups(state, content, action);
  if (groups.kind === 'public') return groups;
  return { kind: 'players', ids: [...groups.located, ...groups.targetOnly].sort(compareIds) };
}

/** Samma observatörer som `observersOfAction`, uppdelade efter vad de vet om positionen (V16). */
export function observerGroups(state: GameState, content: Content, action: ObservedAction): ObserverGroups {
  if (action.stealth === 'undetectable') return { kind: 'players', located: [], targetOnly: [] };
  if (action.stealth === 'cant_be_hidden') return { kind: 'public' };
  const stealth = totalStealth(state, content, action)!;
  const origin = actionOrigin(state, action);
  const located = new Set<PlayerId>();
  const targetOnly = new Set<PlayerId>();

  if (origin !== null) {
    for (const p of sortedValues(state.players)) {
      if (p.status !== 'active' || p.location !== origin) continue;
      if (playerStat(state, content, p.id, 'intercept') >= stealth) located.add(p.id);
    }
    for (const m of sortedValues(state.minions)) {
      if (m.owner.kind !== 'player' || m.location !== origin) continue;
      if (state.players[m.owner.id]?.status !== 'active') continue;
      if (!content.minionTypes[m.type].traits.includes('informant')) continue;
      if (minionStat(state, content, m.id, 'intercept') >= stealth) located.add(m.owner.id);
    }
  }

  const controllerSees = (cityId: CityId): PlayerId | null => {
    const city = state.cities[cityId];
    if (!city || city.controllerId === null) return null;
    if (state.players[city.controllerId]?.status !== 'active') return null;
    return cityStat(state, content, cityId, 'intercept') >= stealth ? city.controllerId : null;
  };
  const destination = action.destination ?? null;
  for (const cityId of [origin, destination]) {
    if (cityId === null) continue;
    const c = controllerSees(cityId);
    if (c !== null) located.add(c);
  }
  for (const cityId of action.targetCities) {
    const c = controllerSees(cityId);
    if (c !== null && !located.has(c)) targetOnly.add(c);
  }

  located.delete(action.playerId);
  targetOnly.delete(action.playerId);
  return {
    kind: 'players',
    located: [...located].sort(compareIds),
    targetOnly: [...targetOnly].sort(compareIds),
  };
}
