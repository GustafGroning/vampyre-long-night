/**
 * Spelserverns logik: en operation in, ett svar ut. Ingen HTTP, ingen databas;
 * allt externt går via `ServerContext` (Store, Auth, klocka, slump).
 *
 * Regler som gäller alla operationer:
 * - Spelare får bara sin egen `PlayerView` (buildPlayerView) och sin egen lista.
 *   Seed, andras listor och GameState lämnar aldrig servern (B3, M9).
 * - Inlämning valideras av motorn mot aktuell state (B5) och sparas bara hel.
 */
import {
  DEFAULT_CONTENT,
  DEMO_INPUT,
  buildPlayerView,
  closeRound as closeWindow,
  createGameState,
  expectedPlayers,
  resolveRound,
  sortedIds,
  startGame,
  submitActions,
  type Content,
  type CreateGameInput,
  type GameState,
  type Json,
  type PlayerId,
  type RoundWindow,
  type SubmittedAction,
  type Submission,
} from '@vampyre/engine';
import type {
  ApiErrorCode,
  ApiRequest,
  ApiResponses,
  CampaignRole,
  SavedSubmission,
} from './api.js';
import type { AuthAdmin, LoadedGame, Membership, Store } from './store.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ServerContext {
  /** Inloggad användare (auth.users.id), eller null. */
  userId: string | null;
  store: Store;
  auth: AuthAdmin;
  /** Epoch ms. Motorn har ingen klocka (M10); servern äger tiden. */
  now: () => number;
  /** Ny slumpmässig seed för en rond (M9) och nya kampanj-id. */
  randomSeed: () => string;
  newId: () => string;
  content?: Content;
}

/** Standard-deadline för en ny rond (P9). */
export const DEFAULT_DEADLINE_HOURS = 72;

const bad = (message: string) => new ApiError(400, 'bad_request', message);
const forbidden = (message: string) => new ApiError(403, 'forbidden', message);
const notFound = (message: string) => new ApiError(404, 'not_found', message);
const conflict = (message: string) => new ApiError(409, 'conflict', message);

// ---------------------------------------------------------------------------
// Indata

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw bad(`${name} saknas`);
  return v;
}

function int(v: unknown, name: string, min = 0): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw bad(`${name} måste vara ett heltal ≥ ${min}`);
  return v;
}

function hours(v: unknown): number {
  if (v === undefined) return DEFAULT_DEADLINE_HOURS;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 24 * 60) throw bad('deadlineHours måste vara 0–1440');
  return v;
}

function isJson(v: unknown, depth = 0): v is Json {
  if (depth > 20) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJson(x, depth + 1));
  if (typeof v === 'object') return Object.values(v as object).every((x) => isJson(x, depth + 1));
  return false;
}

/** Plockar bara de fält motorn känner till, så att klienten inte kan smuggla in något. */
export function parseActions(v: unknown): SubmittedAction[] {
  if (!Array.isArray(v)) throw bad('actions måste vara en lista');
  if (v.length > 50) throw bad('För många actions');
  return v.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) throw bad(`actions[${i}] är inte ett objekt`);
    const a = raw as Record<string, unknown>;
    const actionId = str(a.actionId, `actions[${i}].actionId`);
    const p = a.performer as Record<string, unknown> | undefined;
    let performer: SubmittedAction['performer'];
    if (p?.kind === 'vampire') performer = { kind: 'vampire' };
    else if (p?.kind === 'minion') performer = { kind: 'minion', minionId: str(p.minionId, `actions[${i}].performer.minionId`) as never };
    else throw bad(`actions[${i}].performer är ogiltig`);
    const out: SubmittedAction = { actionId, performer };
    if (a.params !== undefined) {
      if (typeof a.params !== 'object' || a.params === null || Array.isArray(a.params) || !isJson(a.params)) {
        throw bad(`actions[${i}].params är ogiltig`);
      }
      out.params = a.params as { [key: string]: Json };
    }
    if (a.key !== undefined) out.key = str(a.key, `actions[${i}].key`);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Hjälpare

function requireUser(ctx: ServerContext): string {
  if (!ctx.userId) throw new ApiError(401, 'unauthenticated', 'Du är inte inloggad');
  return ctx.userId;
}

async function requireMember(ctx: ServerContext, campaignId: string): Promise<Membership> {
  const m = await ctx.store.membership(campaignId, requireUser(ctx));
  // Samma svar för "finns inte" och "inte medlem": avslöjar inte andras kampanjer.
  if (!m) throw notFound('Kampanjen finns inte');
  return m;
}

async function requireGm(ctx: ServerContext, campaignId: string): Promise<void> {
  const m = await requireMember(ctx, campaignId);
  if (m.role !== 'gm') throw forbidden('Bara GM kan göra det');
}

async function requireAdmin(ctx: ServerContext): Promise<string> {
  const user = requireUser(ctx);
  if (!(await ctx.store.isPlatformAdmin(user))) throw forbidden('Bara plattformsadmin kan göra det');
  return user;
}

