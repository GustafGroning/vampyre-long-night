# Backlog

Sidofynd som inte hör till pågående scope. Skriv var fyndet gjordes.

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
