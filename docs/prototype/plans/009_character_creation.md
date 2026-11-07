# Plan: Character Creation System
Datum: 2026-03-23
Status: DRAFT

## Översikt

Bygger ett steg-för-steg karaktärsskapande där spelare (som fått sin titel tilldelad av GM) konfigurerar sin startkaraktär. Varje titel har unika startresurser, uppgraderingsval och minion-allokering.

**Förutsättningar:** Spelaren har redan fått sect, title, disguise_title (Sabbat), och city_id (Prince/Baron/Archbishop) tilldelade av GM via PlayerRoster.

**Flow:**
1. Välj klan (1 av 14) → får 3 klandiscipliner
2. Välj mastered discipline(s) (antal beror på titel)
3. Välj starting upgrades (titelspecifika val)
4. Spendera starting EXP (extra disciplines, mastery, stats)
5. Välj starting minions (titelspecifikt)
6. Bekräfta → markera som redo

**Nyckeldesign:** Allt sker i ett wizard-UI i GameView (ingen ny route). Alla val valideras client-side med regler per titel. Data sparas vid bekräftelse (inte steg-för-steg).

---

## Startregler per titel

### Inner Circle
| Resurs | Värde |
|--------|-------|
| Blood | 200 |
| VP | 3 |
| EXP | 6 |
| Actions/round | 6 |
| Mastered disciplines | 3 (av klanens 3) |
| Artifact | 1 random (GM tilldelar) |
| Minions | 2x Lvl 2 (Ghoul/Harpy/Eye, valfritt) + 2x Lvl 1 Ghoul |
| Starting city | Ingen (alla Camarilla-städer = domän) |
| Starting upgrades (välj 2) | Extra discipline / +1 valfri stat / Lvl 3 Ghoul/Harpy/Eye / +100 blod |

### Justicar
| Resurs | Värde |
|--------|-------|
| Blood | 150 |
| VP | 0 |
| EXP | 4 |
| Actions/round | 4 |
| Mastered disciplines | 2 (av klanens 3) |
| Artifact | 1 random (GM tilldelar) |
| Missions | 2 (GM tilldelar) |
| Minions | 1x Lvl 2 Archon ELLER 3x Lvl 1 Eye |
| Starting city | Ingen (alla Camarilla-städer = domän) |
| Starting upgrades (välj 2) | Extra discipline / +1 STR eller +1 INT / Lvl 2 Archon / +100 blod |

### Prince
| Resurs | Värde |
|--------|-------|
| Blood | 100 |
| VP | 0 |
| EXP | 4 |
| Actions/round | 4 |
| Mastered disciplines | 1 (av klanens 3) |
| Royal privileges | 2 |
| Minions | 1x Lvl 1 Primogen ELLER 1x Lvl 2 Ghoul/Harpy/Eye |
| Starting city | GM-tilldelad |
| Starting upgrades (välj 2) | Extra discipline / +1 STE eller +1 STR / Starting city +25 blood flow / Starting city +2 intercept |

### Baron
| Resurs | Värde |
|--------|-------|
| Blood | 150 |
| VP | 0 |
| EXP | 4 |
| Actions/round | 5 |
| Mastered disciplines | 1 (av klanens 3) |
| Minions | 1x Lvl 1 Harpy + 1x Lvl 1 Ghoul ELLER 1x Lvl 1 Eye + 1x Lvl 1 Ghoul |
| Starting city | GM-tilldelad |
| Starting upgrades (välj 2) | Extra discipline / +1 STR eller +1 INT / Anarch Stronghold special / Anarch Political Hub ELLER Anarch Free Press special |

### Archbishop
**OBS: Archbishop starting block saknas i game_design.txt! Behöver bekräftas av GM.**

Preliminärt (baserat på seed-data och mönster):
| Resurs | Värde |
|--------|-------|
| Blood | ? (seed: 100) |
| VP | 0 |
| EXP | 4? |
| Actions/round | 4 (bekräftat vid exponering) |
| Mastered disciplines | 1? |
| Minions | ? |
| Starting city | GM-tilldelad |
| Starting upgrades | ? |

