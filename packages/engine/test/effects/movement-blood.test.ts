import { describe, expect, it } from 'vitest';
import { ACTION_CATALOG, stubbedActionIds } from '../../src/catalog/registry.js';
import { moveBlocked } from '../../src/effects/movement.js';
import { resolveRound } from '../../src/round/resolve.js';
import type { RoundEvent, RoundResult, SubmittedAction } from '../../src/round/types.js';
import type { CityId, MinionId, PlayerId } from '../../src/state/ids.js';
import { canonicalJson, cloneJson } from '../../src/state/json.js';
import { cityStat } from '../../src/state/queries.js';
import type { GameState, Mutable } from '../../src/state/types.js';
import { assertValidState } from '../../src/state/validate.js';
import { content, e, sub, subs, v, world, type World } from '../round/fixtures.js';

const opts = { content, registry: ACTION_CATALOG };
const c = (id: string) => id as CityId;
const mn = (actionId: string, minionId: MinionId, params?: SubmittedAction['params']): SubmittedAction => ({
  actionId,
  performer: { kind: 'minion', minionId },
  ...(params ? { params } : {}),
});

function run(w: World, lists: Record<string, SubmittedAction[]>, seed = 'r1', state: GameState = w.state): RoundResult & { status: 'completed' } {
  const s = subs(...Object.entries(lists).map(([k, actions]) => sub(w.P[k]!, actions)));
  const r = resolveRound(state, s, seed, opts);
  if (r.status !== 'completed') throw new Error('väntade completed');
  assertValidState(r.state, content);
  return r;
}

const events = (r: RoundResult, kind: string, pid?: PlayerId): RoundEvent[] =>
  r.resolution.events.filter((ev) => ev.kind === kind && (pid === undefined || ev.playerId === pid));

const only = (pid: PlayerId) => ({ kind: 'players', ids: [pid] });

describe('förflyttning', () => {
  it('Move flyttar vampyren till grannstaden; bara spelaren får moved-eventet', () => {
    const w = world({ a: { title: null } });
    const r = run(w, { a: [v('move', { to: 'east' })] });
    expect(r.state.players[w.P.a!]!.location).toBe('east');
    expect(r.resolution.entries[e(w.P.a!, 0)]!.status).toBe('resolved');
    const [moved] = events(r, 'moved');
    expect(moved!.data).toEqual({ performer: { kind: 'vampire' }, from: 'north', to: 'east' });
    expect(moved!.audience).toEqual(only(w.P.a!));
    expect(events(r, 'actions_paid')[0]!.data!.amount).toBe(10);
  });

  it('två Move i rad följer positionen genom listan (K4)', () => {
    const w = world({ a: { title: null } });
    const r = run(w, { a: [v('move', { to: 'east' }), v('move', { to: 'south' })] });
    expect(r.state.players[w.P.a!]!.location).toBe('south');
  });

  it('Monstrous (Nosferatu): Move kostar +5', () => {
    const w = world({ a: { title: null, clan: 'nosferatu' } });
    const r = run(w, { a: [v('move', { to: 'east' })] });
    expect(events(r, 'actions_paid')[0]!.data!.amount).toBe(15);
  });

  it('moveBlocked: grannskap, avstånd och Sail vid upplösning', () => {
    const s = cloneJson(world({ a: {} }).state) as Mutable<GameState>;
    expect(moveBlocked(s, c('north'), c('east'), { kind: 'adjacent' })).toBeNull();
    expect(moveBlocked(s, c('north'), c('isle'), { kind: 'adjacent' })).toMatch(/adjacent/);
    expect(moveBlocked(s, c('north'), c('isle'), { kind: 'within', steps: 2 })).toBeNull();
    expect(moveBlocked(s, c('west'), c('isle'), { kind: 'within', steps: 1 })).toMatch(/steps/);
    expect(moveBlocked(s, c('north'), c('south'), { kind: 'sail' })).toBeNull();
    expect(moveBlocked(s, c('north'), c('isle'), { kind: 'sail' })).toMatch(/sea region/);
    expect(moveBlocked(s, c('east'), c('south'), { kind: 'sail' })).toMatch(/port/);
    s.seaRegions['north_sea' as keyof typeof s.seaRegions]!.storm = { untilEndOfRound: s.round };
    expect(moveBlocked(s, c('north'), c('south'), { kind: 'sail' })).toMatch(/Storm/);
    // South–isle delar west_sea, som inte har storm.
    expect(moveBlocked(s, c('south'), c('isle'), { kind: 'sail' })).toBeNull();
  });

  it('Sail flyttar mellan hamnar; storm stryker aktionen och inget betalas', () => {
    const w = world({ a: { title: null } });
    expect(run(w, { a: [v('sail', { to: 'south' })] }).state.players[w.P.a!]!.location).toBe('south');

    const stormy = cloneJson(w.state) as Mutable<GameState>;
    stormy.seaRegions['north_sea' as keyof typeof stormy.seaRegions]!.storm = { untilEndOfRound: 1 };
    const r = run(w, { a: [v('sail', { to: 'south' })] }, 'r1', stormy as GameState);
    expect(r.state.players[w.P.a!]!.location).toBe('north');
    expect(r.resolution.entries[e(w.P.a!, 0)]!.status).not.toBe('resolved');
    expect(r.state.players[w.P.a!]!.blood).toBe(100);
  });

  it('minionernas Move och Archon Movement (högst två steg)', () => {
    const w = world(
      { j: { title: 'justicar' }, a: { title: null } },
      { arch: { owner: 'j', type: 'archon', level: 1 }, gh: { owner: 'a', type: 'ghoul', level: 1 } },
    );
    const r = run(w, {
      j: [mn('archon_movement', w.M.arch!, { to: 'isle' })],
      a: [mn('minion_move', w.M.gh!, { to: 'west' })],
    });
    expect(r.state.minions[w.M.arch!]!.location).toBe('isle');
    expect(r.state.minions[w.M.gh!]!.location).toBe('west');
    expect(events(r, 'moved', w.P.a!)[0]!.data!.performer).toEqual({ kind: 'minion', minionId: w.M.gh! });
  });
});

