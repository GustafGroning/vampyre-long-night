# Vampyrer på kontot: plan

Datum: 2026-11-26. Uppdrag (Gustaf): "spelare ska kunna logga in även utan en kampanj, så att de kan skapa vampyrer kopplade till sitt konto."

## Läget före

- Inloggning fungerar utan kampanj, men skärmen säger bara "Be GM att koppla ditt konto".
- Motorn har redan backloggen (`packages/engine/src/characters/`, beslut K1–K14): `CharacterBuild`, `validateCharacterBuild`, `deriveCharacter`, `addCharacter`/`updateCharacter`/`removeCharacter`. Motorn lagrar inget (K10).
- Konton skapades bara av admin (P3).

Utökat samma dag (Gustaf): "spelarna först hamnar på en startsida där de kan öppna kampanjer de hör till (bara admin kan skapa kampanjer) och kan lista sina skapade vampyrer och skapa fler", plus "create account" med varning om lösenordet och utan e-postbekräftelse.

## Beslut (P16–P20, i `docs/decisions/server.md`)

- **P16** En rad per användare i `character_backlogs` med hela `CharacterBacklog` som jsonb och en `revision` för optimistisk låsning. RLS utan policyer, RPC bara för service_role, som resten av spelservern (P11).
- **P17** Serveroperationer `characters`, `character_save` (ny eller ändrad, valideras av motorn) och `character_delete`. Ägaren är alltid den inloggade; klienten anger aldrig `ownerId`.
- **P18** Startsida efter inloggning: kampanjerna man hör till och "Mina vampyrer". "Startsida" i kontoraden.
- **P19** Byggformuläret är ett vanligt formulär med alla val synliga och motorns fel live (`validateCharacterBuild` med `path`). Spara är avstängt tills bygget är giltigt. Ingen design.
- **P20** Självregistrering ("Create account") med varning om lösenordet; e-postbekräftelse av i Supabase. Ersätter P3.

## Steg

1. Migration `20261126050000_character_backlogs.sql` + SQL-test.
2. `packages/server`: Store-metoder, operationer, tester (MemoryStore och Postgres).
3. Web: startsida, `CharacterList` (lista, ny, ändra, ta bort), `CharacterBuilder`, "Create account"; dev-servern får `/dev/signup`.
4. Validera: tester, typecheck, webbläsare mot dev-servern.

## Utanför scope (BACKLOG)

Gå med i en kampanj med en vampyr (lobbyn, K12), GM:s titeltilldelning i UI, återställning av lösenord (kräver SMTP).
