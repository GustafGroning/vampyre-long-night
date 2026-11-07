# Implementationsplan: resolve-round Edge Function

**Datum:** 2026-03-19
**Baserad på:** [004_resolve_round_engine.md](../research/004_resolve_round_engine.md)
**Typ:** Inkrementell — varje implementationsfas är körbar och testbar

---

## Obs: Öppna frågor

Research-dokumentet listar öppna frågor (sektion 12) som rör spelregelstolkningar — bl.a. Wait-and-strike-triggers, Sabbat scheme-fördelning, och Troublemaker-innehåll.

**Klargöranden sedan research:**
- **Celerity (basic):** Celerity är en action som spelaren lägger (t.ex. som action #2). De följande 2 actions (t.ex. #3 och #4) resolvas FÖRE alla andra spelares actions på samma action_order — såvida inte en annan spelare också har använt Celerity, i vilket fall Celerity-boosted actions shufflas sinsemellan.
- **GM-beroende actions:** Alla actions som kräver GM-input (Investigate, Malkavian prophecy, etc.) kommer att tas bort eller göras deterministiska. Spelet ska kunna köras helt utan GM — all resolution måste vara deterministisk.
- **Rundövergång:** Det finns ingen separat "starta runda"-åtgärd. Nästa runda startar automatiskt så snart den nuvarande rundan är fullt resolverad.

**Kvarvarande öppna frågor blockerar INTE fas 1–3 nedan**, men måste besvaras innan fas 4+ kan slutföras. De markeras med ⚠️ där de är relevanta.

---

## Övergripande arkitektur

```
supabase/functions/
├── _shared/                     # Delad kod mellan Edge Functions
│   ├── types.ts                 # Alla TypeScript-interfaces för in-memory state
│   ├── load-state.ts            # Laddar all speldata från DB → in-memory
│   ├── write-state.ts           # Skriver alla ändringar från in-memory → DB
│   └── utils/
│       ├── dice.ts              # Tärningsfunktioner (D4, D6, D10, D20, D100)
│       ├── hunt.ts              # Hunt roll-logik
│       ├── visibility.ts        # Stealth/intercept — vem ser vad
│       └── helpers.ts           # Shuffle, clamp, lookups
├── resolve-round/               # HUVUDFUNKTION — körs när GM resolvar rundan
│   ├── index.ts                 # Entry point — HTTP handler, auth, orchestration
│   ├── phases/
│   │   ├── payment.ts           # Fas 1: betalning + upkeep
│   │   ├── resolve-actions.ts   # Fas 2: dispatcher — loopar action_order (inkl. Celerity-fas)
│   │   ├── end-of-round.ts      # Fas 3: clan curses, missions, masquerade check
│   │   ├── income.ts            # Fas 4: blood income
│   │   └── start-next-round.ts  # Fas 5: start-of-next-round effects (Ventrue blod, IC VP, etc.)
│   ├── actions/
│   │   ├── personal.ts          # Move, Bleed, Attack, Hide, etc.
│   │   ├── faction-common.ts    # Give, Investigate, Troublemaker, etc.
│   │   ├── faction-camarilla.ts # Build my kingdom, Expansion, etc.
│   │   ├── faction-anarch.ts    # Revolt, Anarch highway, etc.
│   │   ├── faction-sabbat.ts    # Build the base, Shovelhead, etc.
│   │   ├── discipline.ts        # 14 basic + 14 mastered
│   │   ├── artifact.ts          # 30 artifact actions
│   │   └── minion.ts            # Ghoul/Harpy/Eye/Primogen/Archon actions
│   └── output/
│       ├── round-updates.ts     # Generera personaliserade round_updates
│       ├── round-news.ts        # Generera publika nyheter
│       └── game-log.ts          # GM-only game_log entries
└── resolve-combat/              # SEPARAT FUNKTION — GM resolvar enskilda strider
    └── index.ts
```

### En Edge Function med integrerad rundövergång
- **`resolve-round`** — GM resolvar rundan efter att actions lämnats in. Kör betalning → aktionsresolution → end-of-round → income → **start-of-next-round effects** (Ventrue blod, IC VP, contested city penalties, etc.). Nästa runda startar automatiskt — det finns ingen separat "starta runda"-åtgärd.
- ~~**`start-round`**~~ — **borttagen**. Start-of-round-effekter körs som sista steg i resolve-round, så att spelarna direkt kan lämna in actions för nästa runda.

### Principer
- **All logik körs mot in-memory state** — ingen DB-åtkomst under resolution
- **En enda DB-transaktion** vid write — atomicitet
- **Varje action handler returnerar en lista med `GameEvent`s** — events används för game_log, round_updates och round_news
- **Stealth/intercept-filtrering sker på events** — inte på actions direkt

---

## Implementationsfas 1: Skeleton + Types + Pipeline

**Mål:** En körbar Edge Function som laddar state, kör tom pipeline, skriver tillbaka och producerar tomma round_updates. Bevisar att hela flödet fungerar end-to-end.

### Steg 1.1 — TypeScript-typer (`types.ts`)
- [x] `GameState` — komplett in-memory representation:
  ```ts
  interface GameState {
    campaign: Campaign
    players: Map<string, Player>        // keyed by player.id
    cities: Map<string, City>           // keyed by city.id
    adjacencies: Map<string, string[]>  // city_id → [adjacent_city_ids]
    contests: CityContest[]
    problems: CityProblem[]
    specials: CitySpecial[]
    clanDefs: Map<string, ClanDef>      // keyed by clan enum
    actionDefs: Map<string, ActionDef>  // keyed by action_key
    actions: GameAction[]               // alla pending actions denna runda
    modifiers: ActiveModifier[]
    minions: Map<string, Minion>        // keyed by minion.id
    disciplines: PlayerDiscipline[]
    artifacts: Map<string, Artifact>    // keyed by artifact.id
    artifactDefs: Map<number, ArtifactDef>
    sabbatBases: SabbatBase[]
    missions: Mission[]
    debates: Debate[]
    debateVotes: DebateVote[]
  }
  ```
- [x] `GameEvent` — allt som händer under resolution:
  ```ts
  interface GameEvent {
    type: string               // 'move', 'bleed', 'attack', 'combat_created', etc.
    round: number
    actionOrder: number | null // vilken action_order triggade detta
    actorId: string            // player_id eller minion_id
    actorType: 'player' | 'minion'
    targetId?: string          // target player/minion/city
    targetType?: string
    cityId?: string            // var hände det
    stealth: number | null     // null = can't be hidden, Infinity = undetectable
    details: Record<string, any>
    message: string            // human-readable för game_log/updates
    isPublicNews: boolean      // ska detta synas i round_news?
  }
  ```
- [x] Interfaces för varje DB-tabell (Player, City, Minion, etc.)
- [x] `MutationLog` — lista av alla DB-ändringar att skriva:
  ```ts
  interface MutationLog {
    playerUpdates: Map<string, Partial<Player>>
    cityUpdates: Map<string, Partial<City>>
    minionUpdates: Map<string, Partial<Minion>>
    minionInserts: Minion[]
    artifactUpdates: Map<string, Partial<Artifact>>
    modifierInserts: ActiveModifier[]
    modifierDeletes: string[]  // ids att ta bort
    contestInserts: CityContest[]
    contestDeletes: string[]
    problemInserts: CityProblem[]
    specialInserts: CitySpecial[]
    specialDeletes: string[]
    combatInserts: Combat[]
    sabbatBaseUpdates: Map<string, Partial<SabbatBase>>
    missionUpdates: Map<string, Partial<Mission>>
    actionResults: Map<string, { status: string, result: any, failure_reason?: string }>
    disciplineInserts: PlayerDiscipline[]
  }
  ```

**Success criteria:** Typerna kompilerar utan fel. De täcker alla DB-tabeller.

### Steg 1.2 — Entry point (`index.ts`)
- [x] HTTP handler som tar `{ campaign_id }` i body
- [x] Autentisering: kontrollera att anroparen är `campaign.created_by` (GM)
- [x] Validera att `campaign.round_phase === 'action_submission'`
- [x] Sätt `round_phase = 'resolving'` i DB direkt (för att förhindra dubbel-trigger)
- [x] Anropa pipeline: `loadState → resolve → writeState`
- [x] Returnera `{ success: true, round: N, combats_created: X }`
- [x] Error handling: vid fel → sätt `round_phase` tillbaka till `'action_submission'`

**Success criteria:** Funktionen kan deployas, anropas med curl, och returnerar svar.

### Steg 1.3 — Load state (`load-state.ts`)
- [x] En funktion `loadGameState(supabase, campaignId): Promise<GameState>`
- [x] Ladda alla 18+ tabeller med parallella queries
- [x] Filtrera allt på `campaign_id`
- [x] Actions filtreras dessutom på `round = current_round` och `status = 'pending'`
- [x] Bygger Maps för snabb lookup

**Success criteria:** `loadGameState` returnerar komplett GameState med alla testdata.

### Steg 1.4 — Write state (`write-state.ts`)
- [x] En funktion `writeState(supabase, state, mutations, events): Promise<void>`
- [x] Skriv alla mutations i en transaktion (Supabase rpc eller batch)
- [x] Uppdatera `actions`-tabellen med status + result
- [x] Uppdatera `campaigns`: `current_round++`, `round_phase`
- [x] INSERT `round_updates` per spelare (tomt entries-array för nu)
- [x] INSERT `round_news` (tomt)
- [x] INSERT `game_log` entries

**Success criteria:** writeState sparar data till alla tabeller utan fel.

### Steg 1.5 — Utilities (`utils/`)
- [x] `dice.ts`: `rollD4()`, `rollD6()`, `rollD10()`, `rollD20()`, `rollD100()`, `roll2D6()`
- [x] `helpers.ts`: `shuffle(array)` (Fisher-Yates), `clamp(val, min, max)`, lookup-helpers
- [x] `hunt.ts`: tom stub — `huntRoll(attacker, defender, modifiers): HuntResult`
- [x] `visibility.ts`: tom stub — `filterEventsForPlayer(events, player, state): GameEvent[]`

**Success criteria:** Utilities exporterar korrekt, dice returnerar värden i rätt intervall.

### Steg 1.6 — Fas-stubs (`phases/`)
- [x] `payment.ts`: tom — returnerar tomma mutations + events
- [x] `resolve-actions.ts`: tom — markerar alla actions som `resolved` med tomt result
- [x] `end-of-round.ts`: tom
- [x] `income.ts`: tom

### Steg 1.7 — Start-of-next-round stub (del av resolve-round pipeline)
- [x] Sista steget i resolve-round-pipelinen (efter income)
- [x] Tom stub: ökar `current_round`, sätter `round_phase = 'action_submission'`
- [x] Start-of-round-effekter implementeras i fas 7

**Success criteria:** Hela pipeline körs. resolve-round resolvar actions, kör start-of-next-round, och sätter `round_phase = 'action_submission'`. Tomma round_updates skapas.

---

## Implementationsfas 2: Stealth/Intercept + Round Updates

**Mål:** Visibility-systemet fungerar korrekt. Spelare ser bara det de ska se.

### Steg 2.1 — Visibility-motor (`utils/visibility.ts`)
- [x] `calculateActionStealth(action, performer, state): number | null`
  - `null` = undetectable
  - Summerar: performer base_stealth + action stealth_modifier + active_modifiers
  - Hanterar `is_undetectable` och `cant_be_hidden`
- [x] `getObserversForEvent(event, state): string[]` — returnerar player_ids som ser eventet
  - Regel 1: Spelare i samma stad med intercept ≥ stealth
  - Regel 2: Stadskontrollant med city intercept ≥ stealth (för aktioner i/mot staden)
  - Regel 3: Eye/Archon minions (Informant trait) med level ≥ stealth → rapporterar till ägaren
  - Specialfall: `stealth === null` (undetectable) → ingen ser
  - Specialfall: `cant_be_hidden` → alla i staden + controller ser alltid
  - Aktören själv ser alltid sitt eget event
- [x] `filterEventsForPlayer(events, playerId, state): GameEvent[]`

**Success criteria:** Tester med mock-data bekräftar att:
- Undetectable aktioner syns bara för aktören
- Can't-be-hidden syns för alla relevanta
- Intercept-tröskel respekteras exakt
- Eye-minions rapporterar korrekt

### Steg 2.2 — Round updates-generator (`output/round-updates.ts`)
- [x] `generateRoundUpdates(state, events, mutations): RoundUpdate[]`
  - Per spelare: filtrera events genom visibility
  - Beräkna `blood_income`, `blood_spent`, `vp_gained`, `vp_lost` från mutations
  - Formattera `entries` som JSONB-array av human-readable messages
- [x] Skriv till `round_updates`-tabellen

### Steg 2.3 — Round news-generator (`output/round-news.ts`)
- [x] `generateRoundNews(events): RoundNews`
  - Filtrera events där `isPublicNews === true`
  - Formattera som JSONB entries-array

### Steg 2.4 — Game log-generator (`output/game-log.ts`)
- [x] `generateGameLog(events, round): GameLogEntry[]`
  - Alla events → game_log rader
  - Inkludera action_order, log_type, message, details

**Success criteria:** Round updates varierar per spelare baserat på stealth/intercept. Game log innehåller allt.

---

## Implementationsfas 3: Betalning + Income (Fas 1 & 5)

**Mål:** Blod flödar korrekt — kostnad dras, minions upkept, income betalas.

### Steg 3.1 — Betalning (`phases/payment.ts`)
- [x] **Action cost**: för varje aktion, dra `blood_cost` från spelarens blod
  - Alla aktionskostnader betalas oavsett — det är spelarens ansvar att actions är giltiga
  - **Ingen refund** vid failade aktioner (blod förbrukas även om aktionen misslyckas)
  - Trifle-hantering: första trifle-aktionen per spelare kostar inte action slot
  - Uppdatera `players.has_used_trifle_this_round`
- [x] **Minion upkeep**: per aktiv minion (ej burned)
  - Ghoul: level × 5
  - Harpy: level × 15
  - Eye: level × 5
  - Primogen: level × 20
  - Archon: 0 (upkeep via loyalty, hanteras i end-of-round)
  - Nyrekryterade minions denna runda: gratis upkeep
  - Om ej råd: bränn minion (`minions.is_burned = true`), generera event
- [x] Generera events: "Paid X blood for actions", "Minion Y burned (unpaid upkeep)"

**Success criteria:** Blod dras korrekt. Minions bränns vid otillräckligt blod. Failade aktioner kostar fortfarande blod (ingen refund).

### Steg 3.2 — Income (`phases/income.ts`)
- [x] **City blood_flow**: controller får `cities.blood_flow` om ej contested
- [x] **Bleed income**: tilldelas från bleed-aktioner resolverade i fas 3
  - Lagras temporärt under resolution, tilldelas här
- [x] **Övrig income**: flaggas av actions under resolution (Bottomless wealth, etc.)
- [x] Uppdatera `players.blood_last_round = players.blood` (före income, för Lasombra-curse)
- [x] Generera events: "Gained X blood from London", "Gained X blood from Bleed"

**Success criteria:** Controllers får korrekt blood_flow. Bleed-blod tilldelas.

---

## Implementationsfas 4: Grundläggande aktionsresolution

**Mål:** De vanligaste aktionerna fungerar — Move, Bleed, Give, stat-buffs, Attack.

### Steg 4.1 — Action dispatcher (`phases/resolve-actions.ts`)
- [ ] Gruppera actions per `action_order` (1, 2, 3, ...)
- [ ] Per grupp, resolva i två steg:
  1. **Celerity-prioriterade actions:** Identifiera spelare med aktiv Celerity-buff (satt av Celerity-action i tidigare action_order). Dessa spelares actions resolvas först. Shuffla sinsemellan om flera spelare har Celerity-buff.
  2. **Normala actions:** Alla övriga actions shufflas (Fisher-Yates) och resolvas.
- [ ] **Celerity-buff-tracking:**
  - När en Celerity-action resolvas → markera spelaren med `celerity_remaining = 2`
  - Varje gång en Celerity-prioriterad action resolvas → `celerity_remaining--`
  - När `celerity_remaining === 0` → spelaren återgår till normal turordning
- [ ] Spara shufflad ordning i game_log
- [ ] Per action: dispatcha till rätt handler baserat på `action_key`
- [ ] Hantera pre-conditions per action:
  - Spelare i torpor → bara Awaken och minion actions tillåtna
  - Spelare burned → alla actions fail
- [ ] Returnera alla events + mutations från alla actions

### Steg 4.2 — Personal actions: Move (`actions/personal.ts`)
- [ ] Validera: mål-stad adjacent till nuvarande stad
- [ ] Kostnadsmodifier: Nosferatu +5 (via clan_definitions lookup)
- [ ] Justicar: trifle, cost 5 istf 10
- [ ] Uppdatera `players.city_id`
- [ ] Event: "Moved from London to Bristol" med stealth = base_stealth + 2

### Steg 4.3 — Personal actions: Bleed
- [ ] Beräkna blod: i domain → 2×D10×5, annars 1×D10×5
- [ ] Cap vid stadens blood_flow
- [ ] Minska `cities.blood_flow` temporärt (till end-of-round)
- [ ] Lagra bleed-belopp för income-fas
- [ ] Ventrue curse: -10 på bleed
- [ ] Event: "Bled London for X blood"

### Steg 4.4 — Personal actions: stat-buffs
- [ ] **Watchful eyes**: +1 intercept, once_per_turn validation
- [ ] **In the shadows**: +1 stealth, once_per_turn validation
- [ ] **Blood for blood**: +1 strength, once_per_turn validation
- [ ] Alla skapar `active_modifiers` med `expires_round = current_round`

### Steg 4.5 — Faction actions: Give
- [ ] Överför blood: dra från givare, lägg till mottagare
- [ ] Överför minions: ändra `minions.owner_id`
- [ ] Överför artifacts: ändra `artifacts.carrier_player_id`
- [ ] Kostar inte action slot (`uses_action_slot = false`)

### Steg 4.6 — Personal actions: Attack!
- [ ] Validera: mål i samma stad
- [ ] Hunt roll (implementera `utils/hunt.ts` fullt ut)
  - D4 + attacker intercept vs D4 + defender stealth
  - Modifiers: Animalism (+3 extra D4), Gangrel (+1), etc.
- [ ] Vid success: skapa `combats`-rad med status='pending'
- [ ] Ambush: om attacker stealth > defender intercept → `has_ambush = true`
- [ ] Minion vs minion: resolva direkt (D4 + level vs D4 + level, förlorare bränns)
- [ ] Event: "Attacked X in London" (stealth = base_stealth - 1)

### Steg 4.7 — Personal actions: Sail
- [ ] Validera: i port-stad, mål är port i samma sea_region, ingen storm
- [ ] Uppdatera `players.city_id`

### Steg 4.8 — Personal actions: övriga
- [ ] **Awaken**: `torpor_awaken_count++`, vid 3 → `is_in_torpor = false`
- [ ] **Hide**: +5 stealth (modifier), inga fler aktioner denna runda
- [ ] **Bestow gifts**: minion level +1 (max 3)
- [ ] **Get a minion**: skapa ny minion (INSERT)
- [ ] **Grow in power**: 50 blod = 1 EXP, apply upgrades ⚠️ (detaljer i öppna frågor)
- [ ] **Diablerie**: hunt roll → burn target, gain discipline/stat ⚠️
- [ ] **Steal artifact**: omvänd hunt roll (stealth vs intercept)
- [ ] **Look for artifacts**: hunt roll → info i round_updates
- [ ] **Summon the storm**: sätt `has_storm = true` på städer i sea_region
- [ ] **Wait and strike**: lagra trigger i action.result ⚠️

**Success criteria:** Alla personal actions resolvas. Move uppdaterar city_id. Bleed beräknar korrekt blod. Attack skapar combat-rader. Hunt rolls fungerar med modifiers.

---

## Implementationsfas 5: Faction Actions

**Mål:** Alla fraktions-specifika aktioner fungerar.

### Steg 5.1 — Common faction actions (`actions/faction-common.ts`)
- [ ] **Investigate**: tas bort eller ersätts med deterministisk variant (GM-beroende action) ⚠️
- [ ] **Troublemaker**: INSERT city_problem baserat på stability ⚠️
- [ ] **Fight for control**: trigga fight-or-flee för contestants
- [ ] **Search**: lista vampyrer/minions med stealth < intercept, 25% artifact-chans
- [ ] **Conquer new territory**: INSERT city_contest, validera no-title

### Steg 5.2 — Camarilla actions (`actions/faction-camarilla.ts`)
- [ ] **Control the masquerade**: stad +1 MS, trifle
- [ ] **Claim credit**: stjäl VP, max 6/runda, once per turn
- [ ] **Buy votes**: 10 blod = +1 röst (sparas för debate-resolution)
- [ ] **Invite to camarilla**: ändra sect, Baron→Prince
- [ ] **Build my kingdom**: 3 val av 7 förbättringar (intercept, stability, blood_flow, specials, influence)
- [ ] **Second tradition**: hunt roll +2, combat med harpies
- [ ] **Expansion**: köp stad (blood_flow × 10) eller contesta adjacent
- [ ] **Recruit primogen**: INSERT minion (primogen) 40/80/120
- [ ] **Sabotage**: stad -1 stability eller -1 intercept
- [ ] **Go anarch**: byt sect, enda aktionen

### Steg 5.3 — Anarch actions (`actions/faction-anarch.ts`)
- [ ] **Anarch highway**: flytta 2 minions till adjacent
- [ ] **Anarch free press**: stad +2 intercept, trifle
- [ ] **Anarch mission**: minion +1 action
- [ ] **Anarch sabotage**: -1 stability/-1 intercept, trifle
- [ ] **Anarch revolt**: revolt counters + alla effektval (D4 rolls, minion burns, bleed, contest)
- [ ] **Organize resistance**: bränn minion → stad-förbättringar

### Steg 5.4 — Sabbat actions (`actions/faction-sabbat.ts`)
- [ ] **Sabbat sabotage**: -1 MS/-1 intercept
- [ ] **Build the base**: skapa/uppgradera sabbat_base
- [ ] **Burn the weak**: D4 rolls mot minions ≤ bas-level
- [ ] **Spreading truth**: 3 städer: -1 stab/-1 MS/-1 intercept
- [ ] **Shovelhead**: D4 rolls, stad-penalties, 2 VP, bas → lvl 1
- [ ] **Esbat**: bleed med bas-level D10s, VP-konvertering
- [ ] **Call a crusade**: 250 blod, 2 minions, exposed
- [ ] **Conquer in name of Cain**: contesta adjacent (exposed only)

**Success criteria:** Alla faction actions resolvas korrekt. VP tilldelas rätt. Stadsstat ändras.

---

## Implementationsfas 6: Discipline + Artifact + Minion Actions

**Mål:** Alla ~100 resterande aktionstyper fungerar.

### Steg 6.1 — Discipline actions (`actions/discipline.ts`)
- [ ] 14 basic disciplines: Animalism, Auspex, Celerity, Chimerstry, Dementation, Dominate, Fortitude, Obfuscate, Oblivion, Protean, Potence, Presence, Thaumaturgy, Vicissitude
- [ ] 14 mastered disciplines: mastered-varianter av ovan
- [ ] Varje discipline har unik logik — implementera en handler per discipline
- [ ] Celerity (basic): sätter `celerity_remaining = 2` på spelaren. Dispatchern (steg 4.1) hanterar turordningen — de följande 2 actions resolvas före andra spelares actions på samma action_order.

### Steg 6.2 — Artifact actions (`actions/artifact.ts`)
- [ ] 30 artefakter med unika aktioner
- [ ] Alla har Trifle
- [ ] Varje artifact: lookup mot artifact_definitions, validera att spelare bär artefakten
- [ ] Implementera per artefakt (många är varianter av bleed/buff/info)
- [ ] Consumable artifacts: `is_burned = true` efter användning

### Steg 6.3 — Minion actions (`actions/minion.ts`)
- [ ] **Ghoul**: Move, Sail, Bleed the enemy (XD10×2), Partner in crime, Sabotage, Move the master
- [ ] **Harpy**: Move, Sail, Wait and strike, Bodyguard, Suicide mission, Guard the master
- [ ] **Eye**: Move, Sail, Investigate, Hide and spy, Keep an eye on them, Hide the master
- [ ] **Primogen**: Build on master's kingdom (per level: +1 stat/special)
- [ ] **Archon**: Movement (2 steg), Sail, Attack, Bodyguard, Follow them, Sabbat interrogations, The master's will
- [ ] Validera att minion-typ matchar aktionstyp
- [ ] Minion performer: `action.performer_type = 'minion'`, `action.performer_minion_id`

**Success criteria:** Alla ~100 aktionstyper har handlers. Minion actions utförs av rätt minion-typ.

---

## Implementationsfas 7: Start-of-Round + End-of-Round Effects

**Mål:** Alla passiva effekter som inte är aktioner hanteras korrekt.

### Steg 7.1 — Start-of-next-round (sista steget i `resolve-round`, ej separat funktion)
Körs automatiskt som sista steg i resolve-round-pipelinen. Ingen GM-trigger behövs.
- [ ] **Contested cities**: -1 stability, -1 MS, 50 blod per contestant
- [ ] **Masquerade violation cascade**: aktiva violations → -1 MS på adjacent
- [ ] **Expired modifiers**: ta bort modifiers med `expires_round < current_round`
- [ ] **Ventrue boon**: +10 blod
- [ ] **Inner Circle VP**: +3 VP varannan runda (om `current_round % 2 === 0`)
- [ ] **Prince/Baron multi-city VP**: +1 VP per extra stad de kontrollerar
- [ ] **Sabbat base income**: 5 blod per base level till alla sabbat-spelare
- [ ] **Reset trifle tracking**: `has_used_trifle_this_round = false`
- [ ] **Reset temp minion mods**: nollställ `temp_strength_mod`, etc.
- [ ] Öka `current_round`, sätt `round_phase = 'action_submission'`
- [ ] Generera round_updates med start-of-round info per spelare

### Steg 7.2 — End-of-round (`phases/end-of-round.ts` — del av resolve-round)
- [ ] **Fight for control resolution**: pending fight-for-control → combat eller controller-byte
- [ ] **Clan curses** (per klan, läs `clan_definitions`):
  - Brujah frenzy: 25% → attack random i samma stad (skapa combat)
  - Malkavian: 25% → flytta random adjacent
  - Ministry: -5 blod
  - Ravnos: -5 blod om ej flyttat denna runda
  - Toreador: -10 blod om ej äger obsession
  - Tzimisce: -10 blod om ej i domain
  - Lasombra: flagga `over_ambitious` (ingen trifle nästa runda om blod < blood_last_round)
- [ ] **Clan boons** som triggas end-of-round:
  - Hecata: om minion förlorad → gratis lvl 1 Ghoul
- [ ] **Punish treason effects**: dra 25 blod från namngivna
- [ ] **(M) Dementation forced actions**: resolva tvingade Move/Bleed (Investigate borttagen) ⚠️
- [ ] **Dominate forced moves**: flytta dominerade vampyrer/minions
- [ ] **Masquerade collapse check**: >50% städer med MS=0 → `campaigns.masquerade_collapse = true`
- [ ] **Masquerade violation → blood hunt**: controller av stad med MS=0 (undantag: första gången i Camarilla-stad). Prince: royal privilege istället.
- [ ] **Justicar missions**: kontrollera criteria, markera completed
- [ ] **Archon loyalty**: -1 counter om Justicar ej avklarat mission. 0 counters → bränn.
- [ ] **Sabbat archbishop VP**: -2 VP till alla archbishops om sabbat-spelare sent to torpor av Camarilla

### Steg 7.3 — Ivory Tower debatter
- [ ] Räkna röster (base votes per title + Buy votes)
- [ ] Resolva vinnande option
- [ ] Applicera debate effects
- [ ] Generera public event

**Success criteria:** Alla passiva effekter triggas korrekt. Curses drar blod. VP tilldelas. Masquerade cascade fungerar.

---

## Implementationsfas 8: Combat Resolution

**Mål:** Combat-systemet fungerar — minion-combat resolvas direkt, vampire-combat pausar.

### Steg 8.1 — Minion vs minion combat
- [ ] Resolva direkt i resolve-round: D4 + level vs D4 + level
- [ ] Harpy trait: +2 strength mot andra minions
- [ ] Förlorare bränns
- [ ] Ingen förhandling

### Steg 8.2 — Vampire combat (skapa, ej resolva)
- [ ] Skapa `combats`-rad: status='pending', deadline = now + combat_negotiation_hours
- [ ] Inkludera all relevant data: strength, has_ambush, etc.
- [ ] Sätt `campaign.round_phase = 'combat_pending'` om vampir-combat finns

### Steg 8.3 — Combat resolution endpoint (separat funktion, ej resolve-round)
- [ ] Ny Edge Function eller del av resolve-round: `resolve-combat`
- [ ] GM triggar efter förhandling/charge/press
- [ ] Uppdatera combats-raden med rolls, wound, deal
- [ ] Applicera wound table (2D6)
- [ ] När alla combats resolverade → fortsätt till end-of-round + income

**Success criteria:** Minion-combat resolvas automatiskt. Vampire-combat skapar pending rader. GM kan resolva combat.

---

## Testning (löpande genom alla faser)

### Manuell testning via seed + curl
- [ ] Skapa test-actions i seed.js (Move, Bleed, Attack, Give, etc.)
- [ ] Anropa resolve-round med curl/Postman
- [ ] Verifiera: round_updates per spelare, blod-balans, stadsändringar

### Stealth/intercept-verifiering
- [ ] Testspelare 1 (Prince) gör Move — Testspelare 2 i samma stad med intercept 2 ska se den (stealth +2)
- [ ] Testspelare 3 gör Bleed med Obfuscate (+4 stealth) — ingen annan ska se den (total stealth högt)
- [ ] Eye-minion (level 2) i samma stad — ska rapportera aktioner med stealth ≤ 2

### Edge case-tester
- [ ] Spelare med 0 blod → alla aktioner misslyckas, minions bränns
- [ ] Spelare i torpor → bara Awaken och minion actions
- [ ] Contested stad → ingen blood_flow till controller
- [ ] Masquerade violation → blood hunt trigger

---

## Definition of Done per fas

| Fas | Done when |
|-----|-----------|
| 1 | resolve-round deployar, körs, returnerar svar, skapar tomma round_updates, startar nästa runda automatiskt |
| 2 | Stealth/intercept filtrerar korrekt, round_updates varierar per spelare |
| 3 | Blod dras vid betalning, income betalas vid slut, minion upkeep fungerar |
| 4 | Move/Bleed/Give/Attack/stat-buffs fungerar end-to-end |
| 5 | Alla faction actions (Camarilla/Anarch/Sabbat) fungerar |
| 6 | Alla ~100 aktionstyper har handlers |
| 7 | Start-of-next-round (Ventrue blod, IC VP, contests) + end-of-round (curses, masquerade, debatter) fungerar — allt inom resolve-round |
| 8 | Combat-systemet fungerar (minion auto, vampire pausar) |

---

## Risker

| Risk | Sannolikhet | Impact | Mitigation |
|------|-------------|--------|------------|
| Stealth-bugg läcker info | Hög | Kritisk | Testa varje visibility-regel separat |
| Edge Function timeout (25s) | Låg | Hög | In-memory state, en transaktion, benchmark |
| Ordningsberoenden mellan aktioner | Medium | Medium | Spelarna ansvarar för ordning, vi respekterar den |
| Deterministik utan GM kräver att alla GM-beroende actions ersätts | Medium | Medium | Identifiera och ersätt/ta bort alla GM-beroende actions (Investigate, Malkavian prophecy, etc.) |
| Celerity turordning edge cases | Medium | Medium | Klargjort: Celerity är en action, ger priority på de 2 följande actions. Testa med flera Celerity-spelare. |
