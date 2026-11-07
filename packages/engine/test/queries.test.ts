import { describe, expect, it } from 'vitest';
import {
  actingTitle,
  apparentFaction,
  apparentTitle,
  artifactLocation,
  baseActionBudget,
  baseIvoryTowerVotes,
  cityStat,
  citySect,
  cloneJson,
  compareIds,
  controlledCityIds,
  domainCityIds,
  effectiveStat,
  finalScore,
  hasDiscipline,
  isInDomain,
  minionEffectiveLevel,
  minionStat,
  minionUpkeep,
  minionsOwnedBy,
  playerStat,
  playerVp,
  sharedSeaRegions,
  sortedIds,
  type ArtifactId,
  type CityId,
  type GameState,
  type MinionId,
  type Mutable,
  type StatModifier,
} from '../src/index.js';
import { P, content, sampleState } from './fixtures.js';

const edit = (mutate: (s: Mutable<GameState>) => void): GameState => {
  const s = cloneJson(sampleState()) as unknown as Mutable<GameState>;
  mutate(s);
  return s as unknown as GameState;
};
const mod = (source: string, amount: number, expiresAfterRound: number | null = null): StatModifier => ({
  stat: 'strength',
  amount,
  source,
  expiresAfterRound,
});

describe('Rule of Three (effectiveStat)', () => {
  it('regelbokens exempel: Protean ×3 + Black Gloves = +5 (gd:532)', () => {
    const mods = [mod('discipline:protean', 1), mod('discipline:protean', 1), mod('discipline:protean', 1), mod('discipline:protean', 1), mod('artifact:black_gloves', 2)];
    expect(effectiveStat(0, mods, 'strength', 1, 3)).toBe(5);
  });

  it('kapar per källa, inte totalt', () => {
    expect(effectiveStat(0, [mod('a', 3), mod('b', 3), mod('c', 3)], 'strength', 1, 3)).toBe(9);
    expect(effectiveStat(0, [mod('a', 5)], 'strength', 1, 3)).toBe(3);
  });

  it('kapar inte avdrag', () => {
    expect(effectiveStat(0, [mod('clan:banu_haqim', -1), mod('a', 5)], 'strength', 1, 3)).toBe(2);
    expect(effectiveStat(0, [mod('a', -5)], 'strength', 1, 3)).toBe(-5);
  });

  it('nettar bonus och avdrag inom samma källa före taket', () => {
    expect(effectiveStat(0, [mod('a', 4), mod('a', -2)], 'strength', 1, 3)).toBe(2);
  });

  it('Charge-strength ignorerar Rule of Three (gd:162)', () => {
    const charge: StatModifier = { ...mod('combat:charge', 7), ignoresRuleOfThree: true };
    expect(effectiveStat(0, [charge, mod('a', 3)], 'strength', 1, 3)).toBe(10);
  });

  it('ignorerar utgångna modifiers och andra stats', () => {
    const mods: StatModifier[] = [mod('old', 2, 1), mod('now', 1, 2), { ...mod('s', 3), stat: 'stealth' }];
    expect(effectiveStat(0, mods, 'strength', 2, 3)).toBe(1);
  });

  it('playerStat räknar med klan-cursen', () => {
    const s = sampleState();
    expect(playerStat(s, content, P.justicar, 'strength')).toBe(-1);
    expect(playerStat(s, content, P.prince, 'strength')).toBe(1);
    expect(playerStat(s, content, P.prince, 'stealth')).toBe(1);
  });
});

describe('minions', () => {
  it('level är bas för alla stats (gd:215)', () => {
    const s = sampleState();
    expect(minionStat(s, content, 'minion-1' as MinionId, 'strength')).toBe(2);
    expect(minionStat(s, content, 'minion-3' as MinionId, 'intercept')).toBe(1);
  });

  it('en buren artefakt ger minionbonusen', () => {
    const s = edit((s) => {
      s.artifacts['artifact-4' as ArtifactId]!.holder = { kind: 'minion', id: 'minion-3' as MinionId }; // Fog Flute: +1 stealth
    });
    expect(minionStat(s, content, 'minion-3' as MinionId, 'stealth')).toBe(2);
    expect(minionStat(s, content, 'minion-3' as MinionId, 'strength')).toBe(1);
    expect(artifactLocation(s, 'artifact-4' as ArtifactId)).toBe('south');
  });

  it('Scepter of Ventrue höjer level men högst till 3', () => {
    const s = edit((s) => {
      s.artifacts['artifact-4' as ArtifactId] = {
        id: 'artifact-4' as ArtifactId,
        definition: 'scepter_of_ventrue',
        holder: { kind: 'minion', id: 'minion-1' as MinionId },
        boundDiscipline: null,
      };
      s.minions['minion-1' as MinionId]!.level = 3;
    });
    expect(minionEffectiveLevel(s, content, 'minion-1' as MinionId)).toBe(3);
  });

  it('upkeep per typ och level, Archon gratis (gd:249–358)', () => {
    const s = sampleState();
    const upkeep = (id: string): number => minionUpkeep(content, s.minions[id as MinionId]!);
    expect(upkeep('minion-1')).toBe(10); // LV2 Ghoul
    expect(upkeep('minion-2')).toBe(10); // LV2 Eye
    expect(upkeep('minion-5')).toBe(0); // LV2 Archon
    expect(upkeep('minion-6')).toBe(20); // LV1 Primogen
    expect(upkeep('minion-9')).toBe(30); // LV2 Harpy
  });

  it('minionsOwnedBy i id-ordning', () => {
    expect(minionsOwnedBy(sampleState(), P.inner).map((m) => m.name)).toEqual(['Ron', 'Jenny', 'G1', 'G2']);
  });
});

