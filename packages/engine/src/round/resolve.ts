import { ACTION_CATALOG } from '../catalog/registry.js';
import {
  type ActionContext,
  type ActionDefinition,
  type ActionOutcome,
  type ActionRegistry,
} from './actions.js';
import { agreedSabbatScheme, royalPrivilegesSpent } from './budget.js';
import {
  burnMinion,
  cloneJson,
  compareIds,
  createRng,
  deriveSeed,
  learnArtifactHolder,
  minionUpkeep,
  actionOrigin,
  observerGroups,
  sortedIds,
  sortedValues,
  type Content,
  type GameState,
  type Minion,
  type PlayerId,
  type Rng,
  type WorkingState,
} from './deps.js';
import type {
  Audience,
  EntryId,
  EntryRecord,
  Interrupt,
  InterruptAnswer,
  Json,
  PhaseId,
  RoundEvent,
  RoundResolution,
  RoundResult,
  Submission,
} from './types.js';
import { normalizeSubmission } from './validate.js';
import { payBleedIncome, payCityIncome, payOtherIncome } from '../effects/income.js';

/** Rondens faser i exakt ordning (SPEC A16, game_design.txt rad 935–960). */
export const PHASES: readonly PhaseId[] = [
  '1a_pay_actions',
  '1b_pay_upkeep',
  '2a_city_effects',
  '2b_event_effects',
  '2c_other_start_effects',
  '3a_actions',
  '4a_fight_for_control',
  '4b_player_end_effects',
  '4c_missions',
  '4d_masquerade_collapse',
  '5a_city_income',
  '5b_bleed_income',
  '5c_other_income',
  '5d_advance_round',
];

export interface PhaseContext {
  state: WorkingState;
  content: Content;
  resolution: RoundResolution;
  phase: PhaseId;
  /**
   * Skapar ett event. Standardpublik: `playerId` om den anges, annars bara GM (M18).
   * Ange `audience` för publika events.
   */
  emit(kind: string, data?: { [key: string]: Json }, playerId?: PlayerId, audience?: Audience): void;
  /** Namngiven delström av rondens seed (M9), t.ex. rng('brujah', playerId). */
  rng(...parts: Array<string | number>): Rng;
  /** Avslutar spelet efter denna fas (masquerade-kollaps, SPEC A15). */
  endGame(reason: string): void;
}

export type PhaseHook = (ctx: PhaseContext) => void;

export interface ResolveOptions {
  content: Content;
  registry?: ActionRegistry;
  /**
   * Regler som kopplas in i faserna. Körs efter fasens inbyggda logik, i
   * listordning. Skelettets faser 2a–2c, 4a–4d och 5a–5c är tomma utan hooks.
   */
  hooks?: Partial<Record<PhaseId, PhaseHook[]>>;
}

const clone = cloneJson;

// ---------------------------------------------------------------------------
// Publikt API

/**
 * Löser en rond som en ren funktion: samma state, listor och seed ger alltid
 * samma resultat. Indata muteras aldrig.
 *
 * Returnerar `completed` med ny state, eller `suspended` om en aktion har
 * startat något som kräver extern input (strid, M11). Fortsätt då med
 * `continueResolution`.
 */
export function resolveRound(
  state: GameState,
  submissions: Record<PlayerId, Submission>,
  seed: string,
  opts: ResolveOptions,
): RoundResult {
  if (state.phase !== 'submission') throw new Error(`Kan inte lösa ronden i fas ${state.phase}`);
  const res: RoundResolution = {
    status: 'running',
    round: state.round,
    seed,
    state: clone(state) as WorkingState,
    cursor: { phaseIndex: 0, slot: 0, slotOrder: null, slotPos: 0 },
    entries: {},
    lists: {},
    budgets: {},
    pendingInterrupts: [],
    events: [],
    scratch: {},
  };
  res.state.phase = 'resolving';
  return run(res, clone(submissions), opts);
}

/**
 * Fortsätter en pausad upplösning med svar på en eller flera interrupts.
 * Är alla interrupts besvarade fortsätter upplösningen med nästa slot.
 */
