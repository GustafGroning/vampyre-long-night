/**
 * Kunskap om andras artefakter (S24, V20–V21): bara det spelaren garanterat vet,
 * ingen "last known".
 */
import { describe, expect, it } from 'vitest';
import {
  buildPlayerView,
  cloneJson,
  knownArtifactHolder,
  learnArtifactHolder,
  learnArtifactsOf,
  resolveRound,
  startGame,
  validateState,
  type ArtifactId,
  type CityId,
  type GameState,
  type Mutable,
  type PlayerId,
  type Submission,
} from '../../src/index.js';
import { content, P, sampleState } from '../fixtures.js';

const DIAMOND = 'artifact-900' as ArtifactId;
const GLOVES = 'artifact-901' as ArtifactId;

/** Justicar bär Diamond of Toreador (can't be hidden) och Black Gloves (undetectable). */
function withArtifacts(): Mutable<GameState> {
  const s = cloneJson(startGame(sampleState())) as Mutable<GameState>;
  s.artifacts[DIAMOND] = { id: DIAMOND, definition: 'diamond_of_toreador', holder: { kind: 'player', id: P.justicar }, boundDiscipline: null };
  s.artifacts[GLOVES] = { id: GLOVES, definition: 'black_gloves', holder: { kind: 'player', id: P.justicar }, boundDiscipline: null };
  s.counters.artifact = Math.max(s.counters.artifact, 902);
  return s;
}

const sub = (playerId: PlayerId, actions: Submission['actions']): Submission => ({
  playerId,
  actions,
  royalPrivilegesToSpend: 0,
  locked: true,
  updatedAt: 0,
});

const all = (s: GameState, pid: PlayerId) => buildPlayerView(s, content, pid).knownArtifacts;
/** Det spelaren vet om andras artefakter (fixturens spelare har egna artefakter). */
const known = (s: GameState, pid: PlayerId) => all(s, pid).filter((a) => a.source !== 'own');

