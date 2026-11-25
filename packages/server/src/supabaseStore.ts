/**
 * Store mot Supabase: varje metod är ett anrop till en RPC-funktion i
 * `supabase/migrations/20261121170000_game_server.sql`, med service role-nyckeln.
 * Bara `fetch`, inga beroenden, så samma kod körs i Deno (edge function) och Node.
 */
import type { GameState, RoundEvent, Submission } from '@vampyre/engine';
import type { CampaignRole, CampaignSummary } from './api.js';
import type { AuthAdmin, CommitArgs, LoadedGame, Membership, Store } from './store.js';

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class SupabaseStore implements Store, AuthAdmin {
  private readonly fetch: typeof fetch;

  constructor(private readonly cfg: SupabaseConfig) {
    this.fetch = cfg.fetch ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.cfg.serviceRoleKey,
      Authorization: `Bearer ${this.cfg.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
  }

  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await this.fetch(`${this.cfg.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) throw new SupabaseError(res.status, `${name}: ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  userCampaigns(userId: string): Promise<CampaignSummary[]> {
    return this.rpc('game_user_campaigns', { _user: userId });
  }

  membership(campaignId: string, userId: string): Promise<Membership | null> {
    return this.rpc('game_membership', { _campaign: campaignId, _user: userId });
  }

  isPlatformAdmin(userId: string): Promise<boolean> {
    return this.rpc('game_is_platform_admin', { _user: userId });
  }

  userIdByEmail(email: string): Promise<string | null> {
    return this.rpc('game_user_id_by_email', { _email: email });
  }

  load(campaignId: string): Promise<LoadedGame | null> {
    return this.rpc('game_load', { _campaign: campaignId });
  }

  assignedPlayers(campaignId: string): Promise<string[]> {
    return this.rpc('game_assigned_players', { _campaign: campaignId });
  }

  roundEvents(campaignId: string, round: number): Promise<RoundEvent[] | null> {
    return this.rpc('game_round_events_get', { _campaign: campaignId, _round: round });
  }

  listSubmissions(campaignId: string, round: number): Promise<Record<string, Submission>> {
    return this.rpc('game_list_submissions', { _campaign: campaignId, _round: round });
  }

  saveSubmission(campaignId: string, round: number, playerId: string, submission: Submission): Promise<boolean> {
    return this.rpc('game_save_submission', { _campaign: campaignId, _round: round, _player: playerId, _submission: submission });
  }

  closeRound(campaignId: string, round: number): Promise<boolean> {
    return this.rpc('game_close_round', { _campaign: campaignId, _round: round });
  }

  reopenRound(campaignId: string, round: number): Promise<boolean> {
    return this.rpc('game_reopen_round', { _campaign: campaignId, _round: round });
  }

  commitRound(a: CommitArgs): Promise<boolean> {
    return this.rpc('game_commit_round', {
      _campaign: a.campaignId,
      _expected_version: a.expectedVersion,
      _round: a.round,
      _outcome: a.outcome,
      _state: a.state,
      _events: a.events,
      _resolution: a.resolution,
      _next_round: a.next?.round ?? null,
      _next_seed: a.next?.seed ?? null,
      _next_deadline_ms: a.next?.deadline ?? null,
    });
  }

  async createCampaign(a: {
    campaignId: string;
    name: string;
    createdBy: string;
    state: GameState;
    seed: string;
    deadline: number;
  }): Promise<void> {
    await this.rpc('game_create_campaign', {
      _id: a.campaignId,
      _name: a.name,
      _created_by: a.createdBy,
      _state: a.state,
      _seed: a.seed,
      _deadline_ms: a.deadline,
    });
  }

  async assignMember(a: {
    campaignId: string;
    userId: string;
    role: CampaignRole;
    playerId: string | null;
    displayName: string | null;
  }): Promise<void> {
    await this.rpc('game_assign_member', {
      _campaign: a.campaignId,
      _user: a.userId,
      _role: a.role,
      _player: a.playerId,
      _display_name: a.displayName,
    });
  }

  /** Supabase Auth admin-API. `email_confirm` = inget mejl behövs (P3). */
  async createUser(email: string, password: string, displayName?: string): Promise<string> {
    const res = await this.fetch(`${this.cfg.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        ...(displayName ? { user_metadata: { name: displayName } } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string };
    if (!res.ok || !body.id) throw new SupabaseError(res.status, body.msg ?? body.message ?? 'Kunde inte skapa användaren');
    return body.id;
  }

  /** Användaren bakom en JWT, eller null om token är ogiltig. */
  async userFromToken(jwt: string): Promise<string | null> {
    const res = await this.fetch(`${this.cfg.url}/auth/v1/user`, {
      headers: { apikey: this.cfg.serviceRoleKey, Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  }
}
