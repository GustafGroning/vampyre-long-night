/**
 * Spelets state: allt som förändras under en kampanj.
 *
 * Principer (se docs/decisions/DECISIONS.md, avsnitt "State och typer"):
 * - Ren JSON: inga klasser, Map, Set, Date eller undefined-värden. State ska kunna
 *   serialiseras, lagras och jämföras byte för byte.
 * - Samlingar är `Record<Id, T>`. Iterera alltid via `sortedIds()` när ordningen
 *   kan påverka utfallet.
 * - Referensdata (klaner, artefaktdefinitioner, minion-typer, titlar, kartmallar)
 *   ligger i `Content`, inte här. State refererar till content med nycklar.
 * - Härledbara värden (VP, domän, stadens sekt, effektiva stats) lagras inte;
 *   de räknas fram med funktionerna i `queries.ts`.
 * - Dold information (Sabbat-identitet, Sabbat-baser) ligger i egna fält så att
 *   vy-lagret kan allowlista publika fält utan att plocka bort dolda (M2).
 */

import type {
  Clan,
  CityStat,
  Discipline,
  DisciplineLevel,
  DisguiseTitle,
  Faction,
  MinionLevel,
  MinionType,
  RoundPhase,
  Stat,
  Title,
  VampireStatus,
} from './enums.js';
import type {
  ArtifactId,
  CityFeatureId,
  CityId,
  CombatId,
  DebateId,
  EffectId,
  IdCounters,
  MissionId,
  NpcId,
  PlayerId,
  SeaRegionId,
  MinionId,
} from './ids.js';
import type { ArtifactKey } from '../content/artifacts.js';

/** Godtyckligt JSON-värde, för innehållsdrivna data (problem, missions, debattutfall). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Modifiers och Rule of Three
// ---------------------------------------------------------------------------

/**
 * Källa till en effekt, som sträng på formen `<typ>:<nyckel>`, t.ex.
 * `discipline:protean`, `artifact:black_gloves`, `action:blood_for_blood`,
 * `exp:greater_strength`, `creation:stat_upgrade`, `clan:banu_haqim`,
 * `diablerie`. Rule of Three räknas per källa (gd:530): två modifiers med samma
 * källa delar på samma +3-tak.
 */
export type SourceKey = string;

/**
 * En bonus eller ett avdrag på en personlig stat.
 *
 * `expiresAfterRound`: sista rond då modifiern gäller; `null` = permanent.
 * `ignoresRuleOfThree`: sant bara för Strength köpt med blood i Charge (gd:162).
 */
export interface StatModifier {
  readonly stat: Stat;
  readonly amount: number;
  readonly source: SourceKey;
  readonly expiresAfterRound: number | null;
  readonly ignoresRuleOfThree?: true;
}

/** Temporär eller permanent ändring av en stads stat (Free Press, Fog Flute, Shovelhead …). */
export interface CityModifier {
  readonly stat: CityStat;
  readonly amount: number;
  readonly source: SourceKey;
  readonly expiresAfterRound: number | null;
}

// ---------------------------------------------------------------------------
// Spelare (vampyrer)
// ---------------------------------------------------------------------------

/** Förklädnad för en dold Archbishop: den titel och sekt omvärlden ser (gd:635). */
export interface Disguise {
  readonly title: DisguiseTitle;
  readonly faction: Exclude<Faction, 'sabbat'>;
}

export interface TorporState {
  /** Antal Awaken-ticks hittills. Lämnar torpor när `progress >= required`. */
  readonly progress: number;
  /** Normalt 3 (gd:206); 1 om Fortitude var aktiv när vampyren hamnade i torpor. */
  readonly required: number;
  readonly sinceRound: number;
}

