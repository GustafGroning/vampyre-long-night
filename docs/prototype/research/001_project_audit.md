# Project Audit — 2026-03-19

## Syfte
Fullständig genomgång av vad som är byggt, vad som saknas, och vad som behövs för en spelbar prototyp.

---

## Frontend (src/) — KOMPLETT

Alla komponenter är färdigimplementerade utan TODOs eller stubs.

| Fil | Status | Notering |
|-----|--------|----------|
| main.js | ✅ | Minimal setup |
| App.vue | ✅ | Auth init, tema-CSS |
| lib/supabase.js | ✅ | Klient-factory |
| router/index.js | ✅ | 3 routes, auth guards |
| stores/auth.js | ✅ | Sign in/up/out, session |
| stores/game.js | ✅ | 11 queries i loadCampaign, action CRUD. Stubb: rad 61 `required_minion_type` returnerar alltid false |
| views/LoginView.vue | ✅ | Email/lösenord |
| views/CampaignList.vue | ✅ | Lista + navigering |
| views/GameView.vue | ✅ | Layout, panelsystem |
| components/GameMap.vue | ✅ | SVG + map.png bakgrund, 18 städer |
| components/PlayerPanel.vue | ✅ | Stats, disciplines, artefakter, minions |
| components/ActionPanel.vue | ⚠️ | Fungerar men saknar: blodkostnad-varning, target-validering |
| components/CityPanel.vue | ✅ | Stadsdetaljer, adjacencies, vampyrer/minions |
| components/HistoryPanel.vue | ✅ | Round updates + public news |

## Backend — DELVIS

### Supabase-schema (i molnet, ej lokalt)
20+ tabeller finns i Supabase-projektet (7 migrationer). Fungerar korrekt — seed.js och frontend queries bekräftar det.

**Saknas lokalt:** Inga migrationer i `supabase/migrations/`. Schemat är inte versionshanterat.

### Edge Functions — SAKNAS HELT
- `resolve-round` — spelmotorn. Inte påbörjad.
- `validate-action` — server-side validering. Inte påbörjad.

Inga `supabase.functions.invoke()` eller `supabase.rpc()` calls finns i frontend.

### RLS — implementerat i Supabase
- Sabbat-baser: bara Sabbat
- Artefakter: bara bäraren
- game_log: GM-only
- round_updates: per spelare
- `my_campaign_ids()` SECURITY DEFINER helper

## Seed-data — KLART
- 18 städer med kalibrerade koordinater (via calibrate.html)
- 36 bidirektionella adjacencies
- 3 testspelare (Ventrue Prince, Nosferatu Baron, Lasombra Archbishop)
- Disciplines, minions, artefakter, stadsspecials/problems

## Karta — NÄSTAN KLAR
- map.png som bakgrund (1024x1335)
- Interaktiva SVG-noder ovanpå
- Adjacency-linjer dolda (bakgrunden har dem)
- Väntar på ren bakgrundsbild utan statiska noder från designer

---

## Vad som blockerar en spelbar prototyp

1. **resolve-round Edge Function** — utan denna kan ingen ronda avslutas
2. **GM-dashboard (minimal)** — behövs för att trigga ronder
3. **validate-action Edge Function** — behövs för att förhindra ogiltiga aktioner

## Mindre saker att fixa
- `required_minion_type` stubb i game.js:61
- Blodkostnad-varning i ActionPanel
- Target-validering i ActionPanel
- Migrationer i version control

## Utanför prototyp-scope
- Stridsförhandling (Discord)
- Ivory Tower-röstning (Discord)
- Karaktärsskapande
- Lobbyskapande/inbjudningar
- Testinfrastruktur
- Realtids-subscriptions (nice-to-have)
