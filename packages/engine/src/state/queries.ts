/**
 * Härledda värden. Allt som kan räknas fram ur state räknas här i stället för att
 * lagras (VP, domän, stadens sekt, effektiva stats, budget).
 *
 * Alla funktioner är rena: de läser state och content och ändrar ingenting.
 */
import type { Content } from '../content/index.js';
import { UNTITLED } from '../content/titles.js';
import type {
  CityStat,
  Discipline,
  DisciplineLevel,
  Faction,
  Stat,
  Title,
} from './enums.js';
import type { ArtifactId, CityId, MinionId, PlayerId } from './ids.js';
import { sortedIds, sortedValues } from './json.js';
import type {
  Artifact,
  ArtifactHolder,
  City,
  CityModifier,
  GameState,
  Minion,
  Player,
  StatModifier,
} from './types.js';

// ---------------------------------------------------------------------------
// Uppslag
// ---------------------------------------------------------------------------

export function getPlayer(state: GameState, id: PlayerId): Player {
  const p = state.players[id];
  if (!p) throw new Error(`Okänd spelare ${id}`);
  return p;
}

export function getMinion(state: GameState, id: MinionId): Minion {
  const m = state.minions[id];
  if (!m) throw new Error(`Okänd minion ${id}`);
  return m;
}

export function getCity(state: GameState, id: CityId): City {
  const c = state.cities[id];
  if (!c) throw new Error(`Okänd stad ${id}`);
  return c;
}

export function getArtifact(state: GameState, id: ArtifactId): Artifact {
  const a = state.artifacts[id];
  if (!a) throw new Error(`Okänd artefakt ${id}`);
  return a;
}

// ---------------------------------------------------------------------------
// Stats och Rule of Three
// ---------------------------------------------------------------------------

/** Om en modifier fortfarande gäller i given rond. */
export function isActive(mod: { readonly expiresAfterRound: number | null }, round: number): boolean {
  return mod.expiresAfterRound === null || mod.expiresAfterRound >= round;
}

/**
 * Effektivt värde för en stat: bas + summan per källa, där varje källas
 * sammanlagda *bonus* kapas vid `cap` (Rule of Three, gd:530). Avdrag kapas inte.
 * Modifiers med `ignoresRuleOfThree` (Charge-strength gd:162, Diablerie) läggs till okapat.
 */
export function effectiveStat(
  base: number,
  modifiers: readonly StatModifier[],
  stat: Stat,
  round: number,
  cap: number,
): number {
  const perSource = new Map<string, number>();
  let uncapped = 0;
  for (const m of modifiers) {
    if (m.stat !== stat || !isActive(m, round)) continue;
    if (m.ignoresRuleOfThree) {
      uncapped += m.amount;
      continue;
    }
    perSource.set(m.source, (perSource.get(m.source) ?? 0) + m.amount);
  }
  let total = base + uncapped;
  for (const sum of perSource.values()) total += Math.min(sum, cap);
  return total;
}

/** En vampyrs effektiva stat i nuvarande rond. Bas 0; allt annat är modifiers. */
export function playerStat(state: GameState, content: Content, playerId: PlayerId, stat: Stat): number {
  const p = getPlayer(state, playerId);
  return effectiveStat(0, p.modifiers, stat, state.round, content.rules.statCapPerSource);
}

/** Artefakten en minion bär, eller `null` (högst en, gd:379). */
export function minionArtifact(state: GameState, minionId: MinionId): Artifact | null {
  for (const a of sortedValues(state.artifacts)) {
    if (a.holder.kind === 'minion' && a.holder.id === minionId) return a;
  }
  return null;
}

/** Minionens effektiva level: bas + Scepter of Ventrue, max `minionMaxLevel`. */
export function minionEffectiveLevel(state: GameState, content: Content, minionId: MinionId): number {
  const m = getMinion(state, minionId);
  const art = minionArtifact(state, minionId);
  const bonus = art ? content.artifacts[art.definition].minionBonus : null;
  const extra = bonus?.kind === 'level' ? bonus.amount : 0;
  return Math.min(m.level + extra, content.rules.minionMaxLevel);
}

/**
 * Minionens effektiva stat: effektiv level som bas (gd:215), plus modifiers och
 * en buren artefakts minionbonus (som egen källa `artifact:<key>`).
 */
export function minionStat(state: GameState, content: Content, minionId: MinionId, stat: Stat): number {
  const m = getMinion(state, minionId);
  const mods: StatModifier[] = [...m.modifiers];
  const art = minionArtifact(state, minionId);
  if (art) {
    const bonus = content.artifacts[art.definition].minionBonus;
    if (bonus?.kind === 'stat' && bonus.stat === stat) {
      mods.push({ stat, amount: bonus.amount, source: `artifact:${art.definition}`, expiresAfterRound: null });
    }
  }
  return effectiveStat(minionEffectiveLevel(state, content, minionId), mods, stat, state.round, content.rules.statCapPerSource);
}

