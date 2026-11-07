# Backlog

Sidofynd som inte hör till pågående scope. Skriv var fyndet gjordes.

## Motorbeslut (hittat under `docs/engine/001_motorbeslut.md`)

- [ ] **Kartdata saknas/motsägelsefull.** `docs/prototype/plans/001_map_improvement.md` listar 37 adjacency-par men säger 36; `007_campaign_setup.md` säger 34. Startvärden per stad (blood flow, stability, MS, intercept) och sea region per hamn finns inte i repot (prototypens `seed.js` följde inte med). Måste bekräftas med GM innan British Isles-kartan blir standardmall (SPEC Part C #14). — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Regelboken säger emot sig själv om ≥/>** vid intercept mot stealth (gd:114/115/925 vs gd:498/913). Gustaf bekräftade ≥ 2026-11-07 (M16): rätta formuleringarna i gd:498 och gd:913 till "lower or equal". — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Rundbreakdown i regelboken numrerar income-fasen som 4a–4c** (gd:955–957) och end-of-round hoppar från 4c till 4e. Kosmetiskt, men bör rättas. — hittad under: docs/engine/001_motorbeslut.md
- [x] **Klan-synlighet:** prototypens backlog funderade på att dölja klan. Gustaf bekräftade 2026-11-07 att klan är publik (M2). — hittad under: docs/engine/001_motorbeslut.md
- [ ] **Titellösa vampyrer (M6/S10) är olöst.** Gustaf vill diskutera budget, domän, titelaktioner, VP och om man kan få ny titel. Motorn använder 3 actions som platshållare. — hittad under: genomgång av motorbeslut 2026-11-07

## State och typer (hittat under `docs/decisions/state.md`)

- [ ] **Regelbokens stavning av artefakter** (gd:411, 420, 422, 426): Vispers in a bottle, Ring of Tremer, Scepter of Venture, Ravanos boots. Normaliserat i koden (S18); rätta regelboken.
- [ ] **Kopierad text i Baron-avsnittet** (gd:551): "Princes can build influence in cities they control" står under Barons. Troligen kvar från Prince-avsnittet.
- [x] **Rule of Three och avdrag** (gd:530): Gustaf bekräftade 2026-11-07 att avdrag inte kapas (S7). Lägg till i regelboken att Diablerie är undantaget från Rule of Three.

## Ronden (hittat under rondens skelett, `docs/engine/round-skeleton-plan.md`)
- [ ] Riktiga aktionseffekter: skelettets `SKELETON_ACTIONS` är stubbar utan effekt (steg 3).
- [ ] Faserna 2a–2c, 4a–4d och 5a–5c är tomma krokar: contest-straff, storm, masquerade-kaskad, Ventrue +10, klan-curses, missions, Archon-loyalty, income från städer och bleeds, start-of-turn-VP.
- [ ] Fight for Control-strider som löses i fas 4a nästa rond (spänner över rondgränsen).
- [ ] Pending choices för målet (M8): fight/flee, acceptera Invite, återvända till contestad stad.
- [ ] Klanregler som påverkar budget eller Trifle: Lasombra (ingen Trifle om mindre blood än förra ronden), Tremere (enda Thaumaturgy kostar ingen action), Salubri (en Give per rond).
- [ ] Bränd minion kan lämna dinglande referenser (strider, effekter, Follow Them). Behöver en gemensam `burnMinion` i state när de modellerna används.
- [ ] Brujah-rabatt mitt i ronden ska återbetalas i fas 5 (M7).
- [ ] `ActionDefinition` är data + TypeScript-handler; utvärdera "data + effektprimitiver" (SPEC B11) när några aktioner byggts (R19).
- [ ] Per-spelare-vyer ska filtrera `RoundResolution.events` (steg 4). Events saknar ännu `audience` (M18).
