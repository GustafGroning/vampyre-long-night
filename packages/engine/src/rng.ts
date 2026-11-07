/**
 * Seedad, deterministisk slumpgenerator.
 *
 * Algoritm: sfc32 (Small Fast Counter, Chris Doty-Humphrey), seedad via
 * cyrb128-hashning av en sträng. Valet motiveras i docs/decisions/DECISIONS.md (S6).
 *
 * Egenskaper som motorn förlitar sig på:
 * - Samma seed ger alltid samma sekvens, på alla plattformar (endast 32-bitars
 *   heltalsaritmetik via Math.imul och >>> 0, inga flyttal i själva generatorn).
 * - Tillståndet är fyra uint32 och kan sparas som JSON och återställas mitt i en
 *   sekvens (behövs för återupptagbar upplösning, M11).
 * - `int` använder rejection sampling, så det finns ingen modulo-bias.
 * - Delströmmar skapas med `deriveSeed`, så att en extra tärning i en del av
 *   upplösningen inte flyttar alla andra slag (M9).
 */

/** Serialiserbart tillstånd för en RNG. Ren JSON. */
export interface RngState {
  readonly algorithm: 'sfc32';
  readonly s: readonly [number, number, number, number];
}

export interface Rng {
  /** Nästa råa 32-bitars heltal, 0 till 2^32 - 1. */
  nextUint32(): number;
  /** Heltal i [min, max], båda inklusive. Kräver max - min + 1 <= 2^32. */
  int(min: number, max: number): number;
  /** Ett tärningsslag 1..sides, t.ex. die(4) för en D4. */
  die(sides: number): number;
  /** `count` tärningsslag 1..sides, i slagordning. */
  roll(count: number, sides: number): number[];
  /** Sant med sannolikheten `probability` (0..1). Används t.ex. för 25 %-curses. */
  chance(probability: number): boolean;
  /** Ett slumpvis element. Kastar på tom array. */
  pick<T>(items: readonly T[]): T;
  /** Ny array i slumpad ordning (Fisher-Yates). Indata ändras inte. */
  shuffle<T>(items: readonly T[]): T[];
  /** Kopia av nuvarande tillstånd, för att spara och återuppta. */
  getState(): RngState;
}

const UINT32 = 0x1_0000_0000;

/**
 * cyrb128: hashar en sträng till fyra 32-bitars heltal. Används bara för att
 * sprida en seed-sträng över sfc32:s 128-bitars tillstånd.
 */
function cyrb128(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function assertIntegerArg(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} måste vara ett heltal, fick ${value}`);
  }
}

function makeRng(initial: readonly [number, number, number, number]): Rng {
  let a = initial[0] >>> 0;
  let b = initial[1] >>> 0;
  let c = initial[2] >>> 0;
  let d = initial[3] >>> 0;

  function nextUint32(): number {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  }

  function int(min: number, max: number): number {
    assertIntegerArg('min', min);
    assertIntegerArg('max', max);
    if (max < min) throw new RangeError(`int(${min}, ${max}): max < min`);
    const range = max - min + 1;
    if (range > UINT32) throw new RangeError(`int(${min}, ${max}): intervallet är större än 2^32`);
    // Rejection sampling: kasta värden i den ofullständiga sista "hinken".
    const limit = UINT32 - (UINT32 % range);
    let x = nextUint32();
    while (x >= limit) x = nextUint32();
    return min + (x % range);
  }

  function die(sides: number): number {
    assertIntegerArg('sides', sides);
    if (sides < 1) throw new RangeError(`die(${sides}): måste ha minst 1 sida`);
    return int(1, sides);
  }

  function roll(count: number, sides: number): number[] {
    assertIntegerArg('count', count);
    if (count < 0) throw new RangeError(`roll(${count}, ${sides}): negativt antal`);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(die(sides));
    return out;
  }

  function chance(probability: number): boolean {
    if (!(probability >= 0 && probability <= 1)) {
      throw new RangeError(`chance(${probability}): sannolikheten måste vara 0..1`);
    }
    if (probability === 0) return false;
    if (probability === 1) return true;
    // Exakt för sannolikheter som är multipler av 2^-32 (t.ex. 0.25).
    return nextUint32() < probability * UINT32;
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick: tom array');
    return items[int(0, items.length - 1)] as T;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  function getState(): RngState {
    return { algorithm: 'sfc32', s: [a, b, c, d] };
  }

  return { nextUint32, int, die, roll, chance, pick, shuffle, getState };
}

/** Antal värden som kastas efter seedning, så att närliggande seeds divergerar. */
const WARMUP = 15;

/** Skapar en RNG från en seed-sträng. */
export function createRng(seed: string): Rng {
  const rng = makeRng(cyrb128(seed));
  for (let i = 0; i < WARMUP; i++) rng.nextUint32();
  return rng;
}

/** Återskapar en RNG från ett sparat tillstånd; fortsätter exakt där den slutade. */
export function restoreRng(state: RngState): Rng {
  if (state.algorithm !== 'sfc32') {
    throw new Error(`restoreRng: okänd algoritm ${String(state.algorithm)}`);
  }
  for (const v of state.s) {
    if (!Number.isInteger(v) || v < 0 || v >= UINT32) {
      throw new RangeError(`restoreRng: ogiltigt tillstånd ${JSON.stringify(state.s)}`);
    }
  }
  return makeRng(state.s);
}

/**
 * Härleder en seed för en namngiven delström, t.ex.
 * `deriveSeed(roundSeed, 'combat', combatId, 'round', 2)`.
 * Delarna kodas som JSON, så `('a/b')` och `('a', 'b')` ger olika seeds.
 */
export function deriveSeed(base: string, ...parts: ReadonlyArray<string | number>): string {
  return JSON.stringify([base, ...parts]);
}
