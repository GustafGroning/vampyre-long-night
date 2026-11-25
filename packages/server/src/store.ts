/**
 * Lagringen bakom spelservern. Varje metod är en atomisk operation; i Supabase
 * motsvarar de RPC-funktionerna i `supabase/migrations/20261121170000_game_server.sql`.
 */
import type { GameState, RoundEvent, RoundResolution, Submission } from '@vampyre/engine';
import type { CampaignRole, CampaignSummary, RoundStatus } from './api.js';

export interface Membership {
  role: CampaignRole;
  playerId: string | null;
}

export interface StoredRound {
  round: number;
  seed: string;
  /** Epoch ms. */
  deadline: number;
  status: RoundStatus;
}

export interface LoadedGame {
  state: GameState;
  /** Räknas upp vid varje commit (optimistisk låsning, P8). */
  version: number;
  /** Senaste ronden (öppen, stängd, pausad eller löst om spelet är slut). */
  round: StoredRound;
  /** Events från senast lösta ronden före state.round. */
  previousEvents: RoundEvent[];
}

export interface CommitArgs {
  campaignId: string;
  expectedVersion: number;
  round: number;
  outcome: 'resolved' | 'suspended';
  state: GameState | null;
  events: RoundEvent[];
  resolution: RoundResolution | null;
  next: { round: number; seed: string; deadline: number } | null;
}

export interface Store {
  userCampaigns(userId: string): Promise<CampaignSummary[]>;
  membership(campaignId: string, userId: string): Promise<Membership | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
  userIdByEmail(email: string): Promise<string | null>;
  load(campaignId: string): Promise<LoadedGame | null>;
  /** Spelar-id som har en användare kopplad. */
  assignedPlayers(campaignId: string): Promise<string[]>;
  /** Events för en given (löst) rond. */
  roundEvents(campaignId: string, round: number): Promise<RoundEvent[] | null>;
  listSubmissions(campaignId: string, round: number): Promise<Record<string, Submission>>;
  /** Sparar bara om ronden är öppen. false = stängd. */
  saveSubmission(campaignId: string, round: number, playerId: string, submission: Submission): Promise<boolean>;
  /** open → closed. false = ronden var inte öppen. */
  closeRound(campaignId: string, round: number): Promise<boolean>;
  /** closed → open (om upplösningen misslyckades). */
  reopenRound(campaignId: string, round: number): Promise<boolean>;
  /** Sparar en löst eller pausad rond atomiskt. false = versionen har ändrats. */
  commitRound(args: CommitArgs): Promise<boolean>;
  createCampaign(args: {
    campaignId: string;
    name: string;
    createdBy: string;
    state: GameState;
    seed: string;
    deadline: number;
  }): Promise<void>;
  assignMember(args: {
    campaignId: string;
    userId: string;
    role: CampaignRole;
    playerId: string | null;
    displayName: string | null;
  }): Promise<void>;
}

/** Skapar användarkonton (Supabase Auth admin-API). */
export interface AuthAdmin {
  createUser(email: string, password: string, displayName?: string): Promise<string>;
}
