import { actionCost, effectiveFactions, effectiveTitles, isTrifle, type ActionRegistry } from './actions.js';
import { computeBudget, schemeAllocationProblem, type BudgetBreakdown } from './budget.js';
import { minionUpkeep, type GameState, type Player } from './deps.js';
import type { Submission, ValidationIssue, ValidationResult } from './types.js';

export interface ValidateOptions {
  registry: ActionRegistry;
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
}

/**
 * Validerar en spelares lista mot aktuell state. Ren funktion; används både
 * vid inlämning (avvisar hela listan) och vid upplösning (stryker entries).
 * Ignorerar entry-index i `skip` (redan strukna vid upplösning).
 */
export function analyzeSubmission(
  state: GameState,
  submission: Submission,
  opts: ValidateOptions,
  skip: ReadonlySet<number> = new Set(),
): SubmissionAnalysis {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const player = state.players[submission.playerId];
  if (!player) {
    errors.push({ code: 'unknown_player', message: `Okänd spelare ${submission.playerId}` });
    return { ok: false, errors, warnings, budget: null, slotsUsed: 0, totalCost: 0 };
  }
  if (player.status === 'burned') {
    errors.push({ code: 'player_burned', message: 'Vampyren är bränd' });
    return { ok: false, errors, warnings, budget: null, slotsUsed: 0, totalCost: 0 };
  }

  // --- Submission-nivå
  if (!Number.isInteger(submission.royalPrivilegesToSpend) || submission.royalPrivilegesToSpend < 0) {
    errors.push({ code: 'royal_privileges', message: 'royalPrivilegesToSpend måste vara ett heltal ≥ 0' });
  } else if (submission.royalPrivilegesToSpend > player.royalPrivileges) {
    errors.push({
      code: 'royal_privileges',
      message: `Har ${player.royalPrivileges} Royal Privileges, försöker använda ${submission.royalPrivilegesToSpend}`,
    });
  }
  const scheme = submission.sabbatScheme;
  if (scheme) {
    const problem = player.faction === 'sabbat' ? schemeAllocationProblem(state, scheme.allocation) : 'Bara Sabbat har schemes';
    if (problem) errors.push({ code: 'invalid_params', message: `Sabbat scheme: ${problem}` });
    else warnings.push({ code: 'invalid_params', message: 'Sabbat scheme gäller bara om alla Sabbat-spelare skickar identiska förslag' });
  }
  const schemeActions = opts.schemeActions ?? (player.faction === 'sabbat' ? (scheme?.allocation[player.id] ?? 0) : 0);
  const budget = computeBudget(state, player, submission, schemeActions);

  // --- Entry-nivå + räkning
  let slotsUsed = 0;
  let trifleUsed = false;
  let totalCost = 0;
  let endsTurnAt: number | null = null;
  const vampireEntries: number[] = [];
  const perAction = new Map<string, number>();
  const minionUses = new Map<string, number>();
  const minionExtra = new Map<string, number>();
  const costs: Array<[index: number, cost: number]> = [];

  submission.actions.forEach((action, index) => {
    if (skip.has(index)) return;
    const err = (code: ValidationIssue['code'], message: string) => errors.push({ code, entryIndex: index, message });
    const def = opts.registry[action.actionId];
    if (!def) return err('unknown_action', `Okänd aktion ${action.actionId}`);
    const ectx = { state, player, action };

    if (def.performer === 'vampire') {
      if (action.performer.kind !== 'vampire') return err('vampire_only', `${def.name} kan bara utföras av vampyren`);
      if (def.titles && !def.titles.some((t) => effectiveTitles(player).includes(t)))
        return err('not_eligible', `${def.name} kräver titel ${def.titles.join('/')}`);
      if (def.factions && !def.factions.some((f) => effectiveFactions(player).includes(f)))
        return err('not_eligible', `${def.name} kräver sekt ${def.factions.join('/')}`);
      if (player.status === 'torpor' && !def.allowedInTorpor)
        return err('torpor_only_awaken', `I torpor kan vampyren bara göra Awaken (inte ${def.name})`);
    } else {
      if (action.performer.kind !== 'minion') return err('minion_only', `${def.name} kan bara utföras av en minion`);
      const minion = state.minions[action.performer.minionId];
      if (!minion) return err('unknown_minion', `Okänd minion ${action.performer.minionId}`);
      if (minion.owner.kind !== 'player' || minion.owner.id !== player.id)
        return err('not_your_minion', `${minion.id} tillhör inte spelaren`);
      if (def.minionTypes && !def.minionTypes.includes(minion.type))
        return err('wrong_minion_type', `${def.name} kan inte utföras av ${minion.type}`);
    }
    const custom = def.eligible?.(ectx);
    if (custom) return err('invalid_params', custom);
    const cost = actionCost(def, ectx);
    if (!Number.isInteger(cost) || cost < 0) return err('invalid_params', `Ogiltig kostnad ${cost}`);

    // Giltig entry: räkna.
    totalCost += cost;
    costs.push([index, cost]);
    if (action.performer.kind === 'vampire') {
      if (endsTurnAt !== null) err('after_ends_turn', `Inga vampyraktioner efter Hide (entry ${endsTurnAt + 1})`);
      if (def.endsTurn && endsTurnAt === null) endsTurnAt = index;
      vampireEntries.push(index);

      const n = (perAction.get(def.id) ?? 0) + 1;
      perAction.set(def.id, n);
      if (def.maxPerRound !== undefined && n > def.maxPerRound)
        err('max_per_round', `${def.name} får göras högst ${def.maxPerRound} gång(er) per rond`);

      if (def.grantsMinionAction) {
        const target = action.params?.minionId as string;
        minionExtra.set(target, Math.min(1, (minionExtra.get(target) ?? 0) + 1));
      }

      let costsSlot = def.slot !== 'free';
      if (costsSlot && !trifleUsed && isTrifle(def, player)) {
        trifleUsed = true;
        costsSlot = false;
      }
      if (costsSlot) {
        slotsUsed += 1;
        if (slotsUsed > budget.total)
          err('over_budget', `Listan använder fler än ${budget.total} vampyraktioner`);
      }
    } else {
      const id = action.performer.minionId;
      const used = (minionUses.get(id) ?? 0) + 1;
      minionUses.set(id, used);
      // Anarch Mission måste stå före minionens extra aktion ("buffs before target", gd:95).
      if (used > 1 + (minionExtra.get(id) ?? 0))
        err('minion_over_budget', `${id} har redan använt sina minionaktioner`);
    }
  });

  // Exclusive (Go Anarch): måste vara enda vampyraktionen. Flagga sista vampyraktionen.
  const exclusive = vampireEntries.some((i) => opts.registry[submission.actions[i]!.actionId]?.exclusive);
  if (exclusive && vampireEntries.length > 1) {
    errors.push({
      code: 'exclusive_action',
      entryIndex: vampireEntries[vampireEntries.length - 1]!,
      message: 'Go Anarch måste vara rondens enda vampyraktion',
    });
  }

  // Råd (M7): total kostnad ≤ blood. Flagga sista entry med kostnad > 0.
  if (totalCost > player.blood) {
    const last = [...costs].reverse().find(([, c]) => c > 0);
    errors.push({
      code: 'unaffordable',
      ...(last ? { entryIndex: last[0] } : {}),
      message: `Listan kostar ${totalCost} blood, har ${player.blood}`,
    });
  } else {
    const upkeep = upkeepFor(state, player);
    if (totalCost + upkeep > player.blood)
      warnings.push({
        code: 'unaffordable',
        message: `Kostnad ${totalCost} + upkeep ${upkeep} överstiger ${player.blood} blood; minions kan brännas`,
      });
  }

  return { ok: errors.length === 0, errors, warnings, budget, slotsUsed, totalCost };
}

export function validateSubmission(state: GameState, submission: Submission, opts: ValidateOptions): ValidationResult {
  const { ok, errors, warnings } = analyzeSubmission(state, submission, opts);
  return { ok, errors, warnings };
}

export function upkeepFor(state: GameState, player: Player): number {
  return Object.keys(state.minions)
    .sort()
    .map((id) => state.minions[id]!)
    .filter((m) => m.owner.kind === 'player' && m.owner.id === player.id && m.acquiredRound < state.round)
    .reduce((s, m) => s + minionUpkeep(m), 0);
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
    const listLevel = new Set(['over_budget', 'minion_over_budget', 'max_per_round', 'exclusive_action', 'after_ends_turn', 'unaffordable']);
    const entryLevel = indexed.filter((e) => !listLevel.has(e.code));
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