export function continueResolution(
  resolution: RoundResolution,
  answers: InterruptAnswer[],
  opts: ResolveOptions,
): RoundResult {
  if (resolution.status !== 'suspended') throw new Error('Upplösningen är inte pausad');
  const res = clone(resolution);
  const registry = opts.registry ?? ACTION_CATALOG;
  for (const answer of answers) {
    const i = res.pendingInterrupts.findIndex((it) => it.id === answer.interruptId);
    if (i < 0) throw new Error(`Okänd eller redan besvarad interrupt ${answer.interruptId}`);
    const [interrupt] = res.pendingInterrupts.splice(i, 1);
    const entry = res.entries[interrupt!.entryId]!;
    const def = registry[entry.action.actionId];
    if (!def?.resume) throw new Error(`${entry.action.actionId} kan inte återupptas`);
    emit(res, '3a_actions', 'interrupt_answered', { interruptId: interrupt!.id }, entry.playerId, entry.id);
    const ctx = makeActionContext(res, entry, registry, opts.content, '3a_actions');
    applyOutcome(res, entry, def.resume(ctx.ctx, clone(answer.result)), '3a_actions');
    ctx.flushImmediate();
  }
  if (res.pendingInterrupts.length > 0) return { status: 'suspended', interrupts: clone(res.pendingInterrupts), resolution: res };
  res.status = 'running';
  res.state.phase = 'resolving';
  nextSlot(res);
  return run(res, null, opts);
}

// ---------------------------------------------------------------------------
// Körning

function run(res: RoundResolution, submissions: Record<PlayerId, Submission> | null, opts: ResolveOptions): RoundResult {
  const registry = opts.registry ?? ACTION_CATALOG;
  while (res.cursor.phaseIndex < PHASES.length) {
    const phase = PHASES[res.cursor.phaseIndex]!;
    switch (phase) {
      case '1a_pay_actions':
        payActions(res, submissions ?? {}, registry, opts.content);
        break;
      case '1b_pay_upkeep':
        payUpkeep(res, opts.content);
        break;
      case '3a_actions':
        if (!resolveSlots(res, registry, opts.content)) {
          res.status = 'suspended';
          res.state.phase = 'awaitingCombat';
          return { status: 'suspended', interrupts: clone(res.pendingInterrupts), resolution: res };
        }
        break;
      case '5a_city_income':
        payCityIncome(phaseContext(res, phase, opts));
        break;
      case '5b_bleed_income':
        payBleedIncome(phaseContext(res, phase, opts));
        break;
      case '5c_other_income':
        payOtherIncome(phaseContext(res, phase, opts));
        break;
      case '5d_advance_round':
        advanceRound(res);
        break;
      default:
        break;
    }
    runHooks(res, phase, opts);
    res.cursor.phaseIndex += 1;
    if (res.scratch.gameOver !== undefined && phase !== '5d_advance_round') {
      res.state.phase = 'finished';
      emit(res, phase, 'game_over', { reason: res.scratch.gameOver }, undefined, undefined, PUBLIC);
      res.cursor.phaseIndex = PHASES.length;
    }
  }
  res.status = 'completed';
  return { status: 'completed', state: res.state as GameState, resolution: res };
}

function phaseContext(res: RoundResolution, phase: PhaseId, opts: ResolveOptions): PhaseContext {
  return {
    state: res.state,
    content: opts.content,
    resolution: res,
    phase,
    emit: (kind, data, playerId, audience) => emit(res, phase, kind, data, playerId, undefined, audience),
    rng: (...parts) => createRng(deriveSeed(res.seed, 'phase', phase, ...parts)),
    endGame: (reason) => {
      res.scratch.gameOver = reason;
    },
  };
}

function runHooks(res: RoundResolution, phase: PhaseId, opts: ResolveOptions): void {
  for (const hook of opts.hooks?.[phase] ?? []) hook(phaseContext(res, phase, opts));
}

function emit(
  res: RoundResolution,
  phase: PhaseId,
  kind: string,
  data?: { [key: string]: Json },
  playerId?: PlayerId,
  entryId?: EntryId,
  audience?: Audience,
): void {
  const ev: RoundEvent = {
    seq: res.events.length,
    round: res.round,
    phase,
    kind,
    audience: audience ?? (playerId !== undefined ? onlyPlayers([playerId]) : GM_ONLY),
  };
  if (playerId !== undefined) ev.playerId = playerId;
  if (entryId !== undefined) ev.entryId = entryId;
  if (data !== undefined) ev.data = data;
  res.events.push(ev);
}

const sortedPlayerIds = (state: WorkingState): PlayerId[] => sortedIds(state.players);

const PUBLIC: Audience = { kind: 'public' };
const GM_ONLY: Audience = { kind: 'gm' };
const onlyPlayers = (ids: PlayerId[]): Audience => ({ kind: 'players', ids: [...new Set(ids)].sort(compareIds) });

// ---------------------------------------------------------------------------
// Fas 1a: normalisera listor, förbruka Royal Privileges, betala allt i förskott.