/** En rad i VP-ledgern. Alla VP-ändringar spåras till regel och händelse (SPEC A13). */
export interface VpEntry {
  readonly round: number;
  readonly amount: number;
  /** Regeln som gav eller tog VP, t.ex. `start:inner_circle`, `city_taken`, `claim_credit`. */
  readonly rule: string;
  /** Fritt referensfält: stad, motspelare, event-id osv. */
  readonly ref?: string;
}

/** Disciplin som man har tillfälligt (Thaumaturgy, Vial of Elder Blood). */
export interface TemporaryDiscipline {
  readonly discipline: Discipline;
  readonly level: DisciplineLevel;
  readonly source: SourceKey;
  readonly expiresAfterRound: number;
}

/** Permanent aktion som (M)Thaumaturgy gett från en bränd artefakt (gd:1269). */
export interface GrantedArtifactAction {
  readonly artifact: ArtifactKey;
  /** Extra blood-kostnad utöver artefaktens ordinarie (gd:1269: +10). */
  readonly extraCost: number;
  readonly grantedRound: number;
}

/** Budgetändring för en viss rond (Call a Crusade +1, Invite to the Camarilla max 1). */
export interface ActionBudgetModifier {
  /** Ronden effekten gäller. */
  readonly round: number;
  /** `bonus`: lägg till `amount`. `cap`: budgeten är högst `amount`. */
  readonly kind: 'bonus' | 'cap';
  readonly amount: number;
  readonly source: SourceKey;
}

/** Toreador-obsession (gd:825, C8): en artefakt, stad eller minion. */
export type ObsessionTarget =
  | { readonly kind: 'artifact'; readonly id: ArtifactId }
  | { readonly kind: 'city'; readonly id: CityId }
  | { readonly kind: 'minion'; readonly id: MinionId };

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly clan: Clan;

  /** Sann sekt. För en dold Archbishop är detta `sabbat`; omvärlden ser `disguise.faction`. */
  readonly faction: Faction;
  /** Sann titel, `null` om vampyren saknar titel. */
  readonly title: Title | null;
  /** Satt för en Archbishop som inte är exponerad. `null` annars. */
  readonly disguise: Disguise | null;

  readonly status: VampireStatus;
  /** Satt när `status === 'torpor'`, annars `null`. */
  readonly torpor: TorporState | null;
  /** Staden vampyren befinner sig i. `null` endast om bränd. */
  readonly location: CityId | null;

  readonly blood: number;
  /** Blood vid slutet av förra ronden (Lasombra-cursen, gd:785). `null` före första ronden. */
  readonly bloodAtEndOfLastRound: number | null;

  readonly exp: {
    /** Ospenderad EXP (Grow in Power spenderas direkt, men fältet finns för skapandeflödet). */
    readonly unspent: number;
    /** Totalt spenderad EXP under kampanjen. Tak 12 (gd:861). */
    readonly spentTotal: number;
  };

  /**
   * Alla stat-bidrag, per källa. Vampyrens basvärde är 0; permanenta bonusar
   * (uppgraderingar vid skapande, EXP, Diablerie, klan-curse) är modifiers med
   * `expiresAfterRound: null`. Se `effectiveStat`.
   */
  readonly modifiers: readonly StatModifier[];

  readonly disciplines: Readonly<Partial<Record<Discipline, DisciplineLevel>>>;
  readonly temporaryDisciplines: readonly TemporaryDiscipline[];
  readonly grantedArtifactActions: readonly GrantedArtifactAction[];

  readonly royalPrivileges: number;
  /** Aktiv blood hunt, eller `null`. */
  readonly bloodHunt: { readonly calledRound: number } | null;

  /** VP = summan av ledgern (se `playerVp`). Lagras inte separat. */
  readonly vpLedger: readonly VpEntry[];
  /** Städer spelaren redan fått VP för att ta (once per city, gd:519). Sorterad. */
  readonly scoredCities: readonly CityId[];

  /** Har utfört en lyckad Diablerie någon gång (Sword of Judgment, Banu Haqim). */
  readonly hasCommittedDiablerie: boolean;
  readonly obsession: ObsessionTarget | null;
  readonly actionBudgetModifiers: readonly ActionBudgetModifier[];
}

