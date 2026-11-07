# Plan: Extrahera hårdkodade strängar till konstanter

**Datum:** 2026-03-19
**Prioritet:** Låg — refaktorering, inget blockerar utan detta

---

## Syfte

Koden har magiska strängar som `'camarilla'`, `'prince'`, `'action_submission'` utspridda i komponenter och stores. Om en enum ändras i databasen eller ett stavfel smyger sig in finns ingen central plats att uppdatera. Lösning: en gemensam konstantfil.

---

## Fas 1 — Skapa konstantfil

**Ny fil:** `src/constants.js`

### Vad som skapas:
- [ ] `SECTS` — camarilla, anarch, sabbat
- [ ] `TITLES` — inner_circle, justicar, prince, baron, archbishop
- [ ] `CLANS` — alla 14
- [ ] `DISCIPLINES` — alla 14
- [ ] `MINION_TYPES` — ghoul, harpy, eye, primogen, archon
- [ ] `CAMPAIGN_STATUS` — setup, recruiting, active, paused, finished
- [ ] `ROUND_PHASE` — action_submission, resolving, combat_pending, resolved, income
- [ ] `ACTION_STATUS` — pending, resolved, failed, refunded

Exempel:
```js
export const SECTS = {
  CAMARILLA: 'camarilla',
  ANARCH: 'anarch',
  SABBAT: 'sabbat'
}
```

---

## Fas 2 — Ersätt hårdkodade strängar

### Filer att uppdatera:
- [ ] `src/components/GameMap.vue` — `SECT_COLORS` och `SECT_LABEL_COLORS` nycklarna
- [ ] `src/stores/game.js` — `round_phase === 'action_submission'`, title-check i `availableActions`
- [ ] `src/components/ActionPanel.vue` — `maxActions` title-checks (`inner_circle`, `baron`), trifle-logik
- [ ] `src/components/PlayerPanel.vue` — eventuella sekt/titel-strängar i templates
- [ ] `src/components/CityPanel.vue` — eventuella sekt-strängar

### Approach:
Sök med grep efter varje enum-värde, ersätt med import från constants.

---

## Utanför scope

- Ändra inte DB-enums — de är rätt där de är
- Ändra inte seed.js — det körs en gång, strängar är OK där
- Ingen runtime-validering — det är DBs jobb via enums

---

## Success criteria
- Alla sekt/titel/discipline/minion-strängar i `src/` kommer från `constants.js`
- Inga nya beteendeändringar — rent refaktor
