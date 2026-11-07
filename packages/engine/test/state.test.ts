import { describe, expect, it } from 'vitest';
import {
  BRITISH_ISLES_MAP,
  TEST_MAP,
  canonicalJson,
  cloneJson,
  createGameState,
  findNonJson,
  instantiateMap,
  takeId,
  validateMapTemplate,
  validateState,
  type CityId,
  type GameState,
  type MapTemplate,
  type Mutable,
} from '../src/index.js';
import { P, SAMPLE_INPUT, content, sampleState } from './fixtures.js';

describe('createGameState', () => {
  it('skapar ett giltigt starttillstånd', () => {
    const s = sampleState();
    expect(validateState(s, content)).toEqual([]);
    expect(s.round).toBe(0);
    expect(s.phase).toBe('setup');
    expect(s.maxRounds).toBe(8);
    expect(Object.keys(s.players)).toHaveLength(6);
    expect(Object.keys(s.cities)).toHaveLength(5);
  });

  it('är deterministisk: samma indata ger byte-identiskt state', () => {
    expect(canonicalJson(sampleState())).toBe(canonicalJson(sampleState()));
  });

  it('är ren JSON och överlever en JSON-rundtur oförändrad', () => {
    const s = sampleState();
    expect(findNonJson(s)).toBeNull();
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(back).toEqual(s);
    expect(canonicalJson(back)).toBe(canonicalJson(s));
  });

  it('delar ut id:n i indataordning och räknar upp räknarna', () => {
    const s = sampleState();
    expect(Object.keys(s.players)).toEqual(['player-1', 'player-2', 'player-3', 'player-4', 'player-5', 'player-6']);
    expect(s.players[P.inner]?.name).toBe('Lady Inner');
    expect(s.counters.player).toBe(7);
    expect(s.counters.minion).toBe(10); // 9 minions
    expect(s.counters.artifact).toBe(5);
    expect(s.counters.npc).toBe(2);
  });

  it('sätter controller för städer i `controls`', () => {
    const s = sampleState();
    expect(s.cities['north' as CityId]?.controllerId).toBe(P.prince);
    expect(s.cities['east' as CityId]?.controllerId).toBe(P.bishop);
    expect(s.cities['south' as CityId]?.controllerId).toBeNull();
  });

  it('bokför start-VP i ledgern', () => {
    expect(sampleState().players[P.inner]?.vpLedger).toEqual([{ round: 0, amount: 3, rule: 'start' }]);
  });

  it('ger Banu Haqim permanent −1 Strength', () => {
    const j = sampleState().players[P.justicar];
    expect(j?.modifiers).toContainEqual({ stat: 'strength', amount: -1, source: 'clan:banu_haqim', expiresAfterRound: null });
  });

  it('ger Archons tre loyalty counters och andra minions inga', () => {
    const s = sampleState();
    const minions = Object.values(s.minions);
    expect(minions.find((m) => m.type === 'archon')?.loyaltyCounters).toBe(3);
    expect(minions.filter((m) => m.type !== 'archon').every((m) => m.loyaltyCounters === null)).toBe(true);
    expect(minions.every((m) => m.acquiredRound === 0)).toBe(true);
  });

  it('lägger poolartefakter i poolen', () => {
    const pool = Object.values(sampleState().artifacts).filter((a) => a.holder.kind === 'pool');
    expect(pool.map((a) => a.definition)).toEqual(['bloodspot_dice', 'fog_flute']);
  });

  it('kastar på okänd stad', () => {
    expect(() =>
      createGameState({ ...SAMPLE_INPUT, players: [{ ...SAMPLE_INPUT.players[0]!, location: 'atlantis' }] }, content),
    ).toThrow(/okänd stad "atlantis"/);
  });

  it('kastar om två spelare kontrollerar samma stad', () => {
    const [a, b] = [SAMPLE_INPUT.players[2]!, SAMPLE_INPUT.players[3]!];
    expect(() => createGameState({ ...SAMPLE_INPUT, players: [a, { ...b, controls: ['north'] }] }, content)).toThrow(
      /kontrolleras redan/,
    );
  });

  it('kastar om resultatet bryter mot en invariant (titel i fel sekt)', () => {
    const bad = { ...SAMPLE_INPUT.players[3]!, faction: 'camarilla' as const };
    expect(() => createGameState({ ...SAMPLE_INPUT, players: [bad] }, content)).toThrow(/hör till anarch/);
  });

  it('kastar om en artefakt som kräver bunden disciplin saknar den', () => {
    const p = { ...SAMPLE_INPUT.players[0]!, artifacts: [{ definition: 'ring_of_tremere' as const }] };
    expect(() => createGameState({ ...SAMPLE_INPUT, players: [p] }, content)).toThrow(/boundDiscipline/);
  });
});