function payActions(
  res: RoundResolution,
  submissions: Record<PlayerId, Submission>,
  registry: ActionRegistry,
  content: Content,
): void {
  const { state } = res;
  const scheme = agreedSabbatScheme(state, submissions);
  if (Object.keys(scheme).length > 0) {
    // Bara Sabbat-spelare (sann sekt) får veta fördelningen (SPEC A14.3).
    const sabbat = sortedPlayerIds(state).filter((id) => state.players[id]!.faction === 'sabbat');
    emit(res, '1a_pay_actions', 'sabbat_scheme_agreed', { allocation: scheme }, undefined, undefined, onlyPlayers(sabbat));
  }

  for (const pid of sortedPlayerIds(state)) {
    const player = state.players[pid]!;
    const submission: Submission = submissions[pid] ?? {
      playerId: pid,
      actions: [],
      royalPrivilegesToSpend: 0,
      locked: false,
      updatedAt: 0,
    };
    if (submission.playerId !== pid) throw new Error(`Lista för ${pid} har playerId ${submission.playerId}`);
    const norm = normalizeSubmission(state, submission, { registry, content, schemeActions: scheme[pid] ?? 0 });
    const rejected = new Map(norm.rejected.map((r) => [r.index, r.reason]));

    res.lists[pid] = submission.actions.map((action, index) => {
      const id: EntryId = `${pid}#${index}`;
      const reason = rejected.get(index);
      const entry: EntryRecord = { id, playerId: pid, index, action, status: reason ? 'rejected' : 'pending', paid: 0 };
      if (reason) {
        entry.reason = reason;
        emit(res, '1a_pay_actions', 'action_rejected', { index, reason }, pid, id);
      }
      res.entries[id] = entry;
      return id;
    });
    res.budgets[pid] = norm.analysis.budget?.total ?? 0;
    if (player.status === 'burned') continue;

    const rp = royalPrivilegesSpent(player, submission);
    if (rp > 0) {
      player.royalPrivileges -= rp;
      emit(res, '1a_pay_actions', 'royal_privileges_spent', { amount: rp }, pid);
    }

    let total = 0;
    for (const id of res.lists[pid]!) {
      const entry = res.entries[id]!;
      if (entry.status !== 'pending') continue;
      entry.paid = norm.analysis.entryCosts[entry.index] ?? 0;
      total += entry.paid;
    }
    // normalizeSubmission garanterar total ≤ blood.
    player.blood -= total;
    emit(res, '1a_pay_actions', 'actions_paid', { amount: total, budget: res.budgets[pid]! }, pid);
  }
}

// ---------------------------------------------------------------------------
// Fas 1b: upkeep. Obetalda minions bränns: högst upkeep först, sedan nyast, sedan id (M7).

function payUpkeep(res: RoundResolution, content: Content): void {
  const { state } = res;
  for (const pid of sortedPlayerIds(state)) {
    const player = state.players[pid]!;
    const owned = sortedIds(state.minions)
      .map((id) => state.minions[id]!)
      .filter((m) => m.owner.kind === 'player' && m.owner.id === pid && m.acquiredRound < state.round);
    if (owned.length === 0) continue;
    const upkeep = (m: Minion) => minionUpkeep(content, m);
    let total = owned.reduce((s, m) => s + upkeep(m), 0);
    const burnOrder: Minion[] = [...owned].sort(
      (a, b) => upkeep(b) - upkeep(a) || b.acquiredRound - a.acquiredRound || compareIds(a.id, b.id),
    );
    for (const m of burnOrder) {
      if (total <= player.blood) break;
      if (upkeep(m) === 0) continue;
      total -= upkeep(m);
      burnMinion(state, m.id);
      emit(res, '1b_pay_upkeep', 'minion_burned_upkeep', { minionId: m.id }, pid);
    }
    player.blood -= total;
    emit(res, '1b_pay_upkeep', 'upkeep_paid', { amount: total }, pid);
  }
}

// ---------------------------------------------------------------------------
// Fas 3a: slot för slot, seedad spelarordning per slot (M4). Returnerar false vid paus.

function maxSlots(res: RoundResolution): number {
  return Math.max(0, ...Object.values(res.lists).map((l) => l.length));
}

function nextSlot(res: RoundResolution): void {
  res.cursor.slot += 1;
  res.cursor.slotOrder = null;
  res.cursor.slotPos = 0;
}