describe('titlar, sekt och förklädnad', () => {
  it('en dold Archbishop ser ut som sin förklädnad', () => {
    const b = sampleState().players[P.bishop]!;
    expect(b.faction).toBe('sabbat');
    expect(apparentFaction(b)).toBe('camarilla');
    expect(apparentTitle(b)).toBe('prince');
    expect(actingTitle(b)).toBe('prince');
  });

  it('en exponerad Archbishop är Archbishop', () => {
    const s = edit((s) => (s.players[P.bishop]!.disguise = null));
    const b = s.players[P.bishop]!;
    expect(apparentFaction(b)).toBe('sabbat');
    expect(actingTitle(b)).toBe('archbishop');
  });

  it('stadens sekt följer controllerns skenbara sekt (M3)', () => {
    const s = sampleState();
    expect(citySect(s, 'north' as CityId)).toBe('camarilla');
    expect(citySect(s, 'west' as CityId)).toBe('anarch');
    expect(citySect(s, 'east' as CityId)).toBe('camarilla'); // förklädd Archbishop
    expect(citySect(s, 'south' as CityId)).toBeNull();
  });
});

describe('aktionsbudget (M6)', () => {
  it('per titel', () => {
    const s = sampleState();
    expect(baseActionBudget(s, content, P.inner)).toBe(6);
    expect(baseActionBudget(s, content, P.justicar)).toBe(4);
    expect(baseActionBudget(s, content, P.prince)).toBe(4);
    expect(baseActionBudget(s, content, P.baron)).toBe(5);
    expect(baseActionBudget(s, content, P.untitled)).toBe(3);
  });

  it('dold Archbishop använder förklädnaden, exponerad har 4', () => {
    const hiddenAsBaron = edit((s) => (s.players[P.bishop]!.disguise = { title: 'baron', faction: 'anarch' }));
    expect(baseActionBudget(hiddenAsBaron, content, P.bishop)).toBe(5);
    const exposed = edit((s) => (s.players[P.bishop]!.disguise = null));
    expect(baseActionBudget(exposed, content, P.bishop)).toBe(4);
  });

  it('torpor 1, bränd 0', () => {
    const s = edit((s) => {
      s.players[P.inner]!.status = 'torpor';
      s.players[P.inner]!.torpor = { progress: 0, required: 3, sinceRound: 1 };
      s.players[P.baron]!.status = 'burned';
      s.players[P.baron]!.location = null;
    });
    expect(baseActionBudget(s, content, P.inner)).toBe(1);
    expect(baseActionBudget(s, content, P.baron)).toBe(0);
  });
});

describe('Ivory Tower-röster (gd:582)', () => {
  it('per titel, 0 utanför Camarilla, förklädnaden räknas', () => {
    const s = sampleState();
    const votes = (id: typeof P.inner): number => baseIvoryTowerVotes(content, s.players[id]!);
    expect(votes(P.inner)).toBe(4);
    expect(votes(P.justicar)).toBe(3);
    expect(votes(P.prince)).toBe(2);
    expect(votes(P.baron)).toBe(0);
    expect(votes(P.bishop)).toBe(2);
    expect(votes(P.untitled)).toBe(0); // Anarch utan titel
  });

  it('Camarilla utan titel har 1 röst', () => {
    const s = edit((s) => (s.players[P.prince]!.title = null));
    expect(baseIvoryTowerVotes(content, s.players[P.prince]!)).toBe(1);
  });
});

describe('domän (gd:534)', () => {
  it('stadstitlar: kontrollerade städer; Justicar och Inner Circle: alla Camarilla-städer', () => {
    const s = sampleState();
    expect(domainCityIds(s, content, P.prince)).toEqual(['north']);
    expect(domainCityIds(s, content, P.baron)).toEqual(['west']);
    expect(domainCityIds(s, content, P.justicar)).toEqual(['east', 'north']);
    expect(domainCityIds(s, content, P.inner)).toEqual(['east', 'north']);
    expect(domainCityIds(s, content, P.untitled)).toEqual([]);
    expect(isInDomain(s, content, P.prince)).toBe(true);
    expect(isInDomain(s, content, P.justicar)).toBe(true);
    expect(isInDomain(s, content, P.inner)).toBe(false);
  });

  it('controlledCityIds', () => {
    expect(controlledCityIds(sampleState(), P.bishop)).toEqual(['east']);
  });
});

