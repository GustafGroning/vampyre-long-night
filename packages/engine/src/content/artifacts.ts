/**
 * De 30 artefakterna (gd:384–445, SPEC A9) plus en definition för artefakter som
 * skapas med (M)Thaumaturgy (gd:1270).
 *
 * Alla artefaktaktioner har Trifle och kan användas en gång per rond och artefakt
 * (gd:377, 381). Effekterna implementeras av motorn utifrån `key`; texten är
 * regeltexten (stavning normaliserad, se DECISIONS.md S13).
 */
import type { Stat, StealthValue } from '../state/enums.js';
import { CANT_BE_HIDDEN, UNDETECTABLE, stealthMod } from '../state/enums.js';

export const ARTIFACT_KEYS = [
  'aarons_feeding_razor',
  'black_gloves',
  'giants_blood',
  'hand_of_conrad',
  'ivory_bow',
  'martinellis_ring_of_clear_thought',
  'pumping_heart_of_nizchetus',
  'tongue_of_jarthis_the_slaver',
  'vestment_of_vileness',
  'bowl_of_convergence',
  'bloodspot_dice',
  'gangrel_eye',
  'orb_of_ulain',
  'whispers_in_a_bottle',
  'bag_of_gifts',
  'fog_flute',
  'shrek_net_access',
  'crown_of_malkav',
  'ring_of_tremere',
  'scepter_of_ventrue',
  'the_evil_eye',
  'ravnos_boots',
  'the_demeter',
  'diamond_of_toreador',
  'daemon_blood',
  'brujahs_book',
  'signet_of_king_saul',
  'soul_gem_of_etrius',
  'sword_of_judgment',
  'vial_of_elder_blood',
  /** Skapad med (M)Thaumaturgy; speglar en basdisciplin (Artifact.boundDiscipline). */
  'thaumaturgic_creation',
] as const;
export type ArtifactKey = (typeof ARTIFACT_KEYS)[number];

/** Vad en minion får av att bära artefakten (parentesen i gd). */
export type MinionArtifactBonus =
  | { readonly kind: 'stat'; readonly stat: Stat; readonly amount: number }
  /** Scepter of Ventrue: +1 level, max 3. */
  | { readonly kind: 'level'; readonly amount: number }
  /** Bag of Gifts: +5 på alla jakter efter blood. */
  | { readonly kind: 'blood_hunt_bonus'; readonly amount: number }
  /** Orb of Ulain: minionen kan inte Domineras. */
  | { readonly kind: 'cant_be_dominated' }
  /** Ring of Tremere: minionen kan utföra den valda disciplinens basaktion. */
  | { readonly kind: 'bound_discipline_action' };

export interface ArtifactDefinition {
  readonly key: ArtifactKey;
  readonly name: string;
  readonly text: string;
  /** Blood-kostnad för artefaktaktionen. `null` = samma som den bundna disciplinens aktion. */
  readonly cost: number | null;
  /** `null` = samma som den bundna disciplinens aktion. */
  readonly stealth: StealthValue | null;
  readonly minionBonus: MinionArtifactBonus | null;
  /** Bränns när aktionen används (Giants' Blood, Vial of Elder Blood). */
  readonly burnsOnUse: boolean;
  /** Aktionen kan användas i torpor. `only` = bara i torpor (Soul Gem). */
  readonly torpor: 'no' | 'allowed' | 'only';
  /** Aktionen kostar ingen action alls, utöver Trifle (Bag of Gifts, The Evil Eye). */
  readonly freeAction: boolean;
  /** Får delas ut slumpvis (startartefakter, My Treasure, Search). */
  readonly inRandomPool: boolean;
}

type Def = Omit<ArtifactDefinition, 'key' | 'burnsOnUse' | 'torpor' | 'freeAction' | 'inRandomPool'> &
  Partial<Pick<ArtifactDefinition, 'burnsOnUse' | 'torpor' | 'freeAction' | 'inRandomPool'>>;

const stat = (s: Stat, amount: number): MinionArtifactBonus => ({ kind: 'stat', stat: s, amount });

