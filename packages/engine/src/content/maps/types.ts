/**
 * Kartmallar. Kartan är data per kampanj (C14): mallen kopieras in i GameState
 * när kampanjen skapas, och GM kan ändra den för sin kampanj utan att påverka andra.
 */

export interface CityTemplate {
  /** Blir stadens id i state, t.ex. `london`. Gemener, a–z, 0–9 och `_`. */
  readonly key: string;
  readonly name: string;
  readonly isPort: boolean;
  /** Havsregioner hamnen ligger vid. Tom för inlandsstäder. */
  readonly seaRegions: readonly string[];
  readonly stability: number;
  readonly masquerade: number;
  readonly intercept: number;
  readonly bloodFlow: number;
  /** Position för kartvyn; ingen spelmekanik. */
  readonly position?: { readonly x: number; readonly y: number };
}

export interface SeaRegionTemplate {
  readonly key: string;
  readonly name: string;
}

export interface MapTemplate {
  readonly key: string;
  readonly name: string;
  /** Sant om mallen innehåller gissade värden som inte bekräftats av GM. */
  readonly provisional: boolean;
  readonly notes?: string;
  readonly seaRegions: readonly SeaRegionTemplate[];
  readonly cities: readonly CityTemplate[];
  /** Oriktade grannpar. Varje par får bara förekomma en gång. */
  readonly adjacencies: readonly (readonly [string, string])[];
}
