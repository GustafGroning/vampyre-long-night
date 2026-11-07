/**
 * Referenskartan: 18 städer på de brittiska öarna (SPEC A10).
 *
 * PROVISORISK. Prototypens kartdata följde inte med till repot. Det som finns här är
 * rekonstruerat från docs/prototype/plans/001_map_improvement.md:
 * - Namn, hamnstatus och kartpositioner: från planen.
 * - Grannpar: de 37 paren i planen (planen säger själv 36, 007_campaign_setup säger 34).
 * - Startvärden: prototypens databasdefaults (stability 3, MS 3, intercept 1,
 *   blood flow 100) för alla städer. Riktiga värden saknas.
 * - Havsregioner per hamn: gissade utifrån geografin. Saknas helt i källorna.
 * Se DECISIONS.md S12. Ska bekräftas av GM innan kartan används i spel.
 */
import type { MapTemplate } from './types.js';

const DEFAULT_STATS = { stability: 3, masquerade: 3, intercept: 1, bloodFlow: 100 } as const;

export const BRITISH_ISLES_MAP: MapTemplate = {
  key: 'british_isles',
  name: 'The British Isles',
  provisional: true,
  notes: 'Rekonstruerad från prototypens plan 001. Startvärden och havsregioner är gissningar.',
  seaRegions: [
    { key: 'north_sea', name: 'North Sea' },
    { key: 'irish_sea', name: 'Irish Sea' },
    { key: 'atlantic', name: 'Atlantic' },
    { key: 'english_channel', name: 'English Channel' },
  ],
  cities: [
    { key: 'edinburgh', name: 'Edinburgh', isPort: true, seaRegions: ['north_sea'], ...DEFAULT_STATS, position: { x: 555, y: 260 } },
    { key: 'glasgow', name: 'Glasgow', isPort: true, seaRegions: ['irish_sea'], ...DEFAULT_STATS, position: { x: 460, y: 320 } },
    { key: 'donegal', name: 'Donegal', isPort: true, seaRegions: ['atlantic'], ...DEFAULT_STATS, position: { x: 195, y: 355 } },
    { key: 'belfast', name: 'Belfast', isPort: true, seaRegions: ['irish_sea'], ...DEFAULT_STATS, position: { x: 320, y: 410 } },
    { key: 'middlesbrough', name: 'Middlesbrough', isPort: true, seaRegions: ['north_sea'], ...DEFAULT_STATS, position: { x: 620, y: 435 } },
    { key: 'york', name: 'York', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 570, y: 495 } },
    { key: 'galway', name: 'Galway', isPort: true, seaRegions: ['atlantic'], ...DEFAULT_STATS, position: { x: 130, y: 520 } },
    { key: 'dublin', name: 'Dublin', isPort: true, seaRegions: ['irish_sea'], ...DEFAULT_STATS, position: { x: 300, y: 510 } },
    { key: 'tullamore', name: 'Tullamore', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 260, y: 540 } },
    { key: 'liverpool', name: 'Liverpool', isPort: true, seaRegions: ['irish_sea'], ...DEFAULT_STATS, position: { x: 480, y: 530 } },
    { key: 'petersborough', name: 'Petersborough', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 640, y: 555 } },
    { key: 'waterford', name: 'Waterford', isPort: true, seaRegions: ['irish_sea'], ...DEFAULT_STATS, position: { x: 240, y: 625 } },
    { key: 'birmingham', name: 'Birmingham', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 510, y: 610 } },
    { key: 'cork', name: 'Cork', isPort: true, seaRegions: ['atlantic', 'english_channel'], ...DEFAULT_STATS, position: { x: 160, y: 670 } },
    { key: 'oxford', name: 'Oxford', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 540, y: 660 } },
    { key: 'cambridge', name: 'Cambridge', isPort: false, seaRegions: [], ...DEFAULT_STATS, position: { x: 620, y: 650 } },
    { key: 'cardiff', name: 'Cardiff', isPort: true, seaRegions: ['irish_sea', 'english_channel'], ...DEFAULT_STATS, position: { x: 440, y: 685 } },
    { key: 'london', name: 'London', isPort: true, seaRegions: ['north_sea', 'english_channel'], ...DEFAULT_STATS, position: { x: 590, y: 720 } },
  ],
  adjacencies: [
    ['edinburgh', 'glasgow'],
    ['edinburgh', 'middlesbrough'],
    ['edinburgh', 'belfast'],
    ['glasgow', 'belfast'],
    ['glasgow', 'liverpool'],
    ['glasgow', 'donegal'],
    ['donegal', 'belfast'],
    ['donegal', 'dublin'],
    ['donegal', 'galway'],
    ['belfast', 'dublin'],
    ['belfast', 'liverpool'],
    ['dublin', 'tullamore'],
    ['dublin', 'galway'],
    ['dublin', 'waterford'],
    ['tullamore', 'galway'],
    ['tullamore', 'waterford'],
    ['tullamore', 'cork'],
    ['galway', 'cork'],
    ['waterford', 'cork'],
    ['middlesbrough', 'york'],
    ['middlesbrough', 'liverpool'],
    ['york', 'liverpool'],
    ['york', 'petersborough'],
    ['york', 'birmingham'],
    ['liverpool', 'birmingham'],
    ['liverpool', 'dublin'],
    ['petersborough', 'cambridge'],
    ['petersborough', 'birmingham'],
    ['birmingham', 'oxford'],
    ['birmingham', 'cardiff'],
    ['oxford', 'london'],
    ['oxford', 'cambridge'],
    ['oxford', 'cardiff'],
    ['cambridge', 'london'],
    ['cardiff', 'london'],
    ['cardiff', 'waterford'],
    ['cardiff', 'cork'],
  ],
};