describe('städer', () => {
  it('modifiers läggs på och kläms till 0..5', () => {
    const s = edit((s) => {
      const c = s.cities['south' as CityId]!;
      c.modifiers.push({ stat: 'stability', amount: 2, source: 'x', expiresAfterRound: null });
      c.modifiers.push({ stat: 'intercept', amount: 2, source: 'action:anarch_free_press', expiresAfterRound: 0 });
      c.modifiers.push({ stat: 'bloodFlow', amount: -500, source: 'bleed', expiresAfterRound: 0 });
    });
    expect(cityStat(s, content, 'south' as CityId, 'stability')).toBe(5);
    expect(cityStat(s, content, 'south' as CityId, 'intercept')).toBe(5);
    expect(cityStat(s, content, 'south' as CityId, 'bloodFlow')).toBe(0);
    expect(cityStat(s, content, 'south' as CityId, 'masquerade')).toBe(5);
  });

  it('havsregioner för Sail', () => {
    const s = sampleState();
    expect(sharedSeaRegions(s, 'north' as CityId, 'south' as CityId)).toEqual(['north_sea']);
    expect(sharedSeaRegions(s, 'isle' as CityId, 'south' as CityId)).toEqual(['west_sea']);
    expect(sharedSeaRegions(s, 'north' as CityId, 'isle' as CityId)).toEqual([]);
    expect(sharedSeaRegions(s, 'east' as CityId, 'south' as CityId)).toEqual([]);
  });
});

describe('VP', () => {
  it('summerar ledgern och ger 0 i torpor eller bränd (gd:561)', () => {
    const s = edit((s) => {
      s.players[P.inner]!.vpLedger.push({ round: 2, amount: 3, rule: 'inner_circle:every_second_round' });
      s.players[P.inner]!.vpLedger.push({ round: 3, amount: -1, rule: 'claim_credit', ref: 'player-3' });
    });
    const inner = s.players[P.inner]!;
    expect(playerVp(inner)).toBe(5);
    expect(finalScore(inner)).toBe(5);
    expect(finalScore({ ...inner, status: 'torpor' })).toBe(0);
    expect(finalScore({ ...inner, status: 'burned' })).toBe(0);
  });
});

describe('discipliner', () => {
  it('bas, mastered och tillfälliga', () => {
    const s = edit((s) => {
      s.round = 2;
      s.phase = 'submission';
      s.players[P.baron]!.temporaryDisciplines.push({ discipline: 'auspex', level: 'mastered', source: 'artifact:vial_of_elder_blood', expiresAfterRound: 2 });
      s.players[P.baron]!.temporaryDisciplines.push({ discipline: 'obfuscate', level: 'basic', source: 'discipline:thaumaturgy', expiresAfterRound: 1 });
    });
    expect(hasDiscipline(s, P.baron, 'potence', 'mastered')).toBe(true);
    expect(hasDiscipline(s, P.baron, 'celerity', 'mastered')).toBe(false);
    expect(hasDiscipline(s, P.baron, 'celerity')).toBe(true);
    expect(hasDiscipline(s, P.baron, 'auspex', 'mastered')).toBe(true);
    expect(hasDiscipline(s, P.baron, 'obfuscate')).toBe(false); // utgången
  });

  it("Martinelli's Ring tar bort Dementation (gd:397)", () => {
    const s = edit((s) => {
      s.artifacts['artifact-3' as ArtifactId] = {
        id: 'artifact-3' as ArtifactId,
        definition: 'martinellis_ring_of_clear_thought',
        holder: { kind: 'player', id: P.untitled },
        boundDiscipline: null,
      };
    });
    expect(hasDiscipline(sampleState(), P.untitled, 'dementation')).toBe(true);
    expect(hasDiscipline(s, P.untitled, 'dementation')).toBe(false);
  });
});

describe('sortering', () => {
  it('compareIds sorterar löpnummer numeriskt', () => {
    expect(['minion-10', 'minion-2', 'minion-1', 'artifact-3'].sort(compareIds)).toEqual([
      'artifact-3',
      'minion-1',
      'minion-2',
      'minion-10',
    ]);
  });

  it('sortedIds är oberoende av insättningsordning', () => {
    expect(sortedIds({ b: 1, a: 2, 'x-10': 3, 'x-9': 4 })).toEqual(['a', 'b', 'x-9', 'x-10']);
  });
});
