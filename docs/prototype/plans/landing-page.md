# Plan: Landing Page
Datum: 2026-03-30
Status: DONE (fas 1+2 implementerade, fas 3 polish kvarstår)

## Översikt

Skapa en publik landningssida på `/` som presenterar spelet för nya besökare, med atmosfärisk design i linje med det gotiska vampyr-temat. Flytta CampaignList till `/campaigns`. Landningssidan ska vara ren frontend — inga Supabase-beroenden.

### Approach
En ny `LandingView.vue` med fem sektioner, full-page scroll. Inga nya dependencies — allt med befintligt designsystem + scoped CSS. Routern uppdateras minimalt.

---

## Fas-uppdelning

### Fas 1 — Router & grundstruktur

- [x] Uppdatera `src/router/index.js`:
  - Ändra `/` från `CampaignList` till ny `LandingView` (ingen auth)
  - Lägg till `/campaigns` route → `CampaignList` (med `requiresAuth: true`)
  - Behåll `/login` som den är
- [x] Uppdatera navigation guard:
  - `/` kräver inte auth längre
  - Inloggade användare som besöker `/` ser fortfarande landningssidan (ingen auto-redirect)
  - Inloggade användare som besöker `/login` → redirect till `/campaigns` (istället för `/`)
- [x] Skapa tom `src/views/LandingView.vue` med grundstruktur (5 sektioner, placeholder-text)
- [x] Uppdatera alla interna navigeringar som pekar mot `/` att istället peka mot `/campaigns`:
  - `LoginView.vue`: `router.push('/')` → `router.push('/campaigns')`
  - `CampaignSetup.vue`: redan använder `{ name: 'campaigns' }` — OK
  - Inga andra ställen hittade som navigerar till `/`

**Success criteria:** Appen bygger. `/` visar skelett-landningssida. `/campaigns` visar kampanjlista (kräver auth). Login redirect fungerar till `/campaigns`.

---

### Fas 2 — Sektionsdesign & innehåll

Varje sektion beskrivs nedan med copy-text, layout och styling.

#### Sektion 1: Hero / Intro

**Syfte:** Fånga besökarens uppmärksamhet. Kort, stämningsfullt intro.

**Layout:**
- Full viewport height (`100vh`)
- Centrerad text vertikalt och horisontellt
- Mörk bakgrund med subtil vinjett (radial gradient mörkare i kanterna)
- Subtil dimma/rök-animation (CSS keyframes, mjuka gradient-blobs med animerad opacity och transform)

**Innehåll:**
```
VAMPIRE: THE LONG NIGHT
[dekorativ separator — tunn gyllene linje med diamantform i mitten]

A 20-player megagame of blood, politics, and shadow
set in 1920s England.

[Scroll-indikator: nedåtpil, subtil puls-animation]
```

**Typografi:**
- Titel: `Cinzel`, ~3rem, `var(--accent-gold)`, `text-shadow` med mjuk guldglöd
- Tagline: `Inter`, ~1.1rem, `var(--text-muted)`, `letter-spacing: 0.05em`

**Atmosfäriska effekter:**
- Vinjett: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)`
- Dimma: 2–3 stora, mjuka `div`-element med `background: radial-gradient(...)`, animerad `opacity` och `transform: translateX()` med lång duration (~20s)
- Scroll-indikator: chevron/pil med `@keyframes bounce` (translateY)

---

#### Sektion 2: Om spelet (detaljerat)

**Syfte:** Förklara vad spelet faktiskt innebär — mekaniker, känsla, upplevelse.

**Layout:**
- Max-width content container (~800px)
- Vänster-justerad text med generösa marginaler
- Bakgrund: subtil gradient-shift, möjligen med tunn separator-linje till hero

**Innehåll (utkast — kan finjusteras):**
```
THE GAME

Vampire: The Long Night is a megagame — a large-scale
strategic game where 20 players control ancient vampires
vying for dominance across the British Isles.

Each round, you'll give your vampire a set of secret orders:
move between cities, feed on the mortal population, deploy
your minions, wield supernatural disciplines, or plot against
your rivals. But you only see what your vampire sees — the
rest is hidden in shadow.

Information is currency. Alliances shift. Trust is a weapon.

Over 8 rounds, you'll navigate a web of politics, betrayal,
and supernatural power — where the most dangerous monster
at the table might be sitting right next to you.
```

**Typografi:**
- Sektionsrubrik: `Cinzel`, ~1.5rem, `var(--accent-gold)`
- Brödtext: `Inter`, ~1rem, `var(--text)`, `line-height: 1.8`
- Betonade rader (t.ex. "Information is currency..."): kursiv eller `var(--accent-gold)` färg

**Dekorativa element:**
- Tunn gyllene separator-linje ovanför rubriken
- Möjligen en diskret bakgrundsstruktur (CSS noise/texture pattern med `mix-blend-mode: overlay`)

---

#### Sektion 3: Fraktioner (Camarilla, Anarchs, Sabbat)

**Syfte:** Presentera de tre spelarbara fraktionerna med distinkt visuell identitet.

**Layout:**
- Tre kort/kolumner i rad (→ stackade på mobil)
- Varje kort har: fraktionsfärg-accent i toppen (border-top eller gradient), namn, citat/motto, beskrivning
- Max-width container (~1000px)

**Fraktionsfärger (från GameMap.vue):**
| Fraktion | Primär | Ljusare variant |
|----------|--------|-----------------|
| Camarilla | `#c43c3c` | `#e06060` |
| Anarch | `#2d8a2d` | `#4ac44a` |
| Sabbat | `#9b59b6` | `#c49bde` |

