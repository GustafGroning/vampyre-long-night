import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_KEYS,
  CLANS,
  DEFAULT_CONTENT,
  DISCIPLINES,
  MINION_TYPES,
  TITLES,
  findNonJson,
} from '../src/index.js';

describe('content', () => {
  it('är ren JSON (kan lagras och versioneras som data, SPEC B11)', () => {
    expect(findNonJson(DEFAULT_CONTENT)).toBeNull();
  });

  it('14 klaner med tre giltiga, unika discipliner var', () => {
    expect(Object.keys(DEFAULT_CONTENT.clans).sort()).toEqual([...CLANS].sort());
    for (const c of Object.values(DEFAULT_CONTENT.clans)) {
      expect(new Set(c.disciplines).size).toBe(3);
      for (const d of c.disciplines) expect(DISCIPLINES).toContain(d);
    }
  });

  it('14 discipliner', () => {
    expect(Object.keys(DEFAULT_CONTENT.disciplines)).toHaveLength(14);
  });

  it('30 artefakter plus den Thaumaturgy-skapade', () => {
    expect(ARTIFACT_KEYS).toHaveLength(31);
    expect(Object.keys(DEFAULT_CONTENT.artifacts).sort()).toEqual([...ARTIFACT_KEYS].sort());
    const inPool = Object.values(DEFAULT_CONTENT.artifacts).filter((a) => a.inRandomPool);
    expect(inPool).toHaveLength(30);
    for (const a of Object.values(DEFAULT_CONTENT.artifacts)) {
      expect(a.cost === null).toBe(a.stealth === null);
    }
  });

  it('titlarnas budget och röster enligt regelboken', () => {
    const t = DEFAULT_CONTENT.titles;
    expect(Object.keys(t).sort()).toEqual([...TITLES].sort());
    expect([t.inner_circle, t.justicar, t.prince, t.baron, t.archbishop].map((x) => x.actionsPerRound)).toEqual([6, 4, 4, 5, 4]);
    expect([t.inner_circle, t.justicar, t.prince].map((x) => x.ivoryTowerVotes)).toEqual([4, 3, 2]);
    expect(t.prince.startingPackage?.royalPrivileges).toBe(2);
    expect(t.inner_circle.startingPackage?.vp).toBe(3);
    for (const title of Object.values(t)) {
      for (const opt of title.startingPackage?.minionOptions ?? []) {
        for (const slot of opt) for (const type of slot.types) expect(MINION_TYPES).toContain(type);
      }
      if (title.startingPackage) expect(title.startingPackage.upgradeOptions).toHaveLength(4);
    }
  });

  it('minion-typer: upkeep och rekrytering enligt regelboken', () => {
    const m = DEFAULT_CONTENT.minionTypes;
    expect(MINION_TYPES.map((k) => m[k].upkeepPerLevel)).toEqual([5, 15, 5, 20, 0]);
    expect(m.ghoul.recruitCost).toEqual([25, 50, 75]);
    expect(m.harpy.recruitCost).toEqual([30, 60, 90]);
    expect(m.eye.recruitCost).toEqual([20, 40, 60]);
    expect(m.primogen.recruitableBy).toEqual(['prince']);
    expect(m.archon.startingLoyalty).toBe(3);
  });
});