// ---------------------------------------------------------------------------
// Städer
// ---------------------------------------------------------------------------

function cityBase(city: City, stat: CityStat): number {
  switch (stat) {
    case 'stability':
      return city.stability;
    case 'masquerade':
      return city.masquerade;
    case 'intercept':
      return city.intercept;
    case 'bloodFlow':
      return city.bloodFlow;
  }
}

/**
 * Stadens effektiva stat: permanent värde + aktiva modifiers. Stability och
 * masquerade kläms till 0..cityStatMax, intercept och blood flow till ≥ 0.
 */
export function cityStat(state: GameState, content: Content, cityId: CityId, stat: CityStat): number {
  const city = getCity(state, cityId);
  let v = cityBase(city, stat);
  for (const m of city.modifiers as readonly CityModifier[]) {
    if (m.stat === stat && isActive(m, state.round)) v += m.amount;
  }
  const max = stat === 'stability' || stat === 'masquerade' ? content.rules.cityStatMax : Infinity;
  return Math.max(0, Math.min(v, max));
}

export function isContested(city: City): boolean {
  return city.contestants.length > 0;
}

export function areAdjacent(state: GameState, a: CityId, b: CityId): boolean {
  return getCity(state, a).adjacent.includes(b);
}

/** Om två hamnar delar en havsregion (Sail, gd:1184). Stormen kontrolleras separat. */
export function sharedSeaRegions(state: GameState, a: CityId, b: CityId): string[] {
  const ca = getCity(state, a);
  const cb = getCity(state, b);
  if (!ca.isPort || !cb.isPort) return [];
  return ca.seaRegions.filter((r) => cb.seaRegions.includes(r));
}

/** Städer en spelare kontrollerar, i id-ordning. */
export function controlledCityIds(state: GameState, playerId: PlayerId): CityId[] {
  return sortedValues(state.cities)
    .filter((c) => c.controllerId === playerId)
    .map((c) => c.id);
}

/**
 * Stadens sekt = controllerns *skenbara* sekt (M3). Okontrollerad stad: `null`.
 * Contested stad behåller controllerns sekt, eftersom controllern finns kvar (gd:507).
 */
export function citySect(state: GameState, cityId: CityId): Faction | null {
  const city = getCity(state, cityId);
  if (city.controllerId === null) return null;
  return apparentFaction(getPlayer(state, city.controllerId));
}

// ---------------------------------------------------------------------------
// Titlar, sekt, domän
// ---------------------------------------------------------------------------

/** Den titel omvärlden ser: förklädnaden för en dold Archbishop. */
export function apparentTitle(player: Player): Title | null {
  return player.disguise ? player.disguise.title : player.title;
}

/** Den sekt omvärlden ser: förklädnadens sekt för en dold Archbishop. */
export function apparentFaction(player: Player): Faction {
  return player.disguise ? player.disguise.faction : player.faction;
}

export function isHiddenArchbishop(player: Player): boolean {
  return player.title === 'archbishop' && player.disguise !== null;
}

/**
 * Titeln som styr vilka titelaktioner spelaren får använda och budgeten: en dold
 * Archbishop använder förklädnadens (gd:635).
 */
export function actingTitle(player: Player): Title | null {
  return isHiddenArchbishop(player) ? apparentTitle(player) : player.title;
}

/**
 * Spelarens domän (gd:534): kontrollerade städer för Prince/Baron/Archbishop och
 * vampyrer utan titel; alla Camarilla-städer för Justicar och Inner Circle.
 * En dold Archbishop med förklädnad följer förklädnadens titel, som är en stadstitel.
 */
export function domainCityIds(state: GameState, content: Content, playerId: PlayerId): CityId[] {
  const p = getPlayer(state, playerId);
  const title = actingTitle(p);
  const rule = title ? content.titles[title].domain : 'controlled_cities';
  if (rule === 'camarilla_cities') {
    return sortedIds(state.cities).filter((id) => citySect(state, id) === 'camarilla');
  }
  return controlledCityIds(state, playerId);
}

export function isInDomain(state: GameState, content: Content, playerId: PlayerId): boolean {
  const p = getPlayer(state, playerId);
  return p.location !== null && domainCityIds(state, content, playerId).includes(p.location);
}

/**
 * Grundbudget för vampyraktioner denna rond, före extra källor (Royal Privileges,
 * Sabbat schemes, `actionBudgetModifiers`). Beslut M6:
 * bränd 0, torpor 1, utan titel 3, dold Archbishop = förklädnadens titel.
 */