**BLOCKER:** Vi kan bygga UI:t men Archbishop-reglerna måste bekräftas innan de kan implementeras fullständigt. Planera för att Archbishop-config kan läggas till separat.

---

## EXP-uppgraderingssystem

Alla titlar får starting EXP att spendera under karaktärsskapande. Samma kostnader som in-game "Grow in Power":

| Upgrade | Kostnad | Begränsning |
|---------|---------|-------------|
| Extra discipline (utanför klanen) | 1 EXP | - |
| Mastera en discipline | 1 EXP | Måste redan ha disciplinen |
| +1 Strength | 2 EXP | Max +3 totalt |
| +1 Stealth | 2 EXP | Max +3 totalt |
| +1 Intercept | 2 EXP | Max +3 totalt |

**Notera:** Random artifact via EXP (1 EXP) finns i spelreglerna men kräver GM-interaktion. Skippas i character creation — GM kan tilldela artefakter separat.

---

## Klanspecifika begränsningar

| Klan | Begränsning |
|------|-------------|
| Tremere | Kan INTE ha Lvl 3 minions (The Broken Pyramid curse) |
| Alla andra | Inga begränsningar på minion-levels |

---

## Fas-uppdelning

### Fas 1 — Data Layer (DB + Store)
*RLS-policys, store-metoder, data-hämtning*

- [ ] **1.1** DB-migration: RLS för player self-update + player_disciplines + minions:
  ```sql
  -- Spelare kan uppdatera sitt eget character under setup
  CREATE POLICY "players_update_own_character" ON players
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  -- Spelare kan se alla disciplines i sin kampanj (klaner publika)
  CREATE POLICY "player_disciplines_select_campaign" ON player_disciplines
    FOR SELECT
    USING (campaign_id IN (
      SELECT campaign_id FROM players WHERE user_id = auth.uid()
    ));

  -- Spelare kan inserta egna disciplines under setup
  CREATE POLICY "player_disciplines_insert_own" ON player_disciplines
    FOR INSERT
    WITH CHECK (
      player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    );

  -- Spelare kan ta bort egna disciplines under setup
  CREATE POLICY "player_disciplines_delete_own" ON player_disciplines
    FOR DELETE
    USING (
      player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    );

  -- GM kan se alla disciplines i sin kampanj
  CREATE POLICY "player_disciplines_select_gm" ON player_disciplines
    FOR SELECT
    USING (is_campaign_gm(campaign_id));

  -- Spelare kan inserta egna minions under setup
  CREATE POLICY "minions_insert_own_setup" ON minions
    FOR INSERT
    WITH CHECK (
      owner_id IN (SELECT id FROM players WHERE user_id = auth.uid())
    );

  -- Spelare kan se minions i sin kampanj
  CREATE POLICY "minions_select_campaign" ON minions
    FOR SELECT
    USING (campaign_id IN (
      SELECT campaign_id FROM players WHERE user_id = auth.uid()
    ));

  -- GM kan se alla minions
  CREATE POLICY "minions_select_gm" ON minions
    FOR SELECT
    USING (is_campaign_gm(campaign_id));
  ```

  **Notera:** Vi begränsar INTE update-policyn till `status = 'setup'` i SQL, utan enforcar detta via application logic. Anledning: campaigns-subquery i players-policy kan orsaka RLS-rekursion. Kampanjens setup-status kontrolleras i store-metoden innan anrop.

- [ ] **1.2** Lägg till `clanDefinitions` ref + `fetchClanDefinitions()` i game.js:
  - `const clanDefinitions = ref([])`
  - Hämta från `clan_definitions` med `.select('*')`
  - Anropa parallellt i `loadCampaign()`

