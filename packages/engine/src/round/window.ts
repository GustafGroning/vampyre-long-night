import { sortedIds, type GameState, type PlayerId } from './deps.js';
import type { RoundWindow, Submission, ValidationResult } from './types.js';
import { validateSubmission, type ValidateOptions } from './validate.js';

/**
 * Startar spelet: från `setup` (rond 0, efter createGameState) till rond 1 med
 * öppen inlämning.
 */
export function startGame(state: GameState): GameState {
  if (state.phase !== 'setup') throw new Error(`Spelet är redan startat (fas ${state.phase})`);
  return { ...state, round: 1, phase: 'submission' };
}

// Inlämningsfönstrets livscykel. Alla funktioner är rena: de returnerar ett nytt
// fönster och tar tiden (`now`, epoch ms) som argument. Motorn har ingen klocka (M10).

export function openRound(state: GameState, params: { seed: string; deadline: number }): RoundWindow {
  if (state.phase !== 'submission') throw new Error(`Kan inte öppna ronden i fas ${state.phase}`);
  return { round: state.round, seed: params.seed, deadline: params.deadline, status: 'open', submissions: {} };
}

export type SubmitResult =
  | { ok: true; window: RoundWindow; validation: ValidationResult }
  | { ok: false; window: RoundWindow; validation: ValidationResult };

function fail(window: RoundWindow, code: 'window_closed' | 'deadline_passed' | 'wrong_round', message: string): SubmitResult {
  return { ok: false, window, validation: { ok: false, errors: [{ code, message }], warnings: [] } };
}

/**
 * Sparar (eller ersätter) en spelares lista. Listan valideras mot aktuell state och
 * avvisas helt vid fel, så att spelaren får veta direkt. Att lämna in igen
 * ersätter den tidigare listan och tar bort låsningen.
 */
export function submitActions(
  window: RoundWindow,
  state: GameState,
  submission: Omit<Submission, 'locked' | 'updatedAt'>,
  now: number,
  opts: ValidateOptions,
): SubmitResult {
  if (window.status !== 'open') return fail(window, 'window_closed', 'Ronden är stängd för inlämning');
  if (now >= window.deadline) return fail(window, 'deadline_passed', 'Deadline har passerat');
  if (state.round !== window.round) return fail(window, 'wrong_round', `Fönstret gäller rond ${window.round}`);
  const full: Submission = { ...submission, locked: false, updatedAt: now };
  const validation = validateSubmission(state, full, opts);
  if (!validation.ok) return { ok: false, window, validation };
  return {
    ok: true,
    validation,
    window: { ...window, submissions: { ...window.submissions, [submission.playerId]: full } },
  };
}

/** Markerar listan som klar (eller ångrar det). Kräver att en lista finns. */
export function setLocked(window: RoundWindow, playerId: PlayerId, locked: boolean, now: number): RoundWindow {
  if (window.status !== 'open' || now >= window.deadline) throw new Error('Ronden är stängd för inlämning');
  const sub = window.submissions[playerId];
  if (!sub) throw new Error(`${playerId} har ingen lista att låsa`);
  return { ...window, submissions: { ...window.submissions, [playerId]: { ...sub, locked, updatedAt: now } } };
}

/** Spelare som förväntas lämna in: alla som inte är brända. Torpida lämnar in (Awaken, minions). */
export function expectedPlayers(state: GameState): PlayerId[] {
  return sortedIds(state.players).filter((id) => state.players[id]!.status !== 'burned');
}

/** Ronden kan lösas när deadline har passerat eller alla förväntade spelare har låst. */
export function isReadyToResolve(window: RoundWindow, state: GameState, now: number): boolean {
  if (window.status !== 'open') return false;
  if (now >= window.deadline) return true;
  return expectedPlayers(state).every((id) => window.submissions[id]?.locked === true);
}

/**
 * Stänger fönstret och ger listorna som ska lösas. Senast sparade lista gäller,
 * låst eller inte; spelare utan lista får en tom lista (M10).
 */
export function closeRound(
  window: RoundWindow,
  state: GameState,
): { window: RoundWindow; submissions: Record<PlayerId, Submission> } {
  const submissions: Record<PlayerId, Submission> = {};
  for (const id of expectedPlayers(state)) {
    submissions[id] = window.submissions[id] ?? {
      playerId: id,
      actions: [],
      royalPrivilegesToSpend: 0,
      locked: false,
      updatedAt: window.deadline,
    };
  }
  return { window: { ...window, status: 'closed' }, submissions };
}
