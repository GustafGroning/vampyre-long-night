/** Klocka, seed och id från plattformen (Web Crypto finns i både Deno och Node). */
export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function cryptoContext(): { now: () => number; randomSeed: () => string; newId: () => string } {
  return { now: () => Date.now(), randomSeed, newId: () => crypto.randomUUID() };
}
