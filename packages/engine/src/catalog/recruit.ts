/**
 * Rekryteringskostnad för en minion: typens pris per level, plus A cursed kiss
 * (Hecata-curse: "Recruiting a minion costs +10 blood", E23).
 */
import type { Content } from '../content/index.js';
import type { Clan, MinionType } from '../state/enums.js';

export const CURSED_KISS_EXTRA = 10;

export function recruitCost(content: Content, clan: Clan, type: MinionType, level: number): number {
  const base = content.minionTypes[type].recruitCost[level - 1];
  if (base === undefined) return 0;
  return base + (content.clans[clan].curse.key === 'a_cursed_kiss' ? CURSED_KISS_EXTRA : 0);
}
