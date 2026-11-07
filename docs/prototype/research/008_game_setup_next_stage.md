# Research: Game Setup — Next Stage (Title Assignment → Character Creation → Game Start)
Datum: 2026-03-23

## Sammanfattning

Undersöker vad som finns och vad som saknas för flödet:
1. GM tilldelar titlar till spelare
2. GM tilldelar Sabbat-spelares förklädnadstitlar
3. Spelare utan titel ser "Väntar på att GM ska konfigurera spelet"
4. Spelare med titel kan gå vidare till karaktärsskapande
5. GM-dashboard visar vem som skapat karaktär och vem som väntar
6. När alla spelare är redo kan GM starta Runda 1

---

## Relevanta filer

### Databas
| Fil | Innehåll |
|-----|----------|
| `supabase/migrations/20260323000001_players_nullable_setup.sql` | Gör clan/sect/title nullable |
| `supabase/migrations/20260323000000_players_gm_update.sql` | GM kan uppdatera spelare (sect/title/city) |
| `supabase/migrations/20260321000000_chat_system.sql` | Chat-auto-creation vid campaign → active, uses disguise_title |
| `supabase/migrations/20260322000001_gm_flag_trigger.sql` | Sets profiles.is_gm on campaign create |

### Frontend
| Fil | Innehåll |
|-----|----------|
| `src/views/AdminView.vue` | GM-dashboard med tabs: Map, Players, Settings |
| `src/views/GameView.vue` | Spelvy — antar att karaktär redan finns |
| `src/views/CampaignList.vue` | Kampanjlista + invite accept/decline |
| `src/components/admin/PlayerRoster.vue` | GM tilldelar sect, title, disguise_title, city, stats |
| `src/components/admin/PlayerInvites.vue` | GM bjuder in spelare via email |
| `src/stores/admin.js` | GM store — createCampaign, updatePlayer, startCampaign |
| `src/stores/game.js` | Spelstate — loadCampaign, myPlayer, availableActions |
| `src/stores/auth.js` | Auth + isGm computed |

### Planer (redan klara)
| Fil | Status |
|-----|--------|
| `thoughts/shared/plans/007_campaign_setup.md` | DONE — täcker kampanjskapande, invite, sect/title-tilldelning |

---

## Vad som redan finns (✓)

### 1. GM tilldelar titlar — FINNS
- **PlayerRoster.vue** har dropdown för sect (camarilla/anarch/sabbat), title (filtrerad per sect), och disguise_title (bara för Sabbat)
- **admin.js** `updatePlayer(playerId, changes)` sparar till DB
- **RLS**: `players_update_gm_setup` tillåter GM att uppdatera spelare i sina kampanjer
- Title-enum-värden: prince, justicar, inner_circle (Camarilla), baron (Anarch), archbishop (Sabbat)

### 2. Sabbat disguise_title — FINNS
- **PlayerRoster.vue** visar disguise_title-dropdown enbart för Sabbat-spelare
- **DB**: `players.disguise_title` (nullable) lagrar förklädnadstitel
- **Chat-systemet** (migration 20260321000000) använder disguise_title för att placera Sabbat i rätt sektchat

### 3. Kampanjstart — FINNS
- **AdminView.vue** Settings-tab har "Start Campaign"-knapp
- **admin.js** `startCampaign()` validerar ≥3 spelare med sect + city, sätter status → 'active', current_round → 1
- Chat-trigger skapar automatiskt 4 chattar vid status → 'active'

### 4. DB-stöd för nullable fields — FINNS
- Migration `20260323000001` gör clan, sect, title nullable
- Spelare kan skapas vid invite-accept utan att ha fått titel ännu

---

## Vad som SAKNAS (✗)

### A. "Väntar på GM"-vy för spelare utan titel — SAKNAS
**Nuvarande beteende:** Spelare med accepterad invite navigerar till GameView som antar att allt är konfigurerat. Om title/sect/clan är null visas felaktiga/tomma värden.

**Behövs:**
- GameView (eller en mellanvy) måste kontrollera om spelaren har fått titel
- Om `myPlayer.title === null` → visa "Väntar på att GM ska konfigurera spelet"
- Om `myPlayer.title !== null && myPlayer.clan === null` → visa karaktärsskapande
- Om `myPlayer.title !== null && myPlayer.clan !== null` → visa normal spelvy

### B. Karaktärsskapande (klanval + disciplines) — SAKNAS
**Nuvarande beteende:** Det finns inget UI eller flöde för att spelaren ska välja klan och disciplines.

**DB-stöd som redan finns:**
- `clan_definitions`-tabell med 14 klaner och deras disciplines
- `player_disciplines`-junction-tabell (player_id, discipline_id, is_mastered)
- `players.clan`-kolumn (nullable, kan sättas av spelaren)

**Behövs:**
- UI-komponent för klanval (visa tillgängliga klaner baserat på spelarens sect)
- UI för discipline-val (baserat på vald klan)
- Store-metod: `submitCharacter(clan, disciplines)` → UPDATE players + INSERT player_disciplines
- RLS: spelare kan uppdatera sin egen clan-kolumn (behöver ny policy)
- RLS: spelare kan inserta egna player_disciplines (behöver ny policy)

### C. GM-dashboard: readiness-spårning — SAKNAS
**Nuvarande beteende:** PlayerRoster visar sect/title/city men inte om spelaren har skapat sin karaktär (valt klan/disciplines).

