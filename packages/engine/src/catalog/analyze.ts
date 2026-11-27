/**
 * Analys av en spelares aktionslista mot det spelaren ser (PlayerView).
 *
 * Samma funktion används av gränssnittet (utkast, "X/Y action points", kostnad,
 * fel per entry, om listan kan bekräftas) och av servern (`analyzeSubmission`,
 * som bygger vyn från state). Därför ger de alltid samma svar.
 */
import type { Content } from '../content/index.js';
import type { Discipline, DisciplineLevel } from '../state/enums.js';
import type { CityId, MinionId, PlayerId } from '../state/ids.js';
import type { PlayerView } from '../view/player.js';
import {
  actionCost,
  actionIncome,
  actionParams,
  effectiveFactions,
  effectiveTitles,
  isTrifle,
  type ActionDefinition,
  type ActionRegistry,
  type ActionStealth,
} from '../round/actions.js';
import { budgetFrom, schemeAllocationProblemFor, type BudgetBreakdown } from '../round/budget.js';
import type {
  Json,
  Performer,
  SabbatSchemeProposal,
  SubmittedAction,
  ValidationCode,
  ValidationIssue,
  ValidationResult,
} from '../round/types.js';
import { minionIsResting } from '../state/queries.js';
import { optionValues } from './options.js';
import { ACTION_CATALOG } from './registry.js';
import type { CatalogContext, NumberRange, ParamKind, ParamOption, ParamSpec, ProjectedPositions } from './types.js';

// ---------------------------------------------------------------------------
// Typer

/** En spelares lista innan den lämnas in. */
export interface DraftSubmission {
  actions: readonly SubmittedAction[];
  /** Royal Privileges som förbrukas för +1 aktion vardera. */
  royalPrivilegesToSpend: number;
  sabbatScheme?: SabbatSchemeProposal;
}

/** Nästa val gränssnittet ska fråga efter, med giltiga alternativ. Ren JSON. */
export interface ParamRequest {
  key: string;
  label: string;
  kind: ParamKind;
  multiple?: { min: number; max: number };
  /** Giltiga alternativ (alla typer utom `number` och `text`). */
  options?: ParamOption[];
  range?: NumberRange;
  maxWords?: number;
}

export interface DraftEntryAnalysis {
  index: number;
  key?: string;
  actionId: string;
  /** Aktionens namn, eller id:t om aktionen är okänd. */
  name: string;
  performer: Performer;
  /** 1 om entryn använder en av vampyrens action points, annars 0. */
  ap: 0 | 1;
  /** Entryn är gratis för att den är rondens första Trifle. */
  trifleFree: boolean;
  /** Aktionen kostar aldrig en action point (Give, Buy Votes, vissa artefakter). */
  freeSlot: boolean;
  /** Blood-kostnad, eller null om den beror på val som inte är gjorda än. */
  cost: number | null;
  /** Deterministisk blood-inkomst, eller null om aktionen inte ger fast inkomst. */
  income: number | null;
  stealth: ActionStealth | null;
  /** Alla obligatoriska val är gjorda. */
  complete: boolean;
  /** Nästa val som saknas, med alternativ. null när entryn är klar. */
  nextParam: ParamRequest | null;
  errors: ValidationIssue[];
}

export interface MinionActionCount {
  minionId: MinionId;
  used: number;
  /** 1, eller 2 efter en Anarch Mission tidigare i listan. */
  allowed: number;
}

export interface DraftAnalysis extends ValidationResult {
  entries: DraftEntryAnalysis[];
  budget: BudgetBreakdown;
  /** "X/Y action points used": vampyrens slots. Minionaktioner räknas separat. */
  ap: { used: number; total: number };
  minionActions: MinionActionCount[];
  /** Summa av alla entries med känd kostnad. */
  totalCost: number;
  /** Summa av deterministisk inkomst. */
  totalIncome: number;
  blood: number;
  /** Upkeep som dras i fas 1b. */
  upkeep: number;
  /** Listan kan lämnas in: alla val gjorda och inga fel. */
  canConfirm: boolean;
}