export function baseActionBudget(state: GameState, content: Content, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  if (p.status === 'burned') return 0;
  if (p.status === 'torpor') return 1;
  const title = actingTitle(p);
  return title ? content.titles[title].actionsPerRound : UNTITLED.actionsPerRound;
}

/**
 * Röster i Ivory Tower utifrån titel (gd:582–585), utan Buy Votes och Elysium.
 * Skenbar sekt avgör, så en Archbishop förklädd till Prince röstar som Prince.
 * Vampyrer utanför Camarilla har 0 (de kan rösta via Buy Votes, gd:578).
 */
export function baseIvoryTowerVotes(content: Content, player: Player): number {
  if (player.status === 'burned') return 0;
  if (apparentFaction(player) !== 'camarilla') return 0;
  const title = apparentTitle(player);
  return title ? content.titles[title].ivoryTowerVotes : UNTITLED.camarillaIvoryTowerVotes;
}

// ---------------------------------------------------------------------------
// VP
// ---------------------------------------------------------------------------

/** Aktuell VP = summan av ledgern. */
export function playerVp(player: Player): number {
  let vp = 0;
  for (const e of player.vpLedger) vp += e.amount;
  return vp;
}

/** VP vid slutpoängräkning: 0 för vampyrer i torpor eller brända (gd:561). */
export function finalScore(player: Player): number {
  return player.status === 'active' ? playerVp(player) : 0;
}

// ---------------------------------------------------------------------------
// Discipliner
// ---------------------------------------------------------------------------

/**
 * Om spelaren har disciplinen på minst angiven nivå i nuvarande rond.
 * Räknar permanenta och tillfälliga discipliner. Martinelli's Ring tar bort
 * Dementation så länge den bärs (gd:397).
 */
export function hasDiscipline(
  state: GameState,
  playerId: PlayerId,
  discipline: Discipline,
  level: DisciplineLevel = 'basic',
): boolean {
  const p = getPlayer(state, playerId);
  if (discipline === 'dementation' && holdsArtifact(state, playerId, 'martinellis_ring_of_clear_thought')) {
    return false;
  }
  const ok = (l: DisciplineLevel | undefined): boolean =>
    l !== undefined && (level === 'basic' || l === 'mastered');
  if (ok(p.disciplines[discipline])) return true;
  return p.temporaryDisciplines.some(
    (t) => t.discipline === discipline && t.expiresAfterRound >= state.round && ok(t.level),
  );
}

// ---------------------------------------------------------------------------
// Artefakter och minions
// ---------------------------------------------------------------------------

function sameHolder(a: ArtifactHolder, b: ArtifactHolder): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'pool' || b.kind === 'pool') return true;
  return a.id === (b as { id: string }).id;
}

export function artifactsHeldBy(state: GameState, holder: ArtifactHolder): Artifact[] {
  return sortedValues(state.artifacts)
    .filter((a) => sameHolder(a.holder, holder));
}

export function holdsArtifact(state: GameState, playerId: PlayerId, key: Artifact['definition']): boolean {
  return artifactsHeldBy(state, { kind: 'player', id: playerId }).some((a) => a.definition === key);
}

/** Staden där artefakten finns, via bäraren. `null` för pool, NPC eller bränd bärare. */
export function artifactLocation(state: GameState, artifactId: ArtifactId): CityId | null {
  const h = getArtifact(state, artifactId).holder;
  switch (h.kind) {
    case 'player':
      return getPlayer(state, h.id).location;
    case 'minion':
      return getMinion(state, h.id).location;
    case 'city':
      return h.id;
    case 'npc':
    case 'pool':
      return null;
  }
}

export function minionsOwnedBy(state: GameState, playerId: PlayerId): Minion[] {
  return sortedValues(state.minions)
    .filter((m) => m.owner.kind === 'player' && m.owner.id === playerId);
}

/** Upkeep per rond (gd:249–358). Vestment-zombien har ingen upkeep (gd:402). */
export function minionUpkeep(content: Content, minion: Minion): number {
  if (minion.origin.kind === 'vestment_zombie') return 0;
  return content.minionTypes[minion.type].upkeepPerLevel * minion.level;
}

/** Vampyrer (ej brända) i en stad, i id-ordning. */
export function playersInCity(state: GameState, cityId: CityId): Player[] {
  return sortedValues(state.players)
    .filter((p) => p.status !== 'burned' && p.location === cityId);
}

export function minionsInCity(state: GameState, cityId: CityId): Minion[] {
  return sortedValues(state.minions)
    .filter((m) => m.location === cityId);
}
