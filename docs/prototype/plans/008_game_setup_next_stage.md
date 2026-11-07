# Plan: Game Setup — Next Stage (Player Gating, Character Creation, GM Readiness)
Datum: 2026-03-23
Status: DRAFT

## Översikt

Bygg det saknade flödet mellan "GM tilldelar titel" och "spelet börjar":

1. Spelare utan titel ser "Väntar på GM"
2. Spelare med titel men utan klan ser karaktärsskapande
3. GM ser vem som är redo
4. GM kan starta när alla är redo

**Approach:** Använd spelarens fältstatus (title/clan) istället för ny campaign status. Tre faser — varje fas levererar testbar funktionalitet. Klaner är fullt synliga för alla spelare.

**Beslut:**
- Ingen ny campaign status behövs — `setup` räcker
- Klaner är publika (synliga för alla i kampanjen)
- Conditional rendering i GameView — ingen ny route

---

## Fas-uppdelning

### Fas 1 — Player Gating i GameView
*Spelare ser rätt vy baserat på sin status*

- [ ] **1.1** Lägg till computed `playerPhase` i GameView:
  - `'loading'` — data laddas
  - `'waiting_for_gm'` — `myPlayer.title === null`
  - `'character_creation'` — `myPlayer.title !== null && myPlayer.clan === null`
  - `'ready'` — `myPlayer.title !== null && myPlayer.clan !== null && campaign.status === 'setup'`
  - `'playing'` — `campaign.status === 'active'`

- [ ] **1.2** Skapa `src/components/WaitingForGM.vue` — enkel vy:
  - Kampanjnamn + spelarnamn
  - "Waiting for the Game Master to assign your role."
  - Gotisk styling, centrerad
  - Polling: `setInterval` var 10:e sekund som kör `game.refreshMyPlayer()` (ny metod)

- [ ] **1.3** Skapa `src/components/GameReady.vue` — "redo men väntar"-vy:
  - "Your character is ready. Waiting for the Game Master to start Round 1."
  - Visar spelarens titel, klan, stad som bekräftelse
  - Polling: `setInterval` var 10:e sekund som kör `game.refreshCampaign()` (ny metod)

- [ ] **1.4** Lägg till `refreshMyPlayer()` och `refreshCampaign()` i game.js:
  - `refreshMyPlayer()` — bara re-fetch `players` WHERE user_id + campaign_id
  - `refreshCampaign()` — bara re-fetch `campaigns` WHERE id

- [ ] **1.5** Uppdatera GameView.vue template:
  - `v-if="playerPhase === 'waiting_for_gm'"` → `<WaitingForGM />`
  - `v-else-if="playerPhase === 'character_creation'"` → `<CharacterCreation />` (placeholder först)
  - `v-else-if="playerPhase === 'ready'"` → `<GameReady />`
  - `v-else-if="playerPhase === 'playing'"` → befintligt spelinnehåll
  - `v-else` → Loading...

**Success criteria fas 1:**
- Spelare utan titel ser "Waiting for GM"-meddelande
- Spelare med titel men utan klan ser placeholder för karaktärsskapande
- Spelare med komplett karaktär + setup-status ser "ready"-vy
- Spelare i aktiv kampanj ser normal spelvy
- Polling uppdaterar automatiskt vid statusändring (10s intervall)

---

### Fas 2 — Character Creation
*Utbruten till eget plandokument: [009_character_creation.md](009_character_creation.md)*

Karaktärsskapande är ett stort system med 6 wizard-steg, titelspecifika startregler, EXP-spenderande, minion-val, och validering. Se dedikerad plan för detaljer.

**Sammanfattning:** Spelare med titel men utan klan ser en steg-för-steg wizard:
1. Välj klan (1 av 14)
2. Välj mastered discipline(s) (antal beror på titel)
3. Välj title upgrades (2 titelspecifika val)
4. Spendera starting EXP (disciplines, mastery, stats)
5. Välj starting minions (titelspecifikt)
6. Bekräfta → markerad som redo

**BLOCKER:** Archbishop startregler saknas i game_design.txt — behöver bekräftas av GM.

---

### Fas 3 — GM Readiness Dashboard
*GM ser vem som skapat karaktär och kan starta*

- [ ] **3.1** Utöka `loadAdminCampaign()` i admin.js:
  - Lägg till parallell query: fetch `player_disciplines` för alla spelare i kampanjen
  - Spara i ny ref `playerDisciplines`

- [ ] **3.2** Lägg till computed `playerReadiness` i admin.js:
  ```js
  const playerReadiness = computed(() => {
    return players.value.map(p => ({
      ...p,
      hasSect: !!p.sect,
      hasTitle: !!p.title,
      hasCity: !!p.city_id,
      hasClan: !!p.clan,
      hasDisciplines: playerDisciplines.value.some(d => d.player_id === p.id),
      isReady: !!p.sect && !!p.title && !!p.city_id && !!p.clan
        && playerDisciplines.value.some(d => d.player_id === p.id)
    }))
  })

  const allPlayersReady = computed(() =>
    players.value.length >= 3 && playerReadiness.value.every(p => p.isReady)
  )

  const readySummary = computed(() => {
    const ready = playerReadiness.value.filter(p => p.isReady).length
    return `${ready}/${players.value.length} players ready`
  })
  ```

