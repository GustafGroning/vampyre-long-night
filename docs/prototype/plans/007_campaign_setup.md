# Plan: Campaign Setup System
Datum: 2026-03-22
Status: DONE

## Översikt

Bygg GM-verktyg för att skapa och konfigurera kampanjer. Fyra huvudfunktioner:
1. Skapa kampanj (namn, max rounds, tidsinställningar)
2. Konfigurera karta (städer, adjacenser, portar, havsregioner)
3. Bjuda in spelare via email
4. Tilldela klaner till spelare

**Approach:** Incremental — varje fas levererar testbar funktionalitet. Använder befintliga patterns (Composition API, Pinia stores, Supabase direkt-queries med RLS). Inget nytt edge function behövs för fas 1-2 (direkt INSERT/UPDATE via anon key + RLS). Fas 3 kräver ny DB-tabell + edge function för email.

**GM-identitet:** `campaigns.created_by = auth.uid()` — samma mönster som resolve-round använder. Profiltabellens `is_gm`-flagga ger global GM-status för att visa "Skapa kampanj"-knappen.

---

## Fas-uppdelning

### Fas 1 — Campaign Creation + GM Admin Store
*Grundläggande kampanjskapande med ny route, vy och store*

- [x] **1.1** Skapa `src/stores/admin.js` — Pinia store för GM-operationer:
  - `createCampaign({ name, max_rounds, action_deadline_hours, combat_negotiation_hours })` → INSERT till `campaigns` med `created_by: auth.uid()`, `status: 'setup'`
  - `loadAdminCampaign(campaignId)` → laddar kampanj + cities + adjacencies + players (utan myPlayer-logik)
  - `isGm` computed — hämta från profiles-tabellen vid init
  - `myCampaigns` — lista kampanjer där `created_by = auth.uid()`

- [x] **1.2** Skapa `src/views/CampaignSetup.vue` — GM-vy med kampanjskapande-formulär:
  - Fält: kampanjnamn, max rounds (default 8), action deadline hours (default 168), combat negotiation hours (default 6)
  - Submit → `admin.createCampaign()` → navigera till `/admin/:campaignId`
  - Stilmässigt: samma gothic dark theme som befintliga vyer

- [x] **1.3** Skapa `src/views/AdminView.vue` — GM dashboard för en kampanj:
  - Tab-baserad layout: Karta | Spelare | Inställningar
  - Laddar kampanjdata via `admin.loadAdminCampaign()`
  - Visar kampanjstatus, rundnummer, antal spelare/städer
  - Placeholder-tabs för fas 2-4

- [x] **1.4** Lägg till routes i `src/router/index.js`:
  - `/campaigns/create` → `CampaignSetup.vue` (meta: requiresAuth)
  - `/admin/:campaignId` → `AdminView.vue` (meta: requiresAuth)

- [x] **1.5** Uppdatera `src/views/CampaignList.vue`:
  - Visa "Skapa kampanj"-knapp om användaren har `profiles.is_gm = true`
  - Visa GM-kampanjer (status: setup) separat från spelar-kampanjer
  - GM-kampanjer länkas till `/admin/:campaignId`

- [x] **1.6** Lägg till RLS-policy för campaigns INSERT:
  - Migration: `CREATE POLICY "campaigns_insert" ON campaigns FOR INSERT WITH CHECK (created_by = auth.uid())`
  - Verifiera att befintliga SELECT/UPDATE-policys täcker GM-access

**Success criteria fas 1:**
- GM kan logga in, se "Skapa kampanj"-knapp, fylla i formulär, skapa kampanj
- Ny kampanj syns i listan med status "setup"
- GM kan navigera till admin-dashboard (tomt men med tabs)
- Icke-GM-användare ser inte "Skapa kampanj"-knappen

---

### Fas 2 — Map Auto-Import
*Alla kampanjer använder British Isles-kartan. Importeras automatiskt vid kampanjskapande.*

- [x] **2.1** Extrahera kartdata från seed.js till `src/data/british-isles-map.js`:
  - 18 städer med alla attribut (coordinates, blood_flow, stability, etc.)
  - 34 adjacenser (stadpar)
  - Exportera som named exports

- [x] **2.2** Admin store-metod `importMap(campaignId)`:
  - Importerar kartdata från british-isles-map.js
  - INSERT alla städer → samla returnerade ID:n
  - INSERT alla adjacenser (bidirektionellt) med korrekta city-ID:n
  - Anropas automatiskt efter `createCampaign()`

- [x] **2.3** RLS-migration: INSERT-policys för `cities` och `city_adjacencies`:
  - GM kan inserta städer/adjacenser i sina kampanjer
  - Helper: `is_campaign_gm(campaign_id)` SECURITY DEFINER function

- [x] **2.4** Visa kartförhandsvisning i AdminView (Karta-tab):
  - Återanvänd GameMap.vue i read-only-läge (inga klick-handlers)
  - Visar importerade städer och adjacenser

**Success criteria fas 2:**
- Vid kampanjskapande importeras 18 städer + adjacenser automatiskt
- Admin-dashboard visar kartförhandsvisning
- Kartdata matchar exakt seed.js-datan

---

### Fas 3 — Player Invites
*GM bjuder in spelare via email, spelare läggs till automatiskt*

- [x] **3.1** DB-migration: skapa `campaign_invites` tabell:
  ```sql
  CREATE TABLE campaign_invites (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    email        text NOT NULL,
    invited_by   uuid NOT NULL REFERENCES auth.users(id),
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    player_id    uuid REFERENCES players(id),  -- set when accepted
    created_at   timestamptz NOT NULL DEFAULT now(),
    accepted_at  timestamptz,
    UNIQUE(campaign_id, email)
  );
  ALTER TABLE campaign_invites ENABLE ROW LEVEL SECURITY;
  ```
  - RLS: GM kan SELECT/INSERT/DELETE för sina kampanjer
  - RLS: Inbjuden användare kan SELECT/UPDATE sin egen invite (matcha email via auth.jwt()->>'email')

