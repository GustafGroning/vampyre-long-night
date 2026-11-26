/**
 * Aktionsmenyn: vad spelaren kan välja i dropdownen just nu, en rad per
 * aktion och utförare (vampyren eller en egen minion).
 */
import type { Content } from '../content/index.js';
import type { PlayerView } from '../view/player.js';
import {
  actionCost,
  actionIncome,
  actionParams,
  isTrifle,
  type ActionCategory,
  type ActionDefinition,
  type ActionRegistry,
  type ActionStealth,
} from '../round/actions.js';
import type { Performer, SubmittedAction } from '../round/types.js';
import { projectPositions, requirementProblem } from './analyze.js';
import { minionLabel } from './options.js';
import { ACTION_CATALOG } from './registry.js';
import type { CatalogContext } from './types.js';

export interface ActionMenuItem {
  actionId: string;
  name: string;
  category: ActionCategory;
  performer: Performer;
  /** "Vampyren" eller minionens namn, typ och level. */
  performerLabel: string;
  /** Aktionen har val (mål, belopp …) som måste göras innan den kan läggas i listan. */
  needsParams: boolean;
  /**
   * Kostnad innan några val är gjorda. När `costVaries` är sann beror den på
   * valen (Grow in Power, Get a Minion …) och är bara en utgångspunkt.
   */
  cost: number;
  costVaries: boolean;
  /** Fast deterministisk inkomst, eller null. */
  income: number | null;
  stealth: ActionStealth;
  trifle: boolean;
  /** Kostar aldrig en action point. */
  freeSlot: boolean;
  /**
   * Går att välja här och nu. False när det första valet saknar giltiga
   * alternativ (t.ex. Sail utanför en hamn); `reason` säger varför.
   */
  available: boolean;
  reason?: string;
}

export interface MenuOptions {
  /** Standard: ACTION_CATALOG. */
  registry?: ActionRegistry;
  /**
   * Var i listan aktionen ska läggas (positioner räknas efter entries före).
   * Standard: sist.
   */
  insertAt?: number;
}

/**
 * Alla aktioner spelaren har tillgång till, för vampyren och varje egen minion.
 * Aktioner spelaren inte alls kan göra (fel titel, sekt, disciplin, minion-typ)
 * tas inte med.
 */
export function listAvailableActions(
  view: PlayerView,
  content: Content,
  actions: readonly SubmittedAction[],
  opts: MenuOptions,
): ActionMenuItem[] {
  const registry = opts.registry ?? ACTION_CATALOG;
  const insertAt = opts.insertAt ?? actions.length;
  const positions = projectPositions(view, content, actions, registry, insertAt);
  const performers: Array<{ performer: Performer; label: string }> = [
    { performer: { kind: 'vampire' }, label: view.me.name },
    ...view.me.minions.map((m) => ({
      performer: { kind: 'minion', minionId: m.id } as Performer,
      label: minionLabel({ name: m.name, level: m.effectiveLevel, type: m.type }),
    })),
  ];
  const out: ActionMenuItem[] = [];
  for (const { performer, label } of performers) {
    for (const def of Object.values(registry)) {
      if (def.performer !== performer.kind) continue;
      if (requirementProblem(def, view, performer)) continue;
      const action: SubmittedAction = { actionId: def.id, performer };
      const list = [...actions.slice(0, insertAt), action, ...actions.slice(insertAt)];
      const ctx: CatalogContext = { view, content, action, positions, list, index: insertAt, registry };
      const specs = actionParams(def, ctx);
      const first = specs[0];
      const firstOptions = first?.options ? first.options(ctx) : null;
      const item: ActionMenuItem = {
        actionId: def.id,
        name: def.name,
        category: def.category,
        performer,
        performerLabel: label,
        needsParams: specs.length > 0,
        cost: safeCost(def, ctx),
        costVaries: def.variableCost ?? (typeof def.cost === 'function' && specs.length > 0 && safeCost(def, ctx) === 0),
        income:
          def.income === undefined
            ? null
            : typeof def.income === 'number' || specs.length === 0
              ? actionIncome(def, ctx) || null
              : null,
        stealth: def.stealth,
        trifle: isTrifle(def, view.me),
        freeSlot: def.slot === 'free',
        available: true,
      };
      if (firstOptions && firstOptions.length === 0 && !(first?.multiple && first.multiple.min === 0)) {
        item.available = false;
        item.reason = `No valid choices for ${first!.label.toLowerCase()} right now`;
      }
      out.push(item);
    }
  }
  return out;
}

function safeCost(def: ActionDefinition, ctx: CatalogContext): number {
  const c = actionCost(def, ctx);
  return Number.isInteger(c) && c >= 0 ? c : 0;
}