- [ ] **1.3** Skapa title config-objekt `src/data/title-configs.js`:
  ```js
  export const TITLE_CONFIGS = {
    inner_circle: {
      blood: 200,
      vp: 3,
      exp: 6,
      actionsPerRound: 6,
      masteredCount: 3,
      royalPrivileges: 0,
      hasArtifact: true,    // GM assigns
      hasMissions: false,
      minions: {
        type: 'choice',     // UI shows choices
        options: [
          // Default allocation (always present)
          { type: 'fixed', items: [
            { type: 'ghoul', level: 1 }, { type: 'ghoul', level: 1 }
          ]},
          // Player picks 2x Lvl 2 from ghoul/harpy/eye
          { type: 'pick', count: 2, from: ['ghoul', 'harpy', 'eye'], level: 2 }
        ]
      },
      upgrades: {
        count: 2,
        options: [
          { key: 'extra_discipline', label: 'Gain another discipline' },
          { key: 'stat_any', label: '+1 to any stat', stats: ['base_strength', 'base_stealth', 'base_intercept'] },
          { key: 'lvl3_minion', label: 'Gain a Lvl 3 Ghoul, Harpy, or Eye', minionTypes: ['ghoul', 'harpy', 'eye'], level: 3 },
          { key: 'extra_blood', label: '+100 starting blood', blood: 100 },
        ]
      },
      startingCity: false,
    },
    justicar: {
      blood: 150,
      vp: 0,
      exp: 4,
      actionsPerRound: 4,
      masteredCount: 2,
      royalPrivileges: 0,
      hasArtifact: true,
      hasMissions: true,
      minions: {
        type: 'either',
        options: [
          { label: '1x Lvl 2 Archon', items: [{ type: 'archon', level: 2 }] },
          { label: '3x Lvl 1 Eye', items: [{ type: 'eye', level: 1 }, { type: 'eye', level: 1 }, { type: 'eye', level: 1 }] },
        ]
      },
      upgrades: {
        count: 2,
        options: [
          { key: 'extra_discipline', label: 'Gain another discipline' },
          { key: 'stat_choice', label: '+1 Strength or +1 Intercept', stats: ['base_strength', 'base_intercept'] },
          { key: 'archon_lvl2', label: 'Gain a Lvl 2 Archon', minionItems: [{ type: 'archon', level: 2 }] },
          { key: 'extra_blood', label: '+100 starting blood', blood: 100 },
        ]
      },
      startingCity: false,
    },
    prince: {
      blood: 100,
      vp: 0,
      exp: 4,
      actionsPerRound: 4,
      masteredCount: 1,
      royalPrivileges: 2,
      hasArtifact: false,
      hasMissions: false,
      minions: {
        type: 'either',
        options: [
          { label: '1x Lvl 1 Primogen', items: [{ type: 'primogen', level: 1 }] },
          { label: '1x Lvl 2 Ghoul/Harpy/Eye', pick: { count: 1, from: ['ghoul', 'harpy', 'eye'], level: 2 } },
        ]
      },
      upgrades: {
        count: 2,
        options: [
          { key: 'extra_discipline', label: 'Gain another discipline' },
          { key: 'stat_choice', label: '+1 Stealth or +1 Strength', stats: ['base_stealth', 'base_strength'] },
          { key: 'city_blood_flow', label: 'Starting city +25 Blood Flow', cityEffect: { field: 'blood_flow', delta: 25 } },
          { key: 'city_intercept', label: 'Starting city +2 Intercept', cityEffect: { field: 'intercept', delta: 2 } },
        ]
      },
      startingCity: true,
    },
    baron: {
      blood: 150,
      vp: 0,
      exp: 4,
      actionsPerRound: 5,
      masteredCount: 1,
      royalPrivileges: 0,
      hasArtifact: false,
      hasMissions: false,
      minions: {
        type: 'either',
        options: [
          { label: '1x Lvl 1 Harpy + 1x Lvl 1 Ghoul', items: [{ type: 'harpy', level: 1 }, { type: 'ghoul', level: 1 }] },
          { label: '1x Lvl 1 Eye + 1x Lvl 1 Ghoul', items: [{ type: 'eye', level: 1 }, { type: 'ghoul', level: 1 }] },
        ]
      },
      upgrades: {
        count: 2,
        options: [
          { key: 'extra_discipline', label: 'Gain another discipline' },
          { key: 'stat_choice', label: '+1 Strength or +1 Intercept', stats: ['base_strength', 'base_intercept'] },
          { key: 'anarch_stronghold', label: 'Starting city: Anarch Stronghold (+2 combat dice)', citySpecial: 'anarch_stronghold' },
          { key: 'anarch_special', label: 'Starting city: Political Hub or Free Press', subChoice: ['anarch_political_hub', 'anarch_free_press'] },
        ]
      },
      startingCity: true,
    },
    archbishop: null,  // BLOCKER: regler saknas, fylls i efter GM-bekräftelse
  }
  ```

