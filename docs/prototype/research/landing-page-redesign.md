# Research: Landing Page & Site Redesign

## Current Site Structure

### Routing (src/router/index.js)
| Route | View | Auth? | Purpose |
|-------|------|-------|---------|
| `/login` | LoginView | No | Sign in / sign up form |
| `/` | CampaignList | Yes | Hub — shows campaigns, invites |
| `/campaign/new` | CampaignSetup | Yes | GM creates new campaign |
| `/admin/:campaignId` | AdminView | Yes | GM setup interface |
| `/game/:campaignId` | GameView | Yes | Main gameplay |

**No public landing page exists.** Unauthenticated users see only the login form. There's no `/` route for visitors — `/` requires auth and redirects to `/login` if not logged in.

### Navigation Guard Flow
1. `router.beforeEach` waits for `auth.loading` to finish
2. If route requires auth and no user → redirect to `/login`
3. If logged in and visiting `/login` → redirect to `/` (campaigns)

### Current Login Page (LoginView.vue)
- Centered card on dark background
- Title "Vampire: The Long Night" in Cinzel gold
- Simple email/password form
- Toggle between Sign In / Create Account
- Email confirmation flow for sign up
- No imagery, no game description, no atmosphere beyond the dark card

### Current Styling System

**CSS Variables (App.vue :root):**
```
--bg-dark: #1a1412       (deep warm brown-black)
--bg-panel: #241e1a      (slightly lighter panel bg)
--bg-card: #2e2520       (card bg)
--border: #4a3e35        (warm border)
--text: #e8dcc8          (warm beige text)
--text-muted: #9a8b78    (muted gold)
--accent-red: #c43c3c    (blood red)
--accent-green: #4a9e4a  (minimal use)
--accent-gold: #c4a24e   (titles, highlights)
--accent-blue: #4a7ec4   (minimal use)
```

**Fonts (loaded via Google Fonts in index.html):**
- `Cinzel` (400, 700) — display/headers. Elegant Roman-style serif, very fitting for vampire aristocracy.
- `Inter` (400, 500, 600) — body text. Clean, modern sans-serif.

**Theme Character:** Dark gothic, warm browns/golds, red accents. Already quite atmospheric but only applied to functional UI elements — no decorative/immersive design.

---

## Proposed Landing Page Architecture

### Route Changes
- `/` → New public `LandingView` (no auth required)
- `/login` → Keep existing LoginView (or integrate into landing page)
- `/campaigns` → Move CampaignList here (auth required, replaces old `/`)

### What the Landing Page Should Convey
1. **What the game is** — 20-player vampire megagame set in 1920s England
2. **The three factions** — Camarilla, Anarch, Sabbat
3. **The tone** — Gothic, political intrigue, hidden information, power struggles
4. **Call to action** — Sign in / create account to play

---

## Styling Ideas That Fit the Theme

### Typography
The current Cinzel + Inter pairing is strong. Consider adding:
- **Cinzel Decorative** — for the landing page hero title only (more ornate variant)
- A texture/noise overlay on backgrounds for a parchment/aged feel

### Color Palette Expansion
Current palette is solid. For the landing page, consider:
- **Deeper blacks** for dramatic hero sections: `#0d0a08`
- **Blood gradient** for dramatic elements: `#8b1a1a → #c43c3c`
- **Faction colors** for the three factions:
  - Camarilla: deep blue/silver (`#2a3f6f`, `#8a9bb5`)
  - Anarch: fiery red/orange (`#c43c3c`, `#d4723c`)
  - Sabbat: dark purple/violet (`#4a2a6f`, `#7a4aa0`)
- **Aged parchment** tones for text sections: `#d4c5a0`

### Visual Elements to Consider
1. **Hero section** — Full-viewport dark background with atmospheric imagery
   - Subtle fog/mist CSS animation
   - Title in large Cinzel with text-shadow glow effect
   - Tagline below: "A 20-player megagame of blood, politics, and shadow"

2. **Faction showcase** — Three columns or cards
   - Each faction with its color accent and symbol
   - Brief description of their philosophy/goals
   - Could use the existing SVG faction symbols from GameMap

3. **Game overview section** — What makes it unique
   - Hidden information / stealth-intercept
   - Political maneuvering
   - 1920s England setting
   - 8 rounds of strategic play

4. **Map teaser** — Could show a dimmed/stylized version of the SVG game map
   - Already have a beautiful gothic parchment-style map built

5. **CTA section** — "Enter the Night" button → login/signup

### CSS Techniques for Atmosphere
- `backdrop-filter: blur()` for frosted glass panels
- CSS `radial-gradient` for vignette/spotlight effects
- `mix-blend-mode` for texture overlays
- `text-shadow` with red/gold glow for dramatic titles
- Subtle `@keyframes` for fog drift, candle flicker on borders
- `scroll-snap` for clean section transitions
- `clip-path` for dramatic section dividers (angled, Gothic arch shapes)

### Layout Pattern
Full-page scroll with distinct sections:
```
[Hero — full viewport, dark + atmospheric]
[About — what is this game?]
[Factions — Camarilla / Anarch / Sabbat]
[Map preview — teaser of the tactical map]
[CTA — "Enter the Night" → /login]
[Footer — minimal]
```

### Responsive Considerations
- Hero works at any size (centered text)
- Faction cards: 3-col → 1-col on mobile
- Map preview: could hide or simplify on mobile
- Login form: already responsive

### Potential Assets Needed
- Background texture/image (dark, atmospheric — could be CSS-generated with gradients + noise)
- Faction symbols (may already exist in SVG map components)
- Optional: a subtle repeating pattern for section backgrounds (damask, gothic)

---

## Technical Implementation Notes

1. **Router change is simple** — add `/` as public route, move CampaignList to `/campaigns`
2. **Nav guard update** — `/` no longer requires auth. Logged-in users visiting `/` still see landing (or auto-redirect to `/campaigns`)
3. **LandingView.vue** — new view component, no store dependencies
4. **No new dependencies needed** — pure CSS for all atmospheric effects
5. **Existing design system** — extend, don't replace. The CSS variables work well; just add landing-page-specific styles scoped to the component.
