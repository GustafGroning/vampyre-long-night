# Research: Campaign Setup System
**Date:** 2026-03-22

## Goal State
1. GM can create a new campaign (name, max rounds, round length settings)
2. GM can configure the map: add cities, set adjacencies, mark ports, assign sea regions
3. GM can invite players by email -> player receives notification, auto-added to campaign
4. GM assigns **sect and title** to players (NOT clan — players always choose their own clan)
5. City titles (prince, baron) are pre-assigned to cities by the GM — e.g. London has "prince", so the player assigned there must be Camarilla
6. Players choose their own **clan and disciplines** as part of character creation (separate flow, not part of GM setup)

---

## What EXISTS

### Database (in Supabase cloud)
- `campaigns` table: id, name, created_by, status (setup/recruiting/active/paused/finished), current_round, max_rounds, round_phase, action_deadline_hours, combat_negotiation_hours, settings (JSONB)
- `players` table: 22 columns — campaign_id, user_id, name, clan, sect, title, city_id, blood, vp, stats, torpor state, etc.
- `cities` table: 18 columns — coordinates (map_x/map_y), blood_flow, stability, masquerade, is_port, sea_region, intercept, etc.
- `city_adjacencies`: bidirectional junction (city_a_id, city_b_id, campaign_id)
- `clan_definitions`: 14 clans with disciplines, boons, curses
- `profiles` table: user_id, display_name, is_gm (added in migration 20260321000003)
- RLS helpers: my_campaign_ids(), is_gm(), is_chat_member()

### Frontend (player-facing only)
- 3 views: LoginView, CampaignList, GameView
- 3 stores: auth, game, chat
- 3 routes: /login, /, /game/:campaignId
- No GM dashboard, no campaign creation, no admin routes

### Seed Script (scripts/seed.js)
- Working reference implementation: creates 8 users, 1 campaign, 18 cities, 36 adjacencies, 7 players with full character data
- City coordinates calibrated to 1024x1335 SVG viewBox

---

## What's MISSING

### 1. Campaign Creation
- **DB:** Schema exists and is sufficient
- **Backend:** No edge function needed — direct INSERT with RLS works (created_by = auth.uid())
- **Frontend:** No form, route, or store methods
- **Work:** New route + view + store methods for campaign CRUD

### 2. Map Configuration
- **DB:** cities + city_adjacencies tables exist with all needed columns
- **Backend:** Direct CRUD via Supabase client works
- **Frontend:** No editor UI
- **Work:** City management form/table + adjacency editor. Could be form-based (simpler) or visual SVG editor (complex). City coordinates need map_x/map_y for the SVG map.

### 3. Player Invites by Email
- **DB:** NO invite table exists — biggest schema gap
- **Backend:** No edge function for sending emails
- **Frontend:** No invite UI or acceptance flow
- **Work needed:**
  - New `campaign_invites` table (campaign_id, email, status, invited_by, created_at, accepted_at)
  - Edge function or DB trigger to handle invite acceptance (auto-create player row when invited user logs in)
  - Options for email: Supabase Auth `inviteUserByEmail()`, custom edge function with SMTP, or simple "share link" approach
  - Frontend: invite form in GM dashboard, notification for invited users on campaign list

### 4. Sect/Title Assignment (GM) + Character Creation (Player)
- **DB:** players.clan, players.sect, players.title columns exist
- **Sect & title:** GM assigns these. City titles (prince, baron) are tied to specific cities — the GM pre-configures which city has which title, and thus which sect the player in that city must belong to.
- **Clan:** Players always choose their own clan. This is part of character creation, NOT GM setup.
- **Disciplines:** Players choose disciplines based on their clan. Also part of character creation.
- **Work:** Two separate flows:
  1. GM assigns sect + title to players (part of admin setup, Fas 4)
  2. Player character creation: choose clan + disciplines (separate feature, not yet planned)

---

## Architectural Notes

### GM Identity
- `campaigns.created_by` is the authoritative GM check (used in resolve-round edge function)
- `profiles.is_gm` exists but is a general flag, not campaign-specific
- Frontend currently has no GM awareness — needs to detect if current user is campaign creator

### Campaign Status Flow
setup -> recruiting -> active -> paused -> finished
- `setup`: GM configuring map, inviting players (new work)
- `recruiting`: players joining, picking clans (new work)
- `active`: game in progress (existing game board works)
- `paused`/`finished`: end states

### Email/Invite Approaches (trade-offs)
1. **Supabase Auth invite** — `auth.admin.inviteUserByEmail()` sends magic link. Pro: built-in. Con: requires service role key (edge function only), user must not already exist.
2. **Custom invite table + edge function** — Store invites in DB, edge function sends email via SMTP/Resend. Pro: flexible, works for existing users. Con: more code.
3. **Simple link sharing** — GM shares campaign link, anyone with link can join. Pro: simplest. Con: no email notification, less control.
4. **Hybrid** — Store invites in DB, auto-add on next login. Email is optional enhancement. Pro: pragmatic starting point.

### Map Editor Complexity
- Simple: form/table with city names, coordinates, port toggle, sea region dropdown, adjacency checkboxes
- Complex: drag-and-drop SVG editor with click-to-connect adjacencies
- Recommendation: start simple (form-based), the seed script already has all 18 British Isles cities as reference data

---

## Files Referenced
- thoughts/shared/research/003_database_schema.md — Complete schema reference
- scripts/seed.js — Working campaign creation example
- src/views/CampaignList.vue — Current campaign list
- src/stores/game.js — Game state loading (14 parallel queries)
- src/stores/auth.js — Auth store
- supabase/migrations/20260321000003_profiles_table.sql — profiles + is_gm
- supabase/functions/resolve-round/index.ts — GM auth check pattern (created_by === user.id)
