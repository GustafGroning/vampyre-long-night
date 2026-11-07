// TEMPORÄR STUB. Ersätts med re-exporter från ../state och ../rng när
// state-trådens gren finns. Allt round/ importerar från state går via den här
// filen så att bytet sker på ett ställe.

export type PlayerId = string;
export type MinionId = string;
export type Faction = 'camarilla' | 'anarch' | 'sabbat';
export type Title = 'inner_circle' | 'justicar' | 'prince' | 'baron' | 'archbishop';
export type MinionType = 'ghoul' | 'harpy' | 'eye' | 'primogen' | 'archon';

export interface Player {
  id: PlayerId;
  faction: Faction;
  title: Title | null;
  disguise: { title: 'prince' | 'baron'; faction: Faction } | null;
  status: 'active' | 'torpor' | 'burned';
  blood: number;
  royalPrivileges: number;
  actionBudgetModifiers: ActionBudgetModifier[];
}

export interface ActionBudgetModifier {
  /** Ronden effekten gäller. */
  round: number;
  kind: 'bonus' | 'cap';
  amount: number;
  source: string;
}

export interface Minion {
  id: MinionId;
  owner: { kind: 'player'; id: PlayerId } | { kind: 'npc'; id: string };
  type: MinionType;
  level: number;
  acquiredRound: number;
}

export interface GameState {
  round: number;
  maxRounds: number;
  phase: 'setup' | 'submission' | 'resolving' | 'awaitingCombat' | 'finished';
  players: Record<PlayerId, Player>;
  minions: Record<MinionId, Minion>;
}

const TITLE_BUDGET: Record<Title, number> = {
  inner_circle: 6,
  justicar: 4,
  prince: 4,
  baron: 5,
  archbishop: 4,
};

export function actionBudgetBase(player: Player): number {
  if (player.title === 'archbishop' && player.disguise) return TITLE_BUDGET[player.disguise.title];
  return player.title ? TITLE_BUDGET[player.title] : 3;
}

const UPKEEP: Record<MinionType, number> = { ghoul: 5, harpy: 15, eye: 5, primogen: 20, archon: 0 };
export function minionUpkeep(minion: Minion): number {
  return UPKEEP[minion.type] * minion.level;
}

export interface Rng {
  int(min: number, max: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function deriveSeed(...parts: Array<string | number>): string {
  return parts.join('/');
}

export function createRng(seed: string): Rng {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

export function burnMinion(state: GameState, id: MinionId): void {
  delete state.minions[id];
}
