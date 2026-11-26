/**
 * Från lobby till kampanjstart: gör om platserna till `CreateGameInput` för
 * `createGameState` (K13, K14).
 *
 * GM placerar varje karaktär i en stad. För stadstitlar (Prince, Baron,
 * förklädd Archbishop) blir staden också deras startstad. Startartefakter (titelns
 * plus My treasure) dras seedat ur kampanjens artefaktpool; resten av poolen
 * ligger kvar för senare dragningar. Ring of Tremere är avstängd (K14).
 */
import { ARTIFACT_KEYS, requiresBoundDiscipline, type ArtifactKey } from '../content/artifacts.js';
import type { Content } from '../content/index.js';
import type { MapTemplate } from '../content/maps/types.js';
import { createRng, deriveSeed } from '../rng.js';
import type { ArtifactSetup, CreateGameInput, PlayerSetup } from '../state/create.js';
import { formatId, type PlayerId } from '../state/ids.js';
import { deriveCharacter } from './build.js';
import type { CampaignLobby } from './lobby.js';
import type { CreationIssue, CreationResult } from './types.js';

export interface SeatPlacement {
  /** Stadsnyckel. För stadstitlar även startstaden. */
  readonly location: string;
}

export interface CampaignSetupInput {
  readonly lobby: CampaignLobby;
  readonly seed: string;
  readonly map: MapTemplate;
  /** GM:s placering per användare. */
  readonly placements: Readonly<Record<string, SeatPlacement>>;
  readonly npcs?: readonly { readonly name: string }[];
  /**
   * Artefakter som finns i kampanjen. Standard: alla med `inRandomPool`, en av
   * varje. Startartefakter dras härifrån; resten blir `artifactPool`.
   */
  readonly artifactKeys?: readonly ArtifactKey[];
  readonly maxRounds?: number;
}

export interface CampaignSetup {
  readonly input: CreateGameInput;
  /** Vilket `PlayerId` varje användare får i state. */
  readonly playerIds: Readonly<Record<string, PlayerId>>;
}

export function buildCampaignInput(setup: CampaignSetupInput, content: Content): CreationResult<CampaignSetup> {
  const issues: CreationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const { lobby } = setup;
  if (lobby.seats.length === 0) add('lobby', 'the campaign has no players');

  const cityKeys = new Set(setup.map.cities.map((c) => c.key));
  const homeCities = new Map<string, string>();

  const deck = createRng(deriveSeed(setup.seed, 'creation', 'artifacts')).shuffle(
    setup.artifactKeys ?? ARTIFACT_KEYS.filter((k) => content.artifacts[k].inRandomPool),
  );
  // Artefakter som kräver ett val när man får dem (Ring of Tremere) kan inte dras än (K14).
  for (const key of setup.artifactKeys ?? []) {
    if (requiresBoundDiscipline(key)) add('artifactKeys', `${key} cannot be in the pool yet: choosing the discipline has no flow`);
  }

  const players: PlayerSetup[] = [];
  const playerIds: Record<string, PlayerId> = {};

  lobby.seats.forEach((seat, i) => {
    const path = `seats[${i}]`;
    const derived = deriveCharacter(seat.build, content, { allowedTitles: lobby.config.allowedTitles });
    if (!derived.ok) {
      for (const issue of derived.issues) add(`${path}.${issue.path}`, issue.message);
      return;
    }
    const c = derived.value;

    const placement = setup.placements[seat.userId];
    if (placement === undefined) {
      add(`${path}.placement`, `${c.name} has no starting location`);
      return;
    }
    if (!cityKeys.has(placement.location)) {
      add(`${path}.placement`, `unknown city "${placement.location}"`);
      return;
    }
    if (c.startsWithCity) {
      const other = homeCities.get(placement.location);
      if (other !== undefined) add(`${path}.placement`, `${placement.location} is already the starting city of ${other}`);
      homeCities.set(placement.location, c.name);
    }

    const artifacts: ArtifactSetup[] = [];
    for (let n = 0; n < c.randomArtifacts; n++) {
      const key = deck.shift();
      if (key === undefined) {
        add(`${path}.artifacts`, 'the artifact pool is not large enough for all starting artifacts');
        break;
      }
      artifacts.push({ definition: key });
    }

    players.push({
      name: c.name,
      clan: c.clan,
      faction: c.faction,
      title: c.title,
      ...(c.disguise !== null ? { disguise: c.disguise } : {}),
      location: placement.location,
      ...(c.startsWithCity ? { controls: [placement.location] } : {}),
      blood: c.blood,
      disciplines: c.disciplines,
      statBonuses: c.statBonuses,
      expSpent: c.expSpent,
      minions: c.minions,
      artifacts,
      royalPrivileges: c.royalPrivileges,
      startingVp: c.startingVp,
      startingCityUpgrades: c.startingCityUpgrades,
    });
    playerIds[seat.userId] = formatId('player', players.length);
  });

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      input: {
        campaignId: lobby.campaignId,
        seed: setup.seed,
        map: setup.map,
        players,
        artifactPool: deck.map((definition) => ({ definition })),
        ...(setup.npcs !== undefined ? { npcs: setup.npcs } : {}),
        ...(setup.maxRounds !== undefined ? { maxRounds: setup.maxRounds } : {}),
      },
      playerIds,
    },
  };
}
