/**
 * Kampanjens lobby före start: vilken titel GM gett varje spelare, och med
 * vilken karaktär spelaren gått med (K12).
 *
 * GM bestämmer titeln (och förklädnaden för en Archbishop). Spelaren går med
 * antingen med en befintlig karaktär ur sin backlog, som måste ha just den
 * titeln, eller med en ny, som då också sparas i backloggen. Platsen får en
 * kopia av bygget, så att senare ändringar i backloggen inte påverkar kampanjen.
 */
import type { Content } from '../content/index.js';
import { DISGUISE_TITLES, type DisguiseTitle, type Title } from '../state/enums.js';
import { addCharacter, listCharacters, type CharacterBacklog, type CharacterId, type CharacterSheet } from './backlog.js';
import { V1_CREATABLE_TITLES, validateCharacterBuild } from './build.js';
import type { CharacterBuild, CreationIssue } from './types.js';

export interface CampaignLobbyConfig {
  /** Titlar GM får dela ut i kampanjen. Standard: V1:s titlar (utan Justicar). */
  readonly allowedTitles: readonly Title[];
  /** Standard 20 (gd:5). */
  readonly maxPlayers: number;
}

/** Titeln GM gett en spelare. `disguise` krävs för Archbishop, annars `null`. */
export interface TitleAssignment {
  readonly title: Title;
  readonly disguise: DisguiseTitle | null;
}

export interface CampaignSeat {
  readonly userId: string;
  readonly characterId: CharacterId;
  /** Backlog-versionen som kopierades. */
  readonly characterVersion: number;
  readonly build: CharacterBuild;
}

export interface CampaignLobby {
  readonly campaignId: string;
  readonly config: CampaignLobbyConfig;
  /** GM:s titel per användare. Bara spelare med en titel kan gå med. */
  readonly assignments: Readonly<Record<string, TitleAssignment>>;
  /** I anslutningsordning. Ordningen bestämmer player-id vid start. */
  readonly seats: readonly CampaignSeat[];
}

export const DEFAULT_LOBBY_CONFIG: CampaignLobbyConfig = {
  allowedTitles: V1_CREATABLE_TITLES,
  maxPlayers: 20,
};

export function createLobby(campaignId: string, config: Partial<CampaignLobbyConfig> = {}): CampaignLobby {
  return { campaignId, config: { ...DEFAULT_LOBBY_CONFIG, ...config }, assignments: {}, seats: [] };
}

export type LobbyResult =
  | { readonly ok: true; readonly lobby: CampaignLobby }
  | { readonly ok: false; readonly issues: readonly CreationIssue[] };

const matches = (build: CharacterBuild, a: TitleAssignment): boolean =>
  build.title === a.title && build.disguise === a.disguise;

const label = (a: TitleAssignment): string => (a.disguise === null ? a.title : `${a.title} (as ${a.disguise})`);

/**
 * GM ger en spelare en titel. Kan ändras så länge spelaren inte gått med med en
 * karaktär av den gamla titeln; då måste spelaren först lämna.
 */
export function assignTitle(lobby: CampaignLobby, userId: string, assignment: TitleAssignment): LobbyResult {
  const fail = (path: string, message: string): LobbyResult => ({ ok: false, issues: [{ path, message }] });
  if (!lobby.config.allowedTitles.includes(assignment.title)) {
    return fail('title', `the title ${assignment.title} is not used in the campaign`);
  }
  if (assignment.title === 'archbishop') {
    if (assignment.disguise === null || !DISGUISE_TITLES.includes(assignment.disguise)) {
      return fail('disguise', 'an Archbishop must be given a disguise (Prince or Baron)');
    }
  } else if (assignment.disguise !== null) {
    return fail('disguise', 'only an Archbishop has a disguise');
  }
  const seat = lobby.seats.find((s) => s.userId === userId);
  if (seat !== undefined && !matches(seat.build, assignment)) {
    return fail('userId', 'the player has already joined with a character of another title and must leave first');
  }
  return { ok: true, lobby: { ...lobby, assignments: { ...lobby.assignments, [userId]: assignment } } };
}

/** Karaktärer i backloggen som har titeln GM gett spelaren, i skapandeordning. */
export function eligibleCharacters(lobby: CampaignLobby, backlog: CharacterBacklog): CharacterSheet[] {
  const a = lobby.assignments[backlog.ownerId];
  if (a === undefined) return [];
  return listCharacters(backlog).filter((c) => matches(c.build, a));
}

export type JoinRequest =
  | { readonly kind: 'existing'; readonly characterId: CharacterId }
  | { readonly kind: 'new'; readonly build: CharacterBuild };

export type JoinResult =
  | {
      readonly ok: true;
      readonly lobby: CampaignLobby;
      /** Oförändrad för `existing`; med den nya karaktären för `new`. */
      readonly backlog: CharacterBacklog;
      readonly seat: CampaignSeat;
    }
  | { readonly ok: false; readonly issues: readonly CreationIssue[] };

/**
 * Låter backloggens ägare gå med i kampanjen. Kontrollerar att GM gett spelaren
 * en titel, att spelaren inte redan är med, att det finns plats, att karaktären
 * har den tilldelade titeln och att den är giltig.
 */
export function joinCampaign(
  lobby: CampaignLobby,
  backlog: CharacterBacklog,
  request: JoinRequest,
  content: Content,
): JoinResult {
  const fail = (path: string, message: string): JoinResult => ({ ok: false, issues: [{ path, message }] });
  const userId = backlog.ownerId;
  const options = { allowedTitles: lobby.config.allowedTitles };

  const assignment = lobby.assignments[userId];
  if (assignment === undefined) return fail('userId', 'the player has not been given a title in the campaign');
  if (lobby.seats.some((s) => s.userId === userId)) return fail('userId', 'the player is already in the campaign');
  if (lobby.seats.length >= lobby.config.maxPlayers) return fail('lobby', 'the campaign is full');

  let build: CharacterBuild;
  if (request.kind === 'existing') {
    const sheet = backlog.characters[request.characterId];
    if (sheet === undefined) return fail('characterId', `unknown character ${request.characterId}`);
    build = sheet.build;
  } else {
    build = request.build;
  }

  if (!matches(build, assignment)) {
    const own = label({ title: build.title, disguise: build.disguise });
    return fail(
      'title',
      request.kind === 'existing'
        ? `the character is ${own}, but you have been given ${label(assignment)} in the campaign: choose another or create a new one`
        : `the character must be ${label(assignment)}, not ${own}`,
    );
  }

  const issues = validateCharacterBuild(build, content, options);
  if (issues.length > 0) return { ok: false, issues };

  let nextBacklog = backlog;
  let characterId: CharacterId;
  let characterVersion: number;
  if (request.kind === 'existing') {
    characterId = request.characterId;
    characterVersion = (backlog.characters[characterId] as CharacterSheet).version;
  } else {
    const added = addCharacter(backlog, build, content, options);
    if (!added.ok) return added;
    nextBacklog = added.backlog;
    characterId = added.characterId;
    characterVersion = 1;
  }

  const seat: CampaignSeat = { userId, characterId, characterVersion, build };
  return { ok: true, lobby: { ...lobby, seats: [...lobby.seats, seat] }, backlog: nextBacklog, seat };
}

/** Lämnar lobbyn. Titeln från GM ligger kvar; karaktären finns kvar i backloggen. */
export function leaveCampaign(lobby: CampaignLobby, userId: string): CampaignLobby {
  return { ...lobby, seats: lobby.seats.filter((s) => s.userId !== userId) };
}
