# Interaktiv regionkarta – research, plan och provisorisk implementation

## Underlag

- Ursprunglig demo i `packages/web/src/components/GameMap.tsx`: fem noder kopplade med linjer, fraktionsfärger och synliga pjäser. Städer och tillgänglig spelarinfo kommer från `PlayerScreenPort` (`src/screen/model.ts`).
- Illustrator-exporten `Map2.svg`: fem namngivna områden (`territory_west`, `territory_north`, `territory_east`, `territory_center`, `territory_south`) med tillhörande siffergrafik.
- Demonstrationsspelmotorn har fem städer med id `west`, `north`, `east`, `south`, `isle`, samt en separat adjacency-lista. Kartans bild får inte avgöra vilka drag som är tillåtna.

## Beslut för prototypen

1. Exportera bara de fem färgade huvudformerna från Lovable-SVG:n; siffergrafiken följer inte med. Illustrator-filerna innehöll dessutom separata inre subpaths som gjorde siffrorna till **utskurna hål** i varje färgad region; även dessa subpaths har tagits bort, kontrollerat genom SVG-rendering. Resultat: `packages/web/src/assets/berlin-regions.svg`.
2. Använd samma SVG-former som React `<path>` med data i `packages/web/src/components/regionGeometry.ts`, utan `dangerouslySetInnerHTML`.
3. Rita varje stads klickbara nod ovanpå rätt form. Behåll `data-testid=city-...`, fraktionsfärgerna, den kända spelarens pjäser samt spelmotorns `MapModel`.
4. Markera regionens kontur när musen hovrar över noden. Klick markerar regionen tillfälligt och öppnar en modal med namn, Lorem Ipsum och statuspunkter. När modalen stängs (kryss, Escape, bakgrundsklick) tas både vald och hovrad regionmarkering bort. Tangentbordsfokus på noden markeras separat av nodens fokusring.
5. Modalens data är **platshållare**, inte information från spelmotorn. Modalen stängs via kryss, Escape eller bakgrundsklick, och regionmarkeringen rensas då.
6. Rita samma förbindelser mellan noderna som i originalkartan genom att läsa `map.links` från spelmodellen. Koordinater tas från `REGION_NODE_POSITIONS`, så både karta och länkar skalar tillsammans. Linjerna ritas ovanpå regionfärgerna men bakom noderna och fångar inga klick. North–South använder en böjd linje för att inte passera över Isle-noden.
7. När kartan inte exakt är femstädersdemon används ursprunglig grafkarta oförändrad (`LegacyGraphMap.tsx`).

## Begränsning och öppet designbeslut

Map2.svg placerar det tidigare Center-segmentet fristående till höger som **Isle**. Även övriga fyra regioner har skalats om, så samtliga nodpositioner har uppdaterats och kontrollerats mot sina nya former. Isle är fortfarande ansluten endast till South enligt spelmotorns kartdata. Dessa förflyttningsregler ändras inte av UI-kartan.

Detta är fortfarande en demonstrationskarta. Innan permanent kartdesign bör den slutliga geografin och spelmodellens verkliga regioner synkroniseras.

## Ändrade filer

- `packages/web/src/components/GameMap.tsx`: väljer vilken kartvy som ska visas.
- `packages/web/src/components/LegacyGraphMap.tsx`: ursprunglig grafkarta för övriga kampanjer.
- `packages/web/src/components/RegionMap.tsx`: klickbara noder, regionmarkeringar, kopplingslinjer och rensning av markering vid modalstängning.
- `packages/web/src/components/RegionModal.tsx`: tillgänglig dialog med platshållartext och statuslista.
- `packages/web/src/components/regionGeometry.ts`: SVG-former, färger och nodpositioner.
- `packages/web/src/assets/berlin-regions.svg`: SVG-konst utan siffror.
- `packages/web/src/styles.css`: styles för regioner, kopplingslinjer, noder och modal.
- `packages/web/test/RegionMap.test.tsx`: tester för hover, länkar, klick, modalstängning, tangentbord och fallback.

## Utanför scope

Ingen ändring av `packages/engine`, `PlayerScreenPort`, adjacency, actionkostnader, dynamisk statusdata eller spelarens dolda information. Ingen multiplayer, spara-funktion eller backend.

## Validering

- TypeScript-kontroll av hela `packages/web` och `packages/engine` passerade i granskningsmiljön.
- Komponentbaserade smoke checks med React + Testing Library passerade för hover, mouseleave, klick, dialogtext, val, stängning, regionbyte och Escape.
- Full Vitest-körning i granskningsmiljön kunde inte utföras eftersom ZIP-filen innehöll Windows-anpassade Rollup/esbuild-binärer medan miljön är Linux. Kör `npm.cmd ci` och sedan `npm.cmd test` samt `npm.cmd run typecheck` lokalt på Windows innan merge.

## Uppdatering v3 – fristående Isle

- Ny geometri är hämtad från användarens `Map2.svg` utan numeriska symboler eller utskurna siffror.
- Formnamnet `territory_center` i käll-SVG:n mappas till spelregionen `isle` och exporteras som `territory_isle`.
- Alla fem noder har fått nya koordinater i samma `viewBox`.
- Förbindelsen South–Isle är en böjd SVG-path under huvudkartan; alla övriga fem `map.links`-förbindelser är raka.
- Modal, hover och rensning av markering vid stängning följer v2. Inga ändringar i spelmotorn.
