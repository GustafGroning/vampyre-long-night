# Research: Komplett aktionsreferens

**Datum:** 2026-03-19
**Källa:** Spelregeltext från GM (RatLord)
**Syfte:** Fullständig referens för implementation av alla action handlers i resolve-round

---

## Innehåll

1. [Discipline Actions](#1-discipline-actions)
2. [Personal Actions](#2-personal-actions)
3. [Faction Actions (gemensamma)](#3-faction-actions-gemensamma)
4. [Camarilla Actions](#4-camarilla-actions)
5. [Anarch Actions](#5-anarch-actions)
6. [Sabbat Actions](#6-sabbat-actions)
7. [Minion Actions](#7-minion-actions)
8. [Implementationsnoteringar](#8-implementationsnoteringar)

---

## 1. Discipline Actions

### Animalism (basic)
- **Effekt:** Om du gör hunt roll(s) denna runda, slå +3 D4 och välj bästa.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable

### Animalism (M)
- **Effekt:** Välj ett:
  - Skicka vargar att jaga blod i alla adjacent cities. De jagar för 1 D10 i varje adjacent city.
  - Skicka fåglar att spionera. +2 personal intercept resten av rundan.
  - Skicka råttor att sabotera. -1 intercept på en adjacent city.
- **Kostnad:** 10 Blood
- **Stealth:** +2

### Auspex (basic)
- **Effekt:** Namnge en vampyr. Välj två:
  - Lär dig den lägsta stealth faction action vampyren utfört denna runda.
  - Lär dig den högsta stealth personal action vampyren utfört.
  - Lär dig alla actions utförda av vampyrens minions som är i samma stad som dig.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable
- **Trifle**

### Auspex (M)
- **Effekt:** Välj ett:
  - Namnge en vampyr och gör hunt roll. Vid success: lär dig alla städer vampyren var i denna runda, i ordning, och hur de flyttade. Även om moves är undetectable.
  - Lär dig platsen för upp till 5 artefakter, vampyrer eller minions (namnge alla).
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Celerity (basic)
- **Effekt:** Dina nästa två actions resolvas omedelbart (före andra spelares actions på samma action_order).
- **Kostnad:** 10 Blood
- **Stealth:** +0
- **Implementation:** Sätter `celerity_remaining = 2` på spelaren. Dispatchern ger prioritet.

### Celerity (M)
- **Effekt:** Flytta upp till 3 städer bort. Om du använt Oblivion blir dessa moves Undetectable.
- **Kostnad:** 20 Blood
- **Stealth:** +0

### Chimerstry (basic)
- **Effekt:** Namnge en adjacent city och en vampyr (ej controllern). Controllern får falskt meddelande att den namngivna vampyren är i deras stad.
- **Kostnad:** 10 Blood
- **Stealth:** +2
- **Trifle**

### Chimerstry (M)
- **Effekt:** Skriv ett meddelande (max 250 ord) som GM postar i information highway vid nästa news update. Du väljer var.
- **Kostnad:** 15 Blood
- **Stealth:** +2
- **Notering:** GM-beroende — behöver deterministisk ersättning eller borttagning.

### Dementation (basic)
- **Effekt:** GM skickar en screenshot från en slumpmässig chatt.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable
- **Trifle**
- **Notering:** GM-beroende — behöver deterministisk ersättning eller borttagning.

### Dementation (M)
- **Effekt:** Namnge en vampyr och gör hunt roll. Vid success: målet utför en av följande actions i slutet av rundan (du väljer): Move, Bleed eller Investigate. Målet för aktionen randomiseras.
- **Kostnad:** 10 Blood
- **Stealth:** +3
- **Notering:** Investigate-alternativet behöver ersättas om Investigate tas bort.

### Dominate (basic)
- **Effekt:** Namnge en vampyr eller minion i samma stad och en stad. Gör hunt roll. Vid success: flytta den namngivna till den valda staden vid rundans slut. Målet kan inte flytta som sin första action nästa runda. Använder målets stealth.
- **Kostnad:** 0 Blood
- **Stealth:** +1

### Dominate (M)
- **Effekt:** Namnge en minion en annan vampyr kontrollerar. Om du är i samma stad och gör hunt roll: vid success tar du kontroll över minionen.
- **Kostnad:** 25/50/100 Blood (beroende på minion lvl 1/2/3)
- **Stealth:** +0

### Fortitude (basic)
- **Effekt:** Om du bränns denna runda, gå till torpor istället. Om du skulle gå till torpor behöver du bara Awaken en gång.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Fortitude (M)
- **Effekt:** Nästa gång du pressar i combat är det gratis.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable
- **Trifle**

### Obfuscate (basic)
- **Effekt:** +4 stealth på en personal eller discipline action.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable

### Obfuscate (M)
- **Effekt:** Nästa hunt roll som riktas mot dig denna runda misslyckas.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Oblivion (basic)
- **Effekt:** Namnge en vampyr. Om den vampyren gör Move eller Grow in power denna runda blir det Undetectable.
- **Kostnad:** 10 Blood
- **Stealth:** +1

### Oblivion (M)
- **Effekt:** Gör upp till 2 av dina minion actions Undetectable.
- **Kostnad:** 15 Blood
- **Stealth:** +2

### Protean (basic)
- **Effekt:** Välj ett: +1 Strength, +1 Stealth, eller +1 Intercept resten av rundan.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Protean (M)
- **Effekt:** Omfördela dina bas-stats (Stealth, Intercept, Strength). Ej modifiers.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Potence (basic)
- **Effekt:** Denna runda i combat: GM slår +3 dice och väljer bästa. Om du vinner combat får förloraren -1 på wound table.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable

### Potence (M)
- **Effekt:** Namnge en lvl 2 eller lägre minion i samma stad. Gör hunt roll, vid success bränn minionen. Första gången per runda du gör detta: +2 strength resten av rundan.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### Presence (basic)
- **Effekt:** +4 stealth på en faction action du utför denna runda, eller ge +4 stealth till en annan vampyrs faction action.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable

### Presence (M)
- **Effekt:** Utför valfri faction action som inte kräver titel. Kan bara göras en gång per runda.
- **Kostnad/Stealth:** Samma som den valda actionen.

### Thaumaturgy (basic)
- **Effekt:** Ge tillgång till en discipline action till en vampyr (du väljer) för denna och nästa runda.
- **Kostnad:** 10 Blood
- **Stealth:** -1
- **Trifle**

### Thaumaturgy (M)
- **Effekt:** Välj ett:
  - Bränn en artefakt du kontrollerar och namnge en vampyr i samma stad. Artefaktens special action blir permanent tillgänglig för den vampyren, men kostar originalkostnad +10 blood.
  - Skapa en artefakt med en special action som har samma förmåga som en basic discipline du har. Samma kostnad och stealth. Du bär artefakten.
- **Kostnad:** 50 Blood
- **Stealth:** +0

### Vicissitude (basic)
- **Effekt:** Välj ett:
  - Få en Lvl 1 Ghoul, Harpy eller Eye minion.
  - Bränn två lvl 1 minions av samma typ du kontrollerar, i samma stad. Få en Lvl 2 minion av den typen.
  - Bränn två lvl 2 minions av samma typ du kontrollerar, i samma stad. Få en Lvl 3 minion av samma typ.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### Vicissitude (M)
- **Effekt:** Ändra en minion från en typ till en annan (ej Primogen eller Archon).
- **Kostnad:** 0 Blood
- **Stealth:** +1

---

## 2. Personal Actions

### Move
- **Effekt:** Flytta till en adjacent city. Justicar: Trifle.
- **Kostnad:** 10 Blood (5 om Justicar)
- **Stealth:** +2

### Bleed
- **Effekt:** Bleed staden du är i. I din domain: 2D10x5. Annars: 1D10x5. Stadens blood flow minskar med bleed-beloppet denna runda. Kan inte få mer blod än stadens blood flow.
- **Kostnad:** 0 Blood
- **Stealth:** +0

### Watchful Eyes
- **Effekt:** +1 personal intercept denna runda. Max en gång per runda.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### In the Shadows
- **Effekt:** +1 personal stealth denna runda. Max en gång per runda.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### Blood for Blood
- **Effekt:** +1 personal strength denna runda. Max en gång per runda.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### Attack!
- **Effekt:** Namnge vampyr/minion i samma stad. Hunt roll, vid success: combat. Om din stealth > deras intercept: Ambush.
- **Kostnad:** 0 Blood
- **Stealth:** -1

### Wait and Strike
- **Effekt:** Välj stad du är i, sätt villkor. Hunt roll görs. Du jagar nästa vampyr/minion som uppfyller villkoret. Avbryts om du lämnar staden.
- **Kostnad:** 0 Blood
- **Stealth:** +2
- **Exempel:** "when an anarch bleeds in the city", "If anyone enters the city", "If a minion enters the city", "When X leaves the city"
- **Notering:** Villkoren behöver vara deterministiskt parsningsbara för automatisk resolution.

### Bestow Gifts
- **Effekt:** Ge en minion +1 Lvl permanent. Max lvl 3.
- **Kostnad:** 25 Blood
- **Stealth:** +1

### Get a Minion
- **Effekt:** Rekrytera en minion.
  - Ghoul: 25/50/75 (lvl 1/2/3)
  - Harpy: 30/60/90 (lvl 1/2/3)
  - Eye: 20/40/60 (lvl 1/2/3)
- **Stealth:** +0

### Grow in Power
- **Effekt:** 1 EXP per 50 blood. Spendera EXP direkt.
- **Kostnad:** 50X Blood
- **Stealth:** +0
- **Trifle**

### Awaken
- **Effekt:** Om i torpor: enda tillåtna action. Tre gånger = lämna torpor. Andra vampyrer i samma stad kan göra detta åt dig.
- **Kostnad:** 0 Blood
- **Stealth:** +3

### Diablerie
- **Effekt:** Namnge en vampyr i torpor i samma stad. Hunt roll. Vid success, välj:
  - Bränn dem och få en av deras disciplines + permanent +1 Strength/Stealth/Intercept. Kan trigga blood hunt.
  - Bara bränn dem. Triggar inte blood hunt.
- **Kostnad:** 0 Blood
- **Stealth:** -1

### Hide
- **Effekt:** +5 stealth denna runda. Inga fler actions denna runda.
- **Kostnad:** 10 Blood
- **Stealth:** Undetectable

### Steal an Artifact
- **Effekt:** Namnge artefakt i samma stad. Hunt roll mot bäraren (din stealth vs deras intercept, omvänt). Vid success: ta artefakten.
- **Kostnad:** 15 Blood
- **Stealth:** +0

### Look for Artifacts
- **Effekt:** Namnge vampyr, hunt roll. Vid success: lär dig alla artefakter de bär.
- **Kostnad:** 10 Blood
- **Stealth:** +1
- **Trifle**

### Sail
- **Effekt:** Från port-stad, flytta till annan port-stad i samma sea region. Ej vid storm.
- **Kostnad:** 15 Blood
- **Stealth:** +0

### Summon the Storm
- **Effekt:** Namnge sea region. Vid start av nästa runda: storm i regionen till rundans slut.
- **Kostnad:** 100 Blood
- **Stealth:** +1

---

## 3. Faction Actions (gemensamma)

### Give
- **Effekt:** Ge valfri mängd blood, minions eller artefakter till en vampyr/NPC. Kostar inte action slot.
- **Kostnad:** 0 Blood
- **Stealth:** +1

### Investigate
- **Effekt:** Namnge stad och problem/special. GM ger info och hint.
- **Kostnad:** 20 Blood
- **Stealth:** +1
- **Notering:** GM-beroende — behöver deterministisk ersättning eller borttagning.

### Troublemaker
- **Effekt:** Namnge stad. Skapa problem. Lägre stability = värre problem. 0 stability = disaster.
- **Kostnad:** 30 Blood
- **Stealth:** +0

### Fight for Control
- **Effekt:** Kräver att du contestar staden. Andra contestants väljer fight eller flee. Flee = du tar kontroll. Fight = combat i slutet av nästa runda, vinnaren tar kontrollen.
- **Kostnad:** 25 Blood
- **Stealth:** -3

### Search
- **Effekt:** Namnge stad i din domain. Lista alla vampyrer/minions med stealth lägre än din eller stadens intercept. 25% chans att hitta artefakt.
- **Kostnad:** 20 Blood
- **Stealth:** +0

### Conquer New Territory
- **Effekt:** Contesta staden du är i. Kräver ingen titel.
- **Kostnad:** 150 Blood
- **Stealth:** Can't be hidden

---

## 4. Camarilla Actions

### Control the Masquerade
- **Effekt:** Namnge stad, +1 masquerade status.
- **Kostnad:** 10 Blood
- **Stealth:** +1
- **Trifle**

### Claim Credit
- **Effekt:** Kräver att en Prince tar ny stad eller Justicar slutför blood hunt. Stjäl 1 VP. Max 6 VP per runda. En gång per runda.
- **Kostnad:** 25 Blood (0 om Inner Circle)
- **Stealth:** -2

### Buy Votes
- **Effekt:** 10 blood = +1 röst i Ivory Tower. Kostar inte action slot.
- **Kostnad:** X Blood
- **Stealth:** +0

### Invite to the Camarilla
- **Effekt:** Namnge anarch. De får val att gå med. Baron -> Prince. Nästa runda: max 1 action.
- **Kostnad:** 10 Blood
- **Stealth:** -2

### Build My Kingdom (Prince only)
- **Effekt:** Namnge stad, välj 3 (ej samma mer än en gång). Max en gång per stad per runda:
  - +1 intercept (10 blood)
  - +1 stability (10 blood)
  - +25 blood flow (50 blood)
  - Special: Camarilla Order — nästa Troublemaker mot staden misslyckas, sedan bränn (15 blood)
  - Special: Secure Haven — nästa Attack mot controllern misslyckas, sedan bränn. Stoppar ej Fight for Control (10 blood)
  - Special: Camarilla Ball — alla princes i staden får 1 Royal Privilege vid end of round, sedan bränn (25 blood)
  - +2 influence i staden (15 blood)
- **Kostnad:** X Blood
- **Stealth:** Can't be hidden

### Second Tradition (Prince only)
- **Effekt:** Namnge vampyr/minion i din domain. Hunt roll med +2 intercept. Vid success: combat. Du kan ta med valfritt antal Harpies i din domain. Medtagna minions kan inte agera denna runda. Du och minions flyttar till målets stad vid success.
- **Kostnad:** 15 Blood
- **Stealth:** +0

### Expansion (Prince only)
- **Effekt:** Namnge adjacent city till en du kontrollerar. Välj:
  - Betala (stadens blood_flow x 10). Du blir controller. Förre controllern förlorar stad och titel. Score VP.
  - Flytta till staden och contesta. Du kan ta med minions i samma stad, men de kan inte agera denna runda.
- **Kostnad:** 50 Blood
- **Stealth:** -2

### Recruit a Primogen (Prince only)
- **Effekt:** Namnge stad i din domain. Få lvl 1/2/3 Primogen.
- **Kostnad:** 40/80/120 Blood
- **Stealth:** +0

### Sabotage (Prince only)
- **Effekt:** -1 stability eller -1 intercept på en stad.
- **Kostnad:** 20 Blood
- **Stealth:** +0

### Go Anarch
- **Effekt:** Förlora Camarilla-tag och titel. Prince -> Baron. Måste vara enda action denna runda.
- **Kostnad:** 0 Blood
- **Stealth:** Can't be hidden

### Orders from the Top (Justicar only)
- **Effekt:** Få en Mission.
- **Kostnad:** 0 Blood
- **Stealth:** Undetectable
- **Trifle**
- **Notering:** GM-beroende — behöver deterministisk ersättning eller borttagning.

### Iron Fist of the Camarilla (Justicar only)
- **Effekt:** Namnge vampyr/minion. Lär dig vilka städer de var i förra rundan och var de slutade.
- **Kostnad:** 20 Blood
- **Stealth:** +0

### Investigate the Sabbat (Justicar only)
- **Effekt:** Namnge stad. Lär dig alla Sabbat-actions som riktat sig mot staden denna och förra rundan (inkl. vilken runda).
- **Kostnad:** 10 Blood
- **Stealth:** +1

### Expose the Sabbat! (Justicar only)
- **Effekt:** Namnge Prince/Baron i samma stad. Om de är Sabbat: D4, allt utom 1 = exposed + 4 VP. Om de inte är Sabbat: -2 VP. En gång per runda.
- **Kostnad:** 50 Blood
- **Stealth:** Can't be hidden

### Recruit an Archon (Justicar only)
- **Effekt:** Få lvl 1/2/3 Archon i samma stad. Kräver avklarad mission denna runda.
- **Kostnad:** 25/50/75 Blood
- **Stealth:** +1

### Bottomless Wealth of the Camarilla (Inner Circle only)
- **Effekt:** +250 Blood. Kan inte flytta denna runda. En gång per runda.
- **Kostnad:** 0 Blood
- **Stealth:** +0

### Reward Loyalty (Inner Circle only)
- **Effekt:** Namnge Prince eller Justicar. Prince: +1 Royal Privilege. Justicar: +50 Blood. En gång per runda.
- **Kostnad:** 25 Blood
- **Stealth:** +1
- **Trifle**

### Fifth Tradition (Inner Circle only)
- **Effekt:** Om du är i en Camarilla-stad: få all info som Prince får från stadens intercept + all info Princes i adjacent Camarilla-städer får.
- **Kostnad:** 30 Blood
- **Stealth:** -1

### Punish Treason (Inner Circle only)
- **Effekt:** Namnge Camarilla-vampyr. -25 blood vid end of round. Max en gång per vampyr per runda.
- **Kostnad:** 0 Blood
- **Stealth:** +0

### Pardon (Inner Circle only)
- **Effekt:** Namnge vampyr med blood hunt. Blood hunt avbryts vid end of round.
- **Kostnad:** 25 Blood
- **Stealth:** Can't be hidden

---

## 5. Anarch Actions

### Anarch Highway
- **Effekt:** Flytta upp till 2 minions till adjacent city.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### Anarch Free Press
- **Effekt:** +2 intercept på en stad resten av rundan.
- **Kostnad:** 10 Blood
- **Stealth:** +2
- **Trifle**

### Anarch Mission
- **Effekt:** Namnge minion, +1 action denna runda. Max +1 extra action per minion per runda.
- **Kostnad:** 15 Blood
- **Stealth:** +1

### Anarch Sabotage
- **Effekt:** -1 stability eller -1 intercept på en stad.
- **Kostnad:** 15 Blood
- **Stealth:** +0
- **Trifle**

### Anarch Revolt (Baron only)
- **Effekt:** Namnge stad med stability 1 eller lägre. Placera 1 revolt counter. Välj ett per revolt counter på staden:
  - D4 per Camarilla/Sabbat-minion i staden. Om D4 > minion lvl: bränn.
  - Om stadskontrollanten är i staden: flytta dem till random adjacent vid end of round, förlora D100 blood.
  - Bleed för halva stadens kvarvarande blood flow. Staden förlorar -10 blood flow permanent.
  - Få 2 lvl 1 Ghouls eller Harpies i staden.
  - Flytta till staden och contesta.
  - Vid 5 revolt counters: ta kontroll, ta bort alla revolt counters, -10 blood flow permanent.
- Sedan: +1 VP, staden -1 MS. Max en gång per stad per runda.
- **Kostnad:** 50 Blood
- **Stealth:** -3

### Organize Resistance (Baron only)
- **Effekt:** Bränn minion i din domain. Välj X (X = burned minion's lvl):
  - Anarch city +1 stability
  - Anarch city +1 intercept
  - Anarch city +1 MS
  - City du kontrollerar: +50 blood, -1 MS
  - City du kontrollerar: ge special (Anarch Stronghold, Anarch Political Hub, eller Anarch Free Press)
- **Kostnad:** 25 Blood
- **Stealth:** +0

---

## 6. Sabbat Actions

### Sabbat Sabotage
- **Effekt:** Stad -1 MS eller -1 intercept.
- **Kostnad:** 15 Blood
- **Stealth:** +2

### Build the Base (Archbishop only)
- **Effekt:** Namnge stad som matchar din disguise-sect eller redan har Sabbat-bas. Ingen bas: skapa lvl 1. Bas finns: +1 lvl (max 3).
- **Bas-effekter:**
  - +X stealth på Sabbat faction actions mot staden (X = bas lvl)
  - Alla Sabbat-spelare: +5 blood per bas-lvl vid end of round
  - Staden räknas som adjacent för Sabbat-actions
- **Kostnad:** 25 Blood
- **Stealth:** +3

### Burn the Weak! (Archbishop only)
- **Effekt:** Namnge stad med Sabbat-bas. D4 per minion med lvl <= bas-lvl. Om D4 > minion lvl: bränn.
- **Kostnad:** 10 Blood
- **Stealth:** +2

### Spreading the Truth of Cain (Archbishop only)
- **Effekt:** Välj upp till 3 städer med Sabbat-baser. Alla får -1 stability, -1 MS, -1 intercept. En gång per runda.
- **Kostnad:** 20 Blood
- **Stealth:** +1

### Shovelhead Attack! (Archbishop only)
- **Effekt:** Namnge stad med lvl 3 Sabbat-bas. D4 per non-sabbat minion (>lvl = bränn). Staden: -2 stability, -2 MS, -25 blood flow i 2 rundor. +2 VP. Basen reduceras till lvl 1. En gång per runda.
- **Kostnad:** 50 Blood
- **Stealth:** +0

### Esbat (Archbishop only)
- **Effekt:** Namnge stad med Sabbat-bas. Bleed XD10x2 (X = bas lvl). Kan välja: istället för blood, score 1 VP per 20 blood (måste väljas vid action submission). En gång per runda.
- **Kostnad:** 10 Blood
- **Stealth:** +2

### Call a Crusade! (Archbishop only)
- **Effekt:** +250 blood, +2 lvl 2 minions, +1 extra action nästa runda. Du blir exposed.
- **Kostnad:** 0 Blood
- **Stealth:** Can't be hidden

### Conquer in the Name of Cain! (Archbishop only, exposed)
- **Effekt:** Namnge adjacent city. Flytta dit och contesta. Kräver exposed.
- **Kostnad:** 100 Blood
- **Stealth:** Can't be hidden

---

## 7. Minion Actions

### 7.1 Ghoul Actions

#### Move (Ghoul)
- **Effekt:** Flytta till adjacent city.
- **Kostnad:** 5 Blood
- **Stealth:** +0

#### Sail (Ghoul)
- **Effekt:** Port till port i samma sea region. Ej vid storm.
- **Kostnad:** 15 Blood
- **Stealth:** +0

#### Bleed the Enemy
- **Effekt:** Bleed i staden. XD10x2 (X = minion lvl). Stadens blood flow minskar.
- **Kostnad:** 0 Blood
- **Stealth:** +1

#### Partner in Crime
- **Effekt:** Om i samma stad som ägaren: +X stealth på varje action ägaren utfört (X = minion lvl) resten av rundan.
- **Kostnad:** 10 Blood
- **Stealth:** +0

#### Sabotage (Ghoul)
- **Effekt:** Staden -1 stability eller -1 intercept.
- **Kostnad:** 15 Blood
- **Stealth:** +2

#### Move the Master
- **Effekt:** Om ägaren är i torpor: flytta ägaren till minionens stad.
- **Kostnad:** 10 Blood
- **Stealth:** +2

### 7.2 Harpy Actions

#### Move (Harpy)
- **Effekt:** Flytta till adjacent city.
- **Kostnad:** 5 Blood
- **Stealth:** +0

#### Sail (Harpy)
- **Effekt:** Port till port i samma sea region. Ej vid storm.
- **Kostnad:** 15 Blood
- **Stealth:** +0

#### Wait and Strike (Harpy)
- **Effekt:** Samma som vampyr-versionen men för minion. Välj stad, sätt villkor, hunt roll.
- **Kostnad:** 0 Blood
- **Stealth:** +2

#### Bodyguard (Harpy)
- **Effekt:** Om ägaren är i samma stad och går in i combat: +strength lika med minion lvl.
- **Kostnad:** 10 Blood
- **Stealth:** +0

#### Suicide Mission
- **Effekt:** Namnge special i samma stad. D4: om <= minion lvl: ta bort specialen. Om > minion lvl: bränn minionen.
- **Kostnad:** 10 Blood
- **Stealth:** -2

#### Guard the Master
- **Effekt:** Om ägaren är i torpor och samma stad: anfall alla vampyrer som försöker diablerie mot ägaren. +1 strength i denna combat.
- **Kostnad:** 10 Blood
- **Stealth:** +1

### 7.3 Eye Actions

#### Move (Eye)
- **Effekt:** Flytta till adjacent city.
- **Kostnad:** 5 Blood
- **Stealth:** +0

#### Sail (Eye)
- **Effekt:** Port till port i samma sea region. Ej vid storm.
- **Kostnad:** 15 Blood
- **Stealth:** +0

#### Investigate Eye
- **Effekt:** Namnge problem/special i samma stad. Välj X frågor (X = minion lvl):
  - Vad är ursprunget till problem/special?
  - Hur kan jag göra det värre/bättre?
  - Vilka andra vampyrer/minions har interagerat med detta?
  - Finns det info utöver ovan frågor?
- **Kostnad:** 10 Blood
- **Stealth:** +2
- **Notering:** Svaren är potentiellt GM-beroende — behöver deterministisk datakälla.

#### Hide and Spy
- **Effekt:** +2 stealth och +2 intercept denna och nästa runda. Kan inte agera nästa runda.
- **Kostnad:** 0 Blood
- **Stealth:** +1

#### Keep an Eye on Them
- **Effekt:** Namnge vampyr i samma stad. Hunt roll. Vid success, välj en fråga:
  - Hur mycket blood har vampyren?
  - Vilka artefakter har den?
  - Har den mer VP än mig?
- **Kostnad:** 10 Blood
- **Stealth:** +2

#### Hide the Master
- **Effekt:** Om ägaren är i torpor och samma stad: ägaren får +stealth lika med minion lvl mot hunt rolls för diablerie.
- **Kostnad:** 10 Blood
- **Stealth:** +0

### 7.4 Primogen Actions

#### Build on the Master's Kingdom
- **Effekt:** Staden får en bonus per minion lvl. Välj:
  - +1 Stability
  - +1 Intercept
  - +1 Masquerade Status
  - +1 Influence
  - Special: Elysium (+1 röst i Ivory Tower för controllern. Kan byggas flera gånger.)
  - Special: Camarilla Order (nästa Troublemaker misslyckas, sedan bränn)
  - Special: Secure Haven (nästa Attack mot controllern misslyckas, sedan bränn. Ej Fight for Control.)
- **Kostnad:** 0 Blood
- **Stealth:** Can't be hidden

### 7.5 Archon Actions

#### Archon Movement
- **Effekt:** Flytta till adjacent city, sedan flytta igen (2 steg totalt).
- **Kostnad:** 5 Blood
- **Stealth:** +2

#### Sail (Archon)
- **Effekt:** Port till port i samma sea region. Ej vid storm.
- **Kostnad:** 15 Blood
- **Stealth:** +0

#### Attack (Archon)
- **Effekt:** Namnge vampyr/minion i samma stad. Hunt roll, vid success: combat. Stealth > intercept = Ambush.
- **Kostnad:** 10 Blood
- **Stealth:** -1

#### Bodyguard (Archon)
- **Effekt:** Om ägaren är i samma stad och går in i combat: +strength lika med minion lvl.
- **Kostnad:** 10 Blood
- **Stealth:** +0

#### Follow Them
- **Effekt:** Namnge vampyr/minion i samma stad. Om de flyttar (på något sätt): minionen följer. Kan triggas flera gånger per runda.
- **Kostnad:** 15 Blood
- **Stealth:** +2

#### Sabbat Interrogations
- **Effekt:** Om Sabbat-bas i samma stad: -1 lvl (lvl 1 = förstörd). Om ingen bas: -1 stability.
- **Kostnad:** 20 Blood
- **Stealth:** +0

#### The Master's Will
- **Effekt:** +3 loyalty counters.
- **Kostnad:** 30 Blood
- **Stealth:** +0

---

## 8. Implementationsnoteringar

### GM-beroende actions (behöver deterministisk ersättning eller borttagning)
- **Dementation (basic):** "GM sends screenshot from random chat" — helt GM-beroende
- **Chimerstry (M):** "GM posts message in information highway" — kräver GM
- **Investigate:** "GM gives info and hint" — kräver GM
- **Orders from the Top (Justicar):** "Get a Mission from GM" — kräver GM
- **Investigate Eye (minion):** Svar på frågor kan vara GM-beroende
- **Wait and Strike:** Villkor behöver vara deterministiskt parsningsbara
- **Dementation (M):** Refererar till Investigate som forcerad action — om Investigate tas bort, behöver alternativ

### Actions med "once per turn" begränsning
- Watchful Eyes, In the Shadows, Blood for Blood
- Claim Credit (max 6 VP stolen per turn)
- Spreading the Truth of Cain
- Shovelhead Attack!
- Esbat
- Expose the Sabbat!
- Bottomless Wealth of the Camarilla
- Reward Loyalty
- Presence (M)
- Build My Kingdom (en gång per stad per runda)
- Anarch Revolt (en gång per stad per runda)

### Actions som inte kostar action slot
- Give
- Buy Votes
- Trifle-actions (första per runda kostar inte slot)

### Stealth-specialfall
- **Undetectable:** Kan inte ses av någon (stealth = null i implementation)
- **Can't be hidden:** Alla relevanta ser den (stealth = -Infinity eller flagga)
- **Obfuscate:** +4 stealth på personal/discipline
- **Presence:** +4 stealth på faction action
- **Partner in Crime:** +X stealth på alla ägarens actions (X = ghoul lvl)

### Hunt roll-modifiers
- Animalism: +3 D4, välj bästa
- Second Tradition: +2 intercept
- Steal Artifact: omvänd (stealth vs intercept istället för intercept vs stealth)

### Celerity implementation
- Basic Celerity är en action som sätter `celerity_remaining = 2`
- De följande 2 actions resolvas före andra spelares actions på samma action_order
- Flera Celerity-spelare shufflas sinsemellan i prioritetsfasen
