/**
 * Hjälpfunktioner för att hålla state som ren JSON och jämföra state byte för byte.
 */

/** Sorterar id:n deterministiskt: `minion-2` före `minion-10`, annars kodpunktsordning. */
export function compareIds(a: string, b: string): number {
  const ma = /^(.*?)-(\d+)$/.exec(a);
  const mb = /^(.*?)-(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) {
    const na = Number(ma[2]);
    const nb = Number(mb[2]);
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Nycklarna i en Record i deterministisk ordning. Använd alltid denna vid iteration. */
export function sortedIds<K extends string>(record: Readonly<Record<K, unknown>>): K[] {
  return (Object.keys(record) as K[]).sort(compareIds);
}

/** Värdena i en Record i id-ordning. */
export function sortedValues<K extends string, V>(record: Readonly<Record<K, V>>): V[] {
  return sortedIds(record).map((id) => record[id]);
}

/**
 * Kontrollerar att ett värde är ren JSON: inga undefined, funktioner, klasser,
 * Map/Set/Date, NaN eller Infinity. Returnerar sökvägen till första felet, eller `null`.
 */
export function findNonJson(value: unknown, path = '$'): string | null {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return null;
    case 'number':
      return Number.isFinite(value) ? null : `${path}: ${value} är inte ett ändligt tal`;
    case 'object': {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const r = findNonJson(value[i], `${path}[${i}]`);
          if (r) return r;
        }
        return null;
      }
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        return `${path}: ${Object.prototype.toString.call(value)} är inte ett vanligt objekt`;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const r = findNonJson(v, `${path}.${k}`);
        if (r) return r;
      }
      return null;
    }
    default:
      return `${path}: ${typeof value} är inte JSON`;
  }
}

/**
 * Kanonisk JSON: objektnycklar sorteras, så två likvärdiga states ger exakt samma
 * sträng oavsett i vilken ordning fälten skapades. För determinismtester och hashning.
 */
export function canonicalJson(value: unknown): string {
  const problem = findNonJson(value);
  if (problem) throw new TypeError(`canonicalJson: ${problem}`);
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = src[k];
      return out;
    }
    return v;
  });
}

/** Djup kopia av ett JSON-värde (state är ren JSON, så detta är förlustfritt). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
