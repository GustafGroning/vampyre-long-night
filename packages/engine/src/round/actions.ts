import type { Content, Faction, GameState, MinionId, MinionType, Mutable, Player, Rng, Title, WorkingState } from './deps.js';
import type { ActionId, EntryRecord, Json, SubmittedAction } from './types.js';

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
  emit(kind: string, data?: { [key: string]: Json }): void;
  scratch: { [key: string]: Json };
  /** Celerity (M5): lös spelarens `count` nästa pending entries direkt, i samma slot. */
  resolveImmediately(count: number): void;
}

export interface EligibilityContext {
  state: GameState;
  content: Content;
  player: Player;
  action: SubmittedAction;
}

export interface ActionDefinition {
  id: ActionId;
  name: string;
  category: ActionCategory;
  /** Vem som utför aktionen. Minionaktioner kan bara utföras av minions (A6). */
  performer: 'vampire' | 'minion';
  stealth: ActionStealth;
  cost: number | ((ctx: EligibilityContext) => number);
  /** Första Trifle-aktionen per rond kostar ingen slot i budgeten. */
  trifle?: boolean | ((player: Player) => boolean);
  /** 'free' = räknas aldrig mot budgeten (Give, Buy Votes). */
  slot?: 'normal' | 'free';
  /** Max antal per rond för samma spelare ("once per turn"). */
  maxPerRound?: number;
  /** Krav på titel (effektiv titel, se effectiveTitles). */
  titles?: Title[];
  /** Krav på sekt (effektiv sekt, se effectiveFactions). */
  factions?: Faction[];
  /** För minionaktioner: vilka typer som får utföra den. */
  minionTypes?: MinionType[];
  /** Får utföras av vampyren i torpor (Awaken, Giants' Blood, Soul Gem). */
  allowedInTorpor?: boolean;
  /** Måste vara spelarens enda vampyraktion (Go Anarch). */
  exclusive?: boolean;
  /** Inga fler vampyraktioner efter denna (Hide). */
  endsTurn?: boolean;
  /** Ger en namngiven minion (params.minionId) +1 minionaktion (Anarch Mission). */
  grantsMinionAction?: boolean;
  /** Extra kontroller (diskipliner, artefakter, mål). Returnerar felmeddelande eller null. */
  eligible?: (ctx: EligibilityContext) => string | null;
  resolve(ctx: ActionContext): ActionOutcome;
  /** Anropas med plattformens svar när en interrupt från denna aktion besvaras. */
  resume?(ctx: ActionContext, result: { [key: string]: Json }): ActionOutcome;
}

export type ActionRegistry = Readonly<Record<ActionId, ActionDefinition>>;

export function createRegistry(defs: ActionDefinition[]): ActionRegistry {
  const out: Record<ActionId, ActionDefinition> = {};
  for (const d of defs) {
    if (out[d.id]) throw new Error(`Dubbel aktionsdefinition: ${d.id}`);
    out[d.id] = d;
  }
  return out;
}

/**
 * Titlar vars aktioner spelaren får använda. En dold Archbishop får använda både
 * sina egna och sin förklädnads (gd:635); en exponerad bara Archbishop.
 */
export function effectiveTitles(player: Player): Title[] {
  if (!player.title) return [];
  if (player.title === 'archbishop' && player.disguise) return ['archbishop', player.disguise.title];
  return [player.title];
}

/** Sekter vars aktioner spelaren får använda. Dold Archbishop: Sabbat + förklädnadens sekt. */
export function effectiveFactions(player: Player): Faction[] {
  if (player.title === 'archbishop' && player.disguise) {
    return player.disguise.faction === player.faction ? [player.faction] : [player.faction, player.disguise.faction];
  }
  return [player.faction];
}

export function actionCost(def: ActionDefinition, ctx: EligibilityContext): number {
  return typeof def.cost === 'function' ? def.cost(ctx) : def.cost;
}

export function isTrifle(def: ActionDefinition, player: Player): boolean {
  return typeof def.trifle === 'function' ? def.trifle(player) : def.trifle === true;
}

// ---------------------------------------------------------------------------
// Stubbar. Bara de metadata som skelettets budget- och valideringsregler
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
    cost: ({ player }) => (player.title === 'justicar' ? 5 : 10),
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
    eligible: ({ state, player, action }) => {
      const id = minionIdParam(action);
      if (!id) return 'Anarch Mission kräver params.minionId';
      const m = state.minions[id as MinionId];
      return m && m.owner.kind === 'player' && m.owner.id === player.id ? null : 'Anarch Mission måste namnge en egen minion';
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
