# Beslut: aktionernas effekter

**Datum:** 2026-11-19
**Status:** Fattade av Claude. Designfrågor (märkta ⏸️) står som unresolved i `BACKLOG.md`, eftersom lead game designern inte är tillgänglig live; motorn använder valet här tills vidare. Övriga är provisoriska standardval; ändra raden här och koden i `packages/engine/src/effects/` om du vill annorlunda.
**Plan:** [`docs/engine/effects-plan.md`](../engine/effects-plan.md) · **Bygger på:** [`catalog.md`](catalog.md), [`round.md`](round.md), [`views.md`](views.md)

## Snabböversikt: de beslut som påverkar spelet mest

| # | Fråga | Valt |
|---|---|---|
| E6 ⏸️ | Bleed i en stad som inte är någons domän (okontrollerad)? | 1D10×5, som "annan vampyrs domän". |
| E7 ⏸️ | Gäller taket "inte mer än stadens blood flow" alla bleeds? | Ja, också Bleed the Enemy, Aaron's Feeding Razor m.fl. |
| E8 ⏸️ | Picky eater: vilka bleeds, och tappar staden hela beloppet? | Bara aktionen Bleed. Staden tappar hela, spelaren får 10 mindre. |
| E10 ⏸️ | Får en controller i torpor stadens blood flow? | Ja. |
| E15 ⏸️ | Hide ger +5 stealth, men Rule of Three säger max +3 per källa. | Hide får hela +5. |

---

## E1. Effekter ligger separat från katalogen
**Beslut:** Effekterna ligger i `src/effects/` som `EFFECTS[actionId] = { resolve, resume? }` och läggs på katalogens definitioner med `withEffects` i `ACTION_CATALOG`. `stubbedActionIds()` listar aktioner som saknar effekt.
**Motivering:** Katalogen räknas från spelarens vy och används av klienten; effekterna läser hela state vid upplösning. Att hålla dem isär gör gränsen tydlig och visar vad som återstår för definition of done.

## E2. Effektevents går bara till den agerande spelaren
**Beslut:** Events som beskriver utfallet (`moved`, `bled`, `income_pending`, `city_income`, `bleed_income`, `other_income`) har standardpubliken: den agerande spelaren (M18). Andra får veta att aktionen gjordes via `action_observed` (V12) och ser publika följder i vyn (t.ex. stadens blood flow, V5).
**Motivering:** Utfallet (tärningar, belopp) är inte något observatören ser: "they might notice the effects of the action" (gd:925) gäller publika värden.

## E3. Förflyttningen kontrolleras vid upplösning
**Beslut:** Move, Sail, minionernas Move/Sail och Archon Movement kontrollerar målet mot var utföraren är när entryn löses. Går det inte (inte grannstad, för långt, storm, ingen gemensam havsregion) misslyckas entryn och kostnaden återbetalas.
**Motivering:** K4 och gd:95.

## E4. Sail och storm
**Beslut:** Sail kräver att båda städerna är hamnar och delar minst en havsregion som inte har storm denna rond (`storm.untilEndOfRound >= round` = storm). Delar de flera regioner räcker det att en är lugn.
**Motivering:** gd:1184 "move to any other port city that shares the same sea region. You can't sail in a sea region with a storm."

## E5. Archon Movement
**Beslut:** Högst två steg längs grannskap (kortaste väg), som i katalogen (K19). Mellanstaden spelar ingen roll.

## E6. Bleed utanför domänen ⏸️
**Beslut:** Bleed ger 2D10×5 i egen domän (`domainCityIds`) och 1D10×5 i alla andra städer, även okontrollerade.
**Motivering:** gd:1138 nämner bara "your domain" och "another vampire's domain". En okontrollerad stad är ingen domän; att ge 1D10×5 där är det försiktiga valet. Designfråga i BACKLOG.

