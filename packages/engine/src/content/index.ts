/**
 * Content: referensdata som motorn läser men aldrig ändrar. Skickas in som
 * argument till motorns funktioner, separat från GameState (SPEC B4/B11).
 */
import type { Clan, Discipline, MinionType, Title } from '../state/enums.js';
import { ARTIFACT_DEFINITIONS, type ArtifactDefinition, type ArtifactKey } from './artifacts.js';
import { CLAN_DEFINITIONS, type ClanDefinition } from './clans.js';
import { DISCIPLINE_DEFINITIONS, type DisciplineDefinition } from './disciplines.js';
import { MINION_TYPE_DEFINITIONS, type MinionTypeDefinition } from './minions.js';
import { DEFAULT_RULES, type RulesConfig } from './rules.js';
import { TITLE_DEFINITIONS, type TitleDefinition } from './titles.js';

export interface Content {
  readonly rules: RulesConfig;
  readonly clans: Readonly<Record<Clan, ClanDefinition>>;
  readonly disciplines: Readonly<Record<Discipline, DisciplineDefinition>>;
  readonly titles: Readonly<Record<Title, TitleDefinition>>;
  readonly minionTypes: Readonly<Record<MinionType, MinionTypeDefinition>>;
  readonly artifacts: Readonly<Record<ArtifactKey, ArtifactDefinition>>;
}

export const DEFAULT_CONTENT: Content = {
  rules: DEFAULT_RULES,
  clans: CLAN_DEFINITIONS,
  disciplines: DISCIPLINE_DEFINITIONS,
  titles: TITLE_DEFINITIONS,
  minionTypes: MINION_TYPE_DEFINITIONS,
  artifacts: ARTIFACT_DEFINITIONS,
};

export * from './artifacts.js';
export * from './clans.js';
export * from './disciplines.js';
export * from './minions.js';
export * from './rules.js';
export * from './titles.js';
export * from './maps/types.js';
export { TEST_MAP } from './maps/testMap.js';
export { BRITISH_ISLES_MAP } from './maps/britishIsles.js';
