import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, restoreRng } from '../src/rng.js';

const take = (seed: string, n: number): number[] => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.nextUint32());
};

describe('createRng', () => {
  it('ger samma sekvens för samma seed', () => {
    expect(take('abc', 50)).toEqual(take('abc', 50));
  });

  it('ger olika sekvenser för olika, även närliggande, seeds', () => {
    const a = take('seed-1', 20);
    const b = take('seed-2', 20);
    expect(a).not.toEqual(b);
    // Ingen position ska råka vara lika: närliggande seeds ska ha divergerat helt.
    expect(a.filter((v, i) => v === b[i])).toEqual([]);
  });

  it('har stabila kända värden (fångar oavsiktligt byte av algoritm)', () => {
    // Om detta test ändras ändras alla tidigare kampanjers replays. Gör det bara medvetet.
    // Värdena är verifierade mot bryc:s referensimplementation av cyrb128 + sfc32
    // (github.com/bryc/code, PRNGs.md) med 15 uppvärmningsvärden.
    expect(take('vampyre', 5)).toMatchInlineSnapshot(`
      [
        4175918865,
        4286635484,
        245868026,
        105840571,
        3487221026,
      ]
    `);
    const r = createRng('vampyre');
    expect(r.roll(10, 4)).toMatchInlineSnapshot(`
      [
        2,
        1,
        3,
        4,
        3,
        3,
        1,
        2,
        4,
        1,
      ]
    `);
  });

  it('nextUint32 ligger i 0..2^32-1', () => {
    for (const v of take('range', 1000)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
});

describe('int, die, roll', () => {
  it('håller sig inom gränserna, båda inklusive', () => {
    const r = createRng('bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it('är ungefär likformig (chi-två på D4, D6, D10)', () => {
    const r = createRng('uniform');
    for (const sides of [4, 6, 10, 20]) {
      const n = 20000;
      const counts = new Array<number>(sides).fill(0);
      for (let i = 0; i < n; i++) counts[r.die(sides) - 1]! += 1;
      const expected = n / sides;
      const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
      // Kritiskt värde för p = 0.001 med 19 frihetsgrader är 43.8; mindre df ger lägre gräns.
      expect(chi2).toBeLessThan(45);
    }
  });

  it('int(min, min) returnerar min', () => {
    expect(createRng('x').int(7, 7)).toBe(7);
  });

  it('klarar hela 32-bitarsintervallet', () => {
    const v = createRng('wide').int(0, 2 ** 32 - 1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 32);
  });

  it('kastar på ogiltiga argument', () => {
    const r = createRng('bad');
    expect(() => r.int(3, 2)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(RangeError);
    expect(() => r.int(0, 2 ** 32)).toThrow(RangeError);
    expect(() => r.die(0)).toThrow(RangeError);
    expect(() => r.roll(-1, 6)).toThrow(RangeError);
    expect(() => r.chance(1.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it('roll ger rätt antal tärningar', () => {
    const dice = createRng('2d6').roll(2, 6);
    expect(dice).toHaveLength(2);
    for (const d of dice) expect(d).toBeGreaterThanOrEqual(1);
  });
});

describe('chance, pick, shuffle', () => {
  it('chance(0.25) slår in ungefär en gång av fyra', () => {
    const r = createRng('frenzy');
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.23);
    expect(hits / 20000).toBeLessThan(0.27);
  });

  it('chance(0) och chance(1) förbrukar inget slag', () => {
    const a = createRng('c');
    const b = createRng('c');
    a.chance(0);
    a.chance(1);
    expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('shuffle ger en permutation och ändrar inte indata', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const out = createRng('shuffle').shuffle(input);
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('shuffle når alla ordningar av tre element', () => {
    const r = createRng('perm');
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(r.shuffle(['a', 'b', 'c']).join(''));
    expect(seen.size).toBe(6);
  });

  it('pick returnerar ett element ur listan', () => {
    const items = ['x', 'y', 'z'];
    expect(items).toContain(createRng('p').pick(items));
  });
});

describe('getState och restoreRng', () => {
  it('fortsätter exakt där den slutade, även via JSON', () => {
    const r = createRng('resume');
    r.roll(17, 6);
    const saved = JSON.parse(JSON.stringify(r.getState())) as ReturnType<typeof r.getState>;
    const expected = Array.from({ length: 30 }, () => r.nextUint32());
    const resumed = restoreRng(saved);
    expect(Array.from({ length: 30 }, () => resumed.nextUint32())).toEqual(expected);
  });

  it('getState är en kopia som inte ändras när RNG:n fortsätter', () => {
    const r = createRng('copy');
    const s = r.getState();
    const before = JSON.stringify(s);
    r.nextUint32();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('avvisar ogiltigt tillstånd', () => {
    expect(() => restoreRng({ algorithm: 'sfc32', s: [1, 2, 3, -1] })).toThrow(RangeError);
    expect(() => restoreRng({ algorithm: 'sfc32', s: [1, 2, 3, 2 ** 32] })).toThrow(RangeError);
    expect(() => restoreRng({ algorithm: 'other' as 'sfc32', s: [1, 2, 3, 4] })).toThrow();
  });
});

describe('deriveSeed', () => {
  it('är deterministisk och skiljer på delar', () => {
    expect(deriveSeed('r', 'combat', 3)).toBe(deriveSeed('r', 'combat', 3));
    expect(deriveSeed('r', 'a/b')).not.toBe(deriveSeed('r', 'a', 'b'));
    expect(deriveSeed('r', 1)).not.toBe(deriveSeed('r', '1'));
  });

  it('ger oberoende delströmmar: extra slag i en ström påverkar inte en annan', () => {
    const base = 'round-seed';
    const combatA = createRng(deriveSeed(base, 'combat', 'combat-1'));
    const slotOrder1 = createRng(deriveSeed(base, 'slotOrder', 1)).shuffle(['p1', 'p2', 'p3', 'p4']);
    combatA.roll(5, 4); // extra slag i combat-strömmen
    const slotOrder2 = createRng(deriveSeed(base, 'slotOrder', 1)).shuffle(['p1', 'p2', 'p3', 'p4']);
    expect(slotOrder2).toEqual(slotOrder1);
  });
});