async function loadGame(ctx: ServerContext, campaignId: string): Promise<LoadedGame> {
  const g = await ctx.store.load(campaignId);
  if (!g) throw notFound('Kampanjen har inget spel');
  return g;
}

function requirePlayer(m: Membership, state: GameState): PlayerId {
  if (!m.playerId) throw forbidden('Du har ingen spelare i kampanjen');
  const id = m.playerId as PlayerId;
  if (!state.players[id]) throw notFound('Din spelare finns inte i spelet');
  return id;
}

function windowOf(game: LoadedGame): RoundWindow {
  return {
    round: game.round.round,
    seed: game.round.seed,
    deadline: game.round.deadline,
    status: game.round.status === 'open' ? 'open' : 'closed',
    submissions: {},
  };
}

function saved(s: Submission | undefined): SavedSubmission | null {
  if (!s) return null;
  return { actions: s.actions, royalPrivilegesToSpend: s.royalPrivilegesToSpend, locked: s.locked, updatedAt: s.updatedAt };
}

function content(ctx: ServerContext): Content {
  return ctx.content ?? DEFAULT_CONTENT;
}

// ---------------------------------------------------------------------------
// Operationer

type Handler<K extends ApiRequest['op']> = (
  req: Extract<ApiRequest, { op: K }>,
  ctx: ServerContext,
) => Promise<ApiResponses[K]>;