**Behövs:**
- Visuell indikator per spelare: "Titel tilldelad" / "Karaktär skapad" / "Redo"
- Sammanfattning: "X av Y spelare redo"
- "Start Campaign"-knappen bör vara disabled tills alla spelare har skapat karaktär
- Admin store behöver ladda player_disciplines för att veta status

### D. Kampanjstatus-flow behöver uppdateras — DELVIS SAKNAS
**Nuvarande:** setup → active (direkt)

**Behövs:** En tydligare fas mellan setup och active:
- `setup` = GM konfigurerar (titlar, städer)
- Implicit "character creation"-fas = spelare väljer klan/disciplines (kan vara inom setup eller ny status)
- `active` = spelet pågår

**Fråga:** Behöver vi en ny campaign status (t.ex. 'recruiting' eller 'character_creation'), eller räcker det att använda `setup` och kontrollera spelarens egna fält?

---

## Befintliga patterns

### Hur spelare skapas idag
1. GM bjuder in via email → `campaign_invites` rad skapas
2. Spelare loggar in → ser invite i CampaignList
3. Spelare accepterar invite → `players`-rad skapas med `clan=null, sect=null, title=null`
4. GM tilldelar sect, title, city via PlayerRoster
5. **HÄR SLUTAR DET NUVARANDE FLÖDET**

### RLS-mönster
- GM-check: `is_campaign_gm(campaign_id)` — SECURITY DEFINER helper
- Spelaren ser sig själv: `user_id = auth.uid()`
- Kampanjmedlem: `my_campaign_ids()` — SECURITY DEFINER helper

### Store-mönster
- Pinia Composition API: `defineStore('name', () => { ... })`
- Supabase-queries direkt i stores
- loading/error refs
- Auth-store hanterar isGm-flagga

---

## Potentiella fallgropar

1. **RLS för spelarens egen clan-uppdatering** — Spelare behöver en UPDATE-policy som bara tillåter ändring av `clan` (inte sect, title, city). Alternativt: en Edge Function som validerar och skriver. Column-level grants eller en RLS policy med specifika kolumner bör övervägas.

2. **Discipline-validering** — Spelaren bör bara kunna välja disciplines som hör till sin valda klan. Validering kan ske client-side + server-side (Edge Function eller check constraint).

3. **Race condition vid startCampaign** — Om GM startar kampanjen medan en spelare håller på att skapa karaktär. Bör validera att alla spelare har clan + disciplines innan start.

4. **Sabbat-klanval** — Sabbat-spelare kan välja klaner som normalt hör till Camarilla/Anarch. Deras disguise_title gör att andra spelare inte vet deras riktiga klan. Klan bör INTE vara synlig för andra spelare via RLS.

5. **Clan-synlighet** — I spelet är en spelares klan inte nödvändigtvis känd av alla. RLS bör hantera att `players.clan` inte alltid visas till alla. Separat fråga — kan hanteras senare.

6. **startCampaign-validering** — Nuvarande validering kräver bara sect + city. Behöver utökas till att kräva clan + minst N disciplines.

---

## Rekommendationer

### Approach: Enklast möjliga
Undvik ny campaign status. Använd spelarens fält för att avgöra var i flödet de är:

| Tillstånd | Villkor | Spelare ser |
|-----------|---------|-------------|
| Väntar på GM | `title === null` | "Väntar på att GM ska konfigurera spelet" |
| Karaktärsskapande | `title !== null && clan === null` | Karaktärsskapande-UI |
| Redo | `title !== null && clan !== null` | Spelvy (eller "Väntar på runda 1" om campaign.status === 'setup') |

### Fas-förslag (för planering)

**Fas 1 — Player gating i GameView**
- Kontrollera myPlayer.title och myPlayer.clan
- Visa rätt vy baserat på tillstånd
- Ingen ny route behövs — hantera med conditional rendering i GameView

**Fas 2 — Karaktärsskapande UI**
- Komponent för klanval + discipline-val
- Store-metod för att spara
- RLS-policy eller Edge Function för att validera val

**Fas 3 — GM readiness dashboard**
- Utöka PlayerRoster med readiness-status
- Utöka startCampaign-validering (kräv clan + disciplines)
- Sammanfattningskort i AdminView

**Fas 4 — Polish**
- Realtime-uppdateringar (GM ser direkt när spelare skapar karaktär)
- Notifiering till spelare när titel tilldelas

---

## Sidofynd (hör ej till detta scope — läggs i BACKLOG.md)

1. **RLS: players_update_gm_setup saknar fas-check** — GM kan uppdatera spelare även när kampanjen är 'active'. Bör begränsas till status = 'setup'. (Låg risk — GM är betrodd.)
2. **Ingen disguise_title-validering** — Inget hindrar att disguise_title sätts till ogiltigt värde. Bör ha enum check.
3. **is_gm är global** — profiles.is_gm är global, inte per-kampanj. Acceptabelt för 20-spelare-scope men bör noteras.
4. **Clan-synlighet** — players.clan är för närvarande synligt via RLS för alla i kampanjen. Behöver eventuellt begränsas (spelare bör inte alltid se andras klan).
5. **startCampaign kräver inte title** — Nuvarande validering kräver sect + city men inte title. Bör utökas.
