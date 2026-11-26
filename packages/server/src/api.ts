/**
 * Spelserverns API: det som skickas mellan klienten och edge-funktionen `game`.
 * Bara typer, så att webben kan importera dem utan att dra in serverkod.
 *
 * Alla anrop är `POST /functions/v1/game` med `{ op, ... }` och användarens JWT.
 * Svar: 200 med operationens svar, eller 4xx/5xx med `{ error: { code, message } }`.
 */
import type {
  CharacterBuild,
  CharacterSheet,
  CreateGameInput,
  CreationIssue,
  PlayerView,
  RoundEvent,
  SubmittedAction,
} from '@vampyre/engine';

export type CampaignRole = 'gm' | 'player';
export type RoundStatus = 'open' | 'closed' | 'resolved' | 'suspended';

export interface CampaignSummary {
  campaignId: string;
  name: string;
  role: CampaignRole;
  /** Motorns spelar-id (`player-3`), eller null om användaren inte har någon spelare. */
  playerId: string | null;
}

/** Spelarens inlämnade lista, som motorn sparade den. */
export interface SavedSubmission {
  actions: SubmittedAction[];
  royalPrivilegesToSpend: number;
  locked: boolean;
  /** Epoch ms. */
  updatedAt: number;
}

export interface ScreenResponse {
  campaignId: string;
  round: number;
  phase: string;
  window: { status: RoundStatus; deadline: number };
  /** Spelarens filtrerade vy (buildPlayerView). Aldrig GameState. */
  view: PlayerView;
  /** Spelarens lista i aktuell rond, eller null om inget är inlämnat. */
  submission: SavedSubmission | null;
}

/** Billig koll för att se om ronden har bytts (P6). */
export interface StatusResponse {
  round: number;
  phase: string;
  windowStatus: RoundStatus;
}

export type SubmitResponse = { ok: true } | { ok: false; errors: string[] };

export interface GmPlayerStatus {
  playerId: string;
  name: string;
  /** Användaren som spelar, om någon är kopplad. */
  assigned: boolean;
  submitted: boolean;
  locked: boolean;
}

export interface GmStatusResponse {
  round: number;
  phase: string;
  windowStatus: RoundStatus;
  deadline: number;
  players: GmPlayerStatus[];
}

export type GmResolveResponse =
  | { status: 'resolved'; round: number; nextRound: number | null; events: number }
  | { status: 'suspended'; round: number; interrupts: number };

/** Spelarens vampyrer utan kampanj (P16–P17), i skapandeordning. */
export interface CharactersResponse {
  characters: CharacterSheet[];
}

/** Ogiltigt bygge sparas inte; `issues` är motorns fel med `path` (validateCharacterBuild). */
export type CharacterSaveResponse =
  | ({ ok: true; characterId: string } & CharactersResponse)
  | { ok: false; issues: CreationIssue[] };

export type ApiRequest =
  | { op: 'campaigns' }
  /** Ägaren är alltid den inloggade (P17). */
  | { op: 'characters' }
  /** Utan characterId = ny vampyr. */
  | { op: 'character_save'; characterId?: string; build: CharacterBuild }
  | { op: 'character_delete'; characterId: string }
  | { op: 'screen'; campaignId: string }
  | { op: 'status'; campaignId: string }
  | {
      op: 'submit';
      campaignId: string;
      /** Ronden klienten tror att den lämnar in för. Fel rond avvisas. */
      round: number;
      actions: SubmittedAction[];
      royalPrivilegesToSpend: number;
    }
  | { op: 'unlock'; campaignId: string; round: number }
  | {
      op: 'gm_create_campaign';
      name: string;
      /** Antingen motorns demokampanj eller ett eget CreateGameInput (utan campaignId och seed). */
      demo?: boolean;
      input?: Omit<CreateGameInput, 'campaignId' | 'seed'>;
      deadlineHours?: number;
    }
  | {
      op: 'gm_assign';
      campaignId: string;
      email: string;
      role: CampaignRole;
      playerId?: string | null;
      displayName?: string;
    }
  | { op: 'gm_status'; campaignId: string }
  | { op: 'gm_resolve'; campaignId: string; deadlineHours?: number }
  /** Bara GM: hela förra rondens log (B3: full log är GM-only). */
  | { op: 'gm_events'; campaignId: string; round?: number }
  | { op: 'admin_create_user'; email: string; password: string; displayName?: string };

export type ApiOp = ApiRequest['op'];

export interface ApiResponses {
  campaigns: CampaignSummary[];
  characters: CharactersResponse;
  character_save: CharacterSaveResponse;
  character_delete: CharactersResponse;
  screen: ScreenResponse;
  status: StatusResponse;
  submit: SubmitResponse;
  unlock: { ok: true };
  gm_create_campaign: { campaignId: string; players: { playerId: string; name: string }[] };
  gm_assign: { ok: true };
  gm_status: GmStatusResponse;
  gm_resolve: GmResolveResponse;
  gm_events: { round: number; events: RoundEvent[] };
  admin_create_user: { userId: string };
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'internal';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