const handlers: { [K in ApiRequest['op']]: Handler<K> } = {
  async campaigns(_req, ctx) {
    return ctx.store.userCampaigns(requireUser(ctx));
  },

  async screen(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    const m = await requireMember(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    const playerId = requirePlayer(m, game.state);
    const view = buildPlayerView(game.state, content(ctx), playerId, { events: game.previousEvents });
    const subs = game.round.round === game.state.round ? await ctx.store.listSubmissions(campaignId, game.round.round) : {};
    return {
      campaignId,
      round: game.state.round,
      phase: game.state.phase,
      window: { status: game.round.status, deadline: game.round.deadline },
      view,
      // Bara den egna listan, aldrig andras.
      submission: saved(subs[playerId]),
    };
  },

  async status(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    await requireMember(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    return { round: game.state.round, phase: game.state.phase, windowStatus: game.round.status };
  },

  async submit(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    const round = int(req.round, 'round', 1);
    const actions = parseActions(req.actions);
    const royalPrivilegesToSpend = int(req.royalPrivilegesToSpend ?? 0, 'royalPrivilegesToSpend');
    const m = await requireMember(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    const playerId = requirePlayer(m, game.state);
    if (round !== game.state.round || game.round.round !== round) {
      throw conflict(`Ronden har bytts: aktuell rond är ${game.state.round}`);
    }
    const now = ctx.now();
    const res = submitActions(windowOf(game), game.state, { playerId, actions, royalPrivilegesToSpend }, now, {
      content: content(ctx),
    });
    if (!res.ok) return { ok: false, errors: res.validation.errors.map((e) => e.message) };
    const sub = res.window.submissions[playerId]!;
    // Confirm = spara + lås i ett steg (P5).
    const ok = await ctx.store.saveSubmission(campaignId, round, playerId, { ...sub, locked: true, updatedAt: now });
    if (!ok) return { ok: false, errors: ['Ronden är stängd för inlämning'] };
    return { ok: true };
  },

  async unlock(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    const round = int(req.round, 'round', 1);
    const m = await requireMember(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    const playerId = requirePlayer(m, game.state);
    if (round !== game.round.round) throw conflict(`Ronden har bytts: aktuell rond är ${game.state.round}`);
    const now = ctx.now();
    if (game.round.status !== 'open' || now >= game.round.deadline) throw conflict('Ronden är stängd för inlämning');
    const sub = (await ctx.store.listSubmissions(campaignId, round))[playerId];
    if (sub && sub.locked) {
      const ok = await ctx.store.saveSubmission(campaignId, round, playerId, { ...sub, locked: false, updatedAt: now });
      if (!ok) throw conflict('Ronden är stängd för inlämning');
    }
    return { ok: true };
  },

  async gm_create_campaign(req, ctx) {
    const user = await requireAdmin(ctx);
    const name = str(req.name, 'name').trim();
    const base = req.demo ? DEMO_INPUT : req.input;
    if (!base) throw bad('Ange demo: true eller input');
    const campaignId = ctx.newId();
    const input: CreateGameInput = { ...base, campaignId, seed: ctx.randomSeed() };
    let state: GameState;
    try {
      state = startGame(createGameState(input, content(ctx)));
    } catch (e) {
      throw bad(`Ogiltig kampanj: ${(e as Error).message}`);
    }
    await ctx.store.createCampaign({
      campaignId,
      name,
      createdBy: user,
      state,
      seed: ctx.randomSeed(),
      deadline: ctx.now() + hours(req.deadlineHours) * 3_600_000,
    });
    return { campaignId, players: sortedIds(state.players).map((id) => ({ playerId: id, name: state.players[id]!.name })) };
  },

  async gm_assign(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    await requireGm(ctx, campaignId);
    const role: CampaignRole = req.role === 'gm' ? 'gm' : req.role === 'player' ? 'player' : (() => { throw bad('role måste vara gm eller player'); })();
    const userId = await ctx.store.userIdByEmail(str(req.email, 'email'));
    if (!userId) throw notFound('Ingen användare med den e-postadressen');
    const playerId = req.playerId ?? null;
    if (playerId !== null) {
      const game = await loadGame(ctx, campaignId);
      if (!game.state.players[playerId as PlayerId]) throw bad(`Okänd spelare ${playerId}`);
    } else if (role === 'player') {
      throw bad('En spelare måste ha playerId');
    }
    await ctx.store.assignMember({ campaignId, userId, role, playerId, displayName: req.displayName ?? null });
    return { ok: true };
  },

  async gm_status(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    await requireGm(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    const subs = await ctx.store.listSubmissions(campaignId, game.round.round);
    const assigned = new Set(await ctx.store.assignedPlayers(campaignId));
    return {
      round: game.state.round,
      phase: game.state.phase,
      windowStatus: game.round.status,
      deadline: game.round.deadline,
      players: expectedPlayers(game.state).map((id) => ({
        playerId: id,
        name: game.state.players[id]!.name,
        assigned: assigned.has(id),
        submitted: subs[id] !== undefined,
        locked: subs[id]?.locked === true,
      })),
    };
  },

  async gm_resolve(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    await requireGm(ctx, campaignId);
    const deadlineHours = hours(req.deadlineHours);
    const game = await loadGame(ctx, campaignId);
    const round = game.round.round;
    if (game.round.status !== 'open' || game.state.phase !== 'submission') {
      throw conflict(`Rond ${round} är inte öppen (${game.round.status})`);
    }
    // Stäng först: från och med nu nekas inlämning atomiskt i databasen (P8).
    if (!(await ctx.store.closeRound(campaignId, round))) throw conflict(`Rond ${round} löses redan`);
    try {
      const stored = await ctx.store.listSubmissions(campaignId, round);
      const window: RoundWindow = { ...windowOf(game), submissions: stored as Record<PlayerId, Submission> };
      const { submissions } = closeWindow(window, game.state);
      const result = resolveRound(game.state, submissions, game.round.seed, { content: content(ctx) });
      if (result.status === 'suspended') {
        const ok = await ctx.store.commitRound({
          campaignId,
          expectedVersion: game.version,
          round,
          outcome: 'suspended',
          state: null,
          events: [],
          resolution: result.resolution,
          next: null,
        });
        if (!ok) throw conflict('Kunde inte spara den pausade upplösningen');
        return { status: 'suspended', round, interrupts: result.interrupts.length };
      }
      const next =
        result.state.phase === 'submission'
          ? { round: result.state.round, seed: ctx.randomSeed(), deadline: ctx.now() + deadlineHours * 3_600_000 }
          : null;
      const ok = await ctx.store.commitRound({
        campaignId,
        expectedVersion: game.version,
        round,
        outcome: 'resolved',
        state: result.state,
        events: result.resolution.events,
        resolution: null,
        next,
      });
      if (!ok) throw conflict('Spelet ändrades under upplösningen');
      return { status: 'resolved', round, nextRound: next?.round ?? null, events: result.resolution.events.length };
    } catch (e) {
      // Inget sparades: öppna ronden igen så att GM kan försöka på nytt.
      await ctx.store.reopenRound(campaignId, round);
      if (e instanceof ApiError) throw e;
      throw new ApiError(500, 'internal', `Upplösningen misslyckades: ${(e as Error).message}`);
    }
  },

  async gm_events(req, ctx) {
    const campaignId = str(req.campaignId, 'campaignId');
    await requireGm(ctx, campaignId);
    const game = await loadGame(ctx, campaignId);
    const round = req.round === undefined ? game.state.round - 1 : int(req.round, 'round', 1);
    const events = await ctx.store.roundEvents(campaignId, round);
    if (!events) throw notFound(`Rond ${round} är inte löst`);
    return { round, events };
  },

  async admin_create_user(req, ctx) {
    await requireAdmin(ctx);
    const email = str(req.email, 'email').trim();
    const password = str(req.password, 'password');
    if (password.length < 8) throw bad('Lösenordet måste ha minst 8 tecken');
    const userId = await ctx.auth.createUser(email, password, req.displayName);
    return { userId };
  },
};

/** Kör en operation. Kastar `ApiError` för fel som klienten ska se. */
export async function handle<K extends ApiRequest['op']>(
  req: Extract<ApiRequest, { op: K }>,
  ctx: ServerContext,
): Promise<ApiResponses[K]> {
  if (typeof req !== 'object' || req === null || typeof req.op !== 'string' || !(req.op in handlers)) {
    throw bad('Okänd operation');
  }
  const h = handlers[req.op] as Handler<K>;
  return h(req, ctx);
}
