/**
 * Numeriska regelkonstanter. Ligger i content (inte hårdkodade i motorn) så att en
 * kampanj kan justeras utan kodändring (SPEC B11). Värdena följer regelboken.
 */
export interface RulesConfig {
  /** Antal ronder (gd:10). */
  readonly maxRounds: number;
  /** Rule of Three: max bonus per stat och källa (gd:530). */
  readonly statCapPerSource: number;
  /** Max EXP som får spenderas under en kampanj (gd:861). */
  readonly expLifetimeCap: number;
  /** Max för stadens stability och masquerade status (gd:485–487). */
  readonly cityStatMax: number;
  readonly minionMaxLevel: number;
  readonly sabbatBaseMaxLevel: number;
  /** Awaken som krävs för att lämna torpor (gd:206). */
  readonly awakensToLeaveTorpor: number;
  /** Kostnad per rond för att contesta en spelarkontrollerad stad (gd:903). */
  readonly contestCostPerRound: number;
  /** Revolt counters som ger Anarch-övertagande (gd:1084). */
  readonly revoltCountersForTakeover: number;
  /** Max VP som kan stjälas med Claim Credit per rond (gd:987). */
  readonly claimCreditMaxPerRound: number;
  /** Andel städer med violation som avslutar spelet: strikt mer än detta (gd:915). */
  readonly masqueradeCollapseFraction: number;
}

export const DEFAULT_RULES: RulesConfig = {
  maxRounds: 8,
  statCapPerSource: 3,
  expLifetimeCap: 12,
  cityStatMax: 5,
  minionMaxLevel: 3,
  sabbatBaseMaxLevel: 3,
  awakensToLeaveTorpor: 3,
  contestCostPerRound: 50,
  revoltCountersForTakeover: 5,
  claimCreditMaxPerRound: 6,
  masqueradeCollapseFraction: 0.5,
};
