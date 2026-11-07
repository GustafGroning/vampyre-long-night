# Research: resolve-round Edge Function — Spelmotorn

**Datum:** 2026-03-19
**Fas:** Research (Fas 1 enligt workflow.md)
**Syfte:** Fullständig analys av hur resolve-round ska byggas, baserat på spelregler (game_design.txt), databasschemat och befintlig kod.

---

## 1. Översikt — Vad resolve-round ska göra

Resolve-round är spelets kärna. Den tar alla inlämnade aktioner för en runda och producerar:
- Uppdaterad spelstatus (players, cities, minions, artifacts, etc.)
- Personaliserade `round_updates` per spelare (filtrerade genom stealth/intercept)
- Publika `round_news` (öppna händelser)
- `game_log`-rader (GM-only, fullständig logg)
- Eventuella `combats`-rader (strider som behöver förhandling)

### Ren funktion
```
game_state + player_actions → new_game_state + per_player_updates + combats
```

---

## 2. Rundordning enligt spelreglerna (game_design.txt s.30)

Reglerna specificerar faser i exakt denna ordning. **Viktigt:** Start-of-round sker INNAN spelare lämnar in actions — det är en separat funktion, inte del av resolve-round.

### Fas 0: Start-of-round (separat från resolve-round — körs när GM startar ny runda)
- **0a** — Stadseffekter resolveras
  - Contested cities: -1 stability, -1 MS per runda
  - Contest-kostnad: 50 blod/runda från contestande spelare
  - Masquerade violation cascade: -1 MS på adjacent städer
  - Storm-effekter (blockerar sailing i sea regions)
  - Sabbat-bas effekter (blod-income till sabbat-spelare)
- **0b** — Event-effekter (GM-skapade, från debates, etc.)
- **0c** — Andra effekter
  - Ventrue boon: +10 blod
  - Inner Circle VP: +3 VP varannan runda
  - Prince multi-city VP: +1 VP per extra stad
  - Baron multi-city VP: +1 VP per extra stad
  - Expired modifiers rensas
- Spelare ser uppdaterad status och lämnar in actions

### Fas 1: Betalning (resolve-round börjar här)
- **1a** — Spelare betalar för sina aktioner (blood_cost dras)
- **1b** — Spelare betalar minion upkeep (per typ och level)
  - Ghoul: 5/10/15 per level
  - Harpy: 15/30/45 per level
  - Eye: 5/10/15 per level
  - Primogen: 20/40/60 per level
  - Archon: 0 (gratis, men loyalty-system)
  - Om upkeep inte kan betalas → minion bränns

### Fas 2: Aktionsresolution
- **2a** — Resolva alla spelares aktion #1 i slumpmässig ordning
- Sedan alla aktion #2, sedan #3, etc.
- Strider (combats) resolveras i ordning baserat på när de triggades i aktionssekvensen
- Om en aktion inte kan resolvas (t.ex. mål i fel stad, torpor) → status='failed' (ingen refund — spelaren betalar oavsett)

### Fas 3: End-of-round effects
- **3a** — Fight for control resolveras
- **3b** — Spelar-end-of-round effects:
  - (M) Dementation forced actions
  - Dominate forced moves
  - Punish treason: -25 blod
  - Brujah frenzy: 25% chans att attackera random i samma stad
  - Malkavian curse: 25% chans att flytta till random adjacent stad
  - Ministry curse: -5 blod
  - Ravnos curse: -5 blod om ej flyttat
  - Toreador curse: -10 blod om ej äger obsession
  - Tzimisce curse: -10 blod om ej i domain
  - Lasombra curse: ingen trifle om lägre blod än förra rundan
- **3c** — Justicar missions: kontrollera om avklarade
- **3d** — Archon loyalty: -1 counter om Justicar ej avklarat mission, bränn vid 0
- **3e** — Masquerade collapse check: >50% städer i violation → spelet slut

### Fas 4: Income
- **4a** — Stadskontrollanter får blood_flow (ej contested städer)
- **4b** — Bleed-inkomst tilldelas (spelare får blod från sina bleeds)
- **4c** — Övrig inkomst (Bottomless wealth, missions, etc.)
- **4d** — Uppdatera `blood_last_round` för Lasombra-curse

---

## 3. Stealth/Intercept — Informationsfiltrering