export interface AnalyzeOptions {
  /** Standard: ACTION_CATALOG. */
  registry?: ActionRegistry;
  /**
   * Spelarens extra actions från Sabbat schemes. Vid inlämning är den okänd,
   * så standard är spelarens eget förslag (R5).
   */
  schemeActions?: number;
  /** Entry-index som redan strukits vid upplösning (R3). */
  skip?: ReadonlySet<number>;
}

// ---------------------------------------------------------------------------
// Krav

function hasDisciplineIn(view: PlayerView, d: Discipline, level: DisciplineLevel): boolean {
  const ok = (l: DisciplineLevel | undefined) => l !== undefined && (level === 'basic' || l === 'mastered');
  if (ok(view.me.disciplines[d])) return true;
  return view.me.temporaryDisciplines.some(
    (t) => t.discipline === d && t.expiresAfterRound >= view.round && ok(t.level),
  );
}

/**
 * Om spelaren alls kan välja aktionen med den här utföraren, oberoende av mål.
 * Returnerar felkod och meddelande, eller null.
 */
export function requirementProblem(
  def: ActionDefinition,
  view: PlayerView,
  performer: Performer,
): { code: ValidationCode; message: string } | null {
  const me = view.me;
  const fail = (code: ValidationCode, message: string) => ({ code, message });
  if (def.performer === 'vampire') {
    if (performer.kind !== 'vampire') return fail('vampire_only', `${def.name} kan bara utföras av vampyren`);
    if (def.titles && !def.titles.some((t) => effectiveTitles(me).includes(t)))
      return fail('not_eligible', `${def.name} kräver titel ${def.titles.join('/')}`);
    if (def.factions && !def.factions.some((f) => effectiveFactions(me).includes(f)))
      return fail('not_eligible', `${def.name} kräver sekt ${def.factions.join('/')}`);
    const req = def.requires;
    if (req?.onlyInTorpor && me.status !== 'torpor') return fail('not_eligible', `${def.name} kan bara göras i torpor`);
    if (me.status === 'torpor' && !def.allowedInTorpor)
      return fail('torpor_only_awaken', `I torpor kan vampyren bara göra Awaken (inte ${def.name})`);
    if (req?.noTitle && me.title !== null) return fail('not_eligible', `${def.name} kräver att man saknar titel`);
    if (req?.archbishop === 'hidden' && !(me.title === 'archbishop' && me.disguise))
      return fail('not_eligible', `${def.name} kräver en dold Archbishop`);
    if (req?.archbishop === 'exposed' && !(me.title === 'archbishop' && !me.disguise))
      return fail('not_eligible', `${def.name} kräver en exponerad Archbishop`);
    if (req?.discipline && !hasDisciplineIn(view, req.discipline.key, req.discipline.level))
      return fail(
        'not_eligible',
        `${def.name} kräver ${req.discipline.level === 'mastered' ? '(M)' : ''}${req.discipline.key}`,
      );
    if (req?.artifact && !me.artifacts.some((a) => a.holder.kind === 'player' && a.definition === req.artifact))
      return fail('not_eligible', `${def.name} kräver artefakten ${req.artifact}`);
    return null;
  }
  if (performer.kind !== 'minion') return fail('minion_only', `${def.name} kan bara utföras av en minion`);
  const minion = me.minions.find((m) => m.id === performer.minionId);
  if (!minion) {
    return view.minions.some((m) => m.id === performer.minionId)
      ? fail('not_your_minion', `${performer.minionId} tillhör inte spelaren`)
      : fail('unknown_minion', `Okänd minion ${performer.minionId}`);
  }
  if (def.requires?.zombieOnly && minion.origin.kind !== 'vestment_zombie')
    return fail('wrong_minion_type', `${def.name} kan bara utföras av Vestment of Vileness-zombien`);
  if (minion.origin.kind === 'vestment_zombie' && !def.zombie)
    return fail('wrong_minion_type', `Zombien kan bara göra Move och Hunt for Me (gd:402)`);
  if (def.minionTypes && !def.minionTypes.includes(minion.type) && !(def.zombie && minion.origin.kind === 'vestment_zombie'))
    return fail('wrong_minion_type', `${def.name} kan inte utföras av ${minion.type}`);
  if (minionIsResting(minion, view.round))
    return fail('minion_resting', `${minion.name} used Hide and Spy last round and cannot act this round`);
  return null;
}

