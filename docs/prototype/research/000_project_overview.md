# Research: Generell projektforstaelse

**Datum:** 2026-03-19
**Scope:** Helhetsbild av projektet — spelmekanik, arkitektur, vad som finns och saknas

---

## 1. Vad spelet ar

"Vampire: The Long Night" ar ett megaspel for 20 spelare i 1920-talets England. Spelare kontrollerar vampyrer fran tre sekter (Camarilla, Anarch, Sabbat) och tavlar om kontroll, resurser och politisk makt over 8 ronder.

**Karnprincip:** Spelet ar en ren funktion: `game_state + player_actions → new_game_state`.
All icke-deterministisk logik har redan eliminerats av GM.

---

## 2. Spelmekanik (fran kod och seed-data)

### 2.1 Fraktioner och titlar

| Sekt | Titlar | Sarskilt |
|------|--------|----------|
| Camarilla | Prince, Inner Circle | Royal Privileges-tokens, 6 aktioner for Inner Circle |
| Anarch | Baron | 5 aktioner, mer blod vid start |
| Sabbat | Archbishop | Forkladda som andra titlar (disguise_title), hemliga baser |

### 2.2 Spelarresurser

- **Blood** — valuta for aktioner (varierar 90–150 vid start)
- **VP** — segerpoanng
- **Strength** — stridsmodifierare
- **Stealth** — gomma aktioner fran andra spelare
- **Intercept** — upptacka andras gomda aktioner
- **Royal Privileges** — Camarilla-tokens
- **Disciplines** — vampyrkrafter (kan vara "mastered" for extra effekt)
- **Artifacts** — 30 unika foremal med specialaktioner
- **Minions** — underhuggare (typer: primogen, eye, ghoul, harpy m.fl.) med level 1-2+

### 2.3 Stader

13+ stader pa Brittiska oarna med:
- **Blood Flow** — fornybar resurs varje rond
- **Stability** (0–4) — stadsstabilitet
- **Masquerade Status** — hemlighallning gentemot dodliga
- **Intercept** — stadens basintercept
- **is_port + sea_region** — hamnar for sjofartsrutter
- **controller_id** — vilken spelare kontrollerar staden
- **Specials** (positiva effekter, t.ex. "+1 stealth i London")
- **Problems** (negativa effekter, t.ex. "-1 stability/ronde i Dublin")

Stader ar kopplade via `city_adjacencies` (dubbelriktade).

### 2.4 Aktionssystem

Varje ronde:
1. Spelare lamnar in en ordnad lista med 4–6 aktioner (beroende pa titel)
2. Motorn processar alla "Aktion #1" i slumpmassig ordning, sedan "#2" etc.
3. Stealth/intercept beraknas — varje spelare ser bara vad deras karaktar *kan* se
4. Personaliserade `round_updates` skrivs till databasen

**Aktionsslots:**
- Default: 4 aktioner
- Baron: 5 aktioner
- Inner Circle: 6 aktioner
- Trifles: gratis (forsta per ronde), tar inte en slot

**Blodkostnad:** Varje aktion har en `base_cost` i blod.

**Performer:** Spelaren sjalv eller en minion.

**~60 aktionstyper** organiserade i kategorier: faction, personal, discipline, artifact.
Filtrering baserat pa: sect, title, discipline (+ mastery), minion_type.

### 2.5 Stealth/Intercept-systemet

- Varje aktion har en `stealth_modifier`
- Vissa aktioner ar `is_undetectable` (kan aldrig ses)
- Vissa ar `cant_be_hidden` (alltid synliga)
- Intercept-varde (spelare + stad) bestammer vad som upptacks
- **Server-side berakning** — inte enbart via RLS
- Personaliserade rondresultat filtrerar bort det spelaren inte ska se

---

## 3. Arkitektur

### 3.1 Tech Stack

| Lager | Teknologi |
|-------|-----------|
| Frontend | Vue 3 + Vite + Pinia + Vue Router |
| Auth | Supabase Auth |
| Databas | Supabase Postgres + RLS |
| Spelmotor | Supabase Edge Functions (Deno/TypeScript) |
| Hosting | Supabase cloud (serverlost) |

### 3.2 Frontend-struktur

```
src/
├── main.js              # App-setup med Pinia + Router
├── App.vue              # Rotkomponent, auth-initiering, CSS-variabler
├── router/index.js      # /login, /, /game/:campaignId (auth guards)
├── stores/
│   ├── auth.js          # Pinia: user, signIn/signUp/signOut
│   └── game.js          # Pinia: all speldata, CRUD for aktioner
├── lib/supabase.js      # Supabase JS-klient
├── components/
│   ├── GameMap.vue       # SVG-karta: stader, fraktionsfaorger, adjacencies
│   ├── ActionPanel.vue   # Aktionsbyggare med validering
│   ├── PlayerPanel.vue   # Spelarinfo: stats, disciplines, artifacts, minions
│   ├── CityPanel.vue     # Stadsdetaljer: resurser, problem, vampyrer
│   └── HistoryPanel.vue  # Rondhistorik: personliga updates + publika nyheter
└── views/
    ├── LoginView.vue     # Inloggning/registrering
    ├── CampaignList.vue  # Kampanjlista
    └── GameView.vue      # Huvudspelvyn: karta + slide-out-paneler
```

