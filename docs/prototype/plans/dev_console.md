# DevConsole Component — Plan

## What
A dev-only overlay component for quickly switching between test users during development.

## Component: `src/components/DevConsole.vue`

### Structure
- Self-contained SFC using Composition API (`<script setup>`)
- Fixed-position overlay, bottom-right corner, starts collapsed
- Toggle button shows "DEV" when collapsed, "X" when expanded

### Data fetching (onMounted)
- Fetch `profiles` (id, display_name, is_gm) and `players` (user_id, sect, title) in parallel from Supabase
- Merge them client-side to enrich each profile with sect/title for display

### User switching
- Each profile rendered as a button showing `display_name` + sect badge (or "GM" badge)
- On click: `supabase.auth.signOut()` → `auth.signIn(email, password)` using the existing auth store
- This triggers `onAuthStateChange` so the whole app reacts naturally

### Email resolution
- `profiles` doesn't store email, and the anon key can't query `auth.users`
- **Decision:** Hardcoded `display_name → email` map matching the seed data
- Dev-only tooling, so tight coupling to seed is acceptable

### Current user highlight
- Compare `auth.user.id` against each profile's `id`, apply active styling (green border)

### Production safety
- Guarded in `App.vue` with `v-if="import.meta.env.DEV"` — Vite tree-shakes the entire component out of prod builds

### Styling
- Uses existing CSS variables (`--bg-panel`, `--border`, `--accent-gold`, etc.) to match the gothic theme
- Sect colors: blue (Camarilla), gold (Anarch), red (Sabbat/GM)

## Files to change
1. **Create** `src/components/DevConsole.vue`
2. **Edit** `src/App.vue` — import DevConsole, add `<DevConsole v-if="isDev" />` to template