function resolveSlots(res: RoundResolution, registry: ActionRegistry, content: Content): boolean {
  while (res.cursor.slot < maxSlots(res)) {
    const { slot } = res.cursor;
    if (res.cursor.slotOrder === null) {
      const players = sortedIds(res.lists).filter((pid) => {
          const id = res.lists[pid]![slot];
          return id !== undefined && res.entries[id]!.status === 'pending';
        });
      res.cursor.slotOrder = createRng(deriveSeed(res.seed, 'slotOrder', slot)).shuffle(players);
      res.cursor.slotPos = 0;
      emit(res, '3a_actions', 'slot_started', { slot: slot + 1, order: res.cursor.slotOrder });
    }
    while (res.cursor.slotPos < res.cursor.slotOrder.length) {
      const pid = res.cursor.slotOrder[res.cursor.slotPos]!;
      res.cursor.slotPos += 1;
      // Entryn kan redan vara löst via Celerity (M5); då lämnar den en tom slot.
      resolveEntry(res, res.lists[pid]![slot]!, registry, content);
    }
    if (res.pendingInterrupts.length > 0) return false;
    nextSlot(res);
  }
  return true;
}

function makeActionContext(
  res: RoundResolution,
  entry: EntryRecord,
  registry: ActionRegistry,
  content: Content,
  phase: PhaseId,
): { ctx: ActionContext; flushImmediate(): void } {
  let immediate = 0;
  const ctx: ActionContext = {
    state: res.state,
    content,
    entry,
    player: res.state.players[entry.playerId]!,
    rng: createRng(deriveSeed(res.seed, 'action', entry.id)),
    emit: (kind, data, audience) => emit(res, phase, kind, data, entry.playerId, entry.id, audience),
    scratch: res.scratch,
    resolveImmediately: (count) => {
      immediate += count;
    },
  };
  return {
    ctx,
    flushImmediate: () => {
      if (immediate <= 0) return;
      const next = res.lists[entry.playerId]!
        .slice(entry.index + 1)
        .filter((id) => res.entries[id]!.status === 'pending')
        .slice(0, immediate);
      for (const id of next) {
        emit(res, phase, 'resolved_immediately', { by: entry.id }, entry.playerId, id);
        resolveEntry(res, id, registry, content);
      }
    },
  };
}

/** Varför en entry inte kan lösas just nu, eller null. Kostnaden återbetalas då (C11). */
function blockedReason(res: RoundResolution, entry: EntryRecord, registry: ActionRegistry): string | null {
  const player = res.state.players[entry.playerId];
  if (!player) return 'Spelaren finns inte längre';
  const def = registry[entry.action.actionId]!;
  if (entry.action.performer.kind === 'vampire') {
    if (player.status === 'burned') return 'Vampyren är bränd';
    if (player.status === 'torpor' && !def.allowedInTorpor) return 'Vampyren är i torpor';
  } else {
    const minion = res.state.minions[entry.action.performer.minionId];
    if (!minion) return 'Minionen finns inte längre';
    if (minion.owner.kind !== 'player' || minion.owner.id !== entry.playerId) return 'Minionen har bytt ägare';
  }
  return null;
}

function resolveEntry(res: RoundResolution, id: EntryId, registry: ActionRegistry, content: Content): void {
  const entry = res.entries[id]!;
  if (entry.status !== 'pending') return;
  const blocked = blockedReason(res, entry, registry);
  if (blocked) {
    applyOutcome(res, entry, { status: 'failed', reason: blocked }, '3a_actions');
    return;
  }
  const def = registry[entry.action.actionId]!;
  observeAction(res, entry, def, content, '3a_actions');
  const { ctx, flushImmediate } = makeActionContext(res, entry, registry, content, '3a_actions');
  applyOutcome(res, entry, def.resolve(ctx), '3a_actions');
  flushImmediate();
}

/**
 * Skapar `action_observed` för dem som ser aktionen (M16–M19). Räknas innan
 * handlern körs, med positioner och stats just då (M18): för Move är det
 * avreseorten. Observatören får veta vem, vilken aktion och mål (M17), inte
 * kostnad eller utfall. Blockerade entries (bränd, torpor) observeras inte,
 * eftersom de aldrig utförs.
 */