### 3.3 State Management (Pinia game store)

Storen laddar ALL speldata i `loadCampaign()` — 14 parallella Supabase-queries:
- campaign, myPlayer, players, cities, adjacencies, minions
- myDisciplines, myArtifacts, myActions
- roundUpdates, roundNews
- cityProblems, citySpecials, actionDefinitions

Computed properties:
- `availableActions` — filtrerar 60 aktionstyper baserat pa spelarens sect/title/disciplines
- `myMinions` — aktiva minions (ej branda)
- `cityMap/adjacencyMap` — snabba uppslag

CRUD:
- `submitAction()` — upsert till Supabase
- `deleteAction()` — ta bort
- `reorderActions()` — andrar action_order

### 3.4 Databas (Supabase Postgres)

**Huvudtabeller:**
| Tabell | Syfte |
|--------|-------|
| campaigns | Kampanjdata, rondnummer, fas |
| players | Spelarkaraktarer per kampanj |
| cities | 13+ stader med resurser och koordinater |
| city_adjacencies | Grannskap (dubbelriktat) |
| action_definitions | ~60 aktionstyper med krav och kostnader |
| actions | Inlamnade aktioner per ronde |
| round_updates | Personaliserade utfall per spelare |
| round_news | Publika nyheter per ronde |
| combat_records | Stridsloggar |
| game_log | GM-only fullstandig logg |
| minions | Underhuggare per spelare |
| player_disciplines | Disciplines per spelare (med mastery) |
| artifacts + artifact_definitions | 30 unika foremal |
| city_problems / city_specials | Stadseffekter |
| debates | Politiska debatter (Ivory Tower) |
| sabbat_bases | Hemliga Sabbat-baser |

Multi-tenancy: alla tabeller har `campaign_id`.

### 3.5 RLS (Row Level Security)

- **Sabbat-baser:** bara Sabbat-spelare ser dem
- **Artefakter:** bara bararen ser dem
- **game_log:** bara GM
- **round_updates:** personaliserade per spelare
- `my_campaign_ids()` — SECURITY DEFINER-funktion for att undvika sjalvreferens

---

## 4. Design och UI

Gotisk/viktoriansk vampyrestetik:
- Mork bakgrund (`#1a1412`), pergament-toner
- Cinzel (rubrik-font) + Inter (brodtext)
- Fraktionsfaorger: rod (Camarilla), gron (Anarch), lila (Sabbat), guld (UI-accent)
- SVG-karta med kugghjulsnoder, ankare for hamnar, blixt for stormar
- Slide-out-paneler for detaljvyer

---

## 5. Vad som ar byggt

- [x] Komplett Vue 3 frontend (3 views, 5 komponenter)
- [x] Pinia state management (auth + game)
- [x] Vue Router med auth guards
- [x] SVG-karta med interaktiva stader
- [x] Aktionsbyggare med validering (client-side)
- [x] Slide-out-paneler: spelare, aktioner, stad, historik
- [x] Supabase-autentisering
- [x] RLS-policys i databasen
- [x] Seed-script med testdata (4 stader, 3 spelare, minions, disciplines, artifacts)
- [x] Gotisk UI med CSS-variabler

---

## 6. Vad som INTE ar byggt (prioritetsordning)

1. **`resolve-round` Edge Function** — spelmotorn som processar aktioner (STORSTA ATERSTAENDE ARBETET)
2. **`validate-action` Edge Function** — server-side realtidsvalidering
3. **GM-dashboard** — kampanjsetup, kartredigerare, rondhantering
4. **Realtids-subscriptions** — live-uppdateringar nar rundan losis
5. Stridsforhandling (pa Discord tills vidare)
6. Ivory Tower-roistning (pa Discord tills vidare)
7. Karaktarsskapande-floide
8. Lobbyskapande och spelarinbjudningar

---

## 7. Observationer och risker

### Saker att ha i atanke

1. **Stealth/intercept ar karnmekaniken** — all logik for vilken information en spelare ser maste beraknas server-side i Edge Functions, inte i frontend
2. **Sabbat disguise_title** — Sabbat-spelare kan ha en forkladnad (t.ex. archbishop som ser ut som prince). UI och logik maste hantera detta
3. **Aktionsordning ar kritisk** — alla spelare kor aktion #1 forst (i slumpmassig ordning), sedan #2 etc. Ordningen spelarens aktioner lags i spelar roll
4. **Minions som performers** — aktioner kan utforas av minions istallet for spelaren sjalv, med andra regler
5. **Inga tester uppsatta** — ingen testinfrastruktur annu
6. **Inga lokala migrationer** — databasschema hanteras i Supabase-dashboarden (7 migrationer finns dar)
7. **Action definitions saknas lokalt** — de ~60 aktionstyperna ar data i databasen, ingen lokal referens utover vad som syns i koden

### Styrkor i nuvarande arkitektur

- Ren separation: frontend for UI, Edge Functions for spellogik
- Multi-tenancy fran dag ett
- RLS for informationsgomning
- Flexibelt JSONB-baserat aktionssystem (params/result)
- Seed-script for snabb testning
