# Vampire: The Long Night — Research → Plan → Implement
*Workflow-guide för Claude Code*

---

## Grundprincip

Hoppa aldrig direkt till implementation. Följ alltid:

```
Research → Plan → Implement → Validera
```

Varje fas sparas som en fil i `thoughts/` så att kontext aldrig går förlorad mellan sessioner.

---

## Mappstruktur

```
thoughts/
└── shared/
    ├── research/               # Forskningsdokument
    │   └── 001_resolve_round.md
    ├── plans/                  # Implementationsplaner
    │   └── 001_resolve_round.md
    ├── decisions/              # Beslutsdokumentation
    │   └── 001_edge_functions.md
    └── sessions/               # Sessionssammanfattningar
        └── 2026-03-18_engine.md

BACKLOG.md                      # Alla sidofynd och framtida tasks (rotnivå)
DECISIONS.md                    # Index över alla beslut (rotnivå)
```

---

## BACKLOG.md — löpande underhåll

`BACKLOG.md` i projektroten är den enda platsen där tasks som *inte hör till nuvarande scope* samlas. Den fylls i löpande under research och implementation.

**Format:**
```markdown
# Backlog

## Hög prioritet
- [ ] Beskrivning av task — hittad under: research/001_resolve_round.md

## Lägre prioritet / nice to have
- [ ] Beskrivning av task

## Teknisk skuld
- [ ] Beskrivning av task
```

**Regler:**
- Lägg aldrig sidofynd direkt i en plan — det är scope creep
- Skriv alltid var tasken hittades (t.ex. "hittad under research fas 1")
- Gå igenom och prioritera backloggen inför varje ny research-fas

---

## DECISIONS.md — beslutsdokumentation

Korta anteckningar om viktiga vägval och *varför* de gjordes. Ovärderligt när man återkommer efter en paus.

**Format:**
```markdown
# Beslut

## 2026-03-18 — Edge Functions istället för egen server
**Beslut:** Supabase Edge Functions (Deno) för spelmotorn
**Motivering:** Tillräckligt för 20 spelare och ~100 aktioner/ronde. Eliminerar självhanterad server.
**Alternativ övervägda:** Egen Node.js-server, Postgres-funktioner
**Konsekvenser:** Logik i TypeScript/Deno, inte Vue-komponenter
```

Skapa en ny post varje gång ett icke-uppenbart tekniskt eller spelmekanik-beslut fattas.

---

## Fas 1 — Research

**När:** Innan du skriver en enda rad kod.

**Prompt att ge Claude Code:**

```
Research phase: [beskriv vad du vill förstå]

Gå igenom kodbasen, databasschema, och befintliga migrations.
Dokumentera:
1. Relevanta filer och var de ligger
2. Spelregler och affärslogik som påverkar implementationen
3. RLS-policys och databastabeller som berörs
4. Befintliga patterns och konventioner
5. Potentiella fallgropar (särskilt kring stealth/intercept-systemet)
6. Rekommendationer inför implementation
7. Sidofynd — saker som bör fixas men inte hör till detta scope

Spara resultatet i thoughts/shared/research/[NNN_namn].md
Lägg sidofynd i BACKLOG.md under rätt prioritetsnivå.
```

**Exempel:**
```
Research phase: round resolution engine

Gå igenom action_types-tabellen, migrations, och spelets aktionsordning.
Dokumentera hur alla 60 aktionstyper ska processas, stealth/intercept-logiken,
och hur personaliserade round_updates ska beräknas.

Spara i thoughts/shared/research/001_resolve_round.md
Lägg sidofynd i BACKLOG.md.
```

**Research-dokumentets struktur:**
```markdown
# Research: [namn]
Datum: YYYY-MM-DD

## Relevanta filer
## Spelregler och affärslogik
## Databas och RLS
## Befintliga patterns
## Potentiella fallgropar
## Rekommendationer

## Sidofynd (hör ej till detta scope — läggs i BACKLOG.md)
- ...
```

---

## Fas 2 — Plan

**När:** Efter research, innan implementation.

**Prompt att ge Claude Code:**

```
Planning phase: [feature/ändring]

Baserat på @thoughts/shared/research/[fil].md, skapa en
detaljerad implementationsplan med:
1. Översikt och approach
2. Fas-uppdelning (varje fas ska vara testbar)
3. Exakt vilka filer som ändras och hur
4. Spelregler och edge cases som måste hanteras
5. Success criteria per fas
6. Kända risker (särskilt kring stealth/intercept och RLS)

Spara i thoughts/shared/plans/[NNN_namn].md
```

**Plandokumentets struktur:**
```markdown
# Plan: [namn]
Datum: YYYY-MM-DD
Status: DRAFT

## Översikt
## Fas-uppdelning
### Fas 1 — [namn]
- [ ] Steg 1
- [ ] Steg 2
### Fas 2 — [namn]
- [ ] Steg 1

## Spelregler och edge cases
## Success criteria
## Kända risker

## Parking lot
*(Noteringar som dyker upp under implementation — ej ursprunglig plan)*
```

**Statusvärden:** `DRAFT` → `APPROVED` → `IN PROGRESS (fas N/M)` → `DONE`

Uppdatera statusraden varje gång fasen ändras.

---

## Fas 3 — Implement

**När:** Användaren har godkänt planen och ger ett explicit kommando att börja.

