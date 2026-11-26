import { analyzeDraft, isListLevelCode, type DraftAnalysis } from '../catalog/analyze.js';
import { buildPlayerView } from '../view/player.js';
import type { ActionRegistry } from './actions.js';
import type { BudgetBreakdown } from './budget.js';
import { minionUpkeep, sortedIds, type Content, type GameState, type Player } from './deps.js';
import type { Submission, ValidationResult } from './types.js';

export interface ValidateOptions {
  /** Standard: ACTION_CATALOG. */
  registry?: ActionRegistry;
  content: Content;
  /**
   * Spelarens extra actions från Sabbat schemes. Vid inlämning är den okänd
   * (andra har kanske inte lämnat in), så standard är spelarens eget förslag.
   */
  schemeActions?: number;
}

export interface SubmissionAnalysis extends ValidationResult {
  budget: BudgetBreakdown | null;
  /** Vampyr-slots som listan använder. */
  slotsUsed: number;
  /** Total blood-kostnad för listan. */
  totalCost: number;
  /** Kostnad per entry-index (bara entries vars kostnad gick att räkna). */
  entryCosts: Record<number, number>;
  /** Hela analysen, när spelaren finns. */
  draft: DraftAnalysis | null;
}

/**
 * Validerar en spelares lista mot aktuell state. Ren funktion; används både
 * vid inlämning (avvisar hela listan) och vid upplösning (stryker entries).
 * Ignorerar entry-index i `skip` (redan strukna vid upplösning).
 *
 * Bygger spelarens vy och kör samma analys som gränssnittet (`analyzeDraft`),
 * så att servern och klienten alltid är överens (K1).
 */
export function analyzeSubmission(
  state: GameState,
  submission: Submission,
  opts: ValidateOptions,
  skip: ReadonlySet<number> = new Set(),
): SubmissionAnalysis {
  const player = state.players[submission.playerId];
  const empty = { budget: null, slotsUsed: 0, totalCost: 0, entryCosts: {}, draft: null, warnings: [] };
  if (!player) {
    return { ok: false, errors: [{ code: 'unknown_player', message: `Unknown player ${submission.playerId}` }], ...empty };
  }
  if (player.status === 'burned') {
    return { ok: false, errors: [{ code: 'player_burned', message: 'The vampire is burned' }], ...empty };
  }
  const view = buildPlayerView(state, opts.content, player.id);
  const draft = analyzeDraft(view, opts.content, submission, {
    ...(opts.registry ? { registry: opts.registry } : {}),
    ...(opts.schemeActions !== undefined ? { schemeActions: opts.schemeActions } : {}),
    skip,
  });
  const entryCosts: Record<number, number> = {};
  for (const e of draft.entries) if (e.cost !== null) entryCosts[e.index] = e.cost;
  return {
    ok: draft.ok,
    errors: draft.errors,
    warnings: draft.warnings,
    budget: draft.budget,
    slotsUsed: draft.ap.used,
    totalCost: draft.totalCost,
    entryCosts,
    draft,
  };
}

export function validateSubmission(state: GameState, submission: Submission, opts: ValidateOptions): ValidationResult {
  const { ok, errors, warnings } = analyzeSubmission(state, submission, opts);
  return { ok, errors, warnings };
}

export function upkeepFor(state: GameState, content: Content, player: Player): number {
  return sortedIds(state.minions)
    .map((id) => state.minions[id]!)
    .filter((m) => m.owner.kind === 'player' && m.owner.id === player.id && m.acquiredRound < state.round)
    .reduce((s, m) => s + minionUpkeep(content, m), 0);
}

export interface NormalizedSubmission {
  /** Index som får stå kvar. */
  kept: number[];
  rejected: Array<{ index: number; reason: string }>;
  analysis: SubmissionAnalysis;
}

/**
 * Vid upplösning: gör en lista giltig genom att stryka entries i stället för att
 * avvisa den. Entry-fel stryks direkt; därefter stryks den högst flaggade
 * entryn tills listan är giltig ("bakifrån", M7). Strukna entries lämnar tomma
 * slots; övriga behåller sin position.
 */
export function normalizeSubmission(
  state: GameState,
  submission: Submission,
  opts: ValidateOptions,
): NormalizedSubmission {
  const skip = new Set<number>();
  const rejected: Array<{ index: number; reason: string }> = [];
  // Royal Privileges klampas och schemes avgörs separat (agreedSabbatScheme);
  // fel på dem ska inte stryka entries.
  const { sabbatScheme: _ignored, ...rest } = submission;
  const sub: Submission = {
    ...rest,
    royalPrivilegesToSpend: Math.max(0, Math.min(submission.royalPrivilegesToSpend, state.players[submission.playerId]?.royalPrivileges ?? 0)),
  };
  for (;;) {
    const analysis = analyzeSubmission(state, sub, opts, skip);
    const indexed = analysis.errors.filter((e) => e.entryIndex !== undefined && !skip.has(e.entryIndex));
    if (analysis.errors.length === 0 || indexed.length === 0) {
      const kept = submission.actions.map((_, i) => i).filter((i) => !skip.has(i));
      if (analysis.errors.length > 0) {
        // Fel på submission-nivå (okänd/bränd spelare): stryk allt.
        for (const i of kept) rejected.push({ index: i, reason: analysis.errors[0]!.message });
        return { kept: [], rejected: rejected.sort((a, b) => a.index - b.index), analysis };
      }
      return { kept, rejected: rejected.sort((a, b) => a.index - b.index), analysis };
    }
    // Entry-fel som inte beror på listans längd stryks alla på en gång.
    const entryLevel = indexed.filter((e) => !isListLevelCode(e.code));
    const toDrop = entryLevel.length
      ? entryLevel
      : [indexed.reduce((a, b) => (b.entryIndex! > a.entryIndex! ? b : a))];
    for (const e of toDrop) {
      if (skip.has(e.entryIndex!)) continue;
      skip.add(e.entryIndex!);
      rejected.push({ index: e.entryIndex!, reason: `${e.code}: ${e.message}` });
    }
  }
}