- [ ] **1.4** Lägg till `submitCharacter(characterData)` i game.js:
  ```js
  // characterData = {
  //   clan, masteredDisciplines, expSpending, minionChoices,
  //   upgradeChoices, statBonuses, cityEffects, citySpecials
  // }
  async function submitCharacter(characterData) {
    const playerId = myPlayer.value.id
    const campaignId = campaign.value.id
    const config = TITLE_CONFIGS[myPlayer.value.title]

    // 1. Update player row (clan, blood, vp, stats, royal_privileges, exp_total)
    const playerUpdate = {
      clan: characterData.clan,
      blood: config.blood + (characterData.extraBlood || 0),
      vp: config.vp,
      royal_privileges: config.royalPrivileges,
      exp_total: config.exp,
      base_strength: characterData.statBonuses.base_strength || 0,
      base_stealth: characterData.statBonuses.base_stealth || 0,
      base_intercept: characterData.statBonuses.base_intercept || 0,
    }
    await supabase.from('players').update(playerUpdate).eq('id', playerId)

    // 2. Insert disciplines (3 clan + extras, some mastered)
    const discRows = characterData.disciplines.map(d => ({
      campaign_id: campaignId,
      player_id: playerId,
      discipline: d.discipline,
      is_mastered: d.is_mastered,
    }))
    await supabase.from('player_disciplines').delete().eq('player_id', playerId)
    await supabase.from('player_disciplines').insert(discRows)

    // 3. Insert minions
    const minionRows = characterData.minions.map((m, i) => ({
      campaign_id: campaignId,
      owner_id: playerId,
      name: `${m.type} ${i + 1}`,
      minion_type: m.type,
      level: m.level,
      city_id: myPlayer.value.city_id,
    }))
    if (minionRows.length > 0) {
      await supabase.from('minions').insert(minionRows)
    }

    // 4. Apply city effects (if any upgrades affect starting city)
    for (const effect of characterData.cityEffects || []) {
      await supabase.from('cities')
        .update({ [effect.field]: supabase.raw(`${effect.field} + ${effect.delta}`) })
        .eq('id', myPlayer.value.city_id)
    }

    // 5. Insert city specials (if any upgrades grant them)
    for (const special of characterData.citySpecials || []) {
      await supabase.from('city_specials').insert({
        campaign_id: campaignId,
        city_id: myPlayer.value.city_id,
        name: special.name,
        special_key: special.key,
        description: special.description,
        effects: special.effects || {},
      })
    }

    // 6. Refresh local state
    await refreshMyPlayer()
    // Re-fetch disciplines and minions
    const { data: disc } = await supabase
      .from('player_disciplines').select('*').eq('player_id', playerId)
    myDisciplines.value = disc || []
  }
  ```

  **Notera:** City-update via RLS behöver en ny policy (spelare kan uppdatera sin egen startstad under setup). Alternativt: skicka alla city-effekter som del av player-update och låt GM applicera dem, eller använd en Edge Function. Enklaste approach: GM-dashboard applicerar city-effekterna automatiskt vid kampanjstart.

  **Beslut behövs:** City-effekter (Prince: +25 blood flow, +2 intercept; Baron: specials) — ska spelaren skriva direkt till cities-tabellen, eller ska dessa sparas som "pending upgrades" som GM/startCampaign applicerar?

  **Rekommendation:** Spara som pending i spelarens JSONB-fält och applicera vid startCampaign. Slipper extra RLS-komplexitet.

