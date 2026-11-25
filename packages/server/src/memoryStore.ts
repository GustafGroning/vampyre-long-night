/**
 * Store i minnet, med samma semantik som RPC-funktionerna i Supabase-migrationen.
 * För tester och lokal utveckling. Allt kopieras in och ut som JSON, så att
 * anropare aldrig delar referenser med lagringen (som i en riktig databas).
 */
import type { GameState, RoundEvent, RoundResolution, Submission } from '@vampyre/engine';
import type { CampaignRole, CampaignSummary } from './api.js';
import type { AuthAdmin, CommitArgs, LoadedGame, Membership, Store, StoredRound } from './store.js';

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  state: GameState;
  version: number;
  rounds: Map<number, StoredRound & { resolution: RoundResolution | null }>;
  submissions: Map<number, Map<string, Submission>>;
  events: Map<number, RoundEvent[]>;
  members: Map<string, Membership & { displayName: string | null }>;
}

export interface MemoryUser {
  id: string;
  email: string;
  password: string;
  platformAdmin: boolean;
}

export class MemoryStore implements Store, AuthAdmin {
  readonly campaigns = new Map<string, Campaign>();
  readonly users = new Map<string, MemoryUser>();
  private seq = 0;

  addUser(email: string, opts: { platformAdmin?: boolean; password?: string; id?: string } = {}): string {
    const id = opts.id ?? `user-${++this.seq}`;
    this.users.set(id, { id, email, password: opts.password ?? 'password', platformAdmin: opts.platformAdmin ?? false });
    return id;
  }

  async createUser(email: string, password: string): Promise<string> {
    if (this.userIdByEmailSync(email)) throw new Error('E-postadressen finns redan');
    return this.addUser(email, { password });
  }

  private userIdByEmailSync(email: string): string | null {
    const e = email.trim().toLowerCase();
    for (const u of this.users.values()) if (u.email.toLowerCase() === e) return u.id;
    return null;
  }

  private campaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  async userCampaigns(userId: string): Promise<CampaignSummary[]> {
    const out: CampaignSummary[] = [];
    for (const c of [...this.campaigns.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      const m = c.members.get(userId);
      if (m) out.push({ campaignId: c.id, name: c.name, role: m.role, playerId: m.playerId });
    }
    return out;
  }

  async membership(campaignId: string, userId: string): Promise<Membership | null> {
    const m = this.campaign(campaignId)?.members.get(userId);
    return m ? { role: m.role, playerId: m.playerId } : null;
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    return this.users.get(userId)?.platformAdmin === true;
  }

  async userIdByEmail(email: string): Promise<string | null> {
    return this.userIdByEmailSync(email);
  }

  async load(campaignId: string): Promise<LoadedGame | null> {
    const c = this.campaign(campaignId);
    if (!c) return null;
    const latest = Math.max(...c.rounds.keys());
    const r = c.rounds.get(latest)!;
    const prev = [...c.events.keys()].filter((n) => n < c.state.round).sort((a, b) => b - a)[0];
    return copy({
      state: c.state,
      version: c.version,
      round: { round: r.round, seed: r.seed, deadline: r.deadline, status: r.status },
      previousEvents: prev === undefined ? [] : c.events.get(prev)!,
    });
  }

  async assignedPlayers(campaignId: string): Promise<string[]> {
    const c = this.campaign(campaignId);
    if (!c) return [];
    return [...c.members.values()].flatMap((m) => (m.playerId ? [m.playerId] : [])).sort();
  }

  async roundEvents(campaignId: string, round: number): Promise<RoundEvent[] | null> {
    const e = this.campaign(campaignId)?.events.get(round);
    return e ? copy(e) : null;
  }

  async listSubmissions(campaignId: string, round: number): Promise<Record<string, Submission>> {
    const subs = this.campaign(campaignId)?.submissions.get(round);
    return subs ? copy(Object.fromEntries(subs)) : {};
  }

  async saveSubmission(campaignId: string, round: number, playerId: string, submission: Submission): Promise<boolean> {
    const c = this.campaign(campaignId);
    if (c?.rounds.get(round)?.status !== 'open') return false;
    if (!c.submissions.has(round)) c.submissions.set(round, new Map());
    c.submissions.get(round)!.set(playerId, copy(submission));
    return true;
  }

  async closeRound(campaignId: string, round: number): Promise<boolean> {
    const r = this.campaign(campaignId)?.rounds.get(round);
    if (r?.status !== 'open') return false;
    r.status = 'closed';
    return true;
  }

  async reopenRound(campaignId: string, round: number): Promise<boolean> {
    const r = this.campaign(campaignId)?.rounds.get(round);
    if (r?.status !== 'closed') return false;
    r.status = 'open';
    return true;
  }

  async commitRound(a: CommitArgs): Promise<boolean> {
    const c = this.campaign(a.campaignId);
    const r = c?.rounds.get(a.round);
    if (!c || !r) return false;
    if (a.outcome === 'suspended') {
      if (r.status !== 'closed') return false;
      r.status = 'suspended';
      r.resolution = copy(a.resolution);
      return true;
    }
    if (c.version !== a.expectedVersion) return false;
    if (r.status !== 'closed' && r.status !== 'suspended') throw new Error(`rond ${a.round} är inte stängd`);
    if (!a.state) throw new Error('state saknas');
    c.state = copy(a.state);
    c.version += 1;
    r.status = 'resolved';
    r.resolution = null;
    c.events.set(a.round, copy(a.events));
    if (a.next) c.rounds.set(a.next.round, { ...a.next, status: 'open', resolution: null });
    return true;
  }

  async createCampaign(a: {
    campaignId: string;
    name: string;
    createdBy: string;
    state: GameState;
    seed: string;
    deadline: number;
  }): Promise<void> {
    const c: Campaign = {
      id: a.campaignId,
      name: a.name,
      createdAt: ++this.seq,
      state: copy(a.state),
      version: 1,
      rounds: new Map([[a.state.round, { round: a.state.round, seed: a.seed, deadline: a.deadline, status: 'open', resolution: null }]]),
      submissions: new Map(),
      events: new Map(),
      members: new Map([[a.createdBy, { role: 'gm', playerId: null, displayName: null }]]),
    };
    this.campaigns.set(a.campaignId, c);
  }

  async assignMember(a: {
    campaignId: string;
    userId: string;
    role: CampaignRole;
    playerId: string | null;
    displayName: string | null;
  }): Promise<void> {
    const c = this.campaign(a.campaignId);
    if (!c) throw new Error('okänd kampanj');
    if (a.playerId) for (const [uid, m] of c.members) if (uid !== a.userId && m.playerId === a.playerId) m.playerId = null;
    const prev = c.members.get(a.userId);
    c.members.set(a.userId, { role: a.role, playerId: a.playerId, displayName: a.displayName ?? prev?.displayName ?? null });
  }
}