## E7. Bleed sänker stadens blood flow resten av ronden, med tak ⏸️
**Beslut:** En bleed lägger en `CityModifier` (`bloodFlow`, −belopp, `source: bleed:<entryId>`, gäller ronden ut). Beloppet kapas vid stadens kvarvarande blood flow (efter tidigare bleeds samma rond). Taket gäller alla aktioner som bleedar, inte bara Bleed. Spelaren får beloppet i fas 5b. Utgångna stadsmodifiers tas bort i fas 5d.
**Motivering:** gd:895 (Bleed-nyckelordet), gd:1138 ("You can't gain more blood than the city's blood flow"). Att bara Bleed skulle ha taket vore konstigt, eftersom blood flow inte kan bli negativ. Designfråga i BACKLOG.

## E8. Picky eater ⏸️
**Beslut:** Ventrues curse ("Get −10 blood on every Bleed action", gd:845) gäller bara aktionen Bleed. Staden tappar hela beloppet; spelaren får 10 mindre (lägst 0).
**Motivering:** Texten säger "Bleed action". Bleed the Enemy är en minionaktion och Aaron's Feeding Razor en artefaktaktion. Designfråga i BACKLOG.

## E9. Stadens inkomst (fas 5a)
**Beslut:** Controllern får stadens nuvarande blood flow (efter rondens bleeds). Contested städer ger ingen inkomst (gd:507). En bränd controller får inget.
**Motivering:** gd:955 "gain the cities current blood flow".

## E10. Controller i torpor ⏸️
**Beslut:** En controller i torpor får sina städers blood flow och sin väntande inkomst.
**Motivering:** Regelboken säger bara att en vampyr i torpor inte kan contesta eller få VP (gd:513, gd:927). Designfråga i BACKLOG.

## E11. Väntande inkomst
**Beslut:** Inkomst från aktioner samlas i `RoundResolution.scratch.income` per spelare och betalas i 5b (bleeds) och 5c (övrigt). En spelare som bränts under ronden får ingen inkomst.
**Motivering:** gd:95 "income comes at the start of the next round" och gd:955–957. Scratch är JSON och överlever en paus för strid (M11).

## E12. (M)Presence kör den valda aktionens effekt
**Beslut:** (M)Presence löser den valda faction actionens effekt med samma entry (valen ligger i samma params, K9). Är den valda aktionen en stubb löses (M)Presence utan effekt.

## E13. Monstrous
**Beslut:** Nosferatus curse ("The Move action costs +5 blood", gd:804) läggs på vampyrens Move i katalogen. Minionernas Move påverkas inte.
**Motivering:** "The Move action" är vampyrens personal action.

---

## Steg 2 (2026-11-19)

## E14. Personliga buffar gäller ronden ut
**Beslut:** Watchful Eyes (+1 intercept), In the Shadows (+1 stealth), Blood for Blood (+1 strength) och Hide (+5 stealth) lägger en `StatModifier` med källan `action:<id>` som gäller till slutet av ronden. Aktioner senare samma rond observeras och jagas med den nya staten (M18). Buffen gäller vampyren, inte dess minions.
**Motivering:** "for this turn" (gd:1141–1147, gd:1176).

## E15. Hide och Rule of Three ⏸️
**Status:** Gustaf 2026-11-19: behåll +5 tills vidare; frågan till designern står kvar i BACKLOG.
**Beslut:** Hide ger hela +5 stealth (`ignoresRuleOfThree`).
**Motivering:** Rule of Three säger "never more than +3 in any stat from any single source" (gd:529–531), men Hide säger uttryckligen +5. Den specifika regeln får gå före den allmänna; annars vore Hide bara +3. Designfråga i BACKLOG.