- [ ] **1.5** Lägg till `character_build` JSONB-kolumn på players-tabellen (migration):
  ```sql
  ALTER TABLE players ADD COLUMN character_build jsonb DEFAULT NULL;
  ```
  Används för att lagra spelarens val (upgrades, city effects, minion picks) innan kampanjstart. `startCampaign()` läser dessa och applicerar.

  **Alternativ approach:** Skippa JSONB — skriv direkt till alla tabeller. Enklare men kräver fler RLS-policys.

  **Rekommendation:** Skriv direkt. Karaktärsskapande sker EN gång per kampanj. Fler RLS-policys är en liten kostnad jämfört med att hantera JSONB-parsning och applicering.

**Success criteria fas 1:**
- clan_definitions kan hämtas från store
- Title configs finns som datastruktur
- RLS tillåter spelare att uppdatera egen clan + inserta disciplines/minions
- submitCharacter-metod finns och skriver till alla relevanta tabeller

---

### Fas 2 — Wizard UI (komponenter)
*Steg-för-steg karaktärsskapande*

- [ ] **2.1** Skapa `src/components/CharacterCreation.vue` — wizard container:
  - Stegindikator: "Step 1/5 — Choose Clan"
  - Navigeringsknappar: Previous / Next / Confirm (sista steget)
  - Hanterar state för hela wizard-processen
  - Visar sammanfattning i sidebar/footer som uppdateras löpande
  - Props: `player` (myPlayer), `clanDefinitions`, `titleConfig`

- [ ] **2.2** Steg 1 — Clan Selection (`CharacterStepClan.vue`):
  - Grid av 14 klaner, varje kort visar:
    - Klannamn + kort beskrivning
    - 3 klandiscipliner (ikoner/badges)
    - Boon (namn + text)
    - Curse (namn + text)
  - Klickbar → markerar vald klan
  - Emit: `@select="clan"`

- [ ] **2.3** Steg 2 — Mastered Disciplines (`CharacterStepMastery.vue`):
  - Visar klanens 3 disciplines
  - Spelare markerar N som mastered (N = titleConfig.masteredCount)
  - Inner Circle: alla 3 mastered (auto-valda, inget val behövs — visa bara som info)
  - Justicar: välj 2 av 3
  - Prince/Baron: välj 1 av 3
  - Emit: `@select="masteredDisciplines[]"`

- [ ] **2.4** Steg 3 — Title Upgrades (`CharacterStepUpgrades.vue`):
  - Visar titleConfig.upgrades.options
  - Spelare väljer N upgrades (N = titleConfig.upgrades.count, typiskt 2)
  - Vissa upgrades kräver sub-val:
    - `stat_choice` → visa vilka stats man kan välja
    - `stat_any` → visa alla 3 stats
    - `lvl3_minion` → visa minion-typ-val (ghoul/harpy/eye)
    - `anarch_special` → visa sub-val (political hub / free press)
    - `city_blood_flow` / `city_intercept` → bara bocka av (effekt appliceras automatiskt)
  - Duplikater tillåtna? → Kontrollera spelregler. Preliminärt: nej (samma upgrade max 1 gång)
  - Emit: `@select="upgrades[]"`

- [ ] **2.5** Steg 4 — EXP Spending (`CharacterStepExp.vue`):
  - Visar: "You have X EXP to spend" (titleConfig.exp, minus ev. upgrades som kostar EXP)
  - EXP-val visas som knappar/checkboxar:
    - "Extra discipline (1 EXP)" — visar alla 14 disciplines, filtrerar bort redan valda
    - "Master a discipline (1 EXP)" — visar ej-mastered disciplines som spelaren har
    - "+1 Strength (2 EXP)" — disabled om redan +3 eller ej tillräckligt EXP
    - "+1 Stealth (2 EXP)" — samma
    - "+1 Intercept (2 EXP)" — samma
  - Löpande visning: "X EXP remaining"
  - Stats sammanfattning uppdateras i realtid
  - **Viktigt:** Stat-bonusar från upgrades (steg 3) och EXP (steg 4) staplas. Visa total.
  - Emit: `@select="expChoices[]"`