**Viktigt:** Börja ALDRIG implementera utan ett explicit kommando från användaren.
Att en plan godkänns betyder bara att planen är bra — inte att implementation ska starta.

**Prompt att ge Claude Code:**

```
Implementation phase: kör @thoughts/shared/plans/[fil].md

Implementera fas [N]. Följ planen exakt.
Bocka av checkboxar när varje steg är klart.
Uppdatera statusraden i plandokumentet.
Lägg oväntade fynd i "Parking lot"-sektionen — avbryt inte för småsaker.
Stanna och rapportera om du stöter på en riktig blocker.
```

**Tips:**
- Implementera en fas i taget
- Be Claude bocka av checkboxar i plandokumentet och uppdatera status
- Sidofynd under implementation → "Parking lot" i plandokumentet, sedan → `BACKLOG.md`
- Om spelregler är otydliga — pausa och fråga, implementera inte gissningar
- Stealth/intercept-logik är känslig — verifiera noggrant mot spelets regler
- Om något oväntat dyker upp som *påverkar planen* — pausa och uppdatera planen

---

## Fas 4 — Validera

**När:** Efter implementation, innan commit.

**Prompt att ge Claude Code:**

```
Validation phase: @thoughts/shared/plans/[fil].md

Verifiera att implementationen matchar planen:
1. Är alla checkboxar iklickade?
2. Finns det avvikelser från planen — är de dokumenterade?
3. Testas stealth/intercept korrekt — ser ingen fel spelare för mycket?
4. Är RLS-policys korrekt respekterade?
5. Vad ska testas manuellt (och med vilka testspelare)?
6. Finns det parking lot-noteringar som ska lyftas till BACKLOG.md?
7. Ska något beslut dokumenteras i DECISIONS.md?
```

---

## Spara session (vid avbrott)

```
Spara sessionssammanfattning i
thoughts/shared/sessions/[datum]_[namn].md

Inkludera:
- Vad som är klart
- Nuvarande status (inkl. planens statusrad)
- Exakt vad som är nästa steg
- Eventuella öppna spelregelsfrågor
- Parking lot-noteringar som inte ännu lagts i BACKLOG.md
```

---

## Återuppta session

```
Läs @thoughts/shared/sessions/[datum]_[namn].md
och fortsätt där vi slutade.
```

---

## Snabbreferens — prompts

| Fas | Börja prompten med |
|-----|--------------------|
| Research | `Research phase: ...` |
| Plan | `Planning phase: ...` |
| Implement | `Implementation phase: kör @...` |
| Validera | `Validation phase: @...` |
| Spara | `Spara sessionssammanfattning i ...` |
| Återuppta | `Läs @... och fortsätt` |

---

## Gyllene regler

1. **Planoutput ska alltid vara en fil** — skriv aldrig en plan enbart i chatten. Chatten är flyktig; filen är persistent
2. **Research först** — alltid, även för "enkla" saker
3. **En fas i taget** — implementera inte fas 2 innan fas 1 är validerad
4. **@-referera filer** — ge Claude exakt kontext med `@filsökväg`
5. **Pausa vid spelregelsfrågor** — implementera aldrig gissningar om spelmekanik
6. **Stealth/intercept är känslig** — verifiera alltid att informationsläckage inte sker
7. **Missade steg** — Om användaren ber dig planera eller implementera utan att ha genomfört tidigare steg, pausa och säg till
8. **Steg redan genomfört** — Varna användaren om steget verkar redan ha gjorts
9. **Genomsök knowledge base** — Vid implementation, se över research- och planfiler innan så ingenting missas
10. **Explicit startkommando** — Börja aldrig implementera bara för att en plan godkänts. Vänta på att användaren säger "kör", "implementera", eller liknande
11. **Sidofynd hör till backloggen** — Lägg aldrig sidofynd direkt i planen. `BACKLOG.md` är rätt ställe
12. **Dokumentera beslut** — Icke-uppenbara tekniska val eller spelmekanik-beslut ska skrivas till `DECISIONS.md`
13. **Parking lot, inte avbrott** — Smånoteringar under implementation läggs i "Parking lot", inte som avbrott till användaren
14. **Håll planens status uppdaterad** — Statusraden i plandokumentet ska alltid reflektera verkligheten


## Struktur på planning dokument
```
Alla planning dokument som skapas ska följa den här strukturen. Det är viktigt för att användaren enkelt ska kunna ge nödvändig input inför implementationen.
```
### A2. FEATURE NAMN ÖVERGRIPANDE
**Komplexitet:** låg, medel, hög, samt kort motivering för komplexitetsgraden
**Prioritet:** låp, medel, hög, samt kort motivering

Nuläge — beskrivning ifall delar av implementationen redan är på plats, eller om gammal variant av feature:n redan existerar

**Approach:** mer noga beskrivning av hur implementationen ska se ut (om specifikt library ska användas t.ex)

#### Fas X — Övergripande implementationsbeskrivning
- [ ] Uppgift att genomföra och bocka av
- [ ] en till uppgift att genomföra och bocka av

**Success criteria:** Testkrav för att verifiera implementationen

ÖPPNA FRÅGOR:
- fråga till användaren?
    svar: Svar från användaren
- fråga 2 till användaren?
    svar: Svar från användaren

#### Fas y — nästa steg i implementationen, etc 