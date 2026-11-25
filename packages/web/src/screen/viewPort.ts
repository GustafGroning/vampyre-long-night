/**
 * Porten mot motorns actionkatalog och kartvy. Allt räknas från spelarens
 * `PlayerView` (motorns `listAvailableActions`, `nextParam`, `analyzeDraft`),
 * så samma kod fungerar i klienten och på servern och kan aldrig visa dold
 * information. Bara inlämningen (`submit`/`unlock`) behöver något mer än vyn.
 */
import {
  ACTION_CATALOG,
  analyzeDraft,
  listAvailableActions,
  nextParam,
  projectPositions,
  type ActionRegistry,
  type BudgetBreakdown,
  type Json,
  type Content,
  type MinionId,
  type ParamRequest,
  type PlayerView,
  type SubmittedAction,
} from '@vampyre/engine';
import { buildMapModel } from './mapModel';
import type {
  ConfirmResult,
  DraftAction,
  DraftAnalysis,
  DraftExtras,
  MainScreenData,
  Params,
  PerformerRef,
  PlayerScreenPort,
  RoyalPrivilegeInfo,
  TargetStep,
} from './model';

export interface ViewPortOptions {
  view: PlayerView;
  content: Content;
  registry?: ActionRegistry;
  /** Lämnar in listan. Lokalt: motorns submitActions; i spelet: servern. */
  submit: (actions: SubmittedAction[], extras: DraftExtras) => ConfirmResult | Promise<ConfirmResult>;
  unlock: () => void | Promise<void>;
  isLocked: () => boolean;
  /** Redan inlämnad lista i ronden (från servern efter omladdning). */
  submitted?: { actions: readonly SubmittedAction[]; royalPrivilegesToSpend: number } | null;
}

export function toSubmitted(a: Pick<DraftAction, 'uid' | 'actionId' | 'performer' | 'params'>): SubmittedAction {
  return {
    key: a.uid,
    actionId: a.actionId,
    performer: a.performer.kind === 'vampire' ? { kind: 'vampire' } : { kind: 'minion', minionId: a.performer.minionId as MinionId },
    params: Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])),
  };
}