- [ ] **2.6** Steg 5 — Minion Selection (`CharacterStepMinions.vue`):
  - Visar titleConfig.minions.options
  - `type: 'either'` → radiobuttons (välj ett alternativ)
  - `type: 'choice'` → Inner Circle: fasta minions visas + välj typ för valfria
  - Visar minions som uppgradering gett (t.ex. Justicar upgrade "Lvl 2 Archon")
  - Tremere-varning: "The Broken Pyramid: You cannot have Lvl 3 minions"
  - Emit: `@select="minions[]"`

- [ ] **2.7** Steg 6 — Confirmation (`CharacterStepConfirm.vue`):
  - Fullständig sammanfattning:
    - Klan (namn, boon, curse)
    - Disciplines (vilka, vilka mastered)
    - Stats (STR/STE/INT med totaler)
    - Blood, VP, Royal Privileges
    - Minions (typ, level)
    - Starting upgrades valda
    - EXP spenderat
    - Starting city (om applicable, visar namn)
  - "Create Character"-knapp
  - Loading-state vid sparning
  - Felhantering

**Success criteria fas 2:**
- Fullständig wizard med alla 6 steg renderas
- Navigation framåt/bakåt fungerar
- Varje steg visar titelspecifika alternativ
- Sammanfattning visar totaler korrekt (upgrades + EXP staplas)
- Tremere-begränsning enforerad

---

### Fas 3 — Validering + GM-sida
*Client-side validering, startCampaign-uppdatering, GM-vy*

- [ ] **3.1** Skapa `src/data/character-validation.js`:
  - `validateCharacterBuild(player, build, titleConfig, clanDef)` → `{ valid, errors[] }`
  - Kontrollerar:
    - Klan vald
    - Rätt antal mastered disciplines
    - Alla upgrades är giltiga för titeln
    - EXP inte överspenderat
    - Stat-bonusar inte över +3
    - Tremere: inga Lvl 3 minions
    - Minion-val matchar titelns alternativ
  - Returnerar lista med specifika felmeddelanden

- [ ] **3.2** Integrera validering i wizard:
  - "Next"-knapp disabled om aktuellt steg ej validerat
  - "Create Character"-knapp kör full validering
  - Visa felmeddelanden vid validering

- [ ] **3.3** Uppdatera `startCampaign()` i admin.js:
  - Utöka validering: alla spelare måste ha clan + minst en discipline
  - Applicera city-effekter vid start:
    - Läs spelarnas upgrade-val
    - Applicera city blood_flow/intercept-bonusar
    - Inserta city_specials (Anarch Stronghold etc.)
  - Felmeddelanden inkluderar vad som saknas per spelare

- [ ] **3.4** Uppdatera PlayerRoster.vue:
  - Visa per spelare: klan (om vald), antal disciplines, antal minions
  - Readiness-ikon: ✗ (saknar titel) / ◌ (har titel, väntar på karaktär) / ✓ (redo)

- [ ] **3.5** Uppdatera AdminView.vue readiness-sammanfattning:
  - "X/Y players ready" med progress-bar
  - Start-knapp disabled tills alla redo

**Success criteria fas 3:**
- Validering fångar ogiltiga builds
- GM ser readiness per spelare
- startCampaign applicerar city-effekter
- Start-knapp disabled tills alla redo

---

### Fas 4 — Polish + edge cases
*Redo-ändring, Archbishop, UI-polish*

- [ ] **4.1** "Ändra karaktär"-funktionalitet:
  - GameReady-vyn (från 008-planen) får en "Edit Character"-knapp
  - Rensa disciplines + minions → öppna wizard igen
  - Bara möjligt under setup-fasen

- [ ] **4.2** Archbishop-support:
  - Fyll i TITLE_CONFIGS.archbishop när regler bekräftats av GM
  - Kan behöva speciell hantering (disguise → använder disguise-titelns actions)

