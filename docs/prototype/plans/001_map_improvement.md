# Plan: Forbattra kartan (GameMap.vue)

**Datum:** 2026-03-19 (uppdaterad)
**Baserat pa:** map.png (malbild, 1024x1335px)

---

## Ny approach — bakgrundsbild istallet for SVG-kustlinjer

Istallet for att forsoka bygga Brittiska oarna med SVG-paths (som blev "okej men inte bra") anvander vi **map.png som bakgrundsbild** och ritar enbart de interaktiva elementen (stadsnoder, adjacency-linjer, labels) som SVG ovanpa.

### Varfor detta ar battre:
- map.png har redan perfekta kustlinjer, pergament-textur och gotisk stil
- Omojligt att matcha den visuella kvaliteten med handskrivna SVG-paths
- Enklare kod — all visuell komplexitet ligger i bilden
- Lattare att byta stil i framtiden (byt bara bilden)

### Utmaning:
map.png har stadsnoder och linjer inbakade. Vara SVG-noder maste positioneras exakt ovanpa sa de taacker de statiska noderna. Detta kraver pixelexakt kalibrering av koordinaterna.

---

## Fas 1 — Bakgrundsbild + rensa SVG-bakgrund

**Fil:** `src/components/GameMap.vue`

### Vad som andras:
- [x] Flytta map.png till `public/map.png`
- [x] Andra viewBox till att matcha map.png:s proportioner (1024x1335)
- [x] Ta bort alla SVG-bakgrundselement: pergament-gradient, paper-noise-filter, vinjett, landmass-paths, border-frame, sea-region-dividers
- [x] Lagg till map.png som `<image>` i SVG:n (fyller hela viewBox)
- [x] Behall: defs for node-shadow, gold-pulse (anvands av stadsnoder)
- [ ] Verifiera att kartan renderas korrekt med bilden som bakgrund

### Success criteria:
- map.png syns som bakgrund med korrekt proportioner
- Inga gamla SVG-bakgrundselement kvar
- Interaktiva stadsnoder ritas fortfarande ovanpa (aven om positionerna inte stammer an)

---

## Fas 2 — Kalibrera stadspositioner mot bakgrundsbilden

**Filer:** `scripts/seed.js`, `src/components/GameMap.vue`

### Vad som andras:
- [x] Mata ut exakta pixelpositioner for varje stad i map.png (var stadsnodernas centrum sitter)
- [x] Konvertera pixelpositionerna till viewBox-koordinater (viewBox = 1024x1335, direkt pixelmappning)
- [x] Uppdatera seed.js med alla 18 stader och korrekta map_x/map_y
- [x] Lagg till alla 36 adjacencies (avlasta fran map.png)
- [x] Lagg till stadsdata (blood_flow, stability, is_port, etc.) for nya stader
- [ ] Verifiera att SVG-noderna taacker de inbakade noderna i bilden exakt

### Stader att positionera (avlasta fran map.png, 1024x1335 pixlar):

| Stad | Approx pixel-X | Approx pixel-Y | Hamn? |
|------|----------------|----------------|-------|
| Edinburgh | 555 | 260 | Ja |
| Glasgow | 460 | 320 | Ja |
| Donegal | 195 | 355 | Ja |
| Belfast | 320 | 410 | Ja |
| Middlesbrough | 620 | 435 | Ja |
| York | 570 | 495 | Nej |
| Galway | 130 | 520 | Ja |
| Dublin | 300 | 510 | Ja |
| Tullamore | 260 | 540 | Nej |
| Liverpool | 480 | 530 | Ja |
| Petersborough | 640 | 555 | Nej |
| Waterford | 240 | 625 | Ja |
| Birmingham | 510 | 610 | Nej |
| Cork | 160 | 670 | Ja |
| Oxford | 540 | 660 | Nej |
| Cambridge | 620 | 650 | Nej |
| Cardiff | 440 | 685 | Ja |
| London | 590 | 720 | Ja |

*OBS: Dessa ar uppskattade fran bilden. Exakta varaden finjusteras visuellt.*

### Adjacencies (avlasta fran map.png):
Edinburgh—Glasgow, Edinburgh—Middlesbrough, Edinburgh—Belfast,
Glasgow—Belfast, Glasgow—Liverpool, Glasgow—Donegal,
Donegal—Belfast, Donegal—Dublin, Donegal—Galway,
Belfast—Dublin, Belfast—Liverpool,
Dublin—Tullamore, Dublin—Galway, Dublin—Waterford,
Tullamore—Galway, Tullamore—Waterford, Tullamore—Cork,
Galway—Cork,
Waterford—Cork,
Middlesbrough—York, Middlesbrough—Liverpool,
York—Liverpool, York—Petersborough, York—Birmingham,
Liverpool—Birmingham, Liverpool—Dublin,
Petersborough—Cambridge, Petersborough—Birmingham,
Birmingham—Oxford, Birmingham—Cardiff,
Oxford—London, Oxford—Cambridge, Oxford—Cardiff,
Cambridge—London,
Cardiff—London, Cardiff—Waterford, Cardiff—Cork

### Success criteria:
- Alla 18 stader syns pa kartan med korrekta positioner
- SVG-noderna linier med de inbakade noderna i bilden
- Adjacency-linjer foljer samma monster som i bilden

---

## Fas 3 — Visuell polish och dolj bakgrundens statiska noder

**Fil:** `src/components/GameMap.vue`

### Vad som andras:
- [x] Justera SVG-nodernas storlek sa de taacker bakgrundens noder helt (outerR 30→37, innerR 24→30, circle 21→26)
- [x] Dolj adjacency-linjer (bakgrundsbilden har dem redan)
- [x] Justera label-ribbons (storlek, font, position) for tatare stadsplacering
- [x] Se over hover-effekter med tatare stadsplacering
- [x] Skalat upp ankh-symbol, ankarbadge, spelarantal-badge, contested X, stability dots
- [x] Ta bort info-panelen (redan gjort i fas 1)
- [ ] Verifiera responsivitet i olika fonsterstorlekar

### Alternativ approach for renare resultat:
Om de inbakade noderna "laacker igenom" runt vara SVG-noder kan vi:
- Skapa en "ren" version av map.png utan stadsnoder (i en bildredigerare)
- Eller lagga en semi-transparent overlay precis under vara noder

### Success criteria:
- Kartan ser ut som en enhetlig helhet — inte som "SVG ovanpa bild"
- Alla interaktiva element fungerar (klick, hover)
- Responsiv i olika fonsterstorlekar

---

## Kanda risker

1. **Positionskalibrering** — SVG-noderna maste matcha bakgrundsbildens noder pixelexakt. Kan krava iteration.
2. **Bildstorlek** — map.png ar 1024x1335. Rimlig storlek, men kan optimeras till WebP for snabbare laddning.
3. **Dubblering** — Bakgrundsbildens statiska noder och vara interaktiva noder kan "krocka" visuellt om positionerna inte stammer.
4. **Seed-scriptet** — Maste koras om med nya stadspositioner. Befintlig testdata paverkas.
5. **Responsivitet** — SVG med `<image>` skalar bra, men bor testas.

---

## Implementationsordning

Fas 1 → Testa → Fas 2 → Testa → Fas 3 → Testa

Fas 1 ar snabb (mest ta bort kod). Fas 2 ar det stora arbetet (positionskalibrering). Fas 3 ar finslipning.