- [ ] **3.3** Uppdatera PlayerRoster.vue — lägg till readiness-indikator per spelare:
  - Statusikon i player-header: grönt ✓ om redo, gult ◌ om väntar på karaktär, rött ✗ om saknar titel
  - Visa klan + disciplines read-only om spelaren valt (hämta från playerDisciplines)
  - Label: "Awaiting title" / "Awaiting character" / "Ready"

- [ ] **3.4** Lägg till readiness-sammanfattning i AdminView.vue:
  - Ovanför tabs: kort med `readySummary`-texten + progress-indikator
  - Visuell: bar eller text "3/5 players ready"
  - Visa bara om campaign.status === 'setup'

- [ ] **3.5** Uppdatera startCampaign-validering i admin.js:
  - Utöka befintlig validering med:
    - Alla spelare måste ha title
    - Alla spelare måste ha clan
    - Alla spelare måste ha minst en discipline
  - Uppdatera felmeddelanden
  - Start-knappen visuellt disabled om `!allPlayersReady`

- [ ] **3.6** Uppdatera "Start Campaign"-sektion i AdminView.vue Settings-tab:
  - Bind `:disabled` till `!admin.allPlayersReady || starting`
  - Uppdatera hint-text till att inkludera clan/character-krav

**Success criteria fas 3:**
- GM ser readiness-status per spelare (ikon + label)
- GM ser "X/Y players ready" sammanfattning
- Start-knapp är disabled tills alla spelare är redo
- Validering inkluderar title + clan + disciplines
- GM kan se spelarens valda klan och disciplines (read-only)

---

## Spelregler och edge cases

1. **Klanval är fritt** — Alla 14 klaner är tillgängliga oavsett sekt. Sabbat-spelare kan välja t.ex. Ventrue (deras sekt döljs via disguise_title, inte klan).
2. **Antal disciplines** — Initialt väljer spelaren 2 disciplines från sin klans lista. Exakt antal kan behöva justeras baserat på spelreglerna.
3. **Ändra klan efter val** — Under setup-fasen kan spelaren välja om. Vid byte rensas gamla disciplines och nya väljs. När kampanjen är 'active' är det låst.
4. **Polling vs Realtime** — Fas 1 använder polling (10s) för att fånga statusändringar. Realtime subscriptions kan läggas till senare men är inte nödvändiga nu.
5. **RLS-rekursion** — `players_update_own_character` sub-query mot campaigns kan orsaka rekursion om campaigns har RLS som refererar players. Kontrollera befintliga campaigns-policys. `is_campaign_gm()` är SECURITY DEFINER och bör vara säker.

## Success criteria (hela planen)

- [ ] Spelare utan titel → "Waiting for GM"
- [ ] Spelare med titel, utan klan → karaktärsskapande UI
- [ ] Spelare kan välja klan + 2 disciplines → sparas till DB
- [ ] Spelare med komplett karaktär, setup-fas → "Ready, waiting for Round 1"
- [ ] Spelare i aktiv kampanj → normal spelvy
- [ ] GM ser readiness per spelare + sammanfattning
- [ ] GM kan starta kampanj bara när alla är redo (title + clan + disciplines)

## Kända risker

1. **RLS-rekursion** — self-referencing sub-queries i players UPDATE-policy mot campaigns. Kan behöva SECURITY DEFINER helper (t.ex. `is_campaign_in_setup(campaign_id)` ).
2. **clan_definitions saknar migration** — Tabellen finns i live-DB men inte i migrations. Vi antar att den redan existerar. Om vi behöver seed:a lokalt kan vi använda scripts/seed.js.
3. **player_disciplines saknar migration** — Samma situation. RLS-policys kan läggas till utan CREATE TABLE.
4. **Discipline-validering** — Client-side only i fas 2. Server-side validering (Edge Function) kan läggas till senare men är inte kritisk under setup-fasen (spelaren "fuskar" bara mot sig själv).

---

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/views/GameView.vue` | Conditional rendering baserat på playerPhase |
| `src/stores/game.js` | refreshMyPlayer, refreshCampaign, fetchClanDefinitions, submitCharacter |
| `src/stores/admin.js` | playerDisciplines, playerReadiness, allPlayersReady, utökad validering |
| `src/views/AdminView.vue` | Readiness-sammanfattning |
| `src/components/admin/PlayerRoster.vue` | Readiness-ikon per spelare |
| **Nya filer** | |
| `src/components/WaitingForGM.vue` | "Väntar på GM"-vy |
| `src/components/CharacterCreation.vue` | Klanval + discipline-val |
| `src/components/GameReady.vue` | "Redo, väntar på start"-vy |
| `supabase/migrations/YYYYMMDD_character_creation_rls.sql` | RLS-policys |

## Parking lot
*(Noteringar som dyker upp under implementation — ej ursprunglig plan)*