/** NPC som kan äga minions eller ta emot Give (gd:964). Ingen spelmekanik i övrigt än. */
export interface Npc {
  readonly id: NpcId;
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Minions
// ---------------------------------------------------------------------------

export type MinionOwner =
  | { readonly kind: 'player'; readonly id: PlayerId }
  | { readonly kind: 'npc'; readonly id: NpcId };

/** Varifrån minionen kommer, när det påverkar regler (upkeep, tillåtna aktioner). */
export type MinionOrigin =
  | { readonly kind: 'standard' }
  /** Zombie från Vestment of Vileness: ingen upkeep, bara Move och Hunt for Me (gd:402). */
  | { readonly kind: 'vestment_zombie'; readonly artifactId: ArtifactId };

export interface Minion {
  readonly id: MinionId;
  readonly name: string;
  readonly owner: MinionOwner;
  readonly type: MinionType;
  /** 1–3. Är minionens bas för Strength, Stealth och Intercept (gd:215). */
  readonly level: MinionLevel;
  readonly location: CityId;
  readonly modifiers: readonly StatModifier[];
  /** Archon: loyalty counters (gd:332). `null` för andra typer. */
  readonly loyaltyCounters: number | null;
  /** Ronden minionen fåtts. Ingen upkeep den ronden (gd:217). 0 = vid kampanjstart. */
  readonly acquiredRound: number;
  readonly origin: MinionOrigin;
}

// ---------------------------------------------------------------------------
// Artefakter
// ---------------------------------------------------------------------------

/**
 * Var en artefakt finns. En vampyr kan bära hur många som helst, en minion en
 * (gd:379). `city` = ligger i en stad och kan hittas. `pool` = ej utdelad, kan
 * dras slumpvis (My Treasure, startartefakter, Search).
 */
export type ArtifactHolder =
  | { readonly kind: 'player'; readonly id: PlayerId }
  | { readonly kind: 'minion'; readonly id: MinionId }
  | { readonly kind: 'npc'; readonly id: NpcId }
  | { readonly kind: 'city'; readonly id: CityId }
  | { readonly kind: 'pool' };

export interface Artifact {
  readonly id: ArtifactId;
  /** Nyckel i `Content.artifacts`. */
  readonly definition: ArtifactKey;
  readonly holder: ArtifactHolder;
  /**
   * Bunden disciplin: valet för Ring of Tremere (gd:420) eller disciplinen som en
   * (M)Thaumaturgy-skapad artefakt speglar (gd:1270). Annars `null`.
   */
  readonly boundDiscipline: Discipline | null;
}

// ---------------------------------------------------------------------------
// Städer och karta
// ---------------------------------------------------------------------------

/** Problem eller special på en stad. Innehållet är data (C3, C4). */
export interface CityFeature {
  readonly id: CityFeatureId;
  /** Nyckel i problem-/special-katalogen, t.ex. `camarilla_order`, `elysium`. */
  readonly key: string;
  readonly name: string;
  readonly createdRound: number;
  /** Sista rond featuren gäller; `null` tills den tas bort. */
  readonly expiresAfterRound: number | null;
  /** Strukturerade fält (ursprung, hur man förvärrar/lagar, parametrar). */
  readonly data: JsonObject;
}

export interface Contestant {
  readonly playerId: PlayerId;
  readonly sinceRound: number;
}

export interface City {
  readonly id: CityId;
  readonly name: string;
  /** Grannstäder, sorterade. Symmetriskt: om a har b har b a. */
  readonly adjacent: readonly CityId[];
  readonly isPort: boolean;
  /** Havsregioner en hamn ligger vid (Sail). Tom för inlandsstäder. */
  readonly seaRegions: readonly SeaRegionId[];