export function toStep(r: ParamRequest): TargetStep {
  if (r.kind === 'number') {
    const range = r.range ?? { min: 0, max: Number.MAX_SAFE_INTEGER, step: 1 };
    return { kind: 'number', param: r.key, label: r.label, ...range };
  }
  if (r.kind === 'text') return { kind: 'text', param: r.key, label: r.label, ...(r.maxWords !== undefined ? { maxWords: r.maxWords } : {}) };
  return {
    kind: 'select',
    param: r.key,
    label: r.label,
    options: (r.options ?? []).map((o) => ({ value: o.value, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
    ...(r.multiple ? { multiple: { ...r.multiple } } : {}),
  };
}

export function titleLabel(view: PlayerView, content: Content): string | null {
  const me = view.me;
  if (!me.title) return null;
  const name = content.titles[me.title].name;
  const domain = me.domain[0] ? view.cities.find((c) => c.id === me.domain[0])?.name : undefined;
  const ofDomain = (me.title === 'prince' || me.title === 'baron') && domain ? ` of ${domain}` : '';
  const disguise = me.disguise ? ` (som ${content.titles[me.disguise.title].name})` : '';
  return `${name}${ofDomain}${disguise}`;
}

/**
 * Royal Privileges för panelen, räknat från motorns budget.
 * `maxUseful`: med ett tak (torpor, Invite) ger bara de som ryms under taket en action.
 * `needed`: så många som krävs för att listans vampyraktioner ska rymmas.
 */
export function royalPrivilegeInfo(
  available: number,
  spending: number,
  budget: BudgetBreakdown,
  apUsed: number,
): RoyalPrivilegeInfo {
  const withoutRp = budget.base + budget.sabbatScheme + budget.bonus;
  const maxUseful = budget.cap === null ? available : Math.max(0, Math.min(available, budget.cap - withoutRp));
  const totalWithoutRp = budget.cap === null ? withoutRp : Math.min(withoutRp, budget.cap);
  const needed = Math.min(maxUseful, Math.max(0, apUsed - totalWithoutRp));
  return { available, spending, maxUseful, needed };
}

/** Varningar när spelaren spenderar Royal Privileges som inte ger något. */
export function royalPrivilegeWarnings(rp: RoyalPrivilegeInfo): string[] {
  if (rp.spending > rp.maxUseful) {
    return [`Bara ${rp.maxUseful} av ${rp.spending} Royal Privileges ger en extra action den här ronden, men alla förbrukas`];
  }
  if (rp.spending > rp.needed) {
    return [`Du spenderar ${rp.spending} Royal Privileges men listan behöver ${rp.needed}`];
  }
  return [];
}

/** Visningstexten för ett val, som ActionComposer sätter den när spelaren väljer. */
function labelFor(step: TargetStep, value: Json): string {
  if (step.kind === 'number') return String(value);
  if (step.kind === 'text') return `”${String(value)}”`;
  if (Array.isArray(value)) {
    return step.options.filter((o) => value.includes(o.value)).map((o) => o.label).join(' + ') || 'inga';
  }
  return step.options.find((o) => o.value === value)?.label ?? String(value);
}

/**
 * Bygger tillbaka en inlämnad lista till rader med visningstexter (P7). Servern
 * sparar bara motorns `SubmittedAction`; texterna räknas fram igen genom att
 * spela upp målvalen (`nextParam`) mot vyn, val för val, i listans ordning.
 * Entryns `key` blir radens uid, så pekare mellan rader håller.
 */
export function restoreDraft(
  view: PlayerView,
  content: Content,
  actions: readonly SubmittedAction[],
  registry: ActionRegistry = ACTION_CATALOG,
): DraftAction[] {
  const out: DraftAction[] = [];
  actions.forEach((a, i) => {
    const params = (a.params ?? {}) as Record<string, Json>;
    const performer: PerformerRef = a.performer.kind === 'vampire' ? { kind: 'vampire' } : { kind: 'minion', minionId: a.performer.minionId };
    const uid = a.key ?? `restored-${i + 1}`;
    const paramLabels: Record<string, string> = {};
    const partial: Record<string, Json> = {};
    const before = out.map(toSubmitted);
    for (let guard = 0; guard < 20; guard++) {
      const list = [...before, { ...a, params: { ...partial } }];
      const r = nextParam(view, content, list, list.length - 1, registry);
      if (!r || !(r.key in params)) break;
      const value = params[r.key]!;
      paramLabels[r.key] = labelFor(toStep(r), value);
      partial[r.key] = value;
    }
    out.push({ uid, actionId: a.actionId, performer, params: params as Params, paramLabels });
  });
  return out;
}

export function createViewPort(opts: ViewPortOptions): PlayerScreenPort {
  const { view, content } = opts;
  const registry = opts.registry ?? ACTION_CATALOG;
  const cityName = (id: string | null | undefined) => (id ? (view.cities.find((c) => c.id === id)?.name ?? id) : 'okänd plats');
  const minionName = (id: string) => view.me.minions.find((m) => m.id === id)?.name ?? id;
  const performerName = (p: PerformerRef) => (p.kind === 'vampire' ? view.me.name : minionName(p.minionId));

  /** Radtext: "Move från North till South", "Bleed i North", "Give: Molly Finch, 20". */
  const describe = (list: readonly DraftAction[], i: number): string => {
    const a = list[i]!;
    const def = registry[a.actionId];
    const name = def?.name ?? a.actionId;
    const pos = projectPositions(view, content, list.map(toSubmitted), registry, i);
    const here = a.performer.kind === 'vampire' ? pos.vampire : (pos.minions[a.performer.minionId as MinionId] ?? null);
    const labels = Object.values(a.paramLabels);
    if (def?.moves && labels.length === 1) return `${name} från ${cityName(here)} till ${labels[0]}`;
    if (labels.length > 0) return `${name}: ${labels.join(', ')}`;
    return here ? `${name} i ${cityName(here)}` : name;
  };

  const analyze = (draft: readonly DraftAction[], extras?: DraftExtras): DraftAnalysis => {
    const actions = draft.map(toSubmitted);
    const spending = extras?.royalPrivilegesToSpend ?? 0;
    const a = analyzeDraft(view, content, { actions, royalPrivilegesToSpend: spending }, { registry });
    const rp = royalPrivilegeInfo(view.me.royalPrivileges, spending, a.budget, a.ap.used);
    const byIndex = new Map(a.entries.map((e) => [e.index, e]));
    return {
      entries: draft.map((d, i) => {
        const e = byIndex.get(i);
        return {
          label: describe(draft, i),
          performerName: performerName(d.performer),
          performerKind: d.performer.kind,
          cost: e?.cost ?? null,
          income: e?.income ?? null,
          errors: (e?.errors ?? []).map((x) => x.message),
        };
      }),
      apUsed: a.ap.used,
      apTotal: a.ap.total,
      royalPrivileges: rp,
      minionActions: view.me.minions.map((m) => {
        const c = a.minionActions.find((x) => x.minionId === m.id);
        return { minionId: m.id, name: m.name, used: c?.used ?? 0, allowed: c?.allowed ?? 1 };
      }),
      totalCost: a.totalCost,
      totalIncome: a.totalIncome,
      errors: a.errors.filter((e) => e.entryIndex === undefined).map((e) => e.message),
      warnings: [...a.warnings.map((w) => w.message), ...royalPrivilegeWarnings(rp)],
      canConfirm: a.canConfirm,
    };
  };

  return {
    load(): MainScreenData {
      return {
        round: { round: view.round, maxRounds: view.maxRounds },
        resources: { ...view.resources },
        vampire: { name: view.me.name, titleLabel: titleLabel(view, content), stats: { ...view.me.stats } },
        map: buildMapModel(view.map),
      };
    },
    actionChoices(draft) {
      const items = listAvailableActions(view, content, draft.map(toSubmitted), { registry });
      return items.map((it) => ({
        key: `${it.performer.kind === 'vampire' ? 'vampire' : `minion:${it.performer.minionId}`}:${it.actionId}`,
        actionId: it.actionId,
        performer: it.performer.kind === 'vampire' ? { kind: 'vampire' } : { kind: 'minion', minionId: it.performer.minionId },
        performerName: performerName(
          it.performer.kind === 'vampire' ? { kind: 'vampire' } : { kind: 'minion', minionId: it.performer.minionId },
        ),
        performerKind: it.performer.kind,
        name: it.name,
        cost: it.cost,
        costVaries: it.costVaries,
        income: it.income,
        ...(it.available ? {} : { disabledReason: it.reason ?? 'Går inte nu' }),
      }));
    },
    nextStep(before, actionId, performer, params) {
      const list = [...before.map(toSubmitted), toSubmitted({ uid: 'new', actionId, performer, params })];
      const r = nextParam(view, content, list, list.length - 1, registry);
      return r ? toStep(r) : null;
    },
    analyze,
    confirm: async (draft, extras) =>
      opts.submit(draft.map(toSubmitted), { royalPrivilegesToSpend: extras?.royalPrivilegesToSpend ?? 0 }),
    unlock: async () => {
      await opts.unlock();
    },
    isLocked: opts.isLocked,
    initialDraft: () => (opts.submitted ? restoreDraft(view, content, opts.submitted.actions, registry) : []),
    initialExtras: () => ({ royalPrivilegesToSpend: opts.submitted?.royalPrivilegesToSpend ?? 0 }),
  };
}
