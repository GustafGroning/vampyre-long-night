import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_PLAYERS,
  cloneJson,
  createDemoRound,
  learnArtifactHolder,
  type ArtifactId,
  type GameState,
  type Mutable,
} from '@vampyre/engine';
import { ArtifactsTab } from '../src/components/ArtifactsTab';
import { createLocalPort } from '../src/screen/localPort';

/** Demokampanjen: Inner Circle (Lady Margaret Ashworth) bär Black Gloves. */
function demo() {
  const { state, events } = createDemoRound();
  const s = cloneJson(state) as Mutable<GameState>;
  const gloves = Object.values(s.artifacts).find((a) => a.definition === 'black_gloves')!;
  return { s, events, gloves: gloves.id as ArtifactId };
}

const load = (s: GameState, player: keyof typeof DEMO_PLAYERS) =>
  createLocalPort({ state: s, playerId: DEMO_PLAYERS[player] }).load().artifacts;

describe('Artifacts-fliken: data', () => {
  it('listar regelbokens 30 artefakter i namnordning', () => {
    const list = load(demo().s, 'prince');
    expect(list).toHaveLength(30);
    expect(list.map((a) => a.name)).toEqual([...list.map((a) => a.name)].sort((a, b) => a.localeCompare(b, 'en')));
    expect(list.find((a) => a.key === 'black_gloves')).toMatchObject({
      cost: '5 Blood',
      stealth: 'Undetectable',
      minionBonus: '+1 Strength',
    });
    expect(list.find((a) => a.key === 'diamond_of_toreador')!.stealth).toBe("Can't be hidden");
    expect(list.find((a) => a.key === 'ring_of_tremere')!.cost).toBe('Same as the chosen discipline');
  });

  it('ägaren ser sin egen artefakt, andra ser Unknown', () => {
    const { s } = demo();
    expect(load(s, 'innerCircle').find((a) => a.key === 'black_gloves')!.owners).toEqual([
      { label: 'You', own: true, how: 'You hold it' },
    ]);
    expect(load(s, 'prince').find((a) => a.key === 'black_gloves')!.owners).toEqual([]);
  });

  it('kunskap från en aktion visar bäraren, tills artefakten byter bärare', () => {
    const { s, gloves } = demo();
    learnArtifactHolder(s, DEMO_PLAYERS.prince, gloves, 'look_for_artifacts');
    expect(load(s, 'prince').find((a) => a.key === 'black_gloves')!.owners).toEqual([
      { label: 'Lady Margaret Ashworth', own: false, how: `Learned with Look for Artifacts in round ${s.round}` },
    ]);
    // Baron vet fortfarande inget.
    expect(load(s, 'baron').find((a) => a.key === 'black_gloves')!.owners).toEqual([]);
    // Stulen eller given: ingen last known.
    s.artifacts[gloves]!.holder = { kind: 'player', id: DEMO_PLAYERS.baron };
    expect(load(s, 'prince').find((a) => a.key === 'black_gloves')!.owners).toEqual([]);
  });

  it('en sedd artefaktaktion visas som "Seen using it"', () => {
    const { s, gloves } = demo();
    learnArtifactHolder(s, DEMO_PLAYERS.prince, gloves, 'artifact_black_gloves');
    expect(load(s, 'prince').find((a) => a.key === 'black_gloves')!.owners[0]!.how).toBe(`Seen using it in round ${s.round}`);
  });
});

describe('Artifacts-fliken: gränssnitt', () => {
  afterEach(cleanup);
  it('visar Unknown, och klick öppnar detaljerna', () => {
    render(<ArtifactsTab artifacts={load(demo().s, 'prince')} />);
    expect(screen.getByTestId('owner-black_gloves').textContent).toBe('Unknown');
    fireEvent.click(screen.getByRole('button', { name: /Black Gloves/ }));
    const details = screen.getByRole('article', { name: 'Black Gloves details' });
    expect(details.textContent).toContain('Get +2 Strength.');
    expect(details.textContent).toContain('5 Blood');
    expect(details.textContent).toContain('Undetectable');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('egen artefakt visar "You"', () => {
    render(<ArtifactsTab artifacts={load(demo().s, 'innerCircle')} />);
    expect(screen.getByTestId('owner-black_gloves').textContent).toBe('You');
  });
});
