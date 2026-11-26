import type { ActionRequirements, CatalogContext, ParamSpec, ProjectedMove } from '../catalog/types.js';
import type { Content, Faction, GameState, MinionId, MinionType, Mutable, Player, Rng, Title, WorkingState } from './deps.js';
import type { ActionId, Audience, EntryRecord, Json, SubmittedAction } from './types.js';
import type { CityId, PlayerId } from './deps.js';

export type ActionCategory = 'personal' | 'faction' | 'minion' | 'discipline' | 'artifact';
export type ActionStealth = number | 'undetectable' | 'cant_be_hidden';

export type ActionOutcome =
  | { status: 'resolved' }
  /** Aktionen kunde inte lösas. Kostnaden återbetalas automatiskt (C11). */
  | { status: 'failed'; reason: string }
  /** Aktionen kräver extern input (t.ex. strid). Upplösningen pausar efter sloten (M11). */
  | { status: 'interrupt'; kind: string; data: { [key: string]: Json } };

/** Det en handler får när dess entry löses. `state` är ett arbetsutkast som får muteras. */
export interface ActionContext {
  state: WorkingState;
  content: Content;
  entry: EntryRecord;
  player: Mutable<Player>;
  /** Egen delström för den här entryn (M9): `action/<entryId>`. */
  rng: Rng;
  /** Skapar ett event. Standardpubliken är den agerande spelaren (M18). */
  emit(kind: string, data?: { [key: string]: Json }, audience?: Audience): void;
  scratch: { [key: string]: Json };
  /** Celerity (M5): lös spelarens `count` nästa pending entries direkt, i samma slot. */
  resolveImmediately(count: number): void;
}

/**
 * Kontext för kostnad, inkomst och extra kontroller. Räknas från spelarens vy
 * (se catalog/types.ts), så att gränssnittet och servern får samma svar.
 */
export type EligibilityContext = CatalogContext;

export interface TargetContext {
  state: GameState;
  content: Content;
  entry: EntryRecord;
}

export interface ActionTargets {
  cities?: CityId[];
  players?: PlayerId[];
  minions?: MinionId[];
}

export interface ActionDefinition {
  id: ActionId;
  name: string;
  category: ActionCategory;
  /** Vem som utför aktionen. Minionaktioner kan bara utföras av minions (A6). */
  performer: 'vampire' | 'minion';
  stealth: ActionStealth;
  /** Blood-kostnad. Variabel kostnad räknas från valen (params) och spelarens vy. */
  cost: number | ((ctx: CatalogContext) => number);
  /** Kostnaden beror på valen även när den inte är 0 utan val (Expansion). Styr `costVaries` i menyn. */
  variableCost?: boolean;
  /**
   * Blood aktionen garanterat ger spelaren (Bottomless Wealth +250). Bara
   * deterministisk inkomst; slumpad (Bleed, Esbat, Bloodspot Dice) anges inte.
   */
  income?: number | ((ctx: CatalogContext) => number);
  /** Första Trifle-aktionen per rond kostar ingen slot i budgeten. */
  trifle?: boolean | ((me: { title: Title | null }) => boolean);
  /** 'free' = räknas aldrig mot budgeten (Give, Buy Votes). */
  slot?: 'normal' | 'free';
  /** Max antal per rond för samma spelare ("once per turn"). */
  maxPerRound?: number;
  /** "En gång per rond och <param>" (Build My Kingdom per stad, Punish Treason per vampyr). */
  oncePerRoundPer?: string;
  /** Krav på titel (effektiv titel, se effectiveTitles). */
  titles?: Title[];
  /** Krav på sekt (effektiv sekt, se effectiveFactions). */
  factions?: Faction[];
  /** För minionaktioner: vilka typer som får utföra den. */
  minionTypes?: MinionType[];
  /** Minionaktion som Vestment of Vileness-zombien får göra (gd:402). */
  zombie?: boolean;
  /** Övriga krav: disciplin, artefakt, titellös, dold/exponerad Archbishop. */
  requires?: ActionRequirements;
  /** Får utföras av vampyren i torpor (Awaken, Giants' Blood, Soul Gem). */
  allowedInTorpor?: boolean;
  /** Måste vara spelarens enda vampyraktion (Go Anarch). */
  exclusive?: boolean;
  /** Inga fler vampyraktioner efter denna (Hide). */
  endsTurn?: boolean;
  /** Vampyren får inte förflytta sig samma rond (Bottomless Wealth). */
  forbidsMovement?: boolean;
  /** Ger en namngiven minion (params.minionId) +1 minionaktion (Anarch Mission). */
  grantsMinionAction?: boolean;
  /**
   * Valen spelaren gör, i ordning. En funktion när senare val beror på tidigare
   * (Organize Resistance: antal val = den brända minionens level).
   */
  params?: readonly ParamSpec[] | ((ctx: CatalogContext) => readonly ParamSpec[]);
  /** Kontroller som spänner över flera val. Returnerar felmeddelande eller null. */
  eligible?: (ctx: CatalogContext) => string | null;
  /** Var aktören (eller dess minions) hamnar om aktionen lyckas. Används för målval längre ner i listan. */
  moves?: (ctx: CatalogContext) => ProjectedMove[];
  /** Egna minions som följer med och inte får agera denna rond (Expansion, Second Tradition). */
  locksMinions?: (ctx: CatalogContext) => MinionId[];
  /**
   * Aktionens mål, läst innan handlern körs. Avgör controller-sikt (målstädernas
   * controller, gd:115) och vad observatörer får veta (M17). Utelämnad = målen
   * läses från params (stad-, vampyr- och minionval).
   */
  targets?: (ctx: TargetContext) => ActionTargets;
  /**
   * Staden utföraren hamnar i om aktionen lyckas (Move, Sail, Second tradition).
   * Läst innan handlern körs. Avgör var observatörer ser utföraren på kartan och
   * ger destinationens controller sikt (M18, V16). Utelämnad = utföraren stannar.
   */
  destination?: (ctx: TargetContext) => CityId | null;
  resolve(ctx: ActionContext): ActionOutcome;
  /** Anropas med plattformens svar när en interrupt från denna aktion besvaras. */
  resume?(ctx: ActionContext, result: { [key: string]: Json }): ActionOutcome;
}