describe('knownArtifacts i PlayerView', () => {
  it('egna artefakter är kända, andras är okända', () => {
    const s = withArtifacts();
    expect(all(s, P.justicar).filter((a) => a.id === DIAMOND || a.id === GLOVES).map((a) => [a.id, a.holder.kind, a.source])).toEqual([
      [DIAMOND, 'self', 'own'],
      [GLOVES, 'self', 'own'],
    ]);
    expect(all(s, P.justicar).every((a) => a.source === 'own')).toBe(true);
    expect(known(s, P.prince)).toEqual([]);
    expect(JSON.stringify(buildPlayerView(s, content, P.prince))).not.toContain(DIAMOND);
  });

  it('kunskap syns för den som lärt sig, inte för andra', () => {
    const s = withArtifacts();
    learnArtifactHolder(s, P.prince, DIAMOND, 'auspex_m');
    expect(known(s, P.prince)).toEqual([
      {
        id: DIAMOND,
        definition: 'diamond_of_toreador',
        boundDiscipline: null,
        holder: { kind: 'player', playerId: P.justicar },
        source: 'auspex_m',
        learnedRound: s.round,
      },
    ]);
    expect(JSON.stringify(buildPlayerView(s, content, P.baron))).not.toContain(DIAMOND);
    expect(validateState(s, content)).toEqual([]);
  });

  it('ingen last known: byter artefakten bärare blir den okänd igen', () => {
    const s = withArtifacts();
    learnArtifactHolder(s, P.prince, DIAMOND, 'look_for_artifacts');
    s.artifacts[DIAMOND]!.holder = { kind: 'player', id: P.baron };
    expect(known(s, P.prince)).toEqual([]);
    expect(knownArtifactHolder(s, P.prince, DIAMOND)).toBeNull();
    // Tillbaka hos samma bärare = sant igen.
    s.artifacts[DIAMOND]!.holder = { kind: 'player', id: P.justicar };
    expect(known(s, P.prince).map((a) => a.id)).toEqual([DIAMOND]);
  });

  it('en bränd (borttagen) artefakt försvinner ur det kända', () => {
    const s = withArtifacts();
    learnArtifactHolder(s, P.prince, DIAMOND, 'look_for_artifacts');
    delete s.artifacts[DIAMOND];
    expect(known(s, P.prince)).toEqual([]);
    expect(validateState(s, content)).toEqual([]);
  });

  it('learnArtifactsOf ger vampyrens egna artefakter, inte minionernas', () => {
    const s = withArtifacts();
    const minion = Object.values(s.minions).find((m) => m.owner.kind === 'player' && m.owner.id === P.justicar)!;
    expect(minion).toBeDefined();
    const carried = 'artifact-902' as ArtifactId;
    for (const a of Object.values(s.artifacts)) if (a.holder.kind === 'minion' && a.holder.id === minion.id) a.holder = { kind: 'pool' };
    s.artifacts[carried] = { id: carried, definition: 'fog_flute', holder: { kind: 'minion', id: minion.id }, boundDiscipline: null };
    s.counters.artifact = 903;
    const learned = learnArtifactsOf(s, P.prince, P.justicar, 'look_for_artifacts');
    const held = Object.values(s.artifacts).filter((a) => a.holder.kind === 'player' && a.holder.id === P.justicar).map((a) => a.id).sort();
    expect([...learned].sort()).toEqual(held);
    expect(learned).toContain(DIAMOND);
    expect(learned).not.toContain(carried);
    expect(known(s, P.prince).map((a) => a.id).sort()).toEqual(held);
  });

  it('NPC och pool kan inte bli kända bärare', () => {
    const s = withArtifacts();
    const pooled = Object.values(s.artifacts).find((a) => a.holder.kind === 'pool')!;
    learnArtifactHolder(s, P.prince, pooled.id, 'auspex_m');
    expect(known(s, P.prince)).toEqual([]);
  });

  it('en artefakt som ligger i en stad visas med staden', () => {
    const s = withArtifacts();
    s.artifacts[GLOVES]!.holder = { kind: 'city', id: 'west' as CityId };
    learnArtifactHolder(s, P.prince, GLOVES, 'auspex_m');
    expect(known(s, P.prince)[0]!.holder).toEqual({ kind: 'city', cityId: 'west' });
  });

  it('gamla sparade kampanjer utan knowledge-fältet fungerar', () => {
    const s = withArtifacts() as Partial<Mutable<GameState>>;
    delete s.knowledge;
    expect(known(s as GameState, P.prince)).toEqual([]);
    learnArtifactHolder(s as Mutable<GameState>, P.prince, DIAMOND, 'auspex_m');
    expect(known(s as GameState, P.prince).map((a) => a.id)).toEqual([DIAMOND]);
  });
});

describe('observerad artefaktaktion avslöjar bäraren (V21)', () => {
  it("can't be hidden (Diamond of Toreador): alla andra lär sig att utföraren har den", () => {
    const s = withArtifacts();
    const r = resolveRound(
      s,
      { [P.justicar]: sub(P.justicar, [{ actionId: 'artifact_diamond_of_toreador', performer: { kind: 'vampire' } }]) },
      'r1',
      { content },
    );
    if (r.status !== 'completed') throw new Error('oväntad paus');
    for (const pid of [P.inner, P.prince, P.baron, P.bishop, P.untitled]) {
      expect(known(r.state, pid)).toEqual([
        expect.objectContaining({ id: DIAMOND, holder: { kind: 'player', playerId: P.justicar }, source: 'artifact_diamond_of_toreador' }),
      ]);
    }
    // Black Gloves användes inte och är fortfarande okänd.
    expect(JSON.stringify(known(r.state, P.prince))).not.toContain(GLOVES);
    expect(validateState(r.state, content)).toEqual([]);
  });

  it('undetectable (Black Gloves): ingen lär sig något', () => {
    const s = withArtifacts();
    const r = resolveRound(
      s,
      { [P.justicar]: sub(P.justicar, [{ actionId: 'artifact_black_gloves', performer: { kind: 'vampire' } }]) },
      'r1',
      { content },
    );
    if (r.status !== 'completed') throw new Error('oväntad paus');
    for (const pid of [P.inner, P.prince, P.baron, P.bishop, P.untitled]) expect(known(r.state, pid)).toEqual([]);
  });
});
