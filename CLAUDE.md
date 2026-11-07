# Vampyre: The Long Night

Ett 20-spelar "matrix megagame" i 1920-talets England (World of Darkness). Spelare styr vampyrer från Camarilla, Anarch eller Sabbat och tävlar om VP under 8 ronder. Spelet har hittills spelats manuellt över Discord med en GM. Målet med detta repo är att bygga nästa version.

Kärnprincip: spelet är en ren funktion, `spelstatus + spelaraktioner -> ny spelstatus`.

## Status

Repot är nystartat och innehåller än så länge bara dokumentation. Ingen kod, ingen stack vald för detta repo. Ett tidigare prototyp-försök (Vue 3 + Vite + Pinia + Supabase) finns dokumenterat i `docs/prototype/`, men koden följde inte med.

## Dokument (läs i den här ordningen)

| Fil | Innehåll |
|---|---|
| `docs/rules/game_design.txt` | Den kanoniska regelboken. Source of truth för reglerna. |
| `docs/rules/SPEC.md` | Fullständig spec (regler som krav, plattformsbeslut, öppna beslut i Part C). Stack-oberoende. |
| `docs/playtest-logs/` | Riktiga spelarloggar (stats, rondresultat, action-listor). Bra exempel på hur spelet faktiskt spelas. |
| `docs/prototype/research/` | Research från prototypen: regler vs implementation, DB-schema, resolve-round-motor, actionreferens. |
| `docs/prototype/plans/` | Implementationsplaner från prototypen. |
| `docs/prototype/workflow.md` | Arbetsflöde Research -> Plan -> Implement. |
| `docs/prototype/CLAUDE.prototype.md` | Gamla projektkontexten för Vue/Supabase-prototypen. |
| `docs/prototype/BACKLOG.md` | Öppna punkter från prototypen. |

Om SPEC.md och game_design.txt säger emot varandra gäller game_design.txt, och avvikelsen ska flaggas.

## Arbetssätt

- Svenska i dokument och kommunikation med användaren, engelska för spelets termer (Stealth, Intercept, VP, Blood, Prince osv.).
- Hoppa inte direkt till implementation: research -> plan -> implement -> validera. Spara research och planer som filer i repot så kontexten överlever mellan sessioner (särskilt viktigt i molnsessioner).
- Sidofynd som inte hör till nuvarande scope går i `BACKLOG.md`, inte in i planen.
- Spelmotorn ska vara deterministisk. Allt som regelboken lämnar åt GM:s bedömning ska lösas explicit och spåras i SPEC.md Part C.

## Hemligheter

Committa aldrig `.env`, Supabase-nycklar eller andra credentials.
