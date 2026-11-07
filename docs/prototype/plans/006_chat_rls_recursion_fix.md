# Plan: Fix chat_members RLS infinite recursion
Datum: 2026-03-21
Status: DONE

## Översikt

Skapa en `SECURITY DEFINER`-hjälpfunktion `is_chat_member(p_chat_id uuid)` och skriv om alla RLS-policies som gör inline-subqueries mot `chat_members`. Detta bryter den rekursiva kedjan och följer samma mönster som `my_campaign_ids()` och `is_gm()`.

Allt görs i en enda ny migration-fil.

## Fas-uppdelning

### Fas 1 — Ny migration: helper-funktion + omskrivna policies

Fil: `supabase/migrations/20260321_chat_rls_recursion_fix.sql`

- [x] Skapa `is_chat_member(p_chat_id uuid)` som `SECURITY DEFINER`-funktion
- [x] DROP + återskapa `chat_members_select` — använd `is_chat_member()` istället för self-join
- [x] DROP + återskapa `chats_select` — använd `is_chat_member()` istället för subquery
- [x] DROP + återskapa `messages_select` — använd `is_chat_member()` istället för subquery
- [x] DROP + återskapa `messages_insert` — använd `is_chat_member()` istället för subquery

### Policies som INTE ändras (inga rekursionsproblem)

- `chats_insert` — refererar `my_campaign_ids()`, ingen `chat_members`-referens
- `chat_members_insert` — refererar `chats` + `my_campaign_ids()`, men med `is_chat_member()`-fixen på `chats_select` bryts kedjan ändå. Dock: denna policy triggar `chats_select` som nu använder `is_chat_member()`, så kedjan är redan bruten.
- `chat_members_update` — kollar bara `user_id = auth.uid()`, ingen subquery

## Exakt SQL

```sql
-- Helper: check chat membership without triggering RLS on chat_members
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

-- 1. chat_members_select — var självreferens, nu via helper
DROP POLICY IF EXISTS "chat_members_select" ON chat_members;
CREATE POLICY "chat_members_select" ON chat_members FOR SELECT USING (
  is_gm() OR is_chat_member(chat_members.chat_id)
);

-- 2. chats_select — refererade chat_members, nu via helper
DROP POLICY IF EXISTS "chats_select" ON chats;
CREATE POLICY "chats_select" ON chats FOR SELECT USING (
  is_gm() OR is_chat_member(chats.id)
);

-- 3. messages_select — refererade chat_members, nu via helper
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  is_gm() OR is_chat_member(messages.chat_id)
);

-- 4. messages_insert — refererade chat_members, nu via helper
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  (sender_id = auth.uid() AND is_chat_member(messages.chat_id))
  OR is_gm()
);
```

## Spelregler och edge cases

- GM ska alltid ha tillgång — `is_gm()` checkas först (short-circuit)
- `is_chat_member()` kör som superuser via `SECURITY DEFINER` men `auth.uid()` fungerar ändå i Supabase (bevisat av `is_gm()` och `my_campaign_ids()`)
- Triggern `recompute_chat_member_hash()` är redan `SECURITY DEFINER` — opåverkad

## Success criteria

1. Felet "infinite recursion detected in policy for relation 'chat_members'" försvinner
2. Spelare kan skapa nya chattar utan fel
3. Spelare kan bara se chattar de är medlem i
4. GM kan se alla chattar
5. Meddelanden kan skickas och läsas inom chattar man är medlem i

## Kända risker

- Ingen: mönstret är identiskt med befintliga `my_campaign_ids()` och `is_gm()` som fungerar i produktion

## Parking lot
