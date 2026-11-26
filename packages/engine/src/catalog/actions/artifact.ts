/**
 * Artefaktaktioner (gd:377–445), byggda från artefaktdefinitionerna i content.
 * Alla har Trifle och kan göras en gång per rond och artefakt (gd:377, 381).
 *
 * Ring of Tremere och (M)Thaumaturgy-skapade artefakter har ingen egen aktion här
 * än: deras aktion är den bundna disciplinens basaktion (BACKLOG).
 */
import { ARTIFACT_DEFINITIONS, type ArtifactDefinition, type ArtifactKey } from '../../content/artifacts.js';
import type { ActionDefinition, ActionStealth } from '../../round/actions.js';
import type { StealthValue } from '../../state/enums.js';
import type { MinionId, CityId } from '../../state/ids.js';
import type { CatalogContext, ParamSpec, ProjectedMove } from '../types.js';
import { define, movesTo } from '../define.js';
import { allCities, citiesAdjacentTo, cityParam, here, ownMinions, playerParam, strParam } from '../options.js';

const toActionStealth = (s: StealthValue): ActionStealth =>
  s.kind === 'modifier' ? s.value : s.kind === 'undetectable' ? 'undetectable' : 'cant_be_hidden';

/** Val och förflyttningar per artefakt. Artefakter som inte står här har inga val. */
const EXTRA: Partial<
  Record<
    ArtifactKey,
    {
      params?: ParamSpec[];
      moves?: (ctx: CatalogContext) => ProjectedMove[];
      income?: number;
    }
  >
> = {
  giants_blood: { params: [playerParam('target', 'Vampire in torpor', { includeSelf: true })] },
  whispers_in_a_bottle: { params: [playerParam('target', 'Vampire')] },
  bag_of_gifts: { params: [playerParam('target', 'Vampire')] },
  fog_flute: { params: [cityParam('city', 'City', (ctx) => allCities(ctx))] },
  the_evil_eye: { params: [playerParam('target', 'Vampire')] },
  brujahs_book: { params: [cityParam('city', 'City', (ctx) => allCities(ctx))] },
  scepter_of_ventrue: {
    params: [
      { key: 'minionId', label: 'Own minion', kind: 'minion', options: (ctx) => ownMinions(ctx) },
      cityParam('to', 'To city', (ctx) => allCities(ctx)),
    ],
    moves: (ctx) => {
      const id = strParam(ctx, 'minionId');
      return id ? [{ performer: { kind: 'minion', minionId: id as MinionId }, to: strParam(ctx, 'to') as CityId }] : [];
    },
  },
  ravnos_boots: {
    params: [cityParam('to', 'Adjacent city', (ctx) => citiesAdjacentTo(ctx, here(ctx)))],
    moves: movesTo(),
  },
  the_demeter: {
    params: [cityParam('to', 'Port', (ctx) => allCities(ctx, (c) => c.isPort && c.id !== here(ctx)))],
    moves: movesTo(),
  },
  diamond_of_toreador: { income: 25 },
};

function artifactAction(a: ArtifactDefinition): ActionDefinition {
  const extra = EXTRA[a.key] ?? {};
  return define({
    id: `artifact_${a.key}`,
    name: a.name,
    category: 'artifact',
    performer: 'vampire',
    stealth: a.stealth ? toActionStealth(a.stealth) : 0,
    cost: a.cost ?? 0,
    trifle: true,
    maxPerRound: 1,
    ...(a.freeAction ? { slot: 'free' as const } : {}),
    ...(a.torpor !== 'no' ? { allowedInTorpor: true } : {}),
    requires: { artifact: a.key, ...(a.torpor === 'only' ? { onlyInTorpor: true } : {}) },
    ...(extra.params ? { params: extra.params } : {}),
    ...(extra.moves ? { moves: extra.moves } : {}),
    ...(extra.income !== undefined ? { income: extra.income } : {}),
  });
}

// Crown of Malkav kräver GM (skärmdump från en chatt) och är borttagen (docs/engine/not-fixed-actions.md).
const WITHOUT_OWN_ACTION: ReadonlySet<ArtifactKey> = new Set<ArtifactKey>(['ring_of_tremere', 'thaumaturgic_creation', 'crown_of_malkav']);

export const ARTIFACT_ACTIONS: ActionDefinition[] = Object.values(ARTIFACT_DEFINITIONS)
  .filter((a) => !WITHOUT_OWN_ACTION.has(a.key))
  .map(artifactAction);