const DEFS: Readonly<Record<ArtifactKey, Def>> = {
  aarons_feeding_razor: {
    name: "Aaron's Feeding Razor",
    text: 'Bleed the city you are in. You get 2d10 x2.',
    cost: 0,
    stealth: stealthMod(1),
    minionBonus: stat('strength', 1),
  },
  black_gloves: {
    name: 'Black Gloves',
    text: 'Get +2 Strength.',
    cost: 5,
    stealth: UNDETECTABLE,
    minionBonus: stat('strength', 1),
  },
  giants_blood: {
    name: "Giants' Blood",
    text: 'Name a vampire in torpor. The named vampire awakens from torpor and then burns this artifact. You can still make this action even if you are in torpor.',
    cost: 0,
    stealth: stealthMod(2),
    minionBonus: null,
    burnsOnUse: true,
    torpor: 'allowed',
  },
  hand_of_conrad: {
    name: 'Hand of Conrad',
    text: 'This round, in combat the GM rolls +3 dice for you and picks the best one as the result.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  ivory_bow: {
    name: 'Ivory Bow',
    text: 'This round if you win a combat and the opponent rolls on the wounds table they get -1 on that roll.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  martinellis_ring_of_clear_thought: {
    name: "Martinelli's Ring of Clear Thought",
    text: 'Get +2 intercept for the rest of the round. If you have the Dementation discipline, lose it for as long as you are in possession of this artifact.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('intercept', 1),
  },
  pumping_heart_of_nizchetus: {
    name: 'Pumping Heart of Nizchetus',
    text: 'If you are in your domain all hunt rolls targeting you get -2.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('stealth', 1),
  },
  tongue_of_jarthis_the_slaver: {
    name: 'Tongue of Jarthis the Slaver',
    text: 'Get +1 Stealth on all faction actions this round.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('stealth', 1),
  },
  vestment_of_vileness: {
    name: 'Vestment of Vileness',
    text: "Get a lvl 1 zombie minion. This minion doesn't cost upkeep. This minion can only do the Move and Hunt for me action. This minion can't be dominated. If the minion is defeated in combat it's burnt and the opposing player gains this artifact. (Players will still see the minion in player stats.)",
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  bowl_of_convergence: {
    name: 'Bowl of Convergence',
    text: 'Learn of one random vampire and minion in the same city as you.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('intercept', 1),
  },
  bloodspot_dice: {
    name: 'Bloodspot Dice',
    text: 'The GM rolls a D20. Gain the rolled amount x2 in blood. If a 1 is rolled, lose 20 Blood.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  gangrel_eye: {
    name: 'Gangrel Eye',
    text: 'If you fail a hunt roll this round, reroll it with +1 to the result.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('intercept', 1),
  },
  orb_of_ulain: {
    name: 'Orb of Ulain',
    text: 'All hunt rolls targeting you for a Dementation, Dominate and Auspex action get -2.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: { kind: 'cant_be_dominated' },
  },
  whispers_in_a_bottle: {
    name: 'Whispers in a Bottle',
    text: 'Learn of one random action performed by a vampire of your choice.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: stat('intercept', 1),
  },
  bag_of_gifts: {
    name: 'Bag of Gifts',
    text: "Give another vampire 10 blood, this doesn't cost an action.",
    cost: 0,
    stealth: stealthMod(1),
    minionBonus: { kind: 'blood_hunt_bonus', amount: 5 },
    freeAction: true,
  },
  fog_flute: {
    name: 'Fog Flute',
    text: 'Give a city -1 intercept until the end of round.',
    cost: 0,
    stealth: stealthMod(2),
    minionBonus: stat('stealth', 1),
  },
  shrek_net_access: {
    name: 'S.H.R.E.K NET Access',
    text: 'Learn of all vampires that made a Move action this round.',
    cost: 10,
    stealth: stealthMod(3),
    minionBonus: stat('intercept', 1),
  },
  crown_of_malkav: {
    name: 'Crown of Malkav',
    text: 'If a vampire uses any dementation action this round, gain a random screen picture from a random chat.',
    cost: 5,
    stealth: UNDETECTABLE,
    minionBonus: stat('intercept', 1),
  },
  ring_of_tremere: {
    name: 'Ring of Tremere',
    text: 'When you gain this artifact choose a discipline. You can perform that discipline action on basic. (Cost and Stealth is the same as the chosen discipline.)',
    cost: null,
    stealth: null,
    minionBonus: { kind: 'bound_discipline_action' },
  },
  scepter_of_ventrue: {
    name: 'Scepter of Ventrue',
    text: 'Move a minion you control to any city.',
    cost: 15,
    stealth: stealthMod(1),
    minionBonus: { kind: 'level', amount: 1 },
  },
  the_evil_eye: {
    name: 'The Evil Eye',
    text: 'Name a vampire, that vampire loses 5 blood. This does not cost an action.',
    cost: 0,
    stealth: stealthMod(3),
    minionBonus: null,
    freeAction: true,
  },
  ravnos_boots: {
    name: 'Ravnos Boots',
    text: 'Move to an adjacent city.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  the_demeter: {
    name: 'The Demeter',
    text: 'Move to any port city.',
    cost: 20,
    stealth: stealthMod(1),
    minionBonus: null,
  },
  diamond_of_toreador: {
    name: 'Diamond of Toreador',
    text: 'All players learn what city you are in. Gain 25 blood.',
    cost: 0,
    stealth: CANT_BE_HIDDEN,
    minionBonus: null,
  },
  daemon_blood: {
    name: 'Daemon Blood',
    text: 'Gain +3 in all stats until the end of the round then enter torpor in the city you are in.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  brujahs_book: {
    name: "Brujah's Book",
    text: 'Name a city, it gets -1 stability and +1 MS.',
    cost: 15,
    stealth: stealthMod(1),
    minionBonus: null,
  },
  signet_of_king_saul: {
    name: 'The Signet of King Saul',
    text: 'Your actions become undetectable for inner circle members this round.',
    cost: 10,
    stealth: UNDETECTABLE,
    minionBonus: null,
  },
  soul_gem_of_etrius: {
    name: 'The Soul Gem of Etrius',
    text: 'You may only perform this action if you are in torpor. If you are diablerised, and the vampire that diablerised you wins the campaign, you win instead.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
    torpor: 'only',
  },
  sword_of_judgment: {
    name: 'Sword of Judgment',
    text: 'Gain +3 strength in combat against vampires that have performed a successful Diablerie action during this campaign. This effect lasts until the end of the round.',
    cost: 5,
    stealth: stealthMod(0),
    minionBonus: null,
  },
  vial_of_elder_blood: {
    name: 'Vial of Elder Blood',
    text: 'Gain all disciplines on basic and mastered until the end of the round. This artifact is burned.',
    cost: 0,
    stealth: UNDETECTABLE,
    minionBonus: null,
    burnsOnUse: true,
  },
  thaumaturgic_creation: {
    name: 'Thaumaturgic creation',
    text: 'An artifact created with (M) Thaumaturgy. Its action is the basic action of the bound discipline, with the same cost and stealth.',
    cost: null,
    stealth: null,
    minionBonus: null,
    inRandomPool: false,
  },
};

export const ARTIFACT_DEFINITIONS: Readonly<Record<ArtifactKey, ArtifactDefinition>> = Object.fromEntries(
  ARTIFACT_KEYS.map((key) => {
    const d = DEFS[key];
    const def: ArtifactDefinition = {
      key,
      name: d.name,
      text: d.text,
      cost: d.cost,
      stealth: d.stealth,
      minionBonus: d.minionBonus,
      burnsOnUse: d.burnsOnUse ?? false,
      torpor: d.torpor ?? 'no',
      freeAction: d.freeAction ?? false,
      inRandomPool: d.inRandomPool ?? true,
    };
    return [key, def];
  }),
) as Record<ArtifactKey, ArtifactDefinition>;

/** Artefakter vars aktion kräver en bunden disciplin. */
export const ARTIFACTS_WITH_BOUND_DISCIPLINE: readonly ArtifactKey[] = ['ring_of_tremere', 'thaumaturgic_creation'];

export function requiresBoundDiscipline(key: ArtifactKey): boolean {
  return ARTIFACTS_WITH_BOUND_DISCIPLINE.includes(key);
}