function observeAction(res: RoundResolution, entry: EntryRecord, def: ActionDefinition, content: Content, phase: PhaseId): void {
  const state = res.state as GameState;
  const targets = def.targets?.({ state, content, entry }) ?? {};
  const destination = def.destination?.({ state, content, entry }) ?? null;
  const observed = {
    playerId: entry.playerId,
    performer: entry.action.performer,
    stealth: def.stealth,
    targetCities: targets.cities ?? [],
    destination,
  };
  const groups = observerGroups(state, content, observed);
  revealArtifactUse(res, entry, def, groups);
  const performer: { [key: string]: Json } =
    entry.action.performer.kind === 'vampire'
      ? { kind: 'vampire', playerId: entry.playerId }
      : { kind: 'minion', minionId: entry.action.performer.minionId, controllerId: entry.playerId };
  const at = destination ?? actionOrigin(state, observed);
  const data = (withPosition: boolean): { [key: string]: Json } => {
    const d: { [key: string]: Json } = {
      actionId: def.id,
      performer: { ...performer },
      targets: {
        cities: [...(targets.cities ?? [])],
        players: [...(targets.players ?? [])],
        minions: [...(targets.minions ?? [])],
      },
    };
    if (withPosition && at !== null) d.at = at;
    return d;
  };
  if (groups.kind === 'public') {
    emit(res, phase, 'action_observed', data(true), undefined, undefined, groups);
    return;
  }
  // Olika publiker som vet olika saker får olika events (V10, V16).
  if (groups.located.length > 0) {
    emit(res, phase, 'action_observed', data(true), undefined, undefined, { kind: 'players', ids: groups.located });
  }
  if (groups.targetOnly.length > 0) {
    emit(res, phase, 'action_observed', data(false), undefined, undefined, { kind: 'players', ids: groups.targetOnly });
  }
}

/**
 * Den som ser en artefaktaktion vet att utföraren har artefakten ("Or you make
 * actions that reveal it", 2.0 Possession; V21). Undetectable-aktioner har inga
 * observatörer och avslöjar därför inget. Har utföraren flera exemplar av samma
 * artefakt räknas det med lägst id.
 */
function revealArtifactUse(
  res: RoundResolution,
  entry: EntryRecord,
  def: ActionDefinition,
  groups: ReturnType<typeof observerGroups>,
): void {
  const key = def.category === 'artifact' ? def.requires?.artifact : undefined;
  if (!key || entry.action.performer.kind !== 'vampire') return;
  const state = res.state;
  const held = sortedValues(state.artifacts as GameState['artifacts']).find(
    (a) => a.definition === key && a.holder.kind === 'player' && a.holder.id === entry.playerId,
  );
  if (!held) return;
  const observers =
    groups.kind === 'public' ? sortedIds(state.players as GameState['players']) : [...groups.located, ...groups.targetOnly];
  for (const pid of observers) {
    if (pid !== entry.playerId) learnArtifactHolder(state, pid as PlayerId, held.id, def.id);
  }
}

function applyOutcome(res: RoundResolution, entry: EntryRecord, outcome: ActionOutcome, phase: PhaseId): void {
  switch (outcome.status) {
    case 'resolved':
      entry.status = 'resolved';
      emit(res, phase, 'action_resolved', { actionId: entry.action.actionId }, entry.playerId, entry.id);
      return;
    case 'failed': {
      entry.status = 'failed';
      entry.reason = outcome.reason;
      const player = res.state.players[entry.playerId];
      if (player && entry.paid > 0) player.blood += entry.paid;
      emit(
        res,
        phase,
        'action_failed',
        { actionId: entry.action.actionId, reason: outcome.reason, refund: entry.paid },
        entry.playerId,
        entry.id,
      );
      return;
    }
    case 'interrupt': {
      entry.status = 'awaiting';
      const n = res.events.filter((e) => e.kind === 'interrupt_opened' && e.entryId === entry.id).length;
      const interrupt: Interrupt = { id: `${entry.id}:${outcome.kind}:${n}`, kind: outcome.kind, entryId: entry.id, data: outcome.data };
      res.pendingInterrupts.push(interrupt);
      emit(res, phase, 'interrupt_opened', { interruptId: interrupt.id, kind: outcome.kind }, entry.playerId, entry.id);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Fas 5d: räkna upp ronden eller avsluta spelet.

function advanceRound(res: RoundResolution): void {
  const { state } = res;
  if (state.round >= state.maxRounds) {
    state.phase = 'finished';
    emit(res, '5d_advance_round', 'game_finished', { round: state.round }, undefined, undefined, PUBLIC);
    return;
  }
  state.round += 1;
  state.phase = 'submission';
  // Utgångna stadsmodifiers (t.ex. rondens bleeds, E7) tas bort så att state inte växer.
  for (const id of sortedIds(state.cities)) {
    const city = state.cities[id]!;
    city.modifiers = city.modifiers.filter((m) => m.expiresAfterRound === null || m.expiresAfterRound >= state.round);
  }
  for (const pid of sortedPlayerIds(state)) {
    const p = state.players[pid]!;
    p.actionBudgetModifiers = p.actionBudgetModifiers.filter((m) => m.round >= state.round);
  }
  emit(res, '5d_advance_round', 'round_advanced', { round: state.round }, undefined, undefined, PUBLIC);
}
