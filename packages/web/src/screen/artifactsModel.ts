/**
 * Artifacts-fliken ur motorns `PlayerView.knownArtifacts` och `Content`.
 *
 * Listan är regelbokens fasta artefakter (2.0, "List of artifacts in game").
 * Bärare visas bara när motorn säger att spelaren garanterat vet (V20): egen
 * ägo, eller kunskap från en aktion som avslöjar det och som fortfarande är sann.
 * Allt annat är "Unknown". Ingen "last known".
 */
import {
  ARTIFACT_KEYS,
  type ActionRegistry,
  type ArtifactDefinition,
  type Content,
  type KnownArtifactView,
  type MinionArtifactBonus,
  type PlayerView,
} from '@vampyre/engine';
import type { ArtifactEntry, ArtifactOwner } from './model';

const STAT_NAMES = { strength: 'Strength', stealth: 'Stealth', intercept: 'Intercept' } as const;

export function stealthLabel(def: ArtifactDefinition): string {
  const s = def.stealth;
  if (!s) return 'Same as the chosen discipline';
  if (s.kind === 'undetectable') return 'Undetectable';
  if (s.kind === 'cant_be_hidden') return "Can't be hidden";
  return s.value >= 0 ? `+${s.value}` : String(s.value);
}

export function costLabel(def: ArtifactDefinition): string {
  return def.cost === null ? 'Same as the chosen discipline' : `${def.cost} Blood`;
}

export function minionBonusLabel(b: MinionArtifactBonus | null): string | null {
  if (!b) return null;
  switch (b.kind) {
    case 'stat':
      return `+${b.amount} ${STAT_NAMES[b.stat]}`;
    case 'level':
      return `+${b.amount} level (max 3)`;
    case 'blood_hunt_bonus':
      return `+${b.amount} to all hunts for blood`;
    case 'cant_be_dominated':
      return "Can't be Dominated";
    case 'bound_discipline_action':
      return 'Can perform the chosen discipline on basic';
  }
}

function notes(def: ArtifactDefinition): string[] {
  const out = ['Trifle', 'Once per round'];
  if (def.freeAction) out.push("Doesn't cost an action");
  if (def.burnsOnUse) out.push('Burned when used');
  if (def.torpor === 'allowed') out.push('Can be used in torpor');
  if (def.torpor === 'only') out.push('Only in torpor');
  return out;
}

function ownerOf(view: PlayerView, content: Content, registry: ActionRegistry, k: KnownArtifactView): ArtifactOwner {
  const playerName = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Unknown vampire';
  const minionName = (id: string) =>
    view.me.minions.find((m) => m.id === id)?.name ?? view.minions.find((m) => m.id === id)?.name ?? 'Unknown minion';
  const bound = k.boundDiscipline ? ` (${content.disciplines[k.boundDiscipline].name})` : '';
  const round = k.learnedRound !== null ? ` in round ${k.learnedRound}` : '';
  const how =
    k.source === 'own'
      ? k.holder.kind === 'own_minion'
        ? `Carried by your minion${bound}`
        : `You hold it${bound}`
      : k.source.startsWith('artifact_')
        ? `Seen using it${round}`
        : `Learned with ${registry[k.source]?.name ?? k.source}${round}`;
  switch (k.holder.kind) {
    case 'self':
      return { label: 'You', own: true, how };
    case 'own_minion':
      return { label: `Your minion ${minionName(k.holder.minionId)}`, own: true, how };
    case 'player':
      return { label: playerName(k.holder.playerId), own: false, how };
    case 'minion': {
      const owner = k.holder.ownerId ? ` (${playerName(k.holder.ownerId)}'s minion)` : '';
      return { label: `${minionName(k.holder.minionId)}${owner}`, own: false, how };
    }
    case 'city': {
      const city = view.cities.find((c) => c.id === (k.holder as { cityId: string }).cityId)?.name ?? 'a city';
      return { label: `Lying in ${city}`, own: false, how };
    }
  }
}

/** Alla artefakter i namnordning, med kända bärare. */
export function buildArtifactEntries(view: PlayerView, content: Content, registry: ActionRegistry): ArtifactEntry[] {
  return ARTIFACT_KEYS.filter((k) => k !== 'thaumaturgic_creation')
    .map((key): ArtifactEntry => {
      const def = content.artifacts[key];
      return {
        key,
        name: def.name,
        text: def.text,
        cost: costLabel(def),
        stealth: stealthLabel(def),
        minionBonus: minionBonusLabel(def.minionBonus),
        notes: notes(def),
        owners: view.knownArtifacts.filter((a) => a.definition === key).map((a) => ownerOf(view, content, registry, a)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