describe('kartor', () => {
  it('instansierar testkartan med symmetriska, sorterade grannar', () => {
    const { cities, seaRegions } = instantiateMap(TEST_MAP);
    expect(cities['south' as CityId]?.adjacent).toEqual(['east', 'isle', 'north', 'west']);
    expect(cities['isle' as CityId]?.adjacent).toEqual(['south']);
    expect(Object.keys(seaRegions)).toEqual(['north_sea', 'west_sea']);
  });

  it('referenskartan är giltig: 18 städer, 37 grannpar, sammanhängande', () => {
    expect(validateMapTemplate(BRITISH_ISLES_MAP)).toEqual([]);
    expect(BRITISH_ISLES_MAP.provisional).toBe(true);
    const { cities } = instantiateMap(BRITISH_ISLES_MAP);
    const ids = Object.keys(cities) as CityId[];
    expect(ids).toHaveLength(18);
    expect(BRITISH_ISLES_MAP.adjacencies).toHaveLength(37);
    // Sammanhängande via land: bredden-först från London når alla.
    const seen = new Set<CityId>(['london' as CityId]);
    const queue: CityId[] = ['london' as CityId];
    while (queue.length) {
      for (const n of cities[queue.shift()!]?.adjacent ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(18);
  });

  it('validateMapTemplate hittar trasiga kartor', () => {
    const broken: MapTemplate = {
      ...TEST_MAP,
      cities: [...TEST_MAP.cities, { ...TEST_MAP.cities[0]!, key: 'North City' }, { ...TEST_MAP.cities[1]!, isPort: true }],
      adjacencies: [...TEST_MAP.adjacencies, ['north', 'east'], ['north', 'north'], ['north', 'nowhere']],
    };
    const errors = validateMapTemplate(broken).join('\n');
    expect(errors).toMatch(/ogiltig stadsnyckel "North City"/);
    expect(errors).toMatch(/dubblerad stad east/);
    expect(errors).toMatch(/north–east förekommer två gånger/);
    expect(errors).toMatch(/samma stad/);
    expect(errors).toMatch(/okänd stad/);
    expect(() => instantiateMap(broken)).toThrow(/Ogiltig karta/);
  });
});

describe('validateState hittar brott mot invarianter', () => {
  const broken = (mutate: (s: Mutable<GameState>) => void): string => {
    const s = cloneJson(sampleState()) as unknown as Mutable<GameState>;
    mutate(s);
    return validateState(s as unknown as GameState, content)
      .map((i) => `${i.path}: ${i.message}`)
      .join('\n');
  };

  it('osymmetriska grannar', () => {
    expect(broken((s) => s.cities['isle' as CityId]!.adjacent.push('north' as CityId))).toMatch(/inte symmetriskt/);
  });

  it('negativ blood och EXP över taket', () => {
    const out = broken((s) => {
      s.players[P.baron]!.blood = -5;
      s.players[P.baron]!.exp.spentTotal = 13;
    });
    expect(out).toMatch(/blood måste vara heltal ≥ 0/);
    expect(out).toMatch(/spenderad EXP 13 > tak 12/);
  });

  it('minion som bär två artefakter', () => {
    const out = broken((s) => {
      for (const a of Object.values(s.artifacts)) if (a.holder.kind === 'pool') a.holder = { kind: 'minion', id: 'minion-1' as never };
    });
    expect(out).toMatch(/bär redan/);
  });

  it('torpor utan torpor-läge och bränd vampyr med position', () => {
    const out = broken((s) => {
      s.players[P.baron]!.status = 'torpor';
      s.players[P.prince]!.status = 'burned';
    });
    expect(out).toMatch(/torpor-fältet stämmer inte/);
    expect(out).toMatch(/ogiltig position north för status burned/);
  });

  it('stadsstats utanför intervallet', () => {
    const out = broken((s) => {
      s.cities['north' as CityId]!.stability = 6;
      s.cities['north' as CityId]!.masquerade = -1;
    });
    expect(out).toMatch(/stability 6 utanför 0..5/);
    expect(out).toMatch(/masquerade -1 utanför 0..5/);
  });

  it('id som krockar med räknaren', () => {
    expect(broken((s) => (s.counters.minion = 3))).toMatch(/id ≥ räknaren 3/);
  });

  it('disguise på någon som inte är Archbishop', () => {
    expect(broken((s) => (s.players[P.prince]!.disguise = { title: 'baron', faction: 'anarch' }))).toMatch(
      /disguise kräver en Sabbat Archbishop/,
    );
  });

  it('icke-JSON-värden', () => {
    expect(broken((s) => ((s as unknown as { extra: unknown }).extra = new Date(0)))).toMatch(/inte ren JSON/);
    expect(broken((s) => (s.players[P.baron]!.blood = Number.NaN))).toMatch(/inte ett ändligt tal/);
  });

  it('Sabbat-bas på level 4', () => {
    expect(broken((s) => (s.sabbat.bases['east' as CityId] = { level: 4 as 3, builtRound: 1 }))).toMatch(/level utanför 1..3/);
  });
});

describe('takeId', () => {
  it('ger nya, unika id:n och räknar upp', () => {
    const s = cloneJson(sampleState()) as unknown as Mutable<GameState>;
    const a = takeId(s.counters, 'minion');
    const b = takeId(s.counters, 'minion');
    expect([a, b]).toEqual(['minion-10', 'minion-11']);
    expect(s.counters.minion).toBe(12);
    expect(Object.keys(s.minions)).not.toContain(a);
  });
});
