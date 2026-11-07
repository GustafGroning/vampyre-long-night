# Rules vs Implementation — Fullständig gapanalys

**Datum:** 2026-03-19
**Källa:** game_design.txt (kompletta spelregler) vs kodbasen

---

## Vad som FINNS (frontend + databas)

### Fullt implementerat i UI
- Login, kampanjlista, spelvy med karta
- Aktionsbyggare: kategorifilter (faction/personal/discipline/artifact/minion), sekt/titel/discipline-krav, target-väljare (stad, spelare), ordering, blodkostnad-visning, trifle-badge
- Spelarstatistik: blod, VP, strength, stealth, intercept, royal_privileges, torpor-status, klan, titel
- Stadsvy: stability, blood_flow, masquerade_status, intercept, controller, contested, port, specials, problems, vampyrer/minions i staden
- Karta: 18 städer, adjacencies, fraktionsfärger, contested-overlay, hamn-badge, storm-ikon
- Rundhistorik: personliga uppdateringar + publika nyheter

### Finns i databas men ingen logik
- `action_definitions` — ~60 aktionstyper med kostnad, stealth, krav
- `combat_records` — tomt, ingen kamplogik
- `debates` — Ivory Tower-tabell, ingen voting-UI
- `sabbat_bases` — tabell finns, ingen UI eller logik
- `game_log` — GM-only logg, ingen skrivare (resolve-round ska skriva)

---

## Vad som SAKNAS — sorterat efter prioritet

### Nivå 1: Blockerare för spelbar prototyp