- [ ] **4.3** UI-polish:
  - Animations mellan wizard-steg (slide transitions)
  - Klan-kort med hover-effekt
  - Discipline-ikoner eller badges
  - Gotisk dark theme konsistent med resten av appen
  - Responsiv: fungerar på smalare skärmar

---

## Spelregler och edge cases

1. **EXP + upgrades staplar** — Prince som väljer "+1 STR" som upgrade OCH spenderar 2 EXP på "+1 STR" har totalt +2 STR
2. **Extra discipline (upgrade)** — Ger en 4:e discipline utanför klanen. Spelaren väljer vilken av alla 14 disciplines (minus sina 3 klandiscipliner)
3. **Extra discipline (EXP)** — Samma som ovan, kan ge 5:e, 6:e etc.
4. **Mastera extra discipline** — Kan bara mastera disciplines man redan har
5. **Tremere + Lvl 3 minion** — Om Tremere-spelare har Inner Circle-titel och väljer "Lvl 3 minion" upgrade: **blockera valet**. Visa varning.
6. **Archon-lojalitet** — Archons startar med 3 loyalty counters. Denna mekanik hanteras av spelmotorn, inte karaktärsskapande
7. **Primogen → bara Prince** — Primogen-minion är lojal till sin Prince. Enforced via minion-alternativ (bara Prince har Primogen som alternativ)
8. **City effects** — Prince/Baron upgrades som påverkar stad (blood flow, intercept, specials) bör appliceras vid kampanjstart, inte vid karaktärsbekräftelse. Anledning: GM kanske byter stad efter karaktärsskapande
9. **Ändrad klan** — Om spelare ändrar klan i edit-läge: rensa alla disciplines och mastery, tvinga omval

## Kända risker

1. **Archbishop BLOCKER** — Regler saknas i game_design.txt. Bygg allt utom Archbishop, lägg till som sista fas
2. **City RLS** — Spelare ska inte kunna uppdatera cities direkt. City-effekter appliceras via startCampaign
3. **RLS-rekursion** — Ny players UPDATE policy riskerar rekursion. Testa noggrant
4. **Minion-naming** — Spelaren kanske vill namnge minions. Kan läggas till som nice-to-have
5. **Antal RLS-policys** — Vi lägger till ~6 nya policys. Varje policy läggs i samma migration för atomicitet

## Filer som skapas/ändras

| Fil | Ändring |
|-----|---------|
| **Nya filer** | |
| `src/components/CharacterCreation.vue` | Wizard container |
| `src/components/character/CharacterStepClan.vue` | Klanval |
| `src/components/character/CharacterStepMastery.vue` | Mastery-val |
| `src/components/character/CharacterStepUpgrades.vue` | Titeluppgraderingar |
| `src/components/character/CharacterStepExp.vue` | EXP-spenderande |
| `src/components/character/CharacterStepMinions.vue` | Minion-val |
| `src/components/character/CharacterStepConfirm.vue` | Bekräftelse |
| `src/data/title-configs.js` | Startregler per titel |
| `src/data/character-validation.js` | Valideringslogik |
| `supabase/migrations/YYYYMMDD_character_creation_rls.sql` | RLS-policys |
| **Ändrade filer** | |
| `src/stores/game.js` | clanDefinitions, submitCharacter, refreshMyPlayer |
| `src/stores/admin.js` | playerReadiness, utökad startCampaign |
| `src/views/AdminView.vue` | Readiness-sammanfattning |
| `src/components/admin/PlayerRoster.vue` | Readiness-ikon, klan/disciplines read-only |

## Öppna frågor (behöver svar innan implementation)

1. **Archbishop starting config?** — Saknas i game_design.txt
2. **Kan samma upgrade väljas två gånger?** — Preliminärt: nej
3. **City-effekter: vid karaktärsskapande eller kampanjstart?** — Rekommendation: kampanjstart
4. **Minion-namn: spelarval eller auto?** — Rekommendation: auto ("Ghoul 1", "Archon 1")

## Parking lot
*(Noteringar som dyker upp under implementation — ej ursprunglig plan)*
