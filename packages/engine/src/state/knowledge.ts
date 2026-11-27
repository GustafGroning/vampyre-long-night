/**
 * Spelarnas kunskap om andras artefakter (S24, V20).
 *
 * Regeln (2.0, "Possession"): andra vet inte vad du har förrän de använder en
 * aktion som avslöjar det, eller du gör en aktion som avslöjar det. Kunskapen
 * sparas med bäraren den gällde, och räknas bara så länge bäraren är densamma:
 * ingen "last known" (Gustafs regel för kartan och vyerna).
 *
 * Effekterna som ger kunskap anropar `learnArtifactHolder`/`learnArtifactsOf`:
 * - observerad artefaktaktion (`round/resolve.ts`, `observeAction`),
 * - Look for Artifacts och Keep an Eye on Them (effektsteg 3–4, hunt roll),
 * - (M) Auspex "locate" (effektsteg 4).
 */
import type { ArtifactId, PlayerId } from './ids.js';
import { sortedValues } from './json.js';
import type { Artifact, ArtifactHolder, ArtifactKnowledge, GameState, KnownArtifactHolder, Mutable } from './types.js';

function knowable(h: ArtifactHolder): KnownArtifactHolder | null {
  switch (h.kind) {
    case 'player':
    case 'minion':
    case 'city':
      return { kind: h.kind, id: h.id } as KnownArtifactHolder;
    case 'npc':
    case 'pool':
      return null;
  }
}

function sameKnownHolder(a: KnownArtifactHolder, b: ArtifactHolder): boolean {
  return a.kind === b.kind && a.id === (b as { id?: string }).id;
}

/**
 * Spelaren lär sig artefaktens nuvarande bärare. Gör inget om artefakten inte finns
 * eller ligger hos en NPC eller i poolen (inget man kan veta, S24).
 */
export function learnArtifactHolder(
  state: Mutable<GameState>,
  playerId: PlayerId,
  artifactId: ArtifactId,
  source: string,
): void {
  const a = state.artifacts[artifactId];
  if (!a) return;
  const holder = knowable(a.holder as ArtifactHolder);
  if (!holder) return;
  // Äldre sparade kampanjer saknar fältet.
  if (!state.knowledge) state.knowledge = { artifacts: {} };
  const mine = (state.knowledge.artifacts[playerId] ??= {});
  mine[artifactId] = { holder: { ...holder }, round: state.round, source };
}

/**
 * Spelaren lär sig alla artefakter som vampyren `targetId` själv bär (Look for
 * Artifacts, Keep an Eye on Them). Artefakter som vampyrens minions bär ingår
 * inte (provisoriskt, BACKLOG: "in possession of").
 */
export function learnArtifactsOf(state: Mutable<GameState>, playerId: PlayerId, targetId: PlayerId, source: string): ArtifactId[] {
  const ids = sortedValues(state.artifacts as GameState['artifacts'])
    .filter((a) => a.holder.kind === 'player' && a.holder.id === targetId)
    .map((a) => a.id);
  for (const id of ids) learnArtifactHolder(state, playerId, id, source);
  return ids;
}

/** Giltig kunskap: artefakten finns kvar och har samma bärare som när det lärdes. Annars `null`. */
export function knownArtifactHolder(state: GameState, playerId: PlayerId, artifactId: ArtifactId): ArtifactKnowledge | null {
  const k = state.knowledge?.artifacts[playerId]?.[artifactId];
  const a: Artifact | undefined = state.artifacts[artifactId];
  if (!k || !a) return null;
  return sameKnownHolder(k.holder, a.holder) ? k : null;
}