export type ActionRegistry = Readonly<Record<ActionId, ActionDefinition>>;

export function createRegistry(defs: ActionDefinition[]): ActionRegistry {
  const out: Record<ActionId, ActionDefinition> = {};
  for (const d of defs) {
    if (out[d.id]) throw new Error(`Duplicate action definition: ${d.id}`);
    out[d.id] = d;
  }
  return out;
}

/**
 * Titlar vars aktioner spelaren får använda. En dold Archbishop får använda både
 * sina egna och sin förklädnads (gd:635); en exponerad bara Archbishop.
 */
export function effectiveTitles(player: Pick<Player, 'title' | 'disguise'>): Title[] {
  if (!player.title) return [];
  if (player.title === 'archbishop' && player.disguise) return ['archbishop', player.disguise.title];
  return [player.title];
}

/** Sekter vars aktioner spelaren får använda. Dold Archbishop: Sabbat + förklädnadens sekt. */
export function effectiveFactions(player: Pick<Player, 'title' | 'disguise' | 'faction'>): Faction[] {
  if (player.title === 'archbishop' && player.disguise) {
    return player.disguise.faction === player.faction ? [player.faction] : [player.faction, player.disguise.faction];
  }
  return [player.faction];
}

export function actionCost(def: ActionDefinition, ctx: CatalogContext): number {
  return typeof def.cost === 'function' ? def.cost(ctx) : def.cost;
}

export function actionIncome(def: ActionDefinition, ctx: CatalogContext): number {
  if (def.income === undefined) return 0;
  return typeof def.income === 'function' ? def.income(ctx) : def.income;
}

export function actionParams(def: ActionDefinition, ctx: CatalogContext): readonly ParamSpec[] {
  if (!def.params) return [];
  return typeof def.params === 'function' ? def.params(ctx) : def.params;
}

export function isTrifle(def: ActionDefinition, player: { title: Title | null }): boolean {
  return typeof def.trifle === 'function' ? def.trifle(player) : def.trifle === true;
}

// ---------------------------------------------------------------------------
// Skelettets stubbar (används av rondens tester). Spelets riktiga katalog är
// ACTION_CATALOG i src/catalog/. Bara de metadata som skelettets budget- och valideringsregler
// behöver; effekterna byggs i steg 3. Varje stubb löser sig utan effekt.

const stubResolve = (): ActionOutcome => ({ status: 'resolved' });

const minionIdParam = (a: SubmittedAction): string | null =>
  typeof a.params?.minionId === 'string' ? a.params.minionId : null;