## E16. Get a Minion
**Beslut:** Minionen hamnar i vampyrens stad, får `acquiredRound` = ronden (ingen upkeep den ronden, gd:217) och ett genererat namn ("Ghoul 7"). The broken pyramid (Tremere-curse, gd:832) stoppar Lvl 3 redan i katalogen och igen vid upplösning.
**Motivering:** Regeln säger inte var minionen hamnar; vampyrens stad är det naturliga. Namnet saknar regel; gränssnittet kan låta spelaren byta namn senare.

## E17. Bestow Gifts
**Beslut:** +1 level på en egen minion, högst 3 (högst 2 för The broken pyramid). Är minionen inte längre spelarens, eller redan på max, misslyckas aktionen.

## E18. Awaken: vem och var
**Beslut:** Man väcker sig själv i torpor, eller en annan vampyr som är i torpor i samma stad när aktionen löses. Annars misslyckas aktionen. Salubri (Healers and scholars, gd:817) ger två ticks på målet. Vid `required` ticks blir vampyren aktiv.
**Motivering:** gd:1170.

## E19. Vad målet för Awaken får veta
**Beslut:** Målet får `torpor_progress` (ticks, krav, vaken) men inte vem som väckte. Den som väckte får `awaken_done` utan målets progress.
**Motivering:** Torpor är dolt (V4); att avslöja aktören skulle gå förbi Awakens stealth (+3).

## E20. Control the Masquerade är permanent
**Beslut:** Control the Masquerade ändrar stadens permanenta `masquerade`, inte en modifier.
**Motivering:** Regeln anger ingen tidsgräns.

## E21. Masquerade violation lagas vid 5
**Beslut:** När Control the Masquerade gör stadens effektiva masquerade 5 tas en aktiv violation bort, med ett publikt event.
**Motivering:** gd:915 "until the masquerade violation has been mended by giving the city that triggered the violation 5/5 MS". Violation är publik (V5/V6).

---

## Minions (2026-11-27)

Källa: Long Night 2.0, MINIONS. Plan: [`docs/engine/minions-plan.md`](../engine/minions-plan.md).

## E22. Vilka minionaktioner som löses nu
**Beslut:** Alla minionaktioner som inte kräver strid har effekt: Sabotage, Partner in Crime, Move the Master, Suicide Mission, Hide and Spy, Keep an Eye on Them, Build on the Master's Kingdom, Follow Them, Sabbat Interrogations och The Master's Will, plus Recruit a Primogen. Bodyguard, Guard the Master, Archons Attack och Hide the Master väntar på strid och Diablerie (steg 3). Suicide Mission räknas som automatisk: "The GM rolls a D4" är ett seedat slag, inget GM-omdöme.

## E23. Rekryteringskostnad
**Beslut:** Kostnaden är typens pris för leveln (Get a Minion, Recruit a Primogen). A cursed kiss (Hecata) lägger på +10 blood. The broken pyramid (Tremere) stoppar Lvl 3 även för Recruit a Primogen.
**Motivering:** "Recruiting a minion costs +10 blood" gäller all rekrytering. Byggt här i stället för i steg 7 eftersom det sitter i rekryteringskostnaden.

## E24. Hunt roll ⏸️
**Beslut:** Jägaren slår D4 + sin intercept, målet D4 + sin stealth. Jakten lyckas om jägarens summa är strikt högre; lika misslyckas. Slagen görs med entryns delström (M9), jägaren först. Modifiers från klaner, discipliner och artefakter är inte med än (BACKLOG).
**Motivering:** Ordlistan "Hunt": "If the score is higher than the hunted vampires or minions stealth your action can continue." Designfråga i BACKLOG (lika, och att meningen säger "stealth" fast målet också slår).

## E25. Ghoulens Sabotage är permanent
**Beslut:** −1 stability (lägst 0) eller −1 intercept (lägst 0) på stadens permanenta värde, i minionens stad.
**Motivering:** Ingen tidsgräns i regeln, samma som Control the Masquerade (E20).

