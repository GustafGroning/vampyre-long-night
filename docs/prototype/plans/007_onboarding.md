# Plan: Onboarding (signup, login, campaign list, GM flow)
Datum: 2026-03-22
Status: DONE
Research: `thoughts/shared/research/007_onboarding_current_state.md`

---

## Oversikt

Most of the onboarding flow already exists. This plan focuses on fixing gaps and polishing what's there into a production-ready flow. No new views are needed — we enhance the existing `LoginView`, `CampaignList`, auth store, and router.

**Approach:** Minimal changes, fix real bugs, make the happy path solid.

---

## Fas 1 — Auth Store: load profile data

The auth store only holds the Supabase Auth user object. We need profile data (`display_name`, `is_gm`) available to the UI.

- [x] Add `profile` ref to auth store (holds `{ display_name, is_gm }`)
- [x] After session is established in `init()`, fetch profile from `profiles` table
- [x] After `signIn()` succeeds, fetch profile
- [x] After `signUp()` succeeds, fetch profile (will have null display_name, is_gm=false)
- [x] On `signOut()`, clear `profile` to null
- [x] Add helper: `async function fetchProfile()` that queries `profiles` where `id = user.id`
- [x] Add computed `isGm` that reads `profile.value?.is_gm ?? false`

**Files changed:** `src/stores/auth.js`

**Success criteria:** After login, `auth.profile.display_name` and `auth.isGm` are available throughout the app.

---

## Fas 2 — Router: redirect fixes

- [x] If user is already authenticated and navigates to `/login`, redirect to `/` (campaigns)
- [x] After `signOut()` in the auth store, use `router.push('/login')` — or handle in CampaignList's sign-out button (simpler)

**Files changed:** `src/router/index.js`, possibly `src/views/CampaignList.vue`

**Success criteria:** Logged-in users can't see the login page. Sign out redirects to login.

---

## Fas 3 — LoginView: email confirmation & display name

- [x] After `signUp()`, check if session exists. If not (email confirm enabled), show a message: "Check your email to confirm your account" instead of redirecting
- [x] Add optional `display_name` field shown only in signup mode — SKIPPED per Option B recommendation (display name prompt moved to CampaignList)
- [x] After successful signup (with session), update `profiles.display_name` if provided — N/A per Option B
- [x] If signup requires confirmation, store the display_name intent so it can be set on first login — N/A per Option B

**Decision point:** How to handle display_name when email confirmation is enabled? Two options:
- A) Show display_name field on signup, save it on first successful login (extra complexity)
- B) Skip display_name on signup entirely, prompt for it on campaign list if null (simpler)

**Recommendation:** Option B — keep signup minimal (email + password only). If `profile.display_name` is null when reaching CampaignList, show a simple inline prompt. This avoids the confirmation timing problem entirely.

**Files changed:** `src/views/LoginView.vue`

**Success criteria:** Signup with email confirmation shows appropriate message. No broken redirect.

---

## Fas 4 — CampaignList: display name prompt & better empty state

- [x] If `auth.profile.display_name` is null, show inline form at top: "Set your display name" with text input and save button
- [x] Save calls `supabase.from('profiles').update({ display_name }).eq('id', auth.user.id)` and refreshes auth.profile
- [x] Update empty state from "Run the seed script" to something like "You're not part of any campaigns yet. Ask your GM for an invite, or create a new campaign."
- [x] Add "Create Campaign" button (visible to all users — creating a campaign is what makes you a GM)
- [x] Also query campaigns where user is GM (`campaigns.created_by = auth.user.id`) in addition to player campaigns, so GMs see their own campaigns even if they're not in the players table

**Files changed:** `src/views/CampaignList.vue`

**Success criteria:** New users see display name prompt. Empty state is user-friendly. GM campaigns visible.

---

## Fas 5 — Campaign creation (GM flow)

- [x] Create a simple modal/inline form in CampaignList: campaign name input + create button — handled via CampaignSetup.vue + admin store (from 007_campaign_setup)
- [x] On submit: insert into `campaigns` table with `created_by = auth.user.id`, `status = 'setup'`, `current_round = 0`
- [x] After campaign creation, set `profiles.is_gm = true` — solved with DB trigger (Option A)
- [x] Solution: Option A — trigger `on_campaign_created` sets `profiles.is_gm = true` for `created_by` user
- [x] After creation, refresh campaign list — admin store calls `auth.fetchProfile()` after creation

**Files changed:**
- `src/views/CampaignList.vue` (UI)
- New migration: `supabase/migrations/YYYYMMDD_campaign_creation.sql` (trigger + RLS policy for campaign INSERT)

**Success criteria:** Any user can create a campaign. Creating a campaign sets `is_gm = true` on their profile. New campaign appears in list.

---

## Spelregler och edge cases

- **Email confirmation:** Supabase may or may not have email confirm enabled. The flow must handle both cases gracefully.
- **GM who is also a player:** A GM might also have a `players` row in their own campaign. The campaign list query must deduplicate.
- **Multiple campaigns:** A user can be GM of one campaign and player in another. Both should show.
- **is_gm is sticky:** Once set to true, stays true even if campaign is deleted. This is fine — it's a permission flag, not a per-campaign role.

---

## Success criteria (overall)

1. New user can sign up with email/password
2. If email confirmation is on, user sees "check your email" message
3. User logs in and sees campaign list (or empty state with helpful message)
4. User is prompted to set display name if not set
5. User can create a campaign (becomes GM)
6. User can sign out and is redirected to login
7. Logged-in user visiting `/login` is redirected to campaign list

---

## Kanda risker

- **Email confirmation behavior** varies by Supabase project config. Need to test both enabled/disabled.
- **Column-level GRANT on profiles** blocks setting `is_gm` from client — must use trigger or SECURITY DEFINER function.
- **RLS on campaigns INSERT** — need to verify/add policy allowing authenticated users to create campaigns.

---

## Parking lot
*(Notes added during implementation)*

- `CampaignSetup.vue` is a placeholder stub — full implementation in plan 007_campaign_setup.md
- Route `/campaign/new` (`campaign-setup`) added to router as stub
- Fas 3 followed Option B: no display_name on signup, prompt in CampaignList instead
- "Create Campaign" button in both empty state and campaign list links to `campaign-setup` route

