# Research: chat_members RLS infinite recursion bug
Datum: 2026-03-21

## Bugbeskrivning

När en spelare försöker skapa en ny chatt visas felet:
> "infinite recursion detected in policy for relation 'chat_members'"

Skärmdump: `thoughts/shared/research/chat_bug.png`

## Relevanta filer

| Fil | Beskrivning |
|-----|-------------|
| `supabase/migrations/20260321_chat_system.sql` | Chat-tabeller, trigger, RLS-policies, auto-create-funktion |
| `supabase/migrations/20260321_chat_rls_patch.sql` | Ersätter gamla policy-namn med nya (samma logik) |
| `src/stores/chat.js` | Pinia store — `createChat()` gör INSERT i `chats` + `chat_members` |
| `src/components/chat/CreateChat.vue` | UI-komponent som anropar `chat.createChat()` |

## Grundorsak — den rekursiva kedjan

### Primärt problem: `chat_members_select` refererar sig själv

```sql
CREATE POLICY "chat_members_select" ON chat_members FOR SELECT USING (
  is_gm()
  OR EXISTS (
    SELECT 1 FROM chat_members AS cm          -- ← SELECT på chat_members
    WHERE cm.chat_id = chat_members.chat_id
      AND cm.user_id = auth.uid()
  )
);
```

Postgres applicerar RLS-policies rekursivt. När den inre `SELECT 1 FROM chat_members AS cm` körs, triggas samma `chat_members_select`-policy på `cm`-raden, som i sin tur gör en ny `SELECT FROM chat_members` → oändlig rekursion.

### Sekundärt problem: korsreferens mellan `chats` och `chat_members`

Utöver självreferensen finns en cykel mellan tabellerna:

1. **INSERT i `chat_members`** → `chat_members_insert`-policyn körs
2. Policyn gör `SELECT FROM chats` → `chats_select`-policyn körs
3. `chats_select` gör `SELECT FROM chat_members` → `chat_members_select` körs
4. `chat_members_select` gör `SELECT FROM chat_members AS cm` → **rekursion**

### Triggerflöde (inte grundorsaken, men relevant)

`recompute_chat_member_hash()` är `SECURITY DEFINER` och borde bypassa RLS. Dock triggas den AFTER INSERT, och felet uppstår redan vid INSERT-policyns evaluering.

## Databas och RLS

### Berörda policies

| Policy | Tabell | Problem |
|--------|--------|---------|
| `chat_members_select` | `chat_members` | **Självreferens** — `SELECT FROM chat_members` i sin egen policy |
| `chat_members_insert` | `chat_members` | Refererar `chats` → triggar `chats_select` → som refererar `chat_members` |
| `chats_select` | `chats` | Refererar `chat_members` → triggar `chat_members_select` → rekursion |
| `messages_select` | `messages` | Refererar `chat_members` — potentiellt samma problem |
| `messages_insert` | `messages` | Refererar `chat_members` — potentiellt samma problem |

### Befintliga helper-funktioner

- `is_gm()` — `SECURITY DEFINER`, kollar `profiles.is_gm`. Fungerar korrekt, bypassar RLS.
- `my_campaign_ids()` — Refereras i policies men definieras i en annan migration. Är `SECURITY DEFINER`, bypassar RLS.

## Befintliga patterns

Projektet använder redan `SECURITY DEFINER`-funktioner för att bryta RLS-cykler:
- `my_campaign_ids()` — undviker self-referencing RLS på `players`-tabellen
- `is_gm()` — undviker RLS på `profiles`

Samma mönster bör appliceras här.

## Rekommendation

Skapa en `SECURITY DEFINER`-funktion som kollar om den inloggade användaren är medlem i en given chatt, och använd den i alla policies som refererar `chat_members`:

```sql
CREATE OR REPLACE FUNCTION is_chat_member(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
  );
$$;
```

Skriv sedan om alla berörda policies att använda `is_chat_member()` istället för inline-subqueries mot `chat_members`. Detta bryter rekursionen helt, precis som `my_campaign_ids()` gör för `players`.

### Policies som behöver skrivas om

1. **`chat_members_select`** — byt ut `EXISTS (SELECT FROM chat_members AS cm ...)` mot `is_chat_member(chat_members.chat_id)`
2. **`chats_select`** — byt ut `EXISTS (SELECT FROM chat_members ...)` mot `is_chat_member(chats.id)`
3. **`messages_select`** — byt ut `EXISTS (SELECT FROM chat_members ...)` mot `is_chat_member(messages.chat_id)`
4. **`messages_insert`** — byt ut `EXISTS (SELECT FROM chat_members ...)` mot `is_chat_member(messages.chat_id)`

### Potentiella fallgropar

- `SECURITY DEFINER` kör som funktionens ägare (postgres/superuser), inte som den autentiserade användaren. Men `auth.uid()` fungerar ändå i Supabase-kontext, vilket `is_gm()` och `my_campaign_ids()` redan bevisar.
- Trigger-funktionen `recompute_chat_member_hash()` är redan `SECURITY DEFINER` och bör inte påverkas.

## Sidofynd (hör ej till detta scope — läggs i BACKLOG.md)

- `messages`-tabellens policies har samma potentiella rekursionsproblem via `chat_members` — bör fixas i samma migration som huvudbugen (inkluderat i rekommendationen ovan).