Det mest kritiska och komplexa systemet. Varje aktion har en stealth-nivå, och spelare ser bara det deras intercept tillåter.

### Beräkning av total stealth
```
total_stealth = performer_stealth + action_stealth_modifier + buff_modifiers
```

- `performer_stealth`: spelarens base_stealth + temporära modifiers
- `action_stealth_modifier`: från action_definitions.stealth_mod
- `buff_modifiers`: från Obfuscate (+4), In the shadows (+1/aktion), Partner in crime (+X), etc.

### Specialfall
- **Undetectable**: ingen kan se aktionen oavsett intercept
- **Can't be hidden**: alla ser aktionen oavsett stealth
- **City intercept**: stadskontrollanten ser aktioner med stealth ≤ stadens intercept som targets eller originerar i staden
- **Eye/Archon informant**: minions med Informant-trait rapporterar baserat på sin intercept (= level)

### Vem ser vad?
1. **Spelare i samma stad** med intercept ≥ action_stealth → ser aktionen
2. **Stadskontrollant** med city_intercept ≥ action_stealth → ser aktioner i/mot staden
3. **Eye/Archon minions** med level ≥ action_stealth → rapporterar till ägaren
4. **Undetectable** → ingen ser (undantag: Can't be hidden trumpar)
5. **Can't be hidden** → alla relevanta spelare ser

### Output: Personaliserade round_updates
Varje spelare får en `round_updates`-rad med:
- `entries` (JSONB array): lista av händelser de kan se
- `blood_income`: total blod-inkomst denna runda
- `blood_spent`: total blodkostnad denna runda
- `vp_gained`: VP tjänat denna runda
- `vp_lost`: VP förlorat denna runda

---

## 4. Aktionsresolution per kategori

### 4.1 Personal Actions (kritiska för MVP)

| Aktion | Logik | DB-ändringar |
|--------|-------|-------------|
| **Move** | Flytta till adjacent stad. Justicar: trifle, cost 5. Nosferatu: +5 cost. | `players.city_id` |
| **Bleed** | I domain: 2D10×5. Annars: 1D10×5. Max city blood_flow. | `cities.blood_flow` (temp), spelare får blod vid income |
| **Watchful eyes** | +1 intercept denna runda. Once per turn. | `active_modifiers` |
| **In the shadows** | +1 stealth denna runda. Once per turn. | `active_modifiers` |
| **Blood for blood** | +1 strength denna runda. Once per turn. | `active_modifiers` |
| **Attack!** | Hunt roll → combat. Ambush om stealth > intercept. | `combats` |
| **Wait and strike** | Sätter trigger-condition. | Lagras i action.result, evalueras under andra aktioner |
| **Bestow gifts** | Minion +1 level (max 3). | `minions.level` |
| **Get a minion** | Skapa ny minion. Kostnad per typ/level. | INSERT `minions` |
| **Grow in power** | 50 blod = 1 EXP. Spending sker direkt. | `players.exp_total`, ev. `player_disciplines`, stats |
| **Awaken** | +1 torpor_awaken_count. Vid 3: lämna torpor. | `players.torpor_awaken_count`, `players.is_in_torpor` |
| **Diablerie** | Hunt roll → burn target, gain discipline/stat. Blood hunt risk. | `players.is_burned`, `player_disciplines`, stats |
| **Hide** | +5 stealth, inga fler aktioner. | `active_modifiers`, markera resterande aktioner som 'failed' |
| **Steal artifact** | Omvänd hunt roll (stealth vs intercept). | `artifacts.carrier_player_id` |
| **Look for artifacts** | Hunt roll → lär dig targets artefakter. Trifle. | Info i round_updates |
| **Sail** | Port → port i samma sea region. Ej vid storm. | `players.city_id` |
| **Summon the storm** | Storm i sea region. 100 blod. | `cities.has_storm` i regionen |

### 4.2 Faction Actions

| Aktion | Logik | DB-ändringar |
|--------|-------|-------------|
| **Give** | Överför blod/minions/artifacts. Ej action slot. | Diverse |
| **Investigate** | GM ger info om problem/special. | Info i round_updates |
| **Troublemaker** | Skapa problem i stad. Värre vid låg stability. | INSERT `city_problems` |
| **Fight for control** | Triggar fight-or-flee för andra contestants. | `combats` eller contestant lämnar |
| **Search** | Lista vampyrer/minions med låg stealth. 25% artifact. | Info i round_updates, ev. `artifacts` |
| **Conquer new territory** | Contesta stad du är i. Kräver no title. | INSERT `city_contests` |

### 4.3 Camarilla-specifika

| Aktion | Logik |
|--------|-------|
| **Control the masquerade** | Stad +1 MS. Trifle. |
| **Claim credit** | Stjäl 1 VP från Prince/Justicar. Max 6 VP/runda. Once per turn. |
| **Buy votes** | 10 blod = +1 röst. Ej action slot. |
| **Invite to camarilla** | Anarch → Camarilla. Baron → Prince. |
| **Build my kingdom** | Prince: välj 3 av 7 förbättringar. Once per city per turn. |
| **Second tradition** | Hunt roll +2. Combat med harpies. |
| **Expansion** | Köp/contesta adjacent stad. |
| **Recruit primogen** | Skapa primogen i domain. 40/80/120. |
| **Sabotage** | Stad -1 stability eller -1 intercept. |
| **Go anarch** | Byt sekt. Enda aktionen denna runda. |

### 4.4 Anarch-specifika

| Aktion | Logik |
|--------|-------|
| **Anarch highway** | Flytta 2 minions till adjacent stad. |
| **Anarch free press** | Stad +2 intercept. Trifle. |
| **Anarch mission** | Minion +1 aktion denna runda. |
| **Anarch sabotage** | Stad -1 stability/-1 intercept. Trifle. |
| **Anarch revolt** | Komplex: revolt counters, D4 rolls, stad-effekter. |
| **Organize resistance** | Bränn minion → stad-förbättringar. |

### 4.5 Sabbat-specifika

| Aktion | Logik |
|--------|-------|
| **Sabbat sabotage** | Stad -1 MS/-1 intercept. |
| **Build the base** | Skapa/uppgradera sabbat-bas. |
| **Burn the weak** | D4 rolls mot minions ≤ bas-level. |
| **Spreading truth** | Upp till 3 städer: -1 stability, -1 MS, -1 intercept. |
| **Shovelhead** | D4 rolls, stad -2 stab/-2 MS/-25 BF, 2 VP, bas → lvl 1. |
| **Esbat** | Bleed med bas-level D10s, eller VP-konvertering. |
| **Call a crusade** | 250 blod, 2 lvl 2 minions, +1 aktion, exposed. |
| **Conquer in name of Cain** | Exposed archbishop: contesta adjacent stad. |

### 4.6 Discipline Actions (14 + 14 mastered)

Se game_design.txt rad 1190-1281 för fullständig lista. Alla kräver hunt roll eller ger buffs/info.

### 4.7 Artifact Actions (30 st)

Se game_design.txt rad 374-446. Alla har Trifle. Många ger info eller buffs.

### 4.8 Minion Actions

Varje minion-typ har sina egna aktioner (se game_design.txt rad 207-358). Minions får 1 aktion per runda.

---

## 5. Hunt Roll — Kärnsystemet

Många aktioner kräver en hunt roll:
```
attacker_roll = D4 + attacker_intercept
defender_roll = D4 + defender_stealth
success = attacker_roll > defender_roll
```

### Modifiers
- Animalism: +3 extra D4, bästa väljs
- Gangrel boon: +1 på alla hunt rolls
- Hand of Conrad: +3 extra D4 i combat
- Pumping Heart of Nizchetus: -2 på hunt rolls mot dig i domain
- Ministry boon: Eye/Archon -1 intercept mot dig
- (M) Obfuscate: nästa hunt roll mot dig misslyckas automatiskt

### Ambush
Om stealth > target intercept → extra D4 i combat, bästa väljs.

---

## 6. Combat-system

Combat har 6 steg men kräver spelarinteraktion (förhandling, charge). Detta betyder att resolve-round inte kan resolva combat fullt ut i ett steg.

### Approach: Combat pausar rundan
1. Resolve-round skapar `combats`-rader med status='pending'
2. `campaign.round_phase` → 'combat_pending'
3. Frontend visar combat-UI (eller Discord-integration)
4. När alla combats är resolverade → resolve-round fortsätter (eller GM triggar vidare)

### Combat-data som behövs
- `combats`-tabellen har allt: attacker/defender, strength, blood_spent, rolls, wound, deal
- Wound table (2D6): 2-3 burned, 4-6 torpor (val), 7-9 torpor (domain), 10-12 flee

### Minion-combat
- Inga förhandlingar, direkt resolution
- D4 + level vs D4 + level
- Förlorare bränns
- Harpies: +2 strength mot andra minions

---

## 7. Databastabeller som resolve-round läser/skriver

### Läser (input)
| Tabell | Vad |
|--------|-----|
| `campaigns` | current_round, round_phase, settings |
| `players` | Alla stats, positions, status |
| `cities` | Alla stats, controller, contested |
| `city_adjacencies` | Grannskap |
| `city_contests` | Vem contestar vad |
| `city_problems` | Aktiva problem |
| `city_specials` | Aktiva specials |
| `clan_definitions` | Boons/curses |
| `action_definitions` | Aktionsdefinitioner |
| `actions` | Inlämnade aktioner (status='pending') |
| `active_modifiers` | Temporära buffs |
| `minions` | Alla minions |
| `player_disciplines` | Alla disciplines |
| `artifacts` | Alla artefakter + bärare |
| `artifact_definitions` | Artefaktdefinitioner |
| `sabbat_bases` | Dolda baser |
| `missions` | Aktiva missions |
| `debates` | Aktiva debatter |
| `debate_votes` | Inlämnade röster |

### Skriver (output)
| Tabell | Vad |
|--------|-----|
| `players` | blood, vp, stats, city_id, is_in_torpor, is_burned, etc. |
| `cities` | stability, blood_flow, masquerade_status, intercept, controller_id, has_storm, influence |
| `city_contests` | Nya/borttagna contests |
| `city_problems` | Nya problem |
| `city_specials` | Nya/borttagna specials |
| `actions` | status → 'resolved'/'failed', result JSONB |
| `active_modifiers` | Nya buffs, ta bort expired |
| `minions` | Nya/uppgraderade/brända minions |
| `player_disciplines` | Nya disciplines (grow in power, diablerie) |
| `artifacts` | Ändrad carrier, burned |
| `combats` | Nya strider |
| `sabbat_bases` | Nya/uppgraderade/förstörda baser |
| `missions` | Avklarade missions |
| `debates` | Resolverade debatter |
| `round_updates` | Personaliserade resultat per spelare |
| `round_news` | Publika nyheter |
| `game_log` | GM-only fullständig logg |
| `campaigns` | current_round++, round_phase |

---

## 8. Teknisk arkitektur — Edge Function

### Supabase Edge Function (Deno)
```
supabase/functions/resolve-round/index.ts
```

### Input
- `campaign_id` (från request body)
- Autentisering: GM-only (kontrollera att anroparen är campaign.created_by)

### Flow
```
1. Validera: campaign.round_phase === 'action_submission'
2. Sätt round_phase → 'resolving'
3. Ladda ALL game state (alla tabeller ovan)
4. Bygg in-memory game state
5. Kör fas 1-5 sekventiellt
6. Skriv alla ändringar till databasen
7. Generera round_updates per spelare
8. Generera round_news
9. Skriv game_log
10. Om combats skapades: round_phase → 'combat_pending'
11. Annars: round_phase → 'resolved', current_round++
```

### In-memory state
All logik körs mot in-memory state (inte direkt mot DB). Detta ger:
- Atomicitet: antingen lyckas allt eller inget
- Testbarhet: kan köra logiken utan DB
- Performance: inga mellanliggande queries

### Storlek/Komplexitet
- ~60 aktionstyper × varierande komplexitet
- Uppskattning: 2000-4000 rader TypeScript
- Bör delas upp i moduler:
  ```
  resolve-round/
  ├── index.ts              # Entry point, orchestration
  ├── types.ts              # TypeScript types
  ├── load-state.ts         # Ladda allt från DB
  ├── payment.ts            # Fas 1: betalning + upkeep
  ├── start-of-round.ts     # Fas 2: start effects
  ├── resolve-actions.ts    # Fas 3: aktionsresolution (dispatcher)
  ├── actions/
  │   ├── personal.ts       # Move, Bleed, Attack, etc.
  │   ├── faction.ts        # Give, Investigate, Troublemaker, etc.
  │   ├── camarilla.ts      # Camarilla-specifika
  │   ├── anarch.ts         # Anarch-specifika
  │   ├── sabbat.ts         # Sabbat-specifika
  │   ├── discipline.ts     # 14 + 14 discipline actions
  │   ├── artifact.ts       # 30 artifact actions
  │   └── minion.ts         # Minion actions per typ
  ├── combat.ts             # Hunt rolls, combat creation
  ├── end-of-round.ts       # Fas 4: end effects, curses
  ├── income.ts             # Fas 5: blood income
  ├── visibility.ts         # Stealth/intercept-filtrering
  ├── round-updates.ts      # Generera personaliserade updates
  └── write-state.ts        # Skriv allt till DB
  ```

---

## 9. Viktiga designbeslut

### 9.1 Deterministisk vs icke-deterministisk
Spelet använder tärningar (D4, D6, D10, D20, D100) på flera ställen:
- Hunt rolls (D4)
- Combat (D4)
- Wound table (2D6)
- Bleed (D10)
- Frenzy/Malkavian (25% → random)
- Bloodspot dice (D20)
- Suicide mission (D4)
- Etc.

**Beslut krävs:** Ska Edge Function rulla tärningar, eller ska GM mata in resultat?

**Rekommendation:** Edge Function rullar alla tärningar automatiskt. GM kan override via dashboard om nödvändigt. Spelets CLAUDE.md säger "all icke-deterministisk logik har eliminerats av GM" men game_design.txt visar att tärningar finns överallt. Tolkning: GM-appen automatiserar tärningsrullning men GM kan korrigera vid behov.

### 9.2 Combat-hantering
Combat kräver spelarinteraktion (förhandling 6h, charge, press). Två alternativ:

**Alt A: Resolve-round pausar vid combat**
- Skapa combat-rader, sätt round_phase='combat_pending'
- Spelare förhandlar via Discord/app
- GM resolverar combat och kör resolve-round-fortsättning

**Alt B: Resolve-round resolvar minion-combat, pausar vid vampire-combat**
- Minion vs minion: direkt resolution (inga förhandlingar)
- Vampire-combat: paus för förhandling

**Rekommendation:** Alt B — minion-combat kan automatiseras fullt ut.

### 9.3 Transaktionshantering
Edge Functions har timeout på ~25s (Supabase). Med 20 spelare och ~100 aktioner:

**Rekommendation:**
1. Ladda allt i en query
2. Kör all logik in-memory
3. Skriv alla ändringar i en enda transaktion
4. 100 aktioner + 20 spelare bör ta <5 sekunder

### 9.4 Ordning inom samma action_order
Reglerna säger "random order" för aktioner med samma nummer.

**Rekommendation:** Shuffla aktionerna med Fisher-Yates innan resolution. Spara den faktiska ordningen i game_log.

---

## 10. Potentiella fallgropar

### 10.1 Ordningsberoenden
Många aktioner beror på varandra:
- Obfuscate måste resolvas INNAN aktionen den buffar
- Celerity gör att nästa 2 aktioner resolvas "omedelbart" (tolkning: de hoppar framåt i ordningen)
- Partner in crime (ghoul) buffar alla aktioner resten av rundan
- Wait and strike triggas av ANDRA spelares aktioner

**Risk:** Om ordningen inte respekteras kan buff-aktioner komma efter aktionen de ska buffa.
**Lösning:** Spelarna själva ansvarar för ordningen (buff-aktion innan target-aktion i sin lista). Resolve-round respekterar spelarnas ordning.

### 10.2 Celerity-specialfall
"Your next two actions will be resolved immediately."

**Tolkning:** De två nästa aktionerna i spelarens lista resolvas direkt efter Celerity, innan andra spelares aktioner med samma action_order.
**Fråga till GM:** Exakt hur fungerar "immediately"? Bör resolvas före andra spelares aktioner med högre action_order?

### 10.3 Information som genereras under resolution
Vissa aktioner genererar information (Auspex, Investigate, Search). Denna info finns inte som DB-state utan måste läggas direkt i spelarens round_updates.

### 10.4 "End of round" vs "immediately"
Vissa effekter triggas "at the end of the round" (Dominate-move, Dementation forced action, clan curses). Dessa måste köras i fas 4, INTE under aktionsresolution.

### 10.5 Blood kan bli negativt
Om en spelare inte har tillräckligt blod för en aktion → aktionen misslyckas, kostnad refunderas.
**Men:** Upkeep-betalning sker i fas 1. Om spelaren inte kan betala → minion bränns. Spelaren kan inte välja vilken minion som bränns om flera saknar upkeep.
**Rekommendation:** Bränn den med lägst level/mest upkeep först. Eller: kräv att spelaren specificerar prioritet.

### 10.6 Sabbat schemes — extra aktioner
Sabbat-spelare får X+1 extra aktioner (X = antal sabbat-spelare). Dessa delas upp före rundan.
**Fråga:** Var lagras fördelningen? Möjligen i `actions`-tabellen med extra action_order?
**Rekommendation:** Lagra som vanliga aktioner med action_order > normalt max. Frontenden behöver hantera detta.

---

## 11. MVP-scope — Vad behövs för första spelbara version?

### Fas 1: Minimal Viable Engine
Resolva dessa aktionstyper:
- **Move** (inkl. Sail)
- **Bleed**
- **Attack!** (skapa combat-rader, ej full resolution)
- **Give**
- **Watchful eyes / In the shadows / Blood for blood**
- **Upkeep-betalning**
- **Blood income**
- **Stealth/intercept-filtrering** (kärnsystemet)
- **Round updates + news + game_log**

### Fas 2: Faction Actions
- Troublemaker, Fight for control, Search
- Camarilla: Control masquerade, Build my kingdom, Expansion
- Anarch: Anarch revolt, Anarch sabotage
- Sabbat: Build the base, Sabbat sabotage

### Fas 3: Personal + Discipline
- Alla personal actions
- Alla 14+14 discipline actions
- Hunt roll-systemet fullt ut

### Fas 4: Artifacts + Minions + Combat
- 30 artifact actions
- Alla minion actions
- Full combat-resolution (med Discord-integration eller in-app)

### Fas 5: Completeness
- Klan boons/curses
- Ivory Tower debatter
- Sabbat-bas fullständig
- Masquerade violation cascade
- Blood hunt-system
- VP-system per titel
- Missions
- EXP/Grow in power (full)

---

## 12. Öppna frågor för GM

1. **Celerity "immediately"** — Resolvas de 2 nästa aktionerna innan alla andras samma action_order?
2. **Wait and strike triggers** — Hur specificeras conditions programmatiskt?
3. **Sabbat schemes** — Var/hur specificerar sabbat-spelare fördelningen av extra aktioner?
4. **Troublemaker** — Vad exakt innebär "create a problem"? Har GM fördefinierade problem?
5. **Investigate** — GM-genererad info. Ska resolve-round generera automatiskt eller flagga för GM-input?
6. **Blood negativity** — Kan blod gå under 0? Eller stoppas vid 0?
7. **Minion upkeep priority** — Om ej råd med alla minions, vilken bränns först?
8. **Conquered cities tracking** — Behövs en ny tabell/kolumn för "VP already scored from this city"?
9. **Malkavian prophecy** — GM-genererad info varje runda. Automatisera eller manuell?
10. **Dementation screenshot** — Discord-specifikt. Hur hanteras i appen?

---

## 13. Rekommendationer

1. **Börja med in-memory state-modellen** — definiera TypeScript-interfaces för all speldata
2. **Bygg stealth/intercept-systemet först** — det påverkar allt output
3. **Implementera fas 1+5 (betalning + income) som proof-of-concept** — enklast och testar hela pipelinen
4. **Dela upp aktionsresolution i en dispatcher + per-action handlers** — skalbar arkitektur
5. **Skriv hunt roll som utility-funktion** — återanvänds av ~15 aktioner
6. **Combat-rader skapas men resolvas separat** — undvik att blockera rund-resolution
7. **GM-override-mekanik** — möjlighet att pausa, korrigera och fortsätta
8. **Seed-data med test-aktioner** — för att kunna testa resolve-round utan UI

---

## 14. Sammanfattning

| Aspekt | Bedömning |
|--------|-----------|
| **Komplexitet** | Hög — ~60 aktionstyper, 14 klan-effekter, stealth/intercept |
| **DB-schema** | Komplett — alla tabeller finns, inga blockerare |
| **Frontend** | Komplett — redo att konsumera round_updates |
| **Största risken** | Stealth/intercept-buggar som läcker info |
| **Uppskattad storlek** | 2000-4000 rader TypeScript fördelat på ~15 moduler |
| **Rekommenderad MVP** | Fas 1 (Move, Bleed, Attack, Give, Income, Stealth) |
| **Beroenden** | GM-dashboard (minimal) för att trigga resolve-round |
