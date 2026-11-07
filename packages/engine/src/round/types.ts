import type { GameState, MinionId, PlayerId, WorkingState } from './deps.js';

/** JSON-värde. Allt i rondens data måste gå att serialisera (M1-principerna). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ActionId = string;

/** Id för en entry i en spelares lista: `${playerId}#${index}` (index från 0). */
export type EntryId = string;

export type Performer = { kind: 'vampire' } | { kind: 'minion'; minionId: MinionId };

/** En rad i spelarens ordnade aktionslista. Slot = position i listan (M4). */
export interface SubmittedAction {
  actionId: ActionId;
  performer: Performer;
  params?: { [key: string]: Json };
}

/** Sabbat schemes (C2): varje Sabbat-spelare föreslår en fördelning. */
export interface SabbatSchemeProposal {
  allocation: Record<PlayerId, number>;
}

export interface Submission {
  playerId: PlayerId;
  actions: SubmittedAction[];
  /** Royal Privileges som förbrukas för +1 aktion vardera. */
  royalPrivilegesToSpend: number;
  sabbatScheme?: SabbatSchemeProposal;
  /** Spelaren har markerat listan som klar. Påverkar bara isReadyToResolve. */
  locked: boolean;
  /** Tidpunkt (epoch ms, från plattformen) för senaste ändring. */
  updatedAt: number;
}

export interface RoundWindow {
  round: number;
  /** Rondens seed, satt när fönstret öppnas (M9). Dold för spelare. */
  seed: string;
  /** Deadline i epoch ms. Motorn har ingen klocka (M10); `now` skickas alltid in. */
  deadline: number;
  status: 'open' | 'closed';
  submissions: Record<PlayerId, Submission>;
}

// ---------------------------------------------------------------------------
// Validering

export type ValidationCode =
  | 'window_closed'
  | 'deadline_passed'
  | 'wrong_round'
  | 'unknown_player'
  | 'player_burned'
  | 'unknown_action'
  | 'not_eligible'
  | 'unknown_minion'
  | 'not_your_minion'
  | 'wrong_minion_type'
  | 'vampire_only'
  | 'minion_only'
  | 'torpor_only_awaken'
  | 'over_budget'
  | 'minion_over_budget'
  | 'max_per_round'
  | 'exclusive_action'
  | 'after_ends_turn'
  | 'royal_privileges'
  | 'unaffordable'
  | 'invalid_params';

export interface ValidationIssue {
  code: ValidationCode;
  /** Index i aktionslistan om felet gäller en enskild entry. */
  entryIndex?: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Upplösning

export type PhaseId =
  | '1a_pay_actions'
  | '1b_pay_upkeep'
  | '2a_city_effects'
  | '2b_event_effects'
  | '2c_other_start_effects'
  | '3a_actions'
  | '4a_fight_for_control'
  | '4b_player_end_effects'
  | '4c_missions'
  | '4d_masquerade_collapse'
  | '5a_city_income'
  | '5b_bleed_income'
  | '5c_other_income'
  | '5d_advance_round';

export type EntryStatus =
  /** Väntar på sin slot. */
  | 'pending'
  /** Strukits före betalning (ogiltig vid upplösning eller ej råd, M7). Inget betalt. */
  | 'rejected'
  /** Har startat något som kräver extern input (strid, M11). */
  | 'awaiting'
  | 'resolved'
  /** Kunde inte lösas. Kostnaden återbetalad (C11). */
  | 'failed';

export interface EntryRecord {
  id: EntryId;
  playerId: PlayerId;
  /** Position i listan, 0-baserad. Slot = index + 1. */
  index: number;
  action: SubmittedAction;
  status: EntryStatus;
  /** Blood som drogs i fas 1a. */
  paid: number;
  reason?: string;
}

export interface RoundEvent {
  seq: number;
  round: number;
  phase: PhaseId;
  kind: string;
  playerId?: PlayerId;
  entryId?: EntryId;
  data?: { [key: string]: Json };
}

/** Något som pausar upplösningen tills plattformen skickar in ett svar (M11). */
export interface Interrupt {
  id: string;
  kind: string;
  entryId: EntryId;
  data: { [key: string]: Json };
}

export interface InterruptAnswer {
  interruptId: string;
  result: { [key: string]: Json };
}

export interface Cursor {
  phaseIndex: number;
  /** Aktuell slot (0-baserad) i fas 3a. */
  slot: number;
  /** Spelarordningen för aktuell slot, seedad (M4). null = inte dragen än. */
  slotOrder: PlayerId[] | null;
  /** Nästa position i slotOrder. */
  slotPos: number;
}

/**
 * Hela upplösningens tillstånd. Ren JSON: kan sparas mellan en paus och
 * continueResolution, och samma indata ger samma resultat oavsett antal pauser.
 */
export interface RoundResolution {
  status: 'running' | 'suspended' | 'completed';
  round: number;
  seed: string;
  /** Arbetskopia; muteras bara inuti motorn. */
  state: WorkingState;
  cursor: Cursor;
  entries: Record<EntryId, EntryRecord>;
  /** Entry-id per spelare i listordning. */
  lists: Record<PlayerId, EntryId[]>;
  /** Vampyraktions-budget per spelare, beräknad i 1a. */
  budgets: Record<PlayerId, number>;
  pendingInterrupts: Interrupt[];
  events: RoundEvent[];
  /** Rondlokal data som handlers och faser delar (t.ex. bleed-blod som betalas i 5b). */
  scratch: { [key: string]: Json };
}

export type RoundResult =
  | { status: 'completed'; state: GameState; resolution: RoundResolution }
  | { status: 'suspended'; interrupts: Interrupt[]; resolution: RoundResolution };
