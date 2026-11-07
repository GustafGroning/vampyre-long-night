# Vampire: The Long Night — Digital Edition
*Projektkontext för Claude Code*

---

## Vad projektet är

En webb-app som automatiserar "Vampire: The Long Night" — ett 20-spelar-megaspel i 1920-talets England. Spelare kontrollerar vampyrer från tre fraktioner (Camarilla, Anarch, Sabbat) och tävlar om kontroll, resurser och politisk makt över 8 ronder.

**Kärnprincipen:** Spelet är en ren funktion — `spelstatus + spelaraktioner → ny spelstatus`. All icke-deterministisk logik har eliminerats av GM.

---

## Tech Stack

- **Frontend:** Vue.js 3 + Vite + Pinia + Vue Router
- **Backend:** Supabase (Postgres + Auth + Row Level Security + Edge Functions)
- **Edge Functions:** Deno (körda i Supabase cloud)
- **Hosting:** Supabase cloud — ingen självhanterad server

---

## Projektstruktur

```
vampire-long-night/
├── src/
│   ├── components/         # Vue-komponenter
│   ├── views/              # Sidvy-komponenter
│   ├── stores/             # Pinia state stores
│   ├── router/             # Vue Router-konfiguration
│   └── lib/                # Supabase-klient och helpers
├── supabase/
│   ├── migrations/         # 7 databas-migrationer (komplett schema)
│   ├── functions/          # Edge Functions (Deno)
│   │   ├── resolve-round/  # Spelmotor — HUVUDSAKLIGA ÅTERSTÅENDE ARBETET
│   │   └── validate-action/ # Realtidsvalidering av aktioner
│   └── seed/               # Testdata-script
├── thoughts/
│   └── shared/
│       ├── research/       # Forskningsdokument
│       ├── plans/          # Implementationsplaner
│       └── sessions/       # Sessionssammanfattningar
├── CLAUDE.md               # Denna fil
└── workflow.md             # Research → Plan → Implement-process
```

---

## Databas — vad som finns

Fullt Postgres-schema med alla spelentiteter:

| Tabell | Innehåll |
|--------|----------|
| `campaigns` | Kampanjdata, rondnummer, status |
| `players` | Spelare kopplade till kampanjer |
| `cities` | 13+ städer med blod, problem, specialregler |
| `city_adjacencies` | Vilka städer är grannar |
| `clans` | 14 klaner (referens) |
| `action_types` | ~60 aktionstyper med blodkostnad, stealth, krav |
| `actions` | Inlämnade aktioner per ronde |
| `round_results` | Personaliserade utfall per spelare |
| `combat_records` | Stridsloggar |
| `game_log` | GM-only fullständig händelselogg |
| `minions`, `disciplines`, `artifacts` | Spelarresurser (30 artefakter) |
| `debates`, `sabbat_bases` | Fraktionstabeller |

Alla tabeller är scoped med `campaign_id` för multi-tenancy.

---

## RLS — informationsgömning

Stealth/intercept-systemet är spelets kärnmekanism. RLS-policys enforcar:
- Sabbat-baser: bara synliga för Sabbat-spelare
- Artefakter: bara synliga för bäraren
- Uppdrag: bara synliga för tilldelade spelare
- `round_updates`: personaliserade rader per spelare
- `game_log`: GM-only

Hjälpfunktionen `my_campaign_ids()` är `SECURITY DEFINER` för att undvika self-referencing RLS.

**Viktigt:** Personaliserade rundan-utfall beräknas server-side i Edge Functions och skrivs till `round_updates` — filtreringen sker *inte* enbart via RLS.

---

## Vad som är byggt

- [x] Komplett databasschema (7 migrationer)
- [x] RLS-policys för informationsgömning
- [x] Vue-klient: login, kampanjlista, spelvy
- [x] SVG-karta (gotisk pergament-stil, kugghjul-stadsnoder, fraktionssymboler)
- [x] Aktionsbyggare med validering mot titel/sekt/discipline-krav
- [x] Slide-out panels: spelastatus, aktioner, stadsdetaljer, rundhistorik
- [x] Seed-script med testdata

---

## Vad som INTE är byggt (prioritetsordning)

1. **`resolve-round` Edge Function** — spelmotor som processar aktioner. Det största återstående arbetet.
2. **`validate-action` Edge Function** — server-side realtidsvalidering
3. **GM-dashboard** — kampanjuppsättning, kartredigerare, rundehantering
4. **Realtids-subscriptions** — live-uppdateringar när rundan löses
5. Stridsförhandling (stannar på Discord tills vidare)
6. Ivory Tower-röstning (stannar på Discord tills vidare)
7. Karaktärsskapande-flöde
8. Lobbyskapande och spelarinbjudningar

---

## Spelmotorn — arkitektur

Spelmotorn är en ren funktion:
```
game_state + player_actions → new_game_state + per_player_updates
```

**Resolutionsordning:**
1. Alla spelare lämnar in en ordnad lista med 4–6 aktioner
2. Motorn processar alla "Aktion #1" i slumpmässig ordning, sedan alla "#2" etc.
3. Stealth/intercept beräknas — varje spelare ser bara vad deras karaktär *kan* se
4. Personaliserade `round_updates`-rader skrivs till databasen

**Aktionstyper inkluderar:** förflyttning, blödning av städer, attack, disciplines, sättning av minions, politiska manövrar

---

## Utvecklingskonventioner

- Vue 3 Composition API med `<script setup>` — inga Options API-komponenter
- Pinia för global state, `ref`/`computed` lokalt
- Supabase-klienten importeras från `src/lib/supabase.js`
- Edge Functions skrivs i TypeScript/Deno
- Inga tester är uppsatta ännu
- Spellogik i Edge Functions, inte i Vue-komponenter

---

## Viktiga designbeslut

- Edge Functions (Deno) kör spelmotorn — tillräckligt för 20 spelare och ~100 aktioner/ronde
- `campaign_id` på alla tabeller från dag ett — multi-tenancy-redo
- Aktioner använder JSONB `params` och `result` för flexibilitet över ~60 aktionstyper
- Stealth/intercept hanteras server-side (inte via ren RLS)

---

## Trigger words — gör så här när du ser dessa

- `"research [X]"` → läs workflow.md Fas 1, skapa research-doc i `thoughts/shared/research/`
- `"plan [X]"` → läs workflow.md Fas 2, skapa plan i `thoughts/shared/plans/`
- `"implement"` → läs workflow.md Fas 3, följ senaste planen i `thoughts/shared/plans/`
- `"validate"` → läs workflow.md Fas 4, validera mot senaste planen
- `"save session"` → spara sammanfattning i `thoughts/shared/sessions/[datum]_[namn].md`
- `"resume"` → läs senaste filen i `thoughts/shared/sessions/` och fortsätt

---

## När du arbetar med projektet

1. Research alltid befintliga mönster och spelregler innan implementation
2. Spelmotorns logik är komplex — skapa alltid en plan för mer än en-fils-ändringar
3. Kontrollera RLS-policys vid nya tabeller eller queries
4. Spelmekanikregler finns i spelets regelbok — fråga om oklarheter innan du antar
5. Stealth/intercept-systemet är känsligt — testa alltid att fel spelare inte ser för mycket