# Plan: Artifacts-fliken

**Datum:** 2026-11-27
**Trello:** "Artifacts" (bräde "Vampyre: long night")
**Regler:** Google Doc "Vampire the long night 2.0", avsnittet ARTEFACTS (lista över 30 artefakter, minions bär en, alla artefaktaktioner har Trifle), "Possession" och informationsaktionerna. Kontrollerat mot 2.0 den 2026-11-27.
**Beslut:** S24 i [`docs/decisions/state.md`](../decisions/state.md), V20–V21 i [`docs/decisions/views.md`](../decisions/views.md).

## Krav (Trello-kortet)

1. En flik som listar alla artefakter man kan få tag på under en kampanj.
2. Vid varje artefakt: vem som har den, **bara** om spelaren vet det. Annars "Unknown".
3. Klick på en artefakt visar vad den gör.

"Alla artefakter" = regelbokens fasta lista med 30 artefakter (`ARTIFACT_KEYS` utom `thaumaturgic_creation`, som inte är en egen artefakt i listan). GM-genererade artefakter finns inte i V1.

## Hur en spelare vet vem som har en artefakt (2.0)

> **Possession:** Other vampires don't know what's in your possession unless they use the actions to uncover it. Or you make actions that reveal it.

| Källa | Regeltext | Vad man får veta | I denna PR |
|---|---|---|---|
| Egen ägo | – | Egna artefakter och de egna minionernas | Ja |
| Någon utför en artefaktaktion som man ser | "Or you make actions that reveal it" | Utföraren har artefakten | Ja: `action_observed` för `artifact_*` skriver kunskap. Undetectable-aktioner syns aldrig och avslöjar därför inget. |
| **Look for Artifacts** (personal, hunt roll) | "On success learn of all artifacts that vampyre is in possession of" | Alla artefakter vampyren bär | API:t finns (`learnArtifactsOf`); effekten kräver hunt roll (effektsteg 3) och är fortfarande stubb |
| **Keep an Eye on Them** (Eye-minion, hunt roll), frågan "Which artifacts does that vampire have?" | | Samma | Samma som ovan (effektsteg 4) |
| **(M) Auspex**, "Learn the location of up to 5 artifacts" | | Var artefakten är | API:t finns (`learnArtifactHolder`); effekten är stubb (effektsteg 4) |
| Steal an Artifact, Search (25 %), Diablerie, Give | | Man får själv artefakten | Syns som egen ägo när effekterna finns |

## Modell

- `GameState.knowledge.artifacts[playerId][artifactId] = { holder, round, source }` (S24). Kunskapen gäller **bara så länge bäraren är densamma** som när den lärdes. Byter artefakten bärare (stöld, Give, Diablerie) visas den som Unknown igen, utan "last known" (Gustafs regel). Brända artefakter försvinner ur listan över kända.
- `PlayerView.knownArtifacts` (V20): spelarens egna artefakter plus giltig kunskap om andras, konstruerat fält för fält. Ingen statisk data: namn, text, kostnad och stealth kommer från `Content` i klienten.
- `learnArtifactHolder`, `learnArtifactsOf` i `src/state/knowledge.ts` är primitiverna som effekterna i steg 3–4 anropar.

## Gränssnitt

- Fliken `artifacts` i `TabMenu` får innehåll: `ArtifactsTab` med en rad per artefakt (namn, ägare eller "Unknown"), egna överst markerade.
- Klick öppnar en detaljpanel: regeltext, kostnad, stealth, minionbonus, "burns on use", torpor, och hur man vet ägaren ("Seen using it in round 2", "You hold it").
- Data går via `PlayerScreenPort.load()` → `MainScreenData.artifacts` (byggs i `viewPort.ts` från `PlayerView` + `Content`).
- All text på engelska.

## Utanför scope (BACKLOG)

- Hunt roll och effekterna för Look for Artifacts, Keep an Eye on Them, (M) Auspex (effektsteg 3–4) — de ska anropa `learnArtifactsOf`/`learnArtifactHolder`.
- Bild på vampyren (Trello nämner bild); vi visar namnet tills det finns porträtt.