const numberParam = (a: SubmittedAction, key: string): number => {
  const v = a.params?.[key];
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
};

export const SKELETON_ACTIONS: ActionRegistry = createRegistry([
  {
    id: 'move',
    name: 'Move',
    category: 'personal',
    performer: 'vampire',
    stealth: 2,
    cost: ({ view }) => (view.me.title === 'justicar' ? 5 : 10),
    trifle: (p) => p.title === 'justicar',
    resolve: stubResolve,
  },
  { id: 'bleed', name: 'Bleed', category: 'personal', performer: 'vampire', stealth: 0, cost: 0, resolve: stubResolve },
  {
    id: 'hide',
    name: 'Hide',
    category: 'personal',
    performer: 'vampire',
    stealth: 'undetectable',
    cost: 10,
    endsTurn: true,
    resolve: stubResolve,
  },
  {
    id: 'awaken',
    name: 'Awaken',
    category: 'personal',
    performer: 'vampire',
    stealth: 3,
    cost: 0,
    allowedInTorpor: true,
    resolve: stubResolve,
  },
  {
    id: 'grow_in_power',
    name: 'Grow in Power',
    category: 'personal',
    performer: 'vampire',
    stealth: 0,
    cost: ({ action }) => 50 * numberParam(action, 'exp'),
    trifle: true,
    resolve: stubResolve,
  },
  {
    id: 'give',
    name: 'Give',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 0,
    slot: 'free',
    resolve: stubResolve,
  },
  {
    id: 'buy_votes',
    name: 'Buy Votes',
    category: 'faction',
    performer: 'vampire',
    stealth: 0,
    cost: ({ action }) => numberParam(action, 'blood'),
    slot: 'free',
    resolve: stubResolve,
  },
  {
    id: 'control_the_masquerade',
    name: 'Control the Masquerade',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 10,
    trifle: true,
    factions: ['camarilla'],
    resolve: stubResolve,
  },
  {
    id: 'go_anarch',
    name: 'Go Anarch',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 0,
    factions: ['camarilla'],
    exclusive: true,
    resolve: stubResolve,
  },
  {
    id: 'reward_loyalty',
    name: 'Reward Loyalty',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 25,
    trifle: true,
    maxPerRound: 1,
    titles: ['inner_circle'],
    resolve: stubResolve,
  },
  {
    id: 'anarch_mission',
    name: 'Anarch Mission',
    category: 'faction',
    performer: 'vampire',
    stealth: 1,
    cost: 15,
    factions: ['anarch'],
    grantsMinionAction: true,
    eligible: ({ view, action }) => {
      const id = minionIdParam(action);
      if (!id) return 'Anarch Mission requires params.minionId';
      return view.me.minions.some((m) => m.id === id) ? null : 'Anarch Mission must name one of your own minions';
    },
    resolve: stubResolve,
  },
  {
    id: 'call_a_crusade',
    name: 'Call a Crusade!',
    category: 'faction',
    performer: 'vampire',
    stealth: 'cant_be_hidden',
    cost: 0,
    titles: ['archbishop'],
    resolve: stubResolve,
  },
  {
    id: 'celerity',
    name: 'Celerity',
    category: 'discipline',
    performer: 'vampire',
    stealth: 0,
    cost: 10,
    resolve: (ctx) => {
      ctx.resolveImmediately(2);
      return { status: 'resolved' };
    },
  },
  {
    id: 'attack',
    name: 'Attack!',
    category: 'personal',
    performer: 'vampire',
    stealth: -1,
    cost: 0,
    // Stubb: startar en strid som pausar ronden (M11). Striden byggs i steg 3.
    resolve: (ctx) => ({
      status: 'interrupt',
      kind: 'combat',
      data: { attackerId: ctx.player.id, target: ctx.entry.action.params?.target ?? null },
    }),
    resume: () => ({ status: 'resolved' }),
  },
  {
    id: 'minion_move',
    name: 'Move (minion)',
    category: 'minion',
    performer: 'minion',
    stealth: 0,
    cost: 5,
    minionTypes: ['ghoul', 'harpy', 'eye'],
    resolve: stubResolve,
  },
  {
    id: 'bleed_the_enemy',
    name: 'Bleed the Enemy',
    category: 'minion',
    performer: 'minion',
    stealth: 1,
    cost: 0,
    minionTypes: ['ghoul'],
    resolve: stubResolve,
  },
]);