  /**
   * Controller. En contested stad behåller sin controller (gd:507): staden är
   * inte okontrollerad men ingen får blood flow.
   */
  readonly controllerId: PlayerId | null;
  /** Vampyrer som contestar staden, sorterade på playerId. Tom = inte contested. */
  readonly contestants: readonly Contestant[];

  /** Permanenta värden. Temporära ändringar ligger i `modifiers`. */
  readonly stability: number;
  readonly masquerade: number;
  readonly intercept: number;
  /** Bas-blood flow efter permanenta ändringar (t.ex. Anarch Revolt −10). */
  readonly bloodFlow: number;
  readonly modifiers: readonly CityModifier[];

  /** Prince-influence (gd:911). Nollställs när staden byter controller. */
  readonly influence: number;
  readonly revoltCounters: number;
  readonly problems: readonly CityFeature[];
  readonly specials: readonly CityFeature[];
  /** Aktiv masquerade violation, eller `null` (gd:915). */
  readonly masqueradeViolation: { readonly sinceRound: number } | null;
}

export interface SeaRegion {
  readonly id: SeaRegionId;
  readonly name: string;
  /** Storm som blockerar Sail. `untilEndOfRound` = sista ronden stormen gäller. */
  readonly storm: { readonly untilEndOfRound: number } | null;
}

// ---------------------------------------------------------------------------
// Sabbat (dold information)
// ---------------------------------------------------------------------------

export interface SabbatBase {
  readonly level: 1 | 2 | 3;
  readonly builtRound: number;
}

/** Allt här är synligt endast för Sabbat-spelare (SPEC A14.3, M2). */
export interface SabbatState {
  /** Högst en bas per stad (gd:637). */
  readonly bases: Readonly<Record<CityId, SabbatBase>>;
}

// ---------------------------------------------------------------------------
// Combat (skelett; byggs ut i steg 3)
// ---------------------------------------------------------------------------

export type Combatant =
  | { readonly kind: 'player'; readonly id: PlayerId }
  | { readonly kind: 'minion'; readonly id: MinionId };

export const COMBAT_STEPS = ['standoff', 'charge', 'combat', 'negotiation', 'press', 'ended'] as const;
export type CombatStep = (typeof COMBAT_STEPS)[number];

export interface CombatSide {
  readonly combatant: Combatant;
  /** Minions som hjälper (Bodyguard, Second Tradition). Bränns om sidan förlorar (gd:201). */
  readonly assistingMinions: readonly MinionId[];
  /** Blood spenderat i nuvarande Charge (+1 Strength per 10, utanför Rule of Three). */
  readonly chargeBlood: number;
  readonly ambush: boolean;
}

export interface Combat {
  readonly id: CombatId;
  readonly cityId: CityId;
  readonly createdRound: number;
  /** Vad som startade striden. `fight_for_control` löses i fas 4a (gd:949). */
  readonly trigger:
    | { readonly kind: 'action'; readonly actionKey: string; readonly slot: number }
    | { readonly kind: 'fight_for_control'; readonly cityId: CityId };
  readonly attacker: CombatSide;
  readonly defender: CombatSide;
  readonly step: CombatStep;
  /** Antal gånger förloraren pressat (gd:178). */
  readonly pressCount: number;
  /** Slag per stridsrunda, för audit. */
  readonly rolls: readonly { readonly attacker: readonly number[]; readonly defender: readonly number[] }[];
  readonly outcome:
    | null
    | { readonly kind: 'deal' }
    | { readonly kind: 'decided'; readonly winner: 'attacker' | 'defender'; readonly woundRoll: number | null };
}

// ---------------------------------------------------------------------------
// Justicar-missions, Ivory Tower och pågående effekter
// ---------------------------------------------------------------------------

export interface Mission {
  readonly id: MissionId;
  readonly justicarId: PlayerId;
  /** Nyckel i missionsbiblioteket (C10). */
  readonly templateKey: string;
  readonly title: string;
  /** Maskinkontrollerbart villkor; formatet definieras med missionsbiblioteket. */
  readonly condition: JsonValue;
  readonly reward: { readonly blood: number; readonly vp: number };
  readonly assignedRound: number;
  readonly status: 'active' | 'completed' | 'failed';
  readonly completedRound: number | null;
}

export interface DebateOption {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** Dataformat för effekter definieras med debattbiblioteket (C9). */
  readonly effect: JsonValue;
  /** Alternativet ger Inner Circle +1 VP (gd:542). */
  readonly innerCircleVp: boolean;
}

export interface Debate {
  readonly id: DebateId;
  readonly round: number;
  /** `replacement`: val av ny Inner Circle/Justicar (gd:580). */
  readonly kind: 'regular' | 'replacement';
  readonly templateKey: string;
  readonly title: string;
  readonly options: readonly DebateOption[];
  /** Dolt: vem som röstat vad (gd:578). Röster per spelare och alternativ. */
  readonly votes: Readonly<Record<PlayerId, Readonly<Record<string, number>>>>;
  /** Publikt efter upplösning: totalsiffror och vinnare. */
  readonly result: null | {
    readonly totals: Readonly<Record<string, number>>;
    readonly winningOptionId: string;
  };
}

/**
 * Effekt som lever över flera rondfaser eller ronder och inte hör hemma på en
 * enskild entitet: debattutfall ("Move kostar +10 i 3 ronder"), Wait and Strike,
 * Follow Them, Summon the Storm m.m. `key` och `data` tolkas av regeln som skapade den.
 */
export interface OngoingEffect {
  readonly id: EffectId;
  readonly key: string;
  readonly source: SourceKey;
  /** Spelaren som skapade effekten, om någon. */
  readonly ownerId: PlayerId | null;
  readonly startsRound: number;
  /** Sista ronden effekten gäller; `null` = tills den tas bort. */
  readonly expiresAfterRound: number | null;
  readonly data: JsonObject;
}

// ---------------------------------------------------------------------------
// GameState
// ---------------------------------------------------------------------------

export const STATE_SCHEMA_VERSION = 1;

export interface GameState {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION;
  readonly campaignId: string;
  /**
   * Kampanjens grund-seed. Dold för alla spelare. Rondens seed härleds från den
   * (eller sätts av plattformen när ronden öppnar, M9) med `deriveSeed`.
   */
  readonly seed: string;
  /** 0 under setup; 1..maxRounds under spel. */
  readonly round: number;
  readonly maxRounds: number;
  readonly phase: RoundPhase;
  readonly counters: IdCounters;

  readonly players: Readonly<Record<PlayerId, Player>>;
  readonly npcs: Readonly<Record<NpcId, Npc>>;
  readonly minions: Readonly<Record<MinionId, Minion>>;
  readonly artifacts: Readonly<Record<ArtifactId, Artifact>>;
  readonly cities: Readonly<Record<CityId, City>>;
  readonly seaRegions: Readonly<Record<SeaRegionId, SeaRegion>>;

  readonly sabbat: SabbatState;
  readonly combats: Readonly<Record<CombatId, Combat>>;
  readonly missions: Readonly<Record<MissionId, Mission>>;
  readonly debates: Readonly<Record<DebateId, Debate>>;
  readonly effects: Readonly<Record<EffectId, OngoingEffect>>;

  readonly flags: {
    /** Första masquerade violation i en Camarilla-stad ger ingen blood hunt (gd:915). Gäller kampanjen. */
    readonly camarillaViolationGraceUsed: boolean;
    /** >50 % av städerna har violation ⇒ spelet slut (gd:915). */
    readonly masqueradeCollapsed: boolean;
  };
}

/** Muterbar variant av en typ (rekursiv). För arbetskopior under upplösning. */
export type Mutable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;
