/**
 * Liten syntetisk karta för tester (C14 i motorbeslutet). Medvetet olika
 * startvärden per stad så att tester fångar förväxlade fält.
 *
 *   north ── east
 *     │    ╲   │
 *   west ── south ── isle (ö, nås bara via hav eller south)
 *
 * Hamnar: north (north_sea), south (north_sea, west_sea), isle (west_sea).
 */
import type { MapTemplate } from './types.js';

export const TEST_MAP: MapTemplate = {
  key: 'test_map',
  name: 'Testkarta',
  provisional: false,
  notes: 'Syntetisk karta för tester. Inte avsedd för spel.',
  seaRegions: [
    { key: 'north_sea', name: 'North Sea' },
    { key: 'west_sea', name: 'West Sea' },
  ],
  cities: [
    { key: 'north', name: 'North', isPort: true, seaRegions: ['north_sea'], stability: 4, masquerade: 3, intercept: 1, bloodFlow: 100 },
    { key: 'east', name: 'East', isPort: false, seaRegions: [], stability: 3, masquerade: 4, intercept: 2, bloodFlow: 80 },
    { key: 'west', name: 'West', isPort: false, seaRegions: [], stability: 2, masquerade: 2, intercept: 0, bloodFlow: 60 },
    { key: 'south', name: 'South', isPort: true, seaRegions: ['north_sea', 'west_sea'], stability: 5, masquerade: 5, intercept: 3, bloodFlow: 150 },
    { key: 'isle', name: 'Isle', isPort: true, seaRegions: ['west_sea'], stability: 1, masquerade: 1, intercept: 1, bloodFlow: 40 },
  ],
  adjacencies: [
    ['north', 'east'],
    ['north', 'west'],
    ['north', 'south'],
    ['east', 'south'],
    ['west', 'south'],
    ['south', 'isle'],
  ],
};
