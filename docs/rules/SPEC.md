# Vampire: The Long Night — Digital Edition
## Complete Game & System Specification

*A self-contained specification for designers and developers. It defines **what** the system must do (game rules as functional requirements) and **how** the system is shaped (platform design decisions), deliberately excluding the implementation stack so technology choices remain free to change.*

**Source of truth:** The game rules in Part A are derived from `game_design.txt` (the canonical rulebook). Where the rulebook leaves a mechanic to GM judgment, this spec flags it in **Part C — Open Decisions** and proposes a deterministic resolution, because the digital edition removes the GM from per-action adjudication.

---

## Table of Contents

- [Part 0 — Product Vision & Core Design Pillars](#part-0--product-vision--core-design-pillars)
- [Part A — Game Design Specification (Functional Rules)](#part-a--game-design-specification-functional-rules)
  - [A1. Players, Factions & Titles](#a1-players-factions--titles)
  - [A2. Character Model & Stats](#a2-character-model--stats)
  - [A3. Character Creation](#a3-character-creation)
  - [A4. Clans (Boons & Curses)](#a4-clans-boons--curses)
  - [A5. Disciplines](#a5-disciplines)
  - [A6. The Action System](#a6-the-action-system)
  - [A7. Full Action Catalogue](#a7-full-action-catalogue)
  - [A8. Minions](#a8-minions)
  - [A9. Artifacts](#a9-artifacts)
  - [A10. Cities & Territory](#a10-cities--territory)
  - [A11. Stealth, Intercept & the Information Rule](#a11-stealth-intercept--the-information-rule)
  - [A12. Combat](#a12-combat)
  - [A13. Victory Points & Winning](#a13-victory-points--winning)
  - [A14. Faction Mechanics](#a14-faction-mechanics)
  - [A15. Special Mechanics & Keywords](#a15-special-mechanics--keywords)
  - [A16. Round Resolution Order](#a16-round-resolution-order)
- [Part B — System Design & Platform Decisions](#part-b--system-design--platform-decisions)
- [Part C — Open Decisions Needed Before Build-Complete](#part-c--open-decisions-needed-before-build-complete)

---

# Part 0 — Product Vision & Core Design Pillars

**Vampire: The Long Night — Digital Edition** automates a 20-player "matrix megagame" of vampiric intrigue set in 1920s England (World of Darkness). Players each control one elite vampire belonging to one of three factions (Camarilla, Anarch, Sabbat) and compete over **8 rounds** to accumulate **Victory Points (VP)** through territory, resources, and political manipulation. The player with the most VP after round 8 wins.

The game was originally played over Discord with a human Game Master (GM) resolving every action by hand. The digital edition automates that resolution.

### Core Design Pillars (non-negotiable)

1. **The game is a pure function.** A round resolves as `game_state + ordered_player_actions → new_game_state + per-player_updates`. Given the same starting state, the same submitted actions, and the same random seed, resolution **must** produce identical output. All randomness is server-generated and seedable. This makes the game fair, reproducible, debuggable, and replayable.

2. **Information is the central resource.** The entire game is built on *hidden information*. Each player perceives only what their character and minions could plausibly know, computed via the stealth/intercept system. The system must never leak information a player's character has not earned. This is the single most important correctness property of the product — a leak is a game-breaking bug, not a cosmetic one.

3. **Determinism replaces GM adjudication.** Mechanics the rulebook delegates to "the GM decides" must be re-expressed as deterministic rules or structured player inputs (see Part C). The system should require **zero** per-action human judgment to resolve a normal round. (Combat negotiation is the one sanctioned exception — see [A12](#a12-combat).)

4. **Asynchronous, deadline-driven play.** Players submit their ordered action list during an open window. A round resolves when all players have submitted or a deadline passes. There is no real-time turn-taking; the game is played over days/weeks.

5. **Multi-tenancy from day one.** Many independent campaigns run simultaneously and never share state. Every entity belongs to exactly one campaign.

---

# Part A — Game Design Specification (Functional Rules)

## A1. Players, Factions & Titles

A campaign has **20 player vampires** and **one or more GMs**. Every player belongs to one of three **factions (sects)** and holds a **title** that defines their powers, action budget, and VP-scoring method.

### The three factions

| Faction | Theme | Titles | Special mechanic |
|---|---|---|---|
| **Camarilla** | Order, secrecy, the Masquerade | Inner Circle, Justicar, Prince | The Ivory Tower (debates & voting) |
| **Anarch** | Rebellion, speed, revolt | Baron | Powerful, fast faction actions (no unique sub-mechanic) |
| **Sabbat** | Chaos, monstrousness, destruction | Archbishop | Hidden identity + shared Sabbat bases + Sabbat schemes |

### Titles — powers and action budgets

| Title | Faction | Actions/round | Starting domain | Notes |
|---|---|---|---|---|
| **Inner Circle** | Camarilla | **6** | none | Most powerful at start; rewards/punishes other Camarilla. |
| **Justicar** | Camarilla | **4** | none (domain = all Camarilla cities) | Hunts Sabbat & polices Princes; uses Archon minions; mission-driven. |
| **Prince** | Camarilla | **4** | one city | Rules and builds cities; uses Primogen minions; can hold Royal Privileges. |
| **Baron** | Anarch | **5** | one city | Revolt specialist; fast. |
| **Archbishop** | Sabbat | **4** when exposed | one city (disguised) | Starts **hidden**, disguised as a Prince or Baron (see [A14.3](#a143-the-sabbat)). |

**Title changes:** A player can change title during play (e.g. Anarch invited into Camarilla becomes a Prince; a Prince who loses their only city loses the title but stays in their sect; "Go Anarch" turns a Prince into a Baron). On a title change the player **keeps all VP earned so far** but must thereafter earn VP by the **new** title's method ([A13](#a13-victory-points--winning)).

### Domains

Some rules reference a vampire's **domain**:
- **Prince / Baron / Archbishop:** their domain is the set of cities they control.
- **Justicar / Inner Circle:** their domain is **all Camarilla cities**.
- When an effect says "move to your domain" and several options exist, the player chooses.

---

## A2. Character Model & Stats

Each player vampire is described by:

| Attribute | Range / type | Meaning |
|---|---|---|
| **Name, Clan, Title, Faction** | — | Identity. Clan grants Boon, Curse, and starting disciplines. |
| **Blood** | integer ≥ 0 | Universal currency. Spent on actions & minion upkeep; gained from city income, bleeding, and effects. |
| **VP** | integer ≥ 0 | Score. Earned per title. |
| **EXP** | 0–12 lifetime | Spent on upgrades (disciplines, stats, artifacts). Max 12 per campaign. |
| **Strength** | base + modifiers | Combat power. |
| **Stealth** | base + modifiers | Hides your actions; defends vs hunt rolls. |
| **Intercept** | base + modifiers | Reveals others' actions; powers your hunt rolls. |
| **Disciplines** | set, each possibly (M)astered | Supernatural powers granting discipline actions. |
| **Artifacts** | set | Grant artifact actions / passive bonuses. |
| **Minions** | set | NPC servants. |
| **Royal Privileges** | integer ≥ 0 | Prince-only resource. |
| **Status** | active / torpor / burned | Torpor = limited; burned = removed from game. |
| **Blood-hunt flag** | boolean | Targeted for a blood hunt. |
| **Domain** | derived | See [A1](#a1-players-factions--titles). |

### The Rule of Three (stat-cap rule) — global invariant

> A vampire can **never gain more than +3 to any single stat from any single source.**

A "source" = any one game effect (a specific action, a specific artifact, a modifier, an EXP upgrade). Example: Protean can be used 3× for +3 Strength; further Protean gives nothing — but Black Gloves (+2 Strength) is a *different* source and still applies, totalling +5. **The engine must track stat bonuses per-source** to enforce this cap correctly. Note the explicit exception: **Strength bought with blood during the Charge step of combat does not follow the Rule of Three.**

---

## A3. Character Creation

At campaign start the GM assigns each player a **title** (and, for city titles, a **starting city** and possibly a starting artifact). The player then builds the character:

1. **Concept** — flavor only (background, why they rose to power, etc.). No mechanical effect.
2. **Choose a clan** (any of the 14). Grants 1 Boon, 1 Curse, and **3 starting disciplines**.
3. **Choose starting minion(s)** — exact options are title-defined (see table below). Each minion is named.
4. **Master disciplines** — title defines how many of your starting disciplines begin mastered `(M)`.
5. **Choose starting upgrades** — pick **2 of 4** title-specific options.
6. **Spend EXP** — title defines a starting EXP pool; **all of it must be spent** during creation, on the EXP upgrade list ([A5](#a5-disciplines)/below).
7. **Character introduction** — flavor post; no mechanical effect.

### Title starting packages

| | Inner Circle | Justicar | Prince | Baron |
|---|---|---|---|---|
| **Blood** | 200 | 150 | 100 | 150 |
| **Mastered disciplines** | 3 | 2 | 1 | 1 |
| **Starting EXP** | 6 | 4 | 4 | 4 |
| **Starting minions** | two LV2 (Ghoul/Harpy/Eye, may differ) **and** two LV1 Ghouls | one LV2 Archon **or** three LV1 Eyes | one LV1 Primogen **or** one LV2 Ghoul/Harpy/Eye | one LV1 Harpy+Ghoul **or** one LV1 Eye+Ghoul |
| **Other** | 1 random artifact; 3 VP | 1 random artifact; 2 Missions | 2 Royal Privileges; 1 city | 1 city |
| **Pick 2 upgrades** | +discipline / +1 any stat / LV3 Ghoul-Harpy-Eye / +100 blood | +discipline / +1 Strength or Intercept / LV2 Archon / +100 blood | +discipline / +1 Stealth or Strength / city +25 bloodflow / city +2 intercept | +discipline / +1 Strength or Intercept / city gets Anarch Stronghold special / city gets Anarch political hub **or** Anarch free press special |

> **Archbishop note:** Archbishops are created using the disguise title's package (Prince or Baron) since they masquerade as that title (see [A14.3](#a143-the-sabbat)).

### EXP upgrade list

| Upgrade | Effect | Cost |
|---|---|---|
| Extra discipline | Learn one discipline you don't have. | 1 EXP |
| Mastered discipline | Master a discipline you already have (unlocks its `(M)` action). | 1 EXP |
| Greater strength | +1 Strength (max +3 from this upgrade). | 2 EXP |
| Unseen | +1 Stealth (max +3 from this upgrade). | 2 EXP |
| Eyes of the night | +1 Intercept (max +3 from this upgrade). | 2 EXP |
| My treasure | Gain a random artifact. | 1 EXP |

Lifetime cap: **12 EXP**. EXP is also earnable mid-game via the **Grow in Power** action (50 blood = 1 EXP).

---

## A4. Clans (Boons & Curses)

There are **14 clans**. Each grants **3 disciplines**, one **Boon** (passive benefit), and one **Curse** (passive penalty). Clan choice is free (independent of faction/title).

| Clan | Disciplines | Boon | Curse |
|---|---|---|---|
| **Banu Haqim** | Celerity, Obfuscate, Thaumaturgy | If this vampire gets an Ambush, also +2 Strength. | −1 Strength; removed permanently after committing Diablerie. |
| **Brujah** | Celerity, Potence, Presence | After winning a combat, all faction actions cost −10 this and next turn. | 25% chance at end of each round to attack a random vampire/minion in your city. |
| **The Ministry** | Obfuscate, Protean, Presence | Eye & Archon minions get −1 intercept against you. | Lose 5 blood at end of every turn. |
| **Gangrel** | Animalism, Fortitude, Protean | +1 to all hunt rolls. | Cannot negotiate if you lose a combat. |
| **Hecata** | Auspex, Fortitude, Oblivion | When you lose a minion, gain a LV1 Ghoul. | Recruiting a minion costs +10 blood. |
| **Lasombra** | Dominate, Oblivion, Potence | When you use Oblivion, choose another action to become Undetectable (1×/round; can't override "Can't be hidden"). | If you have less blood than last turn, you can't use Trifle. |
| **Malkavian** | Auspex, Dementation, Obfuscate | Gain a unique piece of information every round. | 25% chance at end of round to move to a random adjacent city. |
| **Nosferatu** | Animalism, Obfuscate, Potence | Using Obfuscate, Hide, or In the Shadows → +1 intercept for the rest of the round. | Move costs +5 blood. |
| **Ravnos** | Chimerstry, Fortitude, Animalism | +1 Stealth on Bleed (hunt-for-blood) and Steal Artifact. | If you didn't move this round, lose 5 blood at end of round. |
| **Salubri** | Auspex, Dominate, Fortitude | When you perform Awaken, gain 2 ticks instead of 1. | Can make only one Give action per turn. |
| **Toreador** | Auspex, Celerity, Presence | All faction actions cost 5 blood less. | GM generates a random "obsession" (artifact/city/minion); if you don't own/control it, lose 10 blood at end of every turn. |
| **Tremere** | Auspex, Dominate, Thaumaturgy | If you make only one Thaumaturgy action in a round, it costs no action. | Cannot have LV3 minions. |
| **Tzimisce** | Animalism, Dominate, Vicissitude | When you burn another vampire's minion, gain 10/20/30 blood (by its level). | If you end your turn outside your domain, lose 10 blood. |
| **Ventrue** | Dominate, Fortitude, Presence | Gain 10 blood every turn. | −10 blood on every Bleed action. |

> Several Boons/Curses are conditional, end-of-round, or probabilistic — the resolution engine must apply them at the correct phase ([A16](#a16-round-resolution-order)) and respect the Rule of Three where they grant stats.

---

## A5. Disciplines

There are **14 disciplines**. A vampire's disciplines come from their clan and from upgrades. Each discipline grants a **basic action**; spending 1 EXP to **master** it unlocks an additional `(M)` action. A player may only use the `(M)` action if they have mastered that discipline. Full effects, costs, and stealth values are listed in the [Full Action Catalogue → Discipline actions](#a7d-discipline-actions).

The 14 disciplines: **Animalism, Auspex, Celerity, Chimerstry, Dementation, Dominate, Fortitude, Obfuscate, Oblivion, Potence, Presence, Protean, Thaumaturgy, Vicissitude.**

---

## A6. The Action System

Actions are the centerpiece of the game. Each round every vampire (and each minion) performs actions.

### Action types
1. **Faction actions** — affect map/cities/politics. All sect- and title-specific actions are faction actions.
2. **Personal actions** — performed by the vampire on themselves/their position.
3. **Minion actions** — performed by minions; **only** minions can perform these, and only those matching the minion's type.
4. **Discipline actions** — require the relevant discipline.
5. **Artifact actions** — require possession of the relevant artifact.

### Submission rules
- A player submits an **ordered list** of actions for the round (length = their action budget; see title table). Minions each get **1 minion action** per round, listed in the same ordered list.
- Players divide their actions however they like (only minions do minion actions).
- **Resolution order across players:** every player's action #1 resolves first (in random order among players), then every player's #2, etc. ([A16](#a16-round-resolution-order)).
- **Buffs must be ordered before their target.** Modifiers (e.g. Obfuscate granting +4 stealth to "action #3") must appear earlier in the list than the action they affect.
- **Cost is paid up front** at the start of the round (income only arrives at the start of the *next* round, so players must already have the blood).
- **Failed actions are refunded.** If an action cannot resolve (e.g. target is in the wrong city, or you were sent to torpor before it ran), it does not resolve and **its cost is refunded**, and the player is informed. *(Note: this is the canonical rulebook behavior. The current codebase prototype assumed no-refund; the canonical refund rule governs.)*

### Action cost & stealth
- Every action has a **blood cost** and a **stealth modifier** (often a small integer; some are `Undetectable` or `Can't be hidden`).
- **Total stealth** of an action = performer's stealth + the action's stealth modifier + any applied buffs. See [A11](#a11-stealth-intercept--the-information-rule).

### Trifle
- Some actions have the **Trifle** keyword. **The first Trifle action a player makes each round does not cost an action slot.** Subsequent Trifle actions cost a slot normally. (Some Trifle actions also have 0 blood cost, but Trifle only waives the *action slot*, not necessarily blood.)
- **All artifact actions have Trifle.**

### Extra-action sources
- **Royal Privilege** (Prince): spend 1 → +1 action this round.
- **Sabbat schemes:** Sabbat collectively get X+1 extra actions (X = number of Sabbat players), divided by agreement ([A14.3](#a143-the-sabbat)).
- **Anarch Mission** action: grants a named minion +1 action (max 1 extra/minion/round).
- **Call a Crusade!** / **Celerity**: see catalogue.

---

## A7. Full Action Catalogue

> Format: **Name** — effect. *Cost / Stealth.* Notes.
> "Undetectable" = no one can perceive it. "Can't be hidden" = everyone who could perceive it does.

### A7a. Personal actions

- **Move** — Move to an adjacent city. *10 blood (5 if Justicar; +5 if Nosferatu) / +2.* Trifle if Justicar.
- **Bleed** — Bleed the city you're in. In your domain: **2×(D10×5)**; in another's domain: **1×(D10×5)**. City's blood flow drops by the amount bled this turn; you can't gain more than the city's current blood flow. *0 / +0.*
- **Watchful Eyes** — +1 personal intercept this turn. Max 1/turn. *10 / +0.*
- **In the Shadows** — +1 personal stealth this turn. Max 1/turn. *10 / +0.*
- **Blood for Blood** — +1 personal strength this turn. Max 1/turn. *10 / +0.*
- **Attack!** — Name a vampire/minion in your city; make a hunt roll; on success enter combat. If your stealth > their intercept, you get an **Ambush**. *0 / −1.*
- **Wait and Strike** — Choose your city and set a condition; the GM rolls a hunt vs the next vampire/minion meeting the condition. Moving out of the city cancels it. *0 / +2.* (See Part C — conditions need a structured grammar.)
- **Bestow Gifts** — Give one of your minions +1 level permanently (max 3). *25 / +1.*
- **Get a Minion** — Recruit a minion. Ghoul 25/50/75; Harpy 30/60/90; Eye 20/40/60. *Cost = level price / +0.*
- **Grow in Power** — Gain 1 EXP per 50 blood spent; spend the EXP immediately. Trifle. *50×N / +0.*
- **Awaken** — Only usable while in torpor (or used *on* a torpid vampire in your city). 3 successful Awakens leave torpor. *0 / +3.*
- **Diablerie** — Name a torpid vampire in your city; hunt roll; on success burn them, steal one of their disciplines, and gain +1 Strength/Stealth/Intercept (your choice) **for the rest of the game**. May (optionally) trigger a blood hunt; choosing to "just burn them" does **not** trigger one. *0 / −1.*
- **Hide** — +5 stealth this turn; you can make no further actions this round. *10 / Undetectable.*
- **Steal an Artifact** — Name an artifact in your city; hunt roll vs its carrier **using your stealth vs their intercept** (reversed roll); on success take it. *15 / +0.*
- **Look for Artifacts** — Name a vampire; hunt roll; on success learn all artifacts they possess. Trifle. *10 / +1.*
- **Sail** — From a port city, move to any other port city in the same sea region (blocked by a storm in that region). *15 / +0.*
- **Summon the Storm** — Name a sea region; at the start of next round it has a storm until end of round. *100 / +1.*

### A7b. Faction actions (any faction)

- **Give** — Name a vampire/NPC; give them any blood/minions/artifacts you control. Doesn't cost an action. *0 / +1.*
- **Investigate** — Name a city + a problem/special there; GM gives info and a hint to handle or worsen it. *20 / +1.* (Part C: needs a content model.)
- **Troublemaker** — Name a city; create a problem there. Lower stability ⇒ worse problem; 0 stability ⇒ a disaster. *30 / +0.* (Part C: problem table.)
- **Fight for Control** — Only if you contest a city. Other contestants choose fight or flee; fleeing yields the city to you; fighting ⇒ combat at end of next round, winner gains control. *25 / −3.*
- **Search** — Name a city in your domain; GM lists all vampires/minions there with stealth ≤ your-or-the-city's intercept; 25% chance to find an artifact. *20 / +0.*
- **Conquer New Territory** — Contest the city you're in. Only if you have **no title**. *150 / Can't be hidden.*

### A7c. Title / faction-specific actions

**Camarilla (any Camarilla member):**
- **Control the Masquerade** — Name a city; +1 MS. Trifle. *10 / +1.*
- **Claim Credit** — Only when a Prince takes a new city or a Justicar completes a blood hunt. Steal 1 VP from them (max 6 VP stolen per turn; once per turn). *25 (0 if Inner Circle) / −2.*
- **Buy Votes** — +1 Ivory Tower vote per 10 blood, this round. Doesn't cost an action. Non-Camarilla can vote via this. *X / +0.*
- **Invite to the Camarilla** — Name an Anarch; they may join. A Baron becomes a Prince of their city; others just get the Camarilla tag. Invitee can perform only 1 action next turn. *10 / −2.*

**Prince only:**
- **Build My Kingdom** — Name a city; pick **three** distinct effects (once per city per turn): +1 intercept (10); +1 stability (10); +25 blood flow (50); Special: Camarilla Order (15); Special: Secure Haven (10); Special: Camarilla Ball (25); +2 influence (15). *Total = sum of picks / Can't be hidden.*
- **Second Tradition** — Name a vampire/minion in your domain; hunt roll with **+2 intercept**; on success enter combat (you & it move to the target's city). May bring any Harpies in your domain (they then can't act this turn). *15 / +0.*
- **Expansion** — Name a city adjacent to one you control; either (a) pay blood flow ×10 to seize control immediately (previous controller loses city + title; you score VP), or (b) move there and contest it (may bring minions, who then can't act). *50 / −2.*
- **Recruit a Primogen** — Name a city in your domain; gain a LV X Primogen there. *40/80/120 / +0.*
- **Sabotage** — Lower a city's stability **or** intercept by 1. *20 / +0.*
- **Go Anarch** — Lose Camarilla tag & title; a Prince becomes a Baron. Must be your only action this round. *0 / Can't be hidden.*

**Justicar only:**
- **Orders from the Top** — Get a mission from the GM. Trifle. *0 / Undetectable.*
- **Iron Fist of the Camarilla** — Name a vampire/minion; learn what city(ies) they were in last turn and where they ended the round. *20 / +0.*
- **Investigate the Sabbat** — Name a city; learn all Sabbat actions targeting it this round and last (with which round). *10 / +1.*
- **Expose the Sabbat!** — Name a Prince/Baron in your city. If they're Sabbat, roll D4; on anything but 1 they're exposed and you score 4 VP. If not Sabbat, you lose 2 VP. Once/turn. *50 / Can't be hidden.*
- **Recruit an Archon** — Gain a LV X Archon in your city. Only if you completed a mission this turn. *25/50/75 / +1.*

**Inner Circle only:**
- **Bottomless Wealth of the Camarilla** — Gain 250 blood; can't Move (any way) this round. Once/round. *0 / +0.*
- **Reward Loyalty** — Name a Prince (gains 1 Royal Privilege) or Justicar (gains 50 blood). Once/turn. Trifle. *25 / +1.*
- **Fifth Tradition** — If in a Camarilla city, gain all info the Prince gets from that city's intercept **and** from adjacent Camarilla cities' princes. *30 / −1.*
- **Punish Treason** — Name a Camarilla vampire; they lose 25 blood at end of round (a vampire loses blood from this only once/round). *0 / +0.*
- **Pardon** — Name a blood-hunted vampire; the blood hunt is cancelled at end of round. *25 / Can't be hidden.*

**Anarch (any Anarch / Baron):**
- **Anarch Highway** — Move up to 2 of your minions to any adjacent city. *10 / +0.*
- **Anarch Free Press** — Give a city +2 intercept for the rest of the round. Trifle. *10 / +2.*
- **Anarch Mission** — Name a minion you control; it gains +1 action this round (max 1 extra/minion). *15 / +1.*
- **Anarch Sabotage** — Lower a city's stability or intercept by 1. Trifle. *15 / +0.*
- **Anarch Revolt** *(Baron only)* — Name a city with stability ≤ 1; add a revolt counter; then for **each** revolt counter on it choose one: roll D4 per Camarilla/Sabbat minion (burn if D4 > level); move the ruler to a random adjacent city and they lose D100 blood; bleed the city for half its blood flow then it loses 10 blood flow permanently; gain 2 LV1 Ghouls/Harpies there; move there & contest it; **if the city has 5 revolt counters, gain control of it** (remove all counters; city −10 blood flow permanently). Then score 1 VP and the city gets −1 MS. Once/round/city. *50 / −3.*
- **Organize Resistance** *(Baron only)* — Burn a minion in your domain; choose X effects (X = burned minion's level): Anarch city +1 stability; +1 intercept; +1 MS; a city you control gives +50 blood but −1 MS; give a city you control the Anarch Stronghold / Anarch political hub / Anarch free press special. *25 / +0.*

**Sabbat (any Sabbat member):**
- **Sabbat Sabotage** — Choose a city; −1 MS or −1 intercept. *15 / +2.*

**Archbishop only:**
- **Build the Base** — Name a city matching your disguise's sect or already holding a Sabbat base; create a LV1 base, or +1 level (max 3). Base effects (to all Sabbat): +X stealth on Sabbat faction actions targeting it (X=level); all Sabbat gain 5 blood/level at end of round; the base city counts as adjacent for all Sabbat actions. *25 / +3.*
- **Burn the Weak!** — Name a city with a Sabbat base; roll D4 per minion there with level ≤ base level (burn if D4 > minion level). *10 / +2.*
- **Spreading the Truth of Cain** — Up to 3 cities with Sabbat bases get −1 stability, −1 MS, −1 intercept. Once/turn. *20 / +1.*
- **Shovelhead Attack!** — Name a city with a LV3 Sabbat base; roll D4 per non-Sabbat minion (burn if D4 > level); city suffers −2 stability, −2 MS, −25 blood flow for 2 turns; you score 2 VP; the base drops to LV1. Once/round. *50 / +0.*
- **Esbat** — Name a city with a Sabbat base; bleed it for X×(2×D10) (X=base level). May forgo the blood to instead score 1 VP per 20 blood it would have yielded (declared at action time). Once/turn. *10 / +2.*
- **Call a Crusade!** — Gain 250 blood, 2 LV2 minions, +1 action next turn. You become **exposed**. *0 / Can't be hidden.*
- **Conquer in the Name of Cain!** — Name an adjacent city; move there and contest it. Exposed Archbishops only. *100 / Can't be hidden.*

### A7d. Discipline actions

*(`(M)` = mastered-only.)*

- **Animalism** — If you make any hunt roll(s) this round, roll +3 D4 and pick the best. *0 / Undetectable.*
  **(M)** — Choose one: wolves hunt 1×D10 in **every** adjacent city; or birds → +2 personal intercept this round; or rats → −1 intercept to one adjacent city. *10 / +2.*
- **Auspex** — Name a vampire; choose two: learn their lowest-stealth political action this round; their highest-stealth personal action; or all actions by their minions in your city. Trifle. *10 / Undetectable.*
  **(M)** — Choose one: name a vampire + hunt roll → learn all cities they were in this turn, in order, even undetectable moves; or learn the location of up to 5 named artifacts/vampires/minions. *10 / Undetectable.*
- **Celerity** — Your next two actions resolve immediately (priority within their order slot). *10 / +0.*
  **(M)** — Move up to 3 cities away. If you used Oblivion, these moves are also Undetectable. *20 / +0.*
- **Chimerstry** — Name an adjacent city + a vampire who isn't its controller; that controller's next info update falsely reports the named vampire in their city. Trifle. *10 / +2.*
  **(M)** — Write a ≤250-word message the GM posts in the "information highway" on the next news update; you choose where. *15 / +2.* (Part C.)
- **Dementation** — GM sends you a screenshot from a random chat. Trifle. *0 / Undetectable.* (Part C.)
  **(M)** — Name a vampire + hunt roll; on success they perform one of Move/Bleed/Investigate at end of round (you choose which), but the target is randomized. *10 / +3.*
- **Dominate** — Name a vampire/minion in your city + a city; hunt roll; on success move them there at end of round and they can't move as their first action next round. Uses the target's stealth. *0 / +1.*
  **(M)** — Name a minion another vampire controls in your city; hunt roll; on success take control of it. *25/50/100 (by level) / +0.*
- **Fortitude** — If burned this round, go to torpor instead; if you'd go to torpor, you need only 1 Awaken. *10 / Undetectable.*
  **(M)** — Your next press in combat is free. Trifle. *0 / Undetectable.*
- **Obfuscate** — +4 stealth to one personal or discipline action. *0 / Undetectable.*
  **(M)** — The next hunt roll targeting you this turn fails. *10 / Undetectable.*
- **Oblivion** — Name a vampire; if they Move or Grow in Power this round, that action becomes Undetectable. *10 / +1.*
  **(M)** — Make up to 2 of your minion actions Undetectable. *15 / +2.*
- **Potence** — In combat, roll +3 dice & pick best; if you win, the loser gets −1 on the wound roll. *0 / Undetectable.*
  **(M)** — Name a level ≤2 minion in your city + hunt roll → burn it; the first time each round you do this, +2 Strength for the round. *10 / +0.*
- **Presence** — +4 stealth to a faction action you perform, or give +4 to another vampire's faction action. *0 / Undetectable.*
  **(M)** — Perform any faction action that doesn't require a title. Once/turn. *Same cost/stealth as the chosen action.*
- **Protean** — Choose one: +1 Strength / +1 Stealth / +1 Intercept for the round. *10 / Undetectable.*
  **(M)** — Rearrange your base Stealth/Intercept/Strength (base stats only, not modifiers). *10 / Undetectable.*
- **Thaumaturgy** — Give a vampire access to a discipline action for this & next round. Trifle. *10 / −1.*
  **(M)** — Choose one: burn an artifact you control + name a vampire in your city → that artifact's action becomes a permanent action for them (cost +10); or create an artifact whose action mirrors a basic discipline action you have (same cost/stealth), held by you. *50 / +0.*
- **Vicissitude** — Choose one: gain a LV1 Ghoul/Harpy/Eye; or burn two LV1 same-type minions in your city → gain a LV2 of that type; or burn two LV2 same-type → gain a LV3. *10 / +0.*
  **(M)** — Change a minion's type to any other (not Primogen/Archon). *0 / +1.*

### A7e. Artifact actions

All artifact actions have **Trifle** and may be performed once per turn per artifact. Some artifacts may be carried by a minion (max **one** artifact per minion; a vampire may carry any number), granting the minion a stat bonus instead. See [A9](#a9-artifacts) for the full list.

---

## A8. Minions

Minions are NPC servants. There are **5 types**; each has a **level 1–3** that *is* its stat line (a LV2 minion has Strength 2, Stealth 2, Intercept 2, modifiable). Every minion takes **1 minion action per round** (only actions of its own type). **Upkeep must be paid each round** (except the round it's gained); unpaid ⇒ burned. A minion defeated in combat is burned.

| Type | Recruitable by | Upkeep (LV1/2/3) | Traits | Role |
|---|---|---|---|---|
| **Ghoul** | anyone | 5/10/15 | Meek (can't beat a vampire in combat) | Infiltration & sabotage |
| **Harpy** | anyone | 15/30/45 | Trained (+2 Strength vs other minions) | Frontline soldier |
| **Eye** | anyone | 5/10/15 | Meek; Informant (auto-reports what it intercepts) | Spy / info |
| **Primogen** | **Prince only** | 20/40/60 | Loyal to the Prince (burned if not held by a Camarilla Prince) | City builder |
| **Archon** | **Justicar only** | **0** | Trained; Informant; Camarilla Loyal (start with 3 loyalty counters; lose 1/round unless the Justicar completed a mission; at 0 counters or if not held by a Justicar, burned) | Elite agent/warrior |

### Minion actions by type

**Ghoul:** Move (5/+0); Sail (15/+0); Bleed the Enemy — X×(D10×2), X=level (0/+1); Partner in Crime — +X stealth (X=level) to each of your actions while in the same city (10/+0); Sabotage — city −1 stability or −1 intercept (15/+2); Move the Master — if your controller is in torpor, move them to this minion's city (10/+2).

**Harpy:** Move; Sail; Wait and Strike — set condition, hunt the next qualifying target (0/+2); Bodyguard — if your controller fights in this city, +Strength = level (10/+0); Suicide Mission — name a special in this city, roll D4; ≤ level removes the special, else minion is burned (10/−2); Guard the Master — if your controller is torpid here, this minion attacks anyone trying to Diablerize them, +1 Strength (10/+1).

**Eye:** Move; Sail; Investigate Eye — name a problem/special; ask one question per level from a fixed list (10/+2); Hide and Spy — +2 stealth & intercept this & next turn, no action next turn (0/+1); Keep an Eye on Them — name a vampire here + hunt roll; on success ask one of: how much blood / which artifacts / more VP than me? (10/+2); Hide the Master — if your controller is torpid here, they gain stealth = level vs Diablerie hunt rolls (10/+0).

**Primogen:** Build on the Master's Kingdom — one benefit per level, chosen from: +1 stability / +1 intercept / +1 MS / +1 influence / Special: Elysium (controller +1 Ivory Tower vote, stackable) / Special: Camarilla Order / Special: Secure Haven. *0 / Can't be hidden.*

**Archon:** Archon Movement — move to an adjacent city, then optionally again (5/+2); Sail; Attack — name target here + hunt roll → combat (Ambush if stealth > intercept) (10/−1); Bodyguard (10/+0); Follow Them — name a vampire/minion here; if it moves (any way), this minion follows; can trigger multiple times/turn (15/+2); Sabbat Interrogations — if a Sabbat base is here it loses 1 level (LV1 destroyed); else city −1 stability (20/+0); The Master's Will — this minion gains 3 loyalty counters (30/+0).

### Minions in combat
- A minion fights like a vampire; its stats = its level for hunts/combat. If defeated it is **burned**. Minions can't spend blood for Strength during Charge or Press.
- **Meek** minions can't win combat against a vampire.
- **Minion vs minion:** skip all steps except Combat and Combat-ends (no negotiation) — GM just rolls and resolves.
- **Minions helping** (e.g. Bodyguard): add their level to the vampire's Strength; if the vampire loses, all assisting minions are burned (unless saved via negotiation).

---

## A9. Artifacts

Artifacts are powerful objects found, bought, or stolen (or held at start). They grant artifact actions (only usable by the possessor; **all have Trifle**, once/turn/artifact) and/or passive bonuses. A vampire may carry any number; a minion may carry **one** (gaining the parenthetical minion bonus). Possession is hidden from others unless revealed.

> The 30 artifacts below are the canonical content set. *Cost / Stealth* and minion bonus are noted.

| Artifact | Effect | Cost / Stealth |
|---|---|---|
| **Aaron's Feeding Razor** | Bleed your city for 2×(D10×2). | 0 / +1 *(minion +1 Str)* |
| **Black Gloves** | +2 Strength. | 5 / Undetectable *(minion +1 Str)* |
| **Giants' Blood** | Name a torpid vampire; they awaken; burn this artifact. Usable even while in torpor. | 0 / +2 |
| **Hand of Conrad** | This round, in combat roll +3 dice, pick best. | 0 / Undetectable |
| **Ivory Bow** | This round, if you win combat the loser gets −1 on the wound roll. | 0 / Undetectable |
| **Martinelli's Ring of Clear Thought** | +2 intercept for the round. While held, you lose Dementation if you have it. | 0 / Undetectable *(minion +1 int)* |
| **Pumping Heart of Nizchetus** | In your domain, all hunt rolls targeting you get −2. | 0 / Undetectable *(minion +1 stealth)* |
| **Tongue of Jarthis the Slaver** | +1 Stealth on all faction actions this round. | 0 / Undetectable *(minion +1 stealth)* |
| **Vestment of Vileness** | Gain a LV1 zombie minion (no upkeep; only Move & "Hunt for Me"; can't be dominated; if defeated in combat it's burned and the artifact passes to the winner). | 0 / Undetectable |
| **Bowl of Convergence** | Learn one random vampire and minion in your city. | 0 / Undetectable *(minion +1 int)* |
| **Bloodspot Dice** | Roll D20; gain 2× that in blood; on a 1, lose 20 blood. | 0 / Undetectable |
| **Gangrel Eye** | If you fail a hunt roll this round, reroll with +1. | 0 / Undetectable *(minion +1 int)* |
| **Orb of Ulain** | Hunt rolls targeting you for Dementation/Dominate/Auspex get −2. | 0 / Undetectable *(minion can't be Dominated)* |
| **Whispers in a Bottle** | Learn one random action by a vampire of your choice. | 0 / Undetectable *(minion +1 int)* |
| **Bag of Gifts** | Give a vampire 10 blood (no action). | 0 / +1 *(minion +5 to blood hunts)* |
| **Fog Flute** | Give a city −1 intercept until end of round. | 0 / +2 *(minion +1 stealth)* |
| **S.H.R.E.K Net Access** | Learn all vampires who made a Move action this round. | 10 / +3 *(minion +1 int)* |
| **Crown of Malkav** | If any Dementation is used this round, gain a random screenshot from a random chat. | 5 / Undetectable *(minion +1 int)* |
| **Ring of Tremere** | On gaining, choose a discipline; perform its basic action. | = chosen discipline *(minion can too)* |
| **Scepter of Venture** | Move a minion you control to any city. | 15 / +1 *(equipped minion +1 level, max 3)* |
| **The Evil Eye** | Name a vampire; they lose 5 blood (no action). | 0 / +3 |
| **Ravnos Boots** | Move to an adjacent city. | 0 / Undetectable |
| **The Demeter** | Move to any port city. | 20 / +1 |
| **Diamond of Toreador** | All players learn your city; gain 25 blood. | 0 / Can't be hidden |
| **Daemon Blood** | +3 to all stats until end of round, then enter torpor in your city. | 0 / Undetectable |
| **Brujah's Book** | Name a city; −1 stability, +1 MS. | 15 / +1 |
| **The Signet of King Saul** | Your actions are Undetectable to Inner Circle members this round. | 10 / Undetectable |
| **The Soul Gem of Etrius** | Usable only in torpor. If you're diablerized and the diablerist wins the campaign, **you win instead**. | 0 / Undetectable |
| **Sword of Judgment** | +3 Strength in combat vs vampires who have committed a successful Diablerie this campaign; until end of round. | 5 / +0 |
| **Vial of Elder Blood** | Gain all disciplines (basic & mastered) until end of round; burn this artifact. | 0 / Undetectable |

---

## A10. Cities & Territory

Cities are the arenas of conflict. The **map is a configurable, GM-authored graph** of cities connected by **bidirectional adjacencies**, plus **sea regions** linking port cities for Sail.

### City stats

| Stat | Meaning |
|---|---|
| **Controller** | The ruling vampire (or none). Gains the city's blood flow each round; sees actions up to the city's intercept. |
| **Stability (0–5)** | Control level. 0 ⇒ the city gains a problem. Anarchs lower it to enable revolts. |
| **Blood flow** | Blood income to the controller at the start of each round. Reduced by bleeds, contests, problems. |
| **Masquerade Status (MS, 0–5)** | Secrecy. MS 0 ⇒ a **masquerade violation** ([A15](#a15-special-mechanics--keywords)). |
| **Intercept** | The controller learns all actions targeting or originating in the city with stealth ≤ this value. |
| **Problems** | Any number of negative modifiers (from Troublemaker, 0 stability, etc.). |
| **Specials** | Any number of positive modifiers/effects (Camarilla Order, Secure Haven, Elysium, Anarch Stronghold, etc.). |
| **Influence** | Built by Princes (Build My Kingdom). At campaign end, a Prince scores VP = influence of cities they still control. Lost if the city is lost. |
| **Revolt counters** | Placed by Anarch Revolt; 5 ⇒ Anarch takeover. |
| **Is port / Sea region** | Whether Sail is possible and within which region. |
| **Has storm** | Temporary; blocks Sail in the region. |

> **Reference map (current seed — configurable per campaign):** 18 cities across the British Isles — Edinburgh, Glasgow, Donegal, Belfast, Dublin, Galway, Tullamore, Waterford, Cork, Middlesbrough, York, Liverpool, Petersborough, Birmingham, Oxford, Cambridge, Cardiff, London — with four sea regions (North Sea, Irish Sea, Atlantic, English Channel). Cities, stats, adjacencies, ports and regions are GM-editable; the engine must treat the map as data, not as constants.

### Contesting a city
- Two+ vampires may **contest** a city. While contested it has no controller-income (no one collects blood flow) and suffers **−1 stability and −1 MS each round**. Contesting a player-controlled city costs **50 blood/round**.
- Resolution: (a) a contestant strikes a deal and leaves; (b) the **Fight for Control** action; or (c) all other contestants enter torpor / are burned (a torpid vampire can't contest).
- If a controller is contested, they always get a chance to return to the city for the start of next round.
- If a masquerade violation happens in a contested city, **all** contestants count as controllers.

### Taking & losing a city
- A city is **taken** only when its controller changes **after** being contested. The new controller scores VP (Baron 6, Prince 8, Archbishop 3 for all Sabbat). **VP for conquering a city is scored only once per city.**
- Losing your only city ⇒ you lose your title but stay in your sect. On losing a city you gain its **full blood flow** at the start of next round.

---

## A11. Stealth, Intercept & the Information Rule

This is the engine's core correctness domain.

### Core formulas
- **Total stealth of an action** = (performer's stealth) + (action's stealth modifier) + (applied buffs). Special: `Undetectable` ⇒ never perceivable; `Can't be hidden` ⇒ always perceivable by anyone who could see it.
- **Who sees an action:**
  1. **Co-located vampires:** any vampire in the same city as the performer whose **intercept ≥ the action's total stealth** learns of the action.
  2. **City controller:** learns all actions that **target or originate in** their city with stealth ≤ the **city's** intercept.
  3. **Informant minions** (Eyes, Archons): report what they intercept to their controller.
  4. Special visibility actions (Auspex, Iron Fist, Fifth Tradition, Search, etc.) grant extra sight per their text.
- **Hunt roll** (used to act *against* a target): roll D4 + your intercept vs D4 + target's stealth; you succeed if your total **exceeds** the target's. Various effects add dice ("roll +N, pick best"), rerolls, or auto-fail/auto-pass.
  - **Steal an Artifact** reverses the roll: your **stealth** vs the target's **intercept**.
  - **Ambush:** if attacker stealth > defender intercept, roll one extra die in combat and pick the best.

### The Information Rule (player conduct → product requirement)
The tabletop rule forbids players from sharing screenshots/verbatim copies of hidden info. In the digital edition this becomes a **hard system guarantee**: the server computes, per player, exactly the set of events/state their character is entitled to perceive, and transmits nothing more. Hidden state must never reach a client that isn't entitled to it (not even in network payloads, caches, or logs). See [Part B](#b3-information-architecture-the-core-requirement).

---

## A12. Combat

Combat is the one area that **retains human negotiation** (players bargaining), so the engine pauses and hands off rather than fully auto-resolving. Six steps:

1. **The Stand-off** — A combat channel opens for both participants. They have **up to 6 hours** to make a deal. Promised blood/artifacts/minions/cities transfer immediately; promises of future actions are non-binding. A successful deal ends combat.
2. **The Charge** — Each side has 6 hours to secretly spend blood for Strength: **+1 Strength per 10 blood** (this Strength ignores the Rule of Three).
3. **Combat** — Roll one D4 per side, add each side's Strength; highest total wins.
4. **The Negotiation** — Winner & loser get 6 hours to deal. A deal ⇒ combat ends.
5. **Press!** — The loser may **press** (cost 50 blood) and repeat from the Charge. Otherwise proceed.
6. **Combat ends** — If a deal was made, transfer promised assets. Otherwise the loser rolls the **wound table** (2D6):
   - **2–3:** burned.
   - **4–6:** torpor, in the combat city or any adjacent city (loser's choice).
   - **7–9:** torpor, in their domain or any city adjacent to the combat city (loser's choice).
   - **10–12:** flee back to their domain (loser chooses if multiple).

**Minion combat** skips negotiation/press entirely; the engine rolls and resolves directly. See [A8](#a8-minions).

> **Engine requirement:** When resolution creates a combat, it records a combat record, opens a structured negotiation flow with the 6-hour timers and blood-spend inputs, and resumes/applies outcomes deterministically once each step's input or timeout is reached. Combat resolution can therefore **straddle round boundaries** (Fight for Control explicitly resolves "at end of next round"). The system must model combats as first-class, multi-step, timer-driven state machines.

---

## A13. Victory Points & Winning

The winner is the player with the **most VP after round 8**. A vampire **in torpor or burned counts as 0 VP** at final scoring. VP is earned by title:

- **Inner Circle:** start with 3 VP; +3 VP at the start of every **second** round; each Ivory Tower debate always offers them an option worth +1 VP.
- **Justicar:** mission rewards; **+2 VP** each time they send a Sabbat member to torpor or burn them; VP from **Expose the Sabbat!** (+4).
- **Prince:** **+8 VP** for taking a new city (once per city); at the start of each turn controlling >1 city, +1 VP per additional city; at campaign end, +VP equal to influence in cities they still control. *(Claim Credit lets other Camarilla steal up to 6 of these VP.)*
- **Baron:** **+6 VP** for taking a new city (once per city); +1 VP/extra city/turn; **+2 VP** per successful Diablerie; VP from Anarch Revolt.
- **Archbishop / Sabbat:** +1 VP when burning a non-Sabbat-controlled minion; +2 VP when triggering a masquerade violation in a non-Sabbat city; +2 VP per successful Diablerie; **all Sabbat +3 VP** when an Archbishop takes a city; **+10 VP** when a Sabbat burns an Inner Circle member; VP from Shovelhead and Esbat. **If a Sabbat is sent to torpor by a Camarilla player, all Archbishops lose 2 VP.**

> **Engine requirement:** VP is title-conditional and event-driven; many awards are once-per-target (per city) or capped (Claim Credit ≤6/turn). The engine must attribute every VP change to a rule + event for auditability, and re-base scoring rules when a player changes title (keeping accrued VP).

---

## A14. Faction Mechanics

### A14.1 The Camarilla — The Ivory Tower
Each round the Ivory Tower presents a **Debate** with **2–4 options**. When Camarilla players submit actions they also **declare their votes** (a player may split votes across options). Votes per title: No title 1, Prince 2, Justicar 3, Inner Circle 4; **Buy Votes** adds votes (and lets non-Camarilla vote). After resolution, the **vote totals per option are revealed but not who voted how**. The winning option's effects apply (effects can be multi-round, e.g. "for 3 turns"). If an Inner Circle member or Justicar would lose their title or be burned, a **special debate** elects the replacement. *(Part C: who authors debate options/effects.)*

### A14.2 The Anarchs
No unique sub-mechanic; compensated by strong, fast faction actions (Anarch Highway, Free Press, Mission, Sabotage) and the title-defining **Anarch Revolt**. Anarchs are *not* an organized sect — alliances are temporary; each Baron stands alone.

### A14.3 The Sabbat
- **Hidden identity:** Archbishops start **disguised** as a Prince or Baron, controlling a city and using that title's actions, but scoring VP the Sabbat way. They are revealed only by **Call a Crusade!** (self-reveal) or **Expose the Sabbat!** (Justicar). When exposed they lose the disguise + that title's actions and gain the Sabbat tag (4 actions/round).
- **Shared bases:** All Sabbat players see **every** Sabbat base. One base per city, level 1–3 ([A7c](#a7c-title--faction-specific-actions)). Many Sabbat actions need a base of a minimum level.
- **Sabbat schemes:** The Sabbat collectively gain **X+1 extra actions** (X = number of Sabbat players), distributed by unanimous agreement **before** the round; if they can't agree, no one gets them. The distribution must be unambiguous to the engine.

> **Engine requirement (information):** Sabbat identity, base locations, and the Sabbat group chat are visible only to Sabbat players. This is one of the strongest information-hiding guarantees in the game.

---

## A15. Special Mechanics & Keywords

- **Blood hunt:** A vampire can be marked for a blood hunt. All Justicars get a mission to burn them (large VP reward). A non-Justicar who sends them to torpor or burns them gains **150 blood + 2 VP**. If a **Camarilla** member triggers a blood hunt, they lose their title. A **Prince** targeted by a blood hunt instead loses **1 Royal Privilege** (if available).
- **Masquerade violation:** MS 0 ⇒ the controller gets a blood hunt (for failing the First Tradition) — **except** the first violation in a Camarilla city triggers no blood hunt. All **adjacent** cities lose 1 MS at the start of each round until the violation is mended (restore the offending city to 5/5 MS). **If more than half of all cities have an active violation, the game ends** (humanity hunts all vampires).
- **Torpor:** A torpid vampire may only take the Awaken action (3 Awakens to leave; Fortitude reduces to 1; Salubri gains 2 ticks per Awaken). They may still take minion actions. They score **0 VP** while torpid and at final scoring. Other vampires in the same city can Awaken or Diablerize them.
- **Royal Privileges (Prince):** absorb a blood hunt (lose 1 instead of being hunted) or spend 1 for +1 action this round. Granted by Reward Loyalty and Build My Kingdom's Camarilla Ball special.
- **Rule of Three:** see [A2](#a2-character-model--stats).
- **The Information Rule:** see [A11](#a11-stealth-intercept--the-information-rule).
- **Trifle / Domain / Ambush / Bleed / Possession:** as defined in their respective sections.

---

## A16. Round Resolution Order

A round resolves in this exact order (the canonical "round breakdown"). The engine implements this as ordered phases over an in-memory game state, with one atomic commit at the end.

1. **Payment**
   1a. Players pay action costs.
   1b. Players pay minion upkeep (unpaid minions are burned).
2. **Start-of-round effects**
   2a. City effects (contested-city penalties, storms, masquerade-violation cascades to adjacent cities, etc.).
   2b. Event effects (debate outcomes taking effect, multi-round effects ticking).
   2c. Other effects (clan boons such as Ventrue +10 blood; conditional start effects).
3. **Action resolution**
   3a. Resolve every player's **action #1** in random order, then #2, then #3 … until all actions are resolved. **Celerity** gives priority within an order slot. Combats are resolved in the order they were triggered within the action sequence. (No blood income is granted until step 5.)
4. **End-of-round effects**
   4a. Fight for Control resolves.
   4b. Player end-of-round effects (e.g. (M)Dementation forced actions, Dominate forced moves, clan curses like Brujah Frenzy / Malkavian random move / Ministry & Ravnos blood loss / Tzimisce & Toreador domain/obsession losses).
   4c. Justicars check mission completion.
   4d. Check for **masquerade collapse** (>50% cities violated ⇒ game over).
5. **Income**
   5a. City controllers gain current blood flow.
   5b. Players gain blood from Bleeds performed.
   5c. Other income (Bottomless Wealth, completed missions, Sabbat base income, Esbat, etc.).
   Then increment the round counter and award start-of-turn VP (Inner Circle +3 every 2nd round; Prince/Baron +1 per extra city). The next action window opens.

> **Randomness:** "Random order" and all dice are server-generated from a per-round seed so resolution is reproducible.

---

# Part B — System Design & Platform Decisions

*These are the platform-level design decisions and requirements, independent of any specific framework, database, or hosting choice.*

## B1. The Pure-Function Resolution Model

- The game engine is a **pure, deterministic function**: `resolve(state, ordered_actions, seed) → (new_state, per_player_updates, public_news, full_log)`.
- **Determinism is mandatory.** All randomness flows from an explicit seed; no wall-clock or ambient randomness in resolution. Re-running a round with the same inputs yields byte-identical results. This enables automated testing, replay, and audit.
- **In-memory state machine:** A round loads the entire campaign state into memory, runs the ordered phases ([A16](#a16-round-resolution-order)) mutating in memory, then commits **atomically** (all-or-nothing). A crash mid-resolution must leave the prior state intact.
- **Event-sourced output:** Each rule produces typed **events** carrying stealth/visibility metadata. Events are the single source from which per-player updates, public news, and the GM log are derived (see [B3](#b3-information-architecture-the-core-requirement)). Every state mutation and VP change is traceable to a (rule, event) pair for debugging and dispute resolution.
- **Engine logic lives server-side only.** Clients never compute outcomes or hold hidden inputs; they submit intent and render the filtered results.

## B2. Roles & Identity

- **Roles:** Player and GM (a campaign may have multiple GMs). A user authenticates once and may participate in multiple campaigns, with a distinct role/character per campaign.
- **GM powers:** create/configure a campaign, author the map, assign titles/cities/clans (or approve player creation), set deadlines, trigger resolution, view the full game log, and perform sanctioned overrides (see [B8](#b8-gm-tooling)).
- **Player powers:** build their character (within GM-approved constraints), submit & reorder actions before the deadline, vote (Camarilla), participate in combat negotiation, and read only their own filtered state/updates.

## B3. Information Architecture (the core requirement)

Information hiding is the product's defining property and is enforced **server-side**, never by the client.

- **Server-side filtering is authoritative.** For every player, the server computes the exact set of state and events their character is entitled to perceive (via stealth/intercept, controller sight, informant minions, special visibility actions, and faction visibility), and sends nothing more. Hidden data must not appear in any payload, cache, real-time message, or client-readable log.
- **Three visibility tiers** must be modeled distinctly:
  1. **Faction-private** — e.g. Sabbat identities, Sabbat base locations, sect chats. Visible to a fixed group regardless of position.
  2. **Possession-private** — e.g. a vampire's artifacts and exact resources. Visible to the owner until revealed.
  3. **Intercept-filtered** — e.g. actions, movements. Visible only to those whose intercept (personal or city) meets the action's stealth.
- **Defense in depth.** Access-control at the data layer (a player can only ever query rows they own/are entitled to) *plus* engine-level event filtering. Neither alone is sufficient: data-layer rules guard direct reads; the engine guards derived/computed disclosures. The most sensitive disclosures (who saw what action) are produced exclusively by the engine.
- **Personalized round updates** are precomputed and stored per player; players read their own update, not a shared feed they filter client-side.
- **Public news** is a single shared, deliberately-public summary of "large happenings." The **full game log** is GM-only.
- **Anti-leak conduct rules** (no screenshots/verbatim copies of hidden info) from the tabletop are obviated for system-provided info because hidden info never reaches unauthorized clients; player-to-player chat is still subject to the conduct rule socially.

## B4. Multi-Tenancy

- Every entity belongs to exactly one **campaign**; campaigns are fully isolated. No global game state beyond reference content templates.
- Reference content (clans, disciplines, action definitions, artifact definitions, default map) is **template data** that is instantiated/copied per campaign so a campaign can be tuned without affecting others, and so a GM can edit the map and content for their campaign only.
- Data model must scope and index everything by campaign for isolation and performance at the scale of many concurrent campaigns.

## B5. Action Submission, Validation & the Round Lifecycle

- **Action window:** A round has an open submission window with a GM-set deadline. Players build an **ordered list** of actions (≤ their budget, including extra-action sources) plus, for Camarilla, their vote declaration; for Sabbat, the agreed scheme distribution.
- **Editing:** Players may add/remove/reorder actions freely until they lock in or the deadline passes.
- **Two-layer validation:**
  1. **Client-side (advisory):** immediate feedback — title/sect/discipline/artifact eligibility, blood affordability, target legality, "buffs before targets" ordering hints. Improves UX; never trusted.
  2. **Server-side (authoritative):** the source of truth. Re-validates everything before/at resolution. Illegal actions are rejected at submission where possible; actions that become impossible at resolution time fail and are **refunded** ([A6](#a6-the-action-system)).
- **Resolution trigger:** when all players have submitted or the deadline passes, the GM (or an automated trigger) runs resolution. Resolution is idempotent per round (re-running with the same inputs/seed is safe).
- **Scale target:** ~20 players × 4–6 actions ≈ 80–120 actions/round, plus minion actions. Resolution must comfortably handle this; it is not latency-critical (async play) but must be reliable and atomic.

## B6. Combat & Negotiation Subsystem

- Combats are **first-class, multi-step, timer-driven state machines** created during resolution and resolved through structured player interaction ([A12](#a12-combat)).
- Requirements: a private combat space per combat for the participants; **6-hour timers** at the stand-off, charge, and negotiation steps; secret blood-spend inputs at the Charge; deterministic dice at the Combat step; structured (and enforceable) transfer of promised blood/artifacts/minions/cities on a deal; the Press loop; and the wound-table application.
- Combats may **span round boundaries** (Fight for Control resolves at end of next round). The system must persist in-flight combats across resolutions and apply their outcomes at the correct phase.
- Non-binding promises (future actions/payments) are explicitly **not** enforced by the system — only immediate transfers are.

## B7. Character Creation Flow

- A guided, title-aware flow implementing [A3](#a3-character-creation): assign title (GM) → choose clan → choose starting minions (title options) → master disciplines (title count) → pick 2 of 4 starting upgrades → spend all starting EXP on the upgrade list → submit. The flow must enforce all title-specific constraints and the 12-EXP lifetime cap, and surface clan boon/curse and the random obsession/artifact assignments where the rules call for them.
- GM either assigns or approves the result; starting cities/artifacts/missions are granted per title.

## B8. GM Tooling

- **Campaign setup:** create campaign, set number of rounds (default 8) and deadlines, author/edit the **map** (cities, stats, adjacencies, ports, sea regions, starting specials/problems), assign titles/cities, manage invites and the player roster.
- **Round management:** open/close submission windows, view submission status, trigger resolution, and review the **full game log**.
- **Sanctioned overrides:** because some mechanics are GM-flavored in the tabletop ([Part C](#part-c--open-decisions-needed-before-build-complete)), the GM needs tools to inject the content those mechanics require (mission text, Investigate results, debate options, Wait-and-Strike condition approval, obsession assignment) — ideally pre-authored as content so normal resolution stays automatic, with a manual fallback. Overrides must be logged.
- **Replay/audit:** ability to inspect any round's inputs, seed, events, and per-player outputs.

## B9. Real-Time & Notifications

- Play is asynchronous, but the UI benefits from **live updates** when a round resolves, when a combat advances, when chat messages arrive, and when deadlines approach. Real-time delivery must respect the same per-player filtering as everything else (no hidden info pushed to unauthorized clients).
- Notifications (round resolved, your combat needs input, deadline soon) should be deliverable out-of-band.

## B10. Communication (Chat)

- The system provides **scoped chat channels** consistent with information hiding: an all-players channel, per-sect channels (Camarilla, Anarch, Sabbat), and ad-hoc/combat channels. Sabbat channel membership must reflect hidden identities (disguised Archbishops are in the Sabbat channel but appear to others as their disguise elsewhere).
- The tabletop **Information Rule** (retell in your own words, limited quoting, no screenshots of hidden info) remains a social rule for free-text chat; the system enforces hiding only for system-generated info.

## B11. Reference Content (Game Data) as a First-Class Asset

The following are **data, not code**, and must be editable/versionable without engine changes:
- 14 clans (disciplines, boon, curse), 14 disciplines (basic + mastered effects), ~60 action definitions (cost, stealth, type, eligibility, effect parameters), 30 artifacts, 5 minion types (costs, upkeep, traits, action sets), the map (cities/adjacencies/regions), debate templates, problem/special templates, mission templates.
- Engine behavior is driven by these definitions plus a fixed set of effect primitives. Adding/retuning content (e.g. a new artifact, a new debate) should be a data change.

## B12. Non-Functional Requirements

- **Correctness of information hiding** is the top priority; treat any leak as a sev-1 defect.
- **Determinism & reproducibility:** seeded resolution; full input/seed/output captured per round.
- **Atomicity & durability:** round resolution commits all-or-nothing; no partial states.
- **Auditability:** every mutation and VP change traceable to rule + event; GM log complete.
- **Scale:** many concurrent isolated campaigns; ~20 players each; ~8 rounds; resolution reliability over latency.
- **Testability:** the pure-function engine must be unit/scenario-testable headlessly with fixed seeds; information-hiding must have explicit "wrong player must not see X" tests.
- **Portability:** keep the engine and rules independent of UI and storage specifics so the stack can change.

---

# Part C — Open Decisions Needed Before Build-Complete

The tabletop rules delegate several mechanics to live GM judgment. To meet Pillar 3 (determinism, no per-action human input), each must be resolved into a deterministic rule or a structured content/input model. **Recommended defaults are proposed so the system can be built without further input; the GM-content approach is preferred where flavor matters.**

| # | Mechanic | Gap | Recommended resolution |
|---|---|---|---|
| 1 | **Wait and Strike / Harpy Wait and Strike conditions** | Free-text conditions need GM approval. | Define a **structured condition grammar** (trigger ∈ {enters, leaves, bleeds-in, minion-enters, …} × optional subject {any / faction / named vampire / minion}). Player builds the condition from menus; engine evaluates it during resolution. |
| 2 | **Sabbat scheme distribution** | "Agree before the round; clear to the GM." | Add a **pre-round Sabbat allocation step**: extra-action tokens (X+1) are assigned to Sabbat players; requires explicit confirmation from all Sabbat players (or unanimous-approval UI). If not all confirm by the deadline, tokens are forfeited. |
| 3 | **Troublemaker problems & disasters** | "Lower stability ⇒ worse problem." | Author a **problem table** keyed by stability band (and city), each problem a data-defined modifier with severity tiers; engine selects deterministically (seeded) from the band's pool. |
| 4 | **Investigate / Investigate Eye / Search results** | "GM gives info + hint." | Make problems/specials carry structured fields (origin, how-to-worsen, how-to-mend, interaction history). Investigate returns the relevant fields; the "hint" is a pre-authored content string per problem/special. |
| 5 | **Malkavian Prophecy** | "Unique info every round." | Pre-authored **prophecy pool** (flavor + occasionally a true game hint), drawn deterministically per round/player by seed. Decide whether prophecies are purely flavor or sometimes mechanically true. |
| 6 | **Dementation (basic) & Crown of Malkav** | "Screenshot from a random chat." | Decide policy given the Information Rule: recommend a **sanitized excerpt** of a random *public/sect* message the requester is otherwise entitled to, or a redacted snippet — never private hidden content. Define exactly which channels are eligible. |
| 7 | **(M)Chimerstry "information highway"** | Player-authored 250-word post the GM places. | Define the **"information highway"** as a public news sub-feed; allow the player to author and self-place the post (length-capped), no GM step. |
| 8 | **Toreador "Obsession"** | "GM generates a random obsession." | Engine generates a random obsession (artifact/city/minion) at creation from eligible targets via seed; store it on the character; evaluate the curse at end of round. |
| 9 | **Ivory Tower debate authoring** | "Each round a debate with 2–4 options." | Author a **debate template library** (each with options + data-defined effects, including the Inner-Circle +1 VP option). Engine picks/schedules debates; GM may override/curate. Define the special **replacement-election** debate flow when an Inner Circle/Justicar is removed. |
| 10 | **Justicar Missions** | "Get a mission; complete for VP/blood." | Author a **mission library** with machine-checkable completion conditions (e.g. "burn a Sabbat," "raise MS in city X to 5") and rewards; engine assigns and auto-checks at phase 4c. Define the Archon-loyalty link (mission completed ⇒ no counter loss). |
| 11 | **Failed-action refund** | Rulebook says refund; prototype assumed no-refund. | **Adopt the canonical refund rule** (refund cost when an action can't resolve) and inform the player via their update. |
| 12 | **Win/end conditions edge cases** | Final scoring at round 8; masquerade collapse ends early. | Confirmed: highest VP after round 8 wins; torpid/burned = 0 VP; >50% cities violated ends the game immediately. **Decide tie-breakers** (e.g. blood, cities, fewest losses) — currently undefined. |
| 13 | **"Hunt for Me" (Vestment of Vileness zombie action)** | Action referenced but not defined in the catalogue. | Define this minion action (likely a basic bleed-for-master) as data before shipping that artifact. |
| 14 | **Map as content** | Reference map exists in seed; rules use generic examples. | Treat the map as **GM-authored data** per campaign; ship the 18-city British Isles map as the default template. Confirm canonical adjacency/port/region lists with the GM before locking the default. |

---

*End of specification. Part A is rules-complete against `game_design.txt`; Part B captures the platform design decisions as technology-independent requirements; Part C lists every decision still required for a fully deterministic, build-complete system, each with a recommended default so the build can proceed.*