**Innehåll per kort:**

**Camarilla:**
```
THE CAMARILLA
"Order through tradition."

The old guard. The Camarilla believes in structure, hierarchy,
and the Masquerade — the sacred law that keeps vampires hidden
from mortal eyes. They rule through titles, boons, and centuries
of accumulated power. To them, the world is a chessboard, and
they've been playing longer than anyone.
```

**Anarchs:**
```
THE ANARCHS
"Freedom is not given. It is taken."

Rebels with a cause — or several. The Anarchs reject the
Camarilla's rigid hierarchy, fighting for a world where every
vampire stands as an equal. They're idealists, opportunists,
and revolutionaries. Underestimate them at your peril.
```

**Sabbat:**
```
THE SABBAT
"We are the monsters they fear."

Where the Camarilla hides and the Anarchs argue, the Sabbat
embraces what they truly are. Operating from the shadows within
shadows, they wage a secret war with methods the others call
monstrous. They call it necessary.
```

**Styling per kort:**
- Bakgrund: `var(--bg-card)` med `border-top: 3px solid [fraktionsfärg]`
- Fraktionsnamn: `Cinzel`, ~1.2rem, fraktionens färg
- Motto: kursiv, `var(--text-muted)`, indraget
- Brödtext: `Inter`, ~0.95rem, `var(--text)`
- Hover-effekt: subtil `box-shadow` med fraktionsfärg, `transform: translateY(-2px)`
- Border-radius: `6px`

---

#### Sektion 4: Call to Action

**Syfte:** Konvertera besökaren — länk till login/signup.

**Layout:**
- Centrerad, sparsam
- Mörk bakgrund, samma som hero
- Stor CTA-knapp

**Innehåll:**
```
THE NIGHT AWAITS

[Enter the Night] → /login

Already have an account? Sign in → /login
```

**Styling:**
- Rubrik: `Cinzel`, ~1.8rem, `var(--accent-gold)`
- CTA-knapp: stor, `var(--accent-red)` bakgrund, vit text, `Cinzel` font
  - Hover: mjuk glöd-effekt (`box-shadow: 0 0 20px rgba(196, 60, 60, 0.4)`)
  - Storlek: padding `1rem 3rem`, font-size `1.1rem`
- Sekundär länk: `var(--text-muted)`, liten text

---

#### Sektion 5: Footer

**Syfte:** Avsluta sidan snyggt med minimal info.

**Layout:**
- Full width, tunn border-top
- Centrerad text

**Innehåll:**
```
Vampire: The Long Night — A megagame experience
Built with 🩸 in Sweden
```

**Styling:**
- Bakgrund: `var(--bg-dark)` eller möjligen en aning mörkare
- Text: `var(--text-muted)`, `0.85rem`
- Border-top: `1px solid var(--border)`
- Padding: `2rem`

---

### Fas 2 — Implementation checklist

- [x] Bygg Hero-sektionen med titel, tagline, dimma-animation, scroll-indikator
- [x] Bygg Om spelet-sektionen med copy-text och typografi
- [x] Bygg Fraktions-sektionen med tre kort och fraktionsfärger
- [x] Bygg CTA-sektionen med knapp som länkar till `/login`
- [x] Bygg Footer
- [x] Responsiv design: testa mobil (fraktionskort stackas, fontstorlekar anpassas)

**Success criteria:** Landningssidan ser atmosfärisk och professionell ut. Alla sektioner renderas korrekt. CTA-knappen navigerar till `/login`. Responsiv på mobil.

---

### Fas 3 — Polish & detaljer

- [ ] Finjustera dimma-animation (hastighet, opacity, positionering)
- [ ] Lägg till `scroll-behavior: smooth` om det saknas
- [ ] Testa alla routes end-to-end (landing → login → campaigns → game)
- [ ] Kontrollera att inga befintliga interna navigeringar är trasiga
- [ ] Kolla att auth guard fortfarande fungerar korrekt

**Success criteria:** Allt fungerar som innan, plus en fungerande landningssida. Inga regressions.

---

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/router/index.js` | Ny `/` route (LandingView), `/campaigns` route, guard-uppdatering |
| `src/views/LandingView.vue` | **NY FIL** — hela landningssidan |
| `src/views/LoginView.vue` | `router.push('/')` → `router.push('/campaigns')` |
| `src/views/CampaignSetup.vue` | Eventuella redirect-uppdateringar |
| `src/views/CampaignList.vue` | Kontrollera om den refererar till `/` internt |

## Kända risker

1. **Routerordning** — Vue Router matchar routes i ordning. Ny `/` route måste komma först och inte ha `requiresAuth`.
2. **Auth guard edge case** — Inloggade användare som besöker `/` ska se landningssidan, inte redirectas. Guard-logiken måste uppdateras.
3. **Broken links** — Alla `router.push('/')` och `<router-link to="/">` i kodbasen måste hittas och uppdateras till `/campaigns`.
4. **SEO/meta** — Inte i scope, men landningssidan bör ha korrekt `<title>` och `<meta description>` i framtiden.

## Parking lot
*(Tom — fylls under implementation)*