// ---------------------------------------------------------------------------
// Val (params)

function initialPositions(view: PlayerView): ProjectedPositions {
  const minions: Record<MinionId, CityId | null> = {};
  for (const m of view.me.minions) minions[m.id] = m.location;
  return { vampire: view.me.location, minions };
}

function requestFor(spec: ParamSpec, ctx: CatalogContext): ParamRequest {
  const r: ParamRequest = { key: spec.key, label: spec.label, kind: spec.kind };
  if (spec.multiple) r.multiple = { ...spec.multiple };
  if (spec.options) r.options = spec.options(ctx);
  if (spec.range) r.range = spec.range(ctx);
  if (spec.maxWords !== undefined) r.maxWords = spec.maxWords;
  return r;
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Kontrollerar ett gjort val. Returnerar felmeddelande eller null. */
function valueProblem(spec: ParamSpec, value: Json, ctx: CatalogContext): string | null {
  if (spec.kind === 'number') {
    const r = spec.range?.(ctx) ?? { min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 };
    if (typeof value !== 'number' || !Number.isInteger(value)) return `${spec.label}: måste vara ett heltal`;
    if (value < r.min || value > r.max) return `${spec.label}: måste vara ${r.min}–${r.max}`;
    if ((value - r.min) % r.step !== 0) return `${spec.label}: måste vara i steg om ${r.step}`;
    return null;
  }
  if (spec.kind === 'text') {
    if (typeof value !== 'string' || value.trim() === '') return `${spec.label}: tom text`;
    if (spec.maxWords !== undefined && wordCount(value) > spec.maxWords)
      return `${spec.label}: högst ${spec.maxWords} ord`;
    return null;
  }
  const allowed = optionValues(spec.options?.(ctx) ?? []);
  if (spec.multiple) {
    if (!Array.isArray(value)) return `${spec.label}: förväntade en lista`;
    const { min, max } = spec.multiple;
    if (value.length < min || value.length > max)
      return `${spec.label}: välj ${min === max ? min : `${min}–${max}`}`;
    if (new Set(value.map((v) => JSON.stringify(v))).size !== value.length) return `${spec.label}: samma val två gånger`;
    const bad = value.find((v) => (typeof v !== 'string' && typeof v !== 'number') || !allowed.has(v));
    return bad === undefined ? null : `${spec.label}: ${JSON.stringify(bad)} är inget giltigt val`;
  }
  if ((typeof value !== 'string' && typeof value !== 'number') || !allowed.has(value))
    return `${spec.label}: ${JSON.stringify(value)} är inget giltigt val`;
  return null;
}

interface ParamCheck {
  complete: boolean;
  next: ParamRequest | null;
  error: string | null;
}

function checkParams(def: ActionDefinition, ctx: CatalogContext): ParamCheck {
  const specs = actionParams(def, ctx);
  for (const spec of specs) {
    const value = ctx.action.params?.[spec.key];
    if (value === undefined) return { complete: false, next: requestFor(spec, ctx), error: null };
    const problem = valueProblem(spec, value, ctx);
    if (problem) return { complete: false, next: requestFor(spec, ctx), error: problem };
  }
  const extra = def.eligible?.(ctx) ?? null;
  return { complete: extra === null, next: null, error: extra };
}

// ---------------------------------------------------------------------------
// Positioner genom listan

/** Positioner inför varje entry i listan (index → positioner). */
export function projectPositions(
  view: PlayerView,
  content: Content,
  actions: readonly SubmittedAction[],
  registry: ActionRegistry = ACTION_CATALOG,
  upTo: number = actions.length,
  skip: ReadonlySet<number> = new Set(),
): ProjectedPositions {
  let pos = initialPositions(view);
  for (let i = 0; i < Math.min(upTo, actions.length); i++) {
    if (skip.has(i)) continue;
    pos = applyEntryMoves(view, content, actions, i, registry, pos);
  }
  return pos;
}

function applyEntryMoves(
  view: PlayerView,
  content: Content,
  actions: readonly SubmittedAction[],
  index: number,
  registry: ActionRegistry,
  pos: ProjectedPositions,
): ProjectedPositions {
  const action = actions[index]!;
  const def = registry[action.actionId];
  if (!def?.moves || requirementProblem(def, view, action.performer)) return pos;
  const ctx: CatalogContext = { view, content, action, positions: pos, list: actions, index, registry };
  if (!checkParams(def, ctx).complete) return pos;
  const next: ProjectedPositions = { vampire: pos.vampire, minions: { ...pos.minions } };
  for (const mv of def.moves(ctx)) {
    if (mv.performer.kind === 'vampire') next.vampire = mv.to;
    else if (mv.performer.minionId in next.minions) next.minions[mv.performer.minionId] = mv.to;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Steg för steg-val för gränssnittet

/**
 * Nästa val för entryn på `index` i `actions`, med giltiga alternativ räknade
 * från positionerna efter tidigare entries. null när entryn är klar (eller
 * aktionen är okänd/otillåten). För en aktion som håller på att väljas: lägg
 * den sist i listan och fråga om sista index.
 */
export function nextParam(
  view: PlayerView,
  content: Content,
  actions: readonly SubmittedAction[],
  index: number,
  registry: ActionRegistry = ACTION_CATALOG,
): ParamRequest | null {
  const action = actions[index];
  if (!action) return null;
  const def = registry[action.actionId];
  if (!def || requirementProblem(def, view, action.performer)) return null;
  const positions = projectPositions(view, content, actions, registry, index);
  return checkParams(def, { view, content, action, positions, list: actions, index, registry }).next;
}

// ---------------------------------------------------------------------------
// Hela listan

const LIST_LEVEL: ReadonlySet<ValidationCode> = new Set<ValidationCode>([
  'over_budget',
  'minion_over_budget',
  'max_per_round',
  'max_per_target',
  'exclusive_action',
  'after_ends_turn',
  'unaffordable',
  'movement_forbidden',
  'minion_locked',
]);

/** Felkoder som beror på listan som helhet (stryks bakifrån, R3), inte på entryn själv. */
export const isListLevelCode = (code: ValidationCode): boolean => LIST_LEVEL.has(code);

/** Spelarna som räknas som Sabbat för schemes, så som spelaren ser dem. */
function sabbatMembersInView(view: PlayerView): PlayerId[] {
  if (view.me.faction !== 'sabbat') return [];
  return view.players
    .filter((p) => !p.burned && (p.faction === 'sabbat' || p.sabbatIdentity !== undefined || p.id === view.me.id))
    .map((p) => p.id);
}

/**
 * Analyserar en hel lista: AP, minionaktioner, kostnad, inkomst och fel per
 * entry. Utkast får vara ofullständiga och över budget; `canConfirm` säger om
 * listan går att lämna in.
 */
export function analyzeDraft(
  view: PlayerView,
  content: Content,
  draft: DraftSubmission,
  opts: AnalyzeOptions,
): DraftAnalysis {
  const registry = opts.registry ?? ACTION_CATALOG;
  const skip = opts.skip ?? new Set<number>();
  const me = view.me;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- Lista-nivå: Royal Privileges och Sabbat schemes
  if (!Number.isInteger(draft.royalPrivilegesToSpend) || draft.royalPrivilegesToSpend < 0) {
    errors.push({ code: 'royal_privileges', message: 'royalPrivilegesToSpend måste vara ett heltal ≥ 0' });
  } else if (draft.royalPrivilegesToSpend > me.royalPrivileges) {
    errors.push({
      code: 'royal_privileges',
      message: `Har ${me.royalPrivileges} Royal Privileges, försöker använda ${draft.royalPrivilegesToSpend}`,
    });
  }
  const scheme = draft.sabbatScheme;
  if (scheme) {
    const problem =
      me.faction === 'sabbat' ? schemeAllocationProblemFor(sabbatMembersInView(view), scheme.allocation) : 'Bara Sabbat har schemes';
    if (problem) errors.push({ code: 'invalid_params', message: `Sabbat scheme: ${problem}` });
    else warnings.push({ code: 'invalid_params', message: 'Sabbat scheme gäller bara om alla Sabbat-spelare skickar identiska förslag' });
  }
  const schemeActions = opts.schemeActions ?? (me.faction === 'sabbat' ? (scheme?.allocation[me.id] ?? 0) : 0);
  const budget = budgetFrom(
    {
      round: view.round,
      baseActionBudget: me.baseActionBudget,
      status: me.status,
      royalPrivileges: me.royalPrivileges,
      actionBudgetModifiers: me.actionBudgetModifiers,
    },
    Number.isInteger(draft.royalPrivilegesToSpend) ? draft.royalPrivilegesToSpend : 0,
    schemeActions,
  );

  // --- Entry för entry
  const entries: DraftEntryAnalysis[] = [];
  let positions = initialPositions(view);
  let slotsUsed = 0;
  let trifleUsed = false;
  let endsTurnAt: number | null = null;
  const vampireEntries: number[] = [];
  const perAction = new Map<string, number>();
  const perTarget = new Map<string, number>();
  const minionUses = new Map<MinionId, number>();
  const minionExtra = new Map<MinionId, number>();
  const costs: Array<[index: number, cost: number]> = [];
  const movingVampire: number[] = [];
  const forbidsMovement: number[] = [];
  const locked = new Map<MinionId, number>();

  draft.actions.forEach((action, index) => {
    if (skip.has(index)) return;
    const def = registry[action.actionId];
    const entry: DraftEntryAnalysis = {
      index,
      ...(action.key !== undefined ? { key: action.key } : {}),
      actionId: action.actionId,
      name: def?.name ?? action.actionId,
      performer: action.performer,
      ap: 0,
      trifleFree: false,
      freeSlot: def?.slot === 'free',
      cost: null,
      income: null,
      stealth: def?.stealth ?? null,
      complete: false,
      nextParam: null,
      errors: [],
    };
    entries.push(entry);
    const err = (code: ValidationCode, message: string) => {
      const issue = { code, entryIndex: index, message };
      entry.errors.push(issue);
      errors.push(issue);
    };
    if (!def) return err('unknown_action', `Okänd aktion ${action.actionId}`);
    const req = requirementProblem(def, view, action.performer);
    if (req) return err(req.code, req.message);

    const ctx: CatalogContext = { view, content, action, positions, list: draft.actions, index, registry };
    const pc = checkParams(def, ctx);
    entry.complete = pc.complete;
    entry.nextParam = pc.next;
    if (pc.error) err('invalid_params', pc.error);
    else if (!pc.complete) err('incomplete', `${def.name}: ${pc.next?.label ?? 'val'} saknas`);

    if (pc.complete || typeof def.cost === 'number') {
      const cost = actionCost(def, ctx);
      if (!Number.isInteger(cost) || cost < 0) err('invalid_params', `Ogiltig kostnad ${cost}`);
      else entry.cost = cost;
    } else if (!def.variableCost) {
      // Ofullständig entry: visa kostnaden om den inte beror på valen (Move: 5/10).
      const cost = actionCost(def, ctx);
      if (Number.isInteger(cost) && cost > 0) entry.cost = cost;
    }
    if (def.income !== undefined && (pc.complete || typeof def.income === 'number')) {
      const income = actionIncome(def, ctx);
      entry.income = income > 0 ? income : null;
    }
    if (pc.error) return;

    // Räkna (även ofullständiga entries, så att utkastet visar rätt AP).
    if (entry.cost !== null) {
      costs.push([index, entry.cost]);
    }
    if (action.performer.kind === 'vampire') {
      if (endsTurnAt !== null) err('after_ends_turn', `Inga vampyraktioner efter Hide (entry ${endsTurnAt + 1})`);
      if (def.endsTurn && endsTurnAt === null) endsTurnAt = index;
      vampireEntries.push(index);

      const n = (perAction.get(def.id) ?? 0) + 1;
      perAction.set(def.id, n);
      if (def.maxPerRound !== undefined && n > def.maxPerRound)
        err('max_per_round', `${def.name} får göras högst ${def.maxPerRound} gång(er) per rond`);

      if (def.grantsMinionAction && pc.complete) {
        const target = action.params?.minionId as MinionId;
        minionExtra.set(target, Math.min(1, (minionExtra.get(target) ?? 0) + 1));
      }

      let costsSlot = def.slot !== 'free';
      if (costsSlot && !trifleUsed && isTrifle(def, me)) {
        trifleUsed = true;
        costsSlot = false;
        entry.trifleFree = true;
      }
      if (costsSlot) {
        entry.ap = 1;
        slotsUsed += 1;
        if (slotsUsed > budget.total) err('over_budget', `Listan använder fler än ${budget.total} action points`);
      }
      if (def.forbidsMovement) forbidsMovement.push(index);
    } else {
      const id = action.performer.minionId;
      const used = (minionUses.get(id) ?? 0) + 1;
      minionUses.set(id, used);
      // Anarch Mission måste stå före minionens extra aktion ("buffs before target", gd:95).
      if (used > 1 + (minionExtra.get(id) ?? 0)) err('minion_over_budget', `${id} har redan använt sina minionaktioner`);
    }

    if (def.oncePerRoundPer && pc.complete) {
      const target = JSON.stringify(action.params?.[def.oncePerRoundPer] ?? null);
      const k = `${def.id}\u0000${target}`;
      const n = (perTarget.get(k) ?? 0) + 1;
      perTarget.set(k, n);
      if (n > 1) err('max_per_target', `${def.name} får bara göras en gång per rond mot samma mål`);
    }

    if (pc.complete) {
      if (def.locksMinions) for (const m of def.locksMinions(ctx)) if (!locked.has(m)) locked.set(m, index);
      if (def.moves) {
        const moves = def.moves(ctx);
        if (moves.some((mv) => mv.performer.kind === 'vampire')) movingVampire.push(index);
        positions = applyEntryMoves(view, content, draft.actions, index, registry, positions);
      }
    }
  });

  const flag = (index: number, code: ValidationCode, message: string) => {
    const issue = { code, entryIndex: index, message };
    entries.find((e) => e.index === index)?.errors.push(issue);
    errors.push(issue);
  };

  // Exclusive (Go Anarch): måste vara enda vampyraktionen. Flagga sista vampyraktionen.
  const exclusive = vampireEntries.some((i) => registry[draft.actions[i]!.actionId]?.exclusive);
  if (exclusive && vampireEntries.length > 1)
    flag(vampireEntries[vampireEntries.length - 1]!, 'exclusive_action', 'Go Anarch måste vara rondens enda vampyraktion');

  // Bottomless Wealth: ingen förflyttning samma rond. Flagga den senare av de två.
  if (forbidsMovement.length > 0 && movingVampire.length > 0) {
    const last = Math.max(forbidsMovement[0]!, movingVampire[movingVampire.length - 1]!);
    flag(last, 'movement_forbidden', 'Vampyren kan inte förflytta sig samma rond som Bottomless Wealth of the Camarilla');
  }

  // Minions som följer med (Expansion, Second Tradition) får inte agera.
  for (const e of entries) {
    const p = e.performer;
    if (p.kind === 'minion' && locked.has(p.minionId) && e.errors.length === 0)
      flag(e.index, 'minion_locked', `${p.minionId} följer med entry ${locked.get(p.minionId)! + 1} och kan inte agera denna rond`);
  }

  // Råd (M7): total kostnad ≤ blood. Flagga sista entry med kostnad > 0.
  const totalCost = costs.reduce((s, [, c]) => s + c, 0);
  const upkeep = me.minions.filter((m) => m.acquiredRound < view.round).reduce((s, m) => s + m.upkeep, 0);
  if (totalCost > me.blood) {
    const last = [...costs].reverse().find(([, c]) => c > 0);
    const message = `Listan kostar ${totalCost} blood, har ${me.blood}`;
    if (last) flag(last[0], 'unaffordable', message);
    else errors.push({ code: 'unaffordable', message });
  } else if (totalCost + upkeep > me.blood) {
    warnings.push({
      code: 'unaffordable',
      message: `Kostnad ${totalCost} + upkeep ${upkeep} överstiger ${me.blood} blood; minions kan brännas`,
    });
  }

  const minionActions: MinionActionCount[] = me.minions.map((m) => ({
    minionId: m.id,
    used: minionUses.get(m.id) ?? 0,
    allowed: 1 + (minionExtra.get(m.id) ?? 0),
  }));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    entries,
    budget,
    ap: { used: slotsUsed, total: budget.total },
    minionActions,
    totalCost,
    totalIncome: entries.reduce((s, e) => s + (e.income ?? 0), 0),
    blood: me.blood,
    upkeep,
    canConfirm: errors.length === 0,
  };
}
