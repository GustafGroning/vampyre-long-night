# Research: Onboarding — Current State
*2026-03-22*

## Goal State (what we want)
1. User can sign up (email/password via Supabase Auth)
2. Users can log in and out
3. Users can see a list of campaigns they're part of
4. GMs can create accounts (same signup flow, GM role assigned when creating a campaign)

---

## What Already Exists

### Auth Store (`src/stores/auth.js`)
- Pinia store with `user`, `loading` state
- `init()` — fetches existing session, subscribes to `onAuthStateChange`
- `signIn(email, password)` — `signInWithPassword()`
- `signUp(email, password)` — `signUp()`
- `signOut()` — clears session
- No profile data loaded (only Supabase Auth user object)
- No `isGm` computed or profile fetch

### Login/Signup View (`src/views/LoginView.vue`)
- Single form with `isSignUp` toggle between login and create account
- Email + password fields
- Error display
- On success → `router.push('/')`
- No display name input on signup
- No email confirmation handling (if Supabase has confirm enabled, `signUp` returns user but session may be null until confirmed)

### Campaign List (`src/views/CampaignList.vue`)
- Queries `players` table joined with `campaigns(*)` filtered by `auth.user.id`
- Displays campaign name, character name, round/status
- Click → navigates to `/game/:campaignId`
- Sign out button in header
- Empty state says "Run the seed script" — not user-friendly for production
- No "Create Campaign" button or GM-specific UI

### Router (`src/router/index.js`)
- Three routes: `/login`, `/` (campaigns), `/game/:campaignId`
- Auth guard: polls `auth.loading`, redirects to `/login` if no user
- No redirect from `/login` if already authenticated
- No handling of post-signup state (e.g., profile completion)

### Profiles Table (`supabase/migrations/20260321000003_profiles_table.sql`)
- `id` (uuid, FK to auth.users with CASCADE)
- `display_name` (text, nullable)
- `is_gm` (boolean, default false)
- `created_at`, `updated_at`
- Auto-created on signup via `on_auth_user_created` trigger (inserts id only — display_name is null)
- RLS: SELECT open to all, UPDATE own row only
- Column-level grant: non-GM users can only update `display_name`
- `is_gm` can only be set by... unclear — REVOKE/GRANT blocks authenticated from updating it, but no explicit GM grant either

### GM Role Handling
- **`profiles.is_gm`**: boolean flag, auto-defaults to false
- **`campaigns.created_by`**: stores user_id of campaign creator
- **`is_gm()` SQL helper**: used in RLS policies (chat system), checks `profiles.is_gm`
- No mechanism to set `is_gm = true` — the column-level GRANT only allows `display_name` updates for authenticated users
- Goal says "GM role assigned when creating a campaign" — this doesn't exist yet

### Supabase Client (`src/lib/supabase.js`)
- Minimal: creates client with env vars, no custom auth config
- No persistence or session handling configuration

---

## Gaps Between Current State and Goal

### 1. Sign Up — Mostly works, but:
- **No display name input** — profile created with null display_name
- **Email confirmation unclear** — if Supabase project has email confirm enabled, signup won't create a session immediately. The view doesn't handle this case (no "check your email" message)
- **No password requirements shown** — Supabase default is 6 chars minimum

### 2. Log In/Out — Works, but:
- **No redirect when already logged in** — visiting `/login` while authenticated shows the form
- **Sign out doesn't redirect** — `auth.signOut()` clears user but doesn't push to `/login`
- **No "forgot password" flow**

### 3. Campaign List — Works, but:
- **Empty state is dev-only** — needs real messaging for production users
- **No GM view** — no "Create Campaign" button
- **Only shows campaigns where user is a player** — doesn't show campaigns where user is GM (via `campaigns.created_by`) unless they're also in the `players` table

### 4. GM Account Creation — Not implemented:
- **No way to set `is_gm = true`** — column-level GRANT blocks it
- **No campaign creation flow** — no UI, no edge function
- **Goal: "GM role assigned when creating a campaign"** — needs either:
  - A) Edge function that creates campaign AND sets `profiles.is_gm = true` (SECURITY DEFINER)
  - B) Or: `campaigns.created_by` is sufficient and `is_gm` flag gets set by the campaign creation logic

---

## Architecture Notes

### Auth Flow (current)
```
App.vue mount → auth.init() → getSession() + onAuthStateChange listener
  → loading = false → router renders
  → router guard checks auth.user → redirect to /login if null
```

### Profile Creation (current)
```
Supabase Auth signup → auth.users INSERT → trigger on_auth_user_created
  → profiles INSERT (id only, display_name = null, is_gm = false)
```

### Campaign Access (current)
```
CampaignList mount → query players WHERE user_id = me → join campaigns
  → display list → click → /game/:campaignId
```

### What the Auth Store Doesn't Track
- Profile data (display_name, is_gm)
- Whether profile is "complete" (has display_name)
- Campaign membership or role within campaign

---

## Existing Patterns to Follow
- Composition API with `<script setup>` throughout
- Pinia stores in `src/stores/` with `defineStore` + setup function syntax
- Supabase client from `@/lib/supabase`
- CSS variables for theming (Gothic dark: `--bg-panel`, `--accent-gold`, `--accent-red`, `--text-muted`)
- Font families: `var(--font-display)` = Cinzel, body = Inter
- Router lazy-loading views with `() => import()`

---

## Files Relevant to Planning

| File | Role |
|------|------|
| `src/stores/auth.js` | Auth state — needs profile data |
| `src/views/LoginView.vue` | Login/signup form — may need display name field |
| `src/views/CampaignList.vue` | Campaign list — needs GM features, better empty state |
| `src/router/index.js` | Route guards — may need profile-completion redirect |
| `supabase/migrations/20260321000003_profiles_table.sql` | Profile schema — may need GM grant fix |
| `src/App.vue` | App shell — currently just loading + router-view |