- [x] **3.2** Skapa `src/components/admin/PlayerInvites.vue`:
  - Email-input + "Bjud in"-knapp
  - Lista inbjudna spelare med status (pending/accepted)
  - Delete/revoke invite-knapp
  - Visar accepterade spelare med deras profilnamn

- [x] **3.3** Admin store-metoder:
  - `invitePlayer(campaignId, email)` → INSERT campaign_invites
  - `revokeInvite(inviteId)` → DELETE campaign_invites
  - `loadInvites(campaignId)` → SELECT campaign_invites

- [x] **3.4** Uppdatera `CampaignList.vue`:
  - Visa pending invites för inloggad användare (matcha email via `auth.user.email`)
  - "Acceptera"/"Avböj"-knappar per invite
  - Vid accept: skapa player-rad (INSERT players) + uppdatera invite-status till 'accepted'
  - Vid avböj: uppdatera invite-status till 'declined'

**Success criteria fas 3:**
- GM kan skriva in email och bjuda in spelare
- Inbjuden spelare ser kampanjen i sin kampanjlista (efter inloggning)
- Invites har status-spårning (pending/accepted)
- Duplicate-invites förhindras (UNIQUE constraint)

---

### Fas 4 — Sect/Title Assignment + Campaign Start
*GM tilldelar sekt och titel till spelare. Klan och disciplines väljs av spelarna själva (separat feature).*

**Viktigt:** GM tilldelar INTE klaner — spelare väljer alltid sin egen klan som del av karaktärsskapande (ej planerat ännu). Stadsbaserade titlar (prince, baron) är kopplade till specifika städer — GM förkonfigurerar vilken stad som har vilken titel, vilket avgör vilken sekt spelaren i den staden måste tillhöra.

- [x] **4.1** Skapa `src/components/admin/PlayerRoster.vue` — spelarhantering:
  - Tabell med alla spelare i kampanjen
  - Redigeringsbara fält per spelare: sect, title, starting city, blood, strength, stealth, intercept
  - Dropdown för sect (camarilla/anarch/sabbat)
  - Dropdown för title (filtrad baserat på sect)
  - Dropdown för starting city (från campaign's cities)
  - Clan visas read-only (sätts av spelaren, inte GM)

- [x] **4.2** Admin store-metoder:
  - `updatePlayer(playerId, changes)` → UPDATE players (sect, title, city_id, stats — INTE clan)

- [x] **4.3** Kampanjstatus-övergång:
  - "Starta kampanj"-knapp i admin-dashboard
  - Validering: minst 3 spelare, alla har sect + city
  - Uppdaterar `campaigns.status` från 'setup' → 'active', `current_round` → 1, `round_phase` → 'action_submission'
  - Triggar chat-auto-creation (befintlig trigger skapar "All Players", "Camarilla", "Anarchs", "Sabbat"-chattar)

- [x] **4.4** RLS-migration: UPDATE-policy för players-tabellen:
  - GM kan uppdatera spelare i sina kampanjer (under setup-fasen)
  - Helper: kontrollera campaign.status = 'setup' i policy

**Success criteria fas 4:**
- GM kan tilldela sect, title till varje spelare
- GM kan sätta startstad och grundresurser
- GM kan INTE ändra spelarens klan (read-only)
- GM kan starta kampanjen → status ändras till 'active'
- Spelare ser kampanjen i normal GameView efter start

---

## Spelregler och edge cases

1. **Sabbat-spelare** behöver `disguise_title` — GM måste kunna sätta detta separat
2. **Stadsbaserade titlar** — prince/baron är kopplade till specifika städer. GM förkonfigurerar vilken stad som har vilken titel. Spelaren som placeras i den staden ärver titeln och måste tillhöra rätt sekt.
3. **Klan väljs av spelaren** — GM tilldelar ALDRIG klan. Spelaren väljer klan som del av karaktärsskapande (separat feature, ej planerat ännu).
4. **Disciplines väljs av spelaren** — baserat på vald klan. Också del av karaktärsskapande.
5. **Stadskontrollant** (`cities.controller_id`) sätts under setup — GM måste kunna tilldela detta
6. **Campaign status 'setup'** bör blockera spelare från att se kampanjen i GameView (bara via admin)
7. **Unika constraints:** en email per kampanj (invites), en spelare per user_id per kampanj

## Kända risker

1. **RLS för campaign_invites** — email-matchning via `auth.jwt()->>'email'` kan vara fragil om email ändras. Acceptabel risk för MVP.
2. **Trigger vs. manual accept** — auto-accept vid inloggning kräver trigger på auth.users som kan ha performance-impact. Alternativ: manuell accept-knapp i UI (enklare, mer kontroll).
3. **is_gm global flag** — nuvarande `profiles.is_gm` är global, inte per-kampanj. Vem som helst med flaggan kan skapa kampanjer. Acceptabelt för 20-spelare-scope.

## Beslut (fattade)

1. **Invite-modell:** Manuell accept-knapp i CampaignList. Ingen auto-accept trigger.
2. **Email-notifiering:** Skippas. GM berättar för spelare direkt.
3. **Karteditor:** Skippas helt. Alla kampanjer använder den befintliga British Isles-kartan. Städer + adjacenser importeras automatiskt från mall vid kampanjskapande.

---

## Parking lot
*(Noteringar som dyker upp under implementation — ej ursprunglig plan)*