## E26. Partner in Crime
**Beslut:** Resten av ronden får varje vampyraktion spelaren gör +X stealth (X = ghoulens effektiva level), om ghoulen och vampyren är i samma stad när aktionen observeras. Bonusen gäller bara aktionens stealth, inte vampyrens stealth mot hunt rolls, och bara aktioner efter ghoulens aktion. Flera ghouls räknas var för sig (Rule of Three per ghoul). Ligger i `scratch.partnerInCrime`.
**Motivering:** "Increases the stealth of each action you performed by +X … the rest of the turn, if you are in the same city."

## E27. Hide and Spy
**Beslut:** Eyen får +2 stealth och +2 intercept (källa `action:hide_and_spy`) som går ut efter nästa rond. Nästa rond får minionen inte agera: katalogen ger `minion_resting` och upplösningen stoppar entryn. Spärren känns igen på modifiern (`minionIsResting`), så inget nytt fält i state behövs.

## E28. Follow Them
**Beslut:** Gäller resten av ronden. Är målet inte i Archonens stad när aktionen löses händer inget. Varje förflyttning av målet via Move, Sail, minionernas Move, Archon Movement eller Move the Master flyttar Archonen dit, och dess egna följare efter. Archonens spelare får `follow_triggered` utan `playerId`/`entryId`, så att eventet inte avslöjar vems aktion som flyttade målet. Följarens förflyttning observeras inte separat.

## E29. Keep an Eye on Them
**Beslut:** Hunt roll mot den namngivna vampyren. Är den inte i Eyens stad räknas det som en misslyckad jakt med exakt samma event, så att svaret inte avslöjar var den är. Tärningarna loggas bara för GM. Svaren: blood just då (efter rondens betalningar), artefakterna vampyren bär (inte de som dess minions bär), och om dess VP är strikt högre än ens egen. En misslyckad jakt ger ingen återbetalning.

## E30. Build on the Master's Kingdom
**Beslut:** Antalet val är minionens effektiva level när aktionen löses. Stability och masquerade stannar vid 5 (masquerade 5 lagar en violation, E21). Intercept och influence har inget tak. Elysium, Camarilla Order och Secure Haven läggs som specials (`PRIMOGEN_SPECIALS`) och får byggas flera gånger (K11). Elysiums röst och de andra specialernas skydd läses när röstningen, Troublemaker och Attack byggs.

## E31. Sabbat Interrogations ⏸️
**Beslut:** Basen i minionens stad tappar en level, en Lvl 1-bas förstörs; utan bas får staden −1 stability. Archonens spelare får veta vilket som hände.
**Motivering:** Stability är publik, så spelaren kan ändå se om staden tappade stability; att säga vilket utfallet blev läcker inget nytt. Designfråga i BACKLOG (får Sabbat veta vem som gjorde det).

## E32. Loyal to the Prince och Camarilla Loyal ⏸️
**Beslut:** I fas 4b bränns en Primogen vars ägare inte har effektiv titel Prince och skenbar sekt Camarilla, och en Archon vars ägare inte har effektiv titel Justicar. En dold Archbishop förklädd till Prince behåller sin Primogen. NPC-ägda och brända ägares minions bränns.
**Motivering:** Regeln säger inte när kontrollen görs; slutet av ronden låter en Prince som går Anarch eller ger bort en Primogen se följden samma rond. Att bränna en dold Archbishops Primogen skulle avslöja förklädnaden.

## E33. Archon-loyalty utan missions ⏸️
**Beslut:** I fas 4c tappar varje Archon en loyalty counter, även den rond den rekryterats, och bränns vid 0. Inget stoppar det, eftersom missions är borttagna ur spelet (Gustaf 2026-11-19). The Master's Will ger +3.
**Motivering:** "At the end of every round they lose one loyalty counter unless the Justicar has completed a mission." Utan missions gäller huvudregeln. En start-Archon lever alltså 3 ronder om Justicaren inte gör The Master's Will (30 blood). Designfråga i BACKLOG.