**1. resolve-round Edge Function (spelmotorn)**
Utan denna kan ingen runda avslutas. Ska hantera:
- Rundordning: betala aktioner/minion-upkeep → start-of-round effects → resolva aktioner (alla #1 först i slumpad ordning, sedan #2, etc.) → end-of-round effects → income
- Hunt rolls (D4 + intercept vs D4 + stealth)
- Stealth/intercept-filtrering → personaliserade round_updates
- Blod-income från kontrollerade städer
- Minion upkeep (burn om ej betalt)

**2. GM-dashboard (minimal)**
- Trigga resolve-round
- Se game_log
- Starta/avsluta ronder

### Nivå 2: Krävs för meningsfull gameplay

**3. Aktionsresolution — alla kategorier**
Resolve-round behöver hantera:

Faction-aktioner:
- Give, Investigate, Troublemaker, Fight for control, Search, Conquer new territory
- Camarilla: Control the masquerade, Claim credit, Buy votes, Invite to camarilla
- Prince: Build my kingdom (7 val), Second tradition, Expansion, Recruit primogen, Sabotage, Go anarch
- Justicar: Orders from the top, Iron fist, Investigate the sabbat, Expose the sabbat, Recruit archon
- Inner circle: Bottomless wealth, Reward loyalty, Fifth tradition, Punish treason, Pardon
- Anarch: Anarch highway, Anarch free press, Anarch mission, Anarch sabotage
- Baron: Anarch revolt (revoltkounter-system), Organize resistance
- Sabbat: Sabbat sabotage
- Archbishop: Build the base, Burn the weak, Spreading truth, Shovelhead, Esbat, Call a crusade, Conquer in name of Cain

Personal-aktioner:
- Move, Bleed, Watchful eyes, In the shadows, Blood for blood, Attack!, Wait and strike, Bestow gifts, Get a minion, Grow in power, Awaken, Diablerie, Hide, Steal artifact, Look for artifacts, Sail, Summon the storm

Discipline-aktioner (14 st, basic + mastered):
- Animalism, Auspex, Celerity, Chimestry, Dementation, Dominate, Fortitude, Obfuscate, Oblivion, Protean, Potence, Presence, Thaumaturgy, Vicissitude

Artifact-aktioner (30 st):
- Aaron's Feeding Razor, Black Gloves, Giant's Blood, Hand of Conrad, etc.

Minion-aktioner (per typ):
- Ghoul: Move, Sail, Bleed the enemy, Partner in crime, Sabotage, Move the master
- Harpy: Move, Sail, Wait and strike, Bodyguard, Suicide mission, Guard the master
- Eye: Move, Sail, Investigate, Hide and spy, Keep an eye on them, Hide the master
- Primogen: Build on master's kingdom
- Archon: Movement (2 steg), Sail, Attack, Bodyguard, Follow them, Sabbat interrogations, The master's will

**4. Klan-boons och curses**
14 klaner med unika regler:
- Ventrue: +10 blod/runda, -10 på bleed
- Brujah: 25% frenzy-chans, billigare faction efter combat
- Gangrel: +1 hunt, kan ej förhandla vid förlust
- Nosferatu: +1 intercept vid obfuscate, move kostar +5
- Malkavian: random info/runda, 25% chans att flytta slumpmässigt
- Lasombra: oblivion → undetectable, ej trifle om lägre blod
- Etc.
**Status:** Klan lagras i DB men inga boon/curse-effekter tillämpas

**5. Combat-system**
6 steg: standoff → charge → combat (D4+str) → negotiation → press → ends
Wound table (2D6): 2-3 burned, 4-6 torpor (val), 7-9 torpor (domain), 10-12 flee
Minion-combat (förenklat, ingen förhandling)
Ambush: extra D4 vid högre stealth
**Status:** Discord-baserat tills vidare, men resolve-round måste kunna trigga combat

**6. Ivory Tower (Camarilla-debatter)**
Varje runda: debatt med 2-4 alternativ, röstning baserat på titel
No title=1, Prince=2, Justicar=3, Inner Circle=4
Buy votes-aktion för extra röster
**Status:** DB-tabell finns, ingen UI eller logik

**7. Sabbat-bassystem**
Dolda baser, lvl 1-3, delade mellan Sabbat-spelare
Effekter: +stealth, +5 blod/lvl/runda, adjacency-bonus
Crusade exponerar archbishop
**Status:** DB-tabell finns, ingen UI eller logik

### Nivå 3: Viktiga regler att implementera

**8. Masquerade violation cascade**
MS=0 → blood hunt på controller, -1 MS på adjacent städer
>50% städer i violation → spelet slut
Första violation i Camarilla-stad: ingen blood hunt

**9. Blood hunt-system**
Justicars får mission att jaga, icke-Justicars får 150 blod + 2VP
Camarilla-medlem som triggar → förlorar titel
Prince kan använda royal privilege istället

**10. Contest-system**
50 blod/runda att contesta, -1 stability/-1 MS per runda
Tre sätt att vinna: deal, Fight for control, motståndare torpor/burned

**11. VP-system per titel**
Inner Circle: 3VP start, +3 var annan runda, +1VP i debatter
Justicar: 2VP per sabbat till torpor/burned, missions
Prince: 8VP per erövrad stad, +1VP/extra stad/runda, influence vid kampanjslut
Baron: 6VP per erövrad stad, +1VP/extra stad/runda, 2VP per diablerie, revolt-VP
Archbishop: 1VP per bränd minion, 2VP per masquerade violation, 3VP delat vid erövring, 10VP vid burned inner circle

**12. Torpor-regler**
Max 1 aktion (Awaken), kan göra minion-aktioner
0 VP vid slutscoring
3 awaken-ticks för att lämna torpor

**13. Missions (Justicar)**
Fås via Inner Circle eller Orders from the top
Belönar blod + VP vid completion

**14. Royal Privileges (Prince)**
Förhindrar blood hunt (1 privilege istället)
Kan spenderas för +1 aktion per runda

**15. EXP/Grow in Power**
50 blod = 1 EXP, max 12 EXP per kampanj
Upgrades: discipline, mastery, +1 stat, random artifact

**16. Sabbat schemes**
X+1 extra aktioner (X = antal sabbat), delas mellan spelare
Kräver enighet

**17. Influence-system (Prince)**
Build my kingdom → +influence
VP = influence i kontrollerade städer vid kampanjslut

**18. Storm-system**
Summon the storm (100 blod) → blockerar sailing i havsregion

---

## Sammanfattning

| Kategori | Antal regler/mekaniker | Implementerat | Saknas |
|----------|----------------------|---------------|--------|
| Frontend UI | 14 komponenter | 14 | 0 |
| Aktionstyper | ~60 | 0 (definition i DB) | ~60 (resolution) |
| Klan-effekter | 28 (14 boons + 14 curses) | 0 | 28 |
| Discipline-aktioner | 28 (14 basic + 14 mastered) | 0 | 28 |
| Artifact-aktioner | 30 | 0 | 30 |
| Minion-aktioner | ~30 | 0 | ~30 |
| Övriga mekaniker | 18 | 0 | 18 |

**Frontend = klart. Backend/spelmotor = allt kvar att göra.**
