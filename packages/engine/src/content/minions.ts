/**
 * Minion-typer (gd:207–358, SPEC A8): upkeep, rekryteringskostnad och traits.
 * Minionaktionerna hör till aktionskatalogen.
 */
import type { MinionType, Title } from '../state/enums.js';

export const MINION_TRAITS = ['meek', 'trained', 'informant', 'loyal_to_prince', 'camarilla_loyal'] as const;
export type MinionTrait = (typeof MINION_TRAITS)[number];

export interface MinionTypeDefinition {
  readonly key: MinionType;
  readonly name: string;
  /** Upkeep per level och rond: LV1/2/3 = 1×/2×/3× detta värde. */
  readonly upkeepPerLevel: number;
  /** Rekryteringskostnad per level [LV1, LV2, LV3]. */
  readonly recruitCost: readonly [number, number, number];
  /** Titlar som får rekrytera typen; `null` = alla. */
  readonly recruitableBy: readonly Title[] | null;
  readonly traits: readonly MinionTrait[];
  /** Archon: loyalty counters vid start (gd:332). */
  readonly startingLoyalty: number | null;
}

export const MINION_TYPE_DEFINITIONS: Readonly<Record<MinionType, MinionTypeDefinition>> = {
  ghoul: {
    key: 'ghoul',
    name: 'Ghoul',
    upkeepPerLevel: 5,
    recruitCost: [25, 50, 75],
    recruitableBy: null,
    traits: ['meek'],
    startingLoyalty: null,
  },
  harpy: {
    key: 'harpy',
    name: 'Harpy',
    upkeepPerLevel: 15,
    recruitCost: [30, 60, 90],
    recruitableBy: null,
    traits: ['trained'],
    startingLoyalty: null,
  },
  eye: {
    key: 'eye',
    name: 'Eye',
    upkeepPerLevel: 5,
    recruitCost: [20, 40, 60],
    recruitableBy: null,
    traits: ['meek', 'informant'],
    startingLoyalty: null,
  },
  primogen: {
    key: 'primogen',
    name: 'Primogen',
    upkeepPerLevel: 20,
    recruitCost: [40, 80, 120],
    recruitableBy: ['prince'],
    traits: ['loyal_to_prince'],
    startingLoyalty: null,
  },
  archon: {
    key: 'archon',
    name: 'Archon',
    upkeepPerLevel: 0,
    recruitCost: [25, 50, 75],
    recruitableBy: ['justicar'],
    traits: ['trained', 'informant', 'camarilla_loyal'],
    startingLoyalty: 3,
  },
};

/**
 * Specials som Primogen kan bygga med Build on the Master's Kingdom (Long Night
 * 2.0, MINIONS). Nyckeln blir `CityFeature.key`. Camarilla Order och Secure
 * Haven är samma specials som Build My Kingdom ger.
 */
export const PRIMOGEN_SPECIALS: Readonly<Record<'elysium' | 'camarilla_order' | 'secure_haven', { readonly name: string; readonly text: string }>> = {
  elysium: {
    name: 'Elysium',
    text: 'The controller of this city gains +1 vote in the Ivory Tower. This special can be built multiple times in the same city.',
  },
  camarilla_order: {
    name: 'Camarilla Order',
    text: 'Next time someone targets this city with the Troublemaker action, the action fails and this special is burned.',
  },
  secure_haven: {
    name: 'Secure Haven',
    text: 'The next time someone attacks the controller of the city the action fails and this special is burnt. Does not stop combat from a Fight for Control action.',
  },
};

/** Loyalty counters som The Master's Will ger en Archon. */
export const MASTERS_WILL_LOYALTY = 3;
