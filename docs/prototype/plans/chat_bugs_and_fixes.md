# Chat System — Bugs & Fixes

*2026-03-21*

---

## Bug 1: `chats_insert` RLS blocks player chat creation (FIXED)

**Symptom:** Players get "new row violates row-level security policy for table chats" when creating a chat.

**Root cause:** The Supabase JS client does `.insert().select().single()` which performs a SELECT after the INSERT. The `chats_select` policy required `is_chat_member(id)`, but the creator hasn't been added as a member yet, so the post-insert SELECT fails.

**Fix applied:** Added `created_by` column to `chats` (defaults to `auth.uid()`), and updated `chats_select` to also allow `created_by = auth.uid()`.

**Migration:** `20260321000005_chats_select_fix.sql`

---

## Bug 2: `chat_members_insert` RLS fails due to `chats_select` blocking (FIXED)

**Symptom:** Even if the chat INSERT succeeded, adding members would fail because the `chat_members_insert` policy did an inline `SELECT FROM chats` — which triggered `chats_select` RLS, and the chat was invisible to the creator (not yet a member).

**Root cause:** The `chat_members_insert` policy used an inline `EXISTS (SELECT 1 FROM chats WHERE ...)`, which is subject to `chats_select` RLS. Since the player wasn't a member yet, the chat row was invisible.

**Fix applied:** Created a `SECURITY DEFINER` function `chat_in_campaign(p_chat_id uuid)` that bypasses RLS on `chats` to check campaign ownership. Updated the `chat_members_insert` policy to use it.

**Migration:** `20260321000004_chat_members_insert_fix.sql`

---

## Bug 3: Realtime messages subscription is not working

**Symptom:** Players don't receive live message updates from other players. New messages only appear after manual page refresh or re-opening the chat.

**Root cause:** The `messages` table is not added to the `supabase_realtime` publication. The `postgres_changes` subscription in `src/stores/chat.js` connects a channel, but Postgres never emits WAL events for the `messages` table because it's not published.

**Fix:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

---

## Bug 4: Realtime subscription is unfiltered — cost and privacy risk

**Symptom:** No visible symptom yet (realtime isn't active due to Bug 3), but once enabled the current code will cause unnecessary cost and potential info leakage.

**Root cause:** The subscription in `src/stores/chat.js:204-224` listens to ALL inserts on the `messages` table:

```js
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'messages'
}, handler)
```

This means every connected player receives a realtime event for every message in every chat across the entire campaign. Supabase applies RLS server-side so players won't see message *content* they shouldn't, but:

1. **Cost:** Each message triggers a realtime event to every connected player. With 20 players, that's 20x amplification. Supabase bills per realtime message.
2. **Metadata leakage:** Even if content is filtered by RLS, the event itself reveals that *something* was inserted into `messages`, and may include the `chat_id`.

**Fix:** Replace the single broad subscription with per-chat filtered subscriptions in `src/stores/chat.js`:

```js
// Current (bad): one unfiltered subscription
messagesChannel = supabase
  .channel(`chat-messages:${campaignId}`)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'messages'
  }, handler)
  .subscribe()
```

```js
// Fixed: one subscription per chat with server-side filter
const chatChannels = []
for (const chat of chats.value) {
  const ch = supabase
    .channel(`chat:${chat.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `chat_id=eq.${chat.id}`
    }, handler)
    .subscribe()
  chatChannels.push(ch)
}
```

This applies the filter at the WAL level in Postgres — events for chats the player isn't in are never sent over the wire. Also update `unsubscribe()` to clean up all per-chat channels.

---

## Implementation order

1. ~~Bug 1 — `chats_select` fix~~ (done)
2. ~~Bug 2 — `chat_members_insert` fix~~ (done)
3. Bug 4 — Refactor subscription to per-chat filtered channels (`src/stores/chat.js`)
4. Bug 3 — Enable realtime publication for `messages` table (do this AFTER Bug 4 so the unfiltered subscription never goes live)