describe('Bleed och inkomst', () => {
  /** Summan av tärningarna i `bled`-eventet. */
  const bled = (r: RoundResult, pid: PlayerId) => events(r, 'bled', pid)[0]!.data as {
    cityId: string;
    rolled: number;
    drained: number;
    gained: number;
    dice: number[];
  };

  it('Bleed i egen domän: 2D10×5, staden tappar blood flow, blood kommer i 5b efter stadens inkomst i 5a', () => {
    const w = world({ p: { title: 'prince', clan: 'brujah', controls: ['north'], blood: 100 } });
    const r = run(w, { p: [v('bleed')] });
    const b = bled(r, w.P.p!);
    expect(b.dice).toHaveLength(2);
    expect(b.rolled).toBe(5 * (b.dice[0]! + b.dice[1]!));
    expect(b.drained).toBe(Math.min(b.rolled, 100));
    expect(b.gained).toBe(b.drained);

    const city = events(r, 'city_income', w.P.p!)[0]!;
    expect(city.phase).toBe('5a_city_income');
    expect(city.data).toEqual({ amount: 100 - b.drained, cities: { north: 100 - b.drained } });
    const bleed = events(r, 'bleed_income', w.P.p!)[0]!;
    expect(bleed.phase).toBe('5b_bleed_income');
    expect(bleed.data!.amount).toBe(b.gained);
    expect(r.state.players[w.P.p!]!.blood).toBe(100 + 100);
    for (const ev of [city, bleed, events(r, 'bled')[0]!]) expect(ev.audience).toEqual(only(w.P.p!));
  });

  it('Bleed utanför domänen: 1D10×5', () => {
    const w = world({ a: { title: null, clan: 'brujah', location: 'east' } });
    const b = bled(run(w, { a: [v('bleed')] }), w.P.a!);
    expect(b.dice).toHaveLength(1);
    expect(b.rolled).toBe(5 * b.dice[0]!);
  });

  it('Picky eater (Ventrue): −10 på vad spelaren får, staden tappar hela beloppet', () => {
    const w = world({ a: { title: null, clan: 'ventrue', location: 'east' } });
    const r = run(w, { a: [v('bleed')] });
    const b = bled(r, w.P.a!);
    expect(b.gained).toBe(Math.max(0, b.drained - 10));
    expect(r.state.players[w.P.a!]!.blood).toBe(100 + b.gained);
  });

  it('man kan inte bleeda mer än stadens kvarvarande blood flow', () => {
    // Isle har 40 i blood flow. Fyra bleeds i domänen tömmer den garanterat inte över 40.
    const w = world({
      a: { title: null, clan: 'brujah', location: 'isle' },
      b: { title: null, clan: 'brujah', location: 'isle' },
      p: { title: 'prince', clan: 'brujah', location: 'isle', controls: ['isle'] },
    });
    const r = run(w, { a: [v('bleed'), v('bleed')], b: [v('bleed')], p: [v('bleed')] });
    const all = events(r, 'bled').map((ev) => ev.data as { drained: number; rolled: number });
    expect(all.reduce((s, x) => s + x.drained, 0)).toBeLessThanOrEqual(40);
    for (const x of all) expect(x.drained).toBeLessThanOrEqual(x.rolled);
    // Prince får det som är kvar av blood flow i 5a.
    const left = 40 - all.reduce((s, x) => s + x.drained, 0);
    expect(events(r, 'city_income', w.P.p!)[0]?.data?.amount ?? 0).toBe(left);
  });

  it('bleedens sänkning gäller bara ronden: modifiern är borta nästa rond', () => {
    const w = world({ a: { title: null, clan: 'brujah' } });
    const r = run(w, { a: [v('bleed')] });
    expect(r.state.round).toBe(2);
    expect(r.state.cities['north' as CityId]!.modifiers).toEqual([]);
    expect(cityStat(r.state, content, c('north'), 'bloodFlow')).toBe(100);
  });

  it('contested stad ger ingen inkomst (gd:507)', () => {
    const w = world({ p: { title: 'prince', controls: ['north'] }, x: { title: null, location: 'north' } });
    const s = cloneJson(w.state) as Mutable<GameState>;
    s.cities['north' as CityId]!.contestants = [{ playerId: w.P.x!, sinceRound: 1 }];
    const r = run(w, {}, 'r1', s as GameState);
    expect(events(r, 'city_income')).toEqual([]);
    expect(r.state.players[w.P.p!]!.blood).toBe(100);
  });

  it('Bottomless Wealth ger 250 i fas 5c, bara spelaren ser inkomsten', () => {
    const w = world({ ic: { title: 'inner_circle' } });
    const r = run(w, { ic: [v('bottomless_wealth_of_the_camarilla')] });
    const ev = events(r, 'other_income', w.P.ic!)[0]!;
    expect(ev.phase).toBe('5c_other_income');
    expect(ev.data!.amount).toBe(250);
    expect(ev.audience).toEqual(only(w.P.ic!));
    expect(r.state.players[w.P.ic!]!.blood).toBe(350);
  });

  it('Bleed the Enemy: ghoulen bleedar sin stad för level D10 × 2 till ägaren', () => {
    const w = world({ a: { title: null } }, { gh: { owner: 'a', type: 'ghoul', level: 2, location: 'east' } });
    const r = run(w, { a: [mn('bleed_the_enemy', w.M.gh!)] });
    const b = bled(r, w.P.a!);
    expect(b.cityId).toBe('east');
    expect(b.dice).toHaveLength(2);
    expect(b.rolled).toBe(2 * (b.dice[0]! + b.dice[1]!));
    // Upkeep 10 för en level 2-ghoul.
    expect(r.state.players[w.P.a!]!.blood).toBe(100 - 10 + b.gained);
  });

  it('samma seed ger samma rond; annan seed kan ge andra tärningar', () => {
    const w = world({ a: { title: null, clan: 'brujah' }, b: { title: null, clan: 'brujah', location: 'east' } });
    const lists = { a: [v('bleed'), v('move', { to: 'east' }), v('bleed')], b: [v('bleed')] };
    expect(canonicalJson(run(w, lists, 's').resolution)).toBe(canonicalJson(run(w, lists, 's').resolution));
  });
});

describe('effekter i katalogen', () => {
  it('byggda effekter är inte stubbar', () => {
    const stubs = new Set(stubbedActionIds());
    for (const id of [
      'move',
      'sail',
      'minion_move',
      'minion_sail',
      'archon_movement',
      'bleed',
      'bleed_the_enemy',
      'artifact_aarons_feeding_razor',
      'bottomless_wealth_of_the_camarilla',
      'artifact_diamond_of_toreador',
      'presence_m',
    ]) {
      expect(stubs.has(id), id).toBe(false);
    }
  });
});
