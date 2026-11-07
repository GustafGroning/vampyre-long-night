# Plan: Chat Feature (Vue frontend + Supabase Realtime)
Datum: 2026-03-21
Status: DONE

## Oversikt

DB-lagret finns redan (migration `20260321_chat_system.sql` + `20260321_chat_rls_patch.sql`): `chats`, `chat_members`, `messages` med RLS, auto-creation trigger, och duplicate-prevention via `member_hash`. Denna plan tacker Vue-frontend: komponenter, Pinia store, Supabase Realtime-subscriptions, och integration i befintligt GameView-panelsystem.

**Beslut fran anvandaren:**
- Ladda senaste 20 meddelanden per chatt (ingen infinite scroll)
- Spelare kan skapa nya chattar (med duplicate-prevention via member_hash)
- GM-meddelanden far distinkt visuell stil

## Fas-uppdelning

### Fas 1 -- Pinia store (`src/stores/chat.js`)

- [x] Skapa store med state: `chats`, `messages` (Map), `activeChatId`, `onlineUserIds` (Set), `gmUserId`, `lastReadMap` (Map)
- [x] Computed: `unreadCounts` (Map), `totalUnread` (sum), `sortedChats` (senaste meddelande forst)
- [x] `loadChats(campaignId)` -- hamta chattar via chat_members join, senaste 20 meddelanden per chatt, campaign.created_by for gmUserId
- [x] `sendMessage(chatId, content)` -- insert i messages
- [x] `markRead(chatId)` -- update chat_members.last_read_at = now()
- [x] `renameChat(chatId, name)` -- update chat_members.custom_name

**Success criteria:** Store kan ladda chattar, skicka meddelanden, och markera last.

### Fas 2 -- Baskomponenter

- [x] `src/components/chat/PresenceIndicator.vue` -- gron/gra prick, props: userId
- [x] `src/components/chat/ChatList.vue` -- listar sortedChats, visar custom_name || chat.name, unread badge, last message preview, presence-prickar
- [x] `src/components/chat/ChatConversation.vue` -- meddelandehistorik + skicka-input, auto-scroll, markRead vid oppning, GM-meddelanden med guld-border stil
- [x] `src/components/ChatterPanel.vue` -- wrapper: activeChatId === null -> ChatList, annars ChatConversation. Back-knapp.

**Success criteria:** Kan oppna panelen, se chattar, klicka in i en chatt, skicka meddelanden, se GM-stil.

### Fas 3 -- GameView-integration

- [x] Importera ChatterPanel och useChatStore i GameView.vue
- [x] Lagg till 4:e panel-knapp ("Chatter" med totalUnread badge)
- [x] Rendera `<ChatterPanel v-if="activePanel === 'chatter'" />` i panel-sloten
- [x] onMounted: `chatStore.loadChats(campaignId)`
- [x] onUnmounted: `chatStore.unsubscribe()`

**Success criteria:** Chatter-knapp syns, oppnar panelen, badge visar unread.

### Fas 4 -- Realtime-subscriptions

- [x] En Postgres Changes-kanal for messages (`chat-messages:${campaignId}`), RLS filtrerar server-side
- [x] Handler: push nytt meddelande till lokal messages-map, auto-markRead om aktiv chatt
- [x] En Presence-kanal (`presence:${campaignId}`), track user_id, sync -> uppdatera onlineUserIds
- [x] `subscribe(campaignId)` och `unsubscribe()` metoder i store
- [x] Koppla subscribe/unsubscribe i GameView mount/unmount

**Success criteria:** Meddelanden fran annan spelare dyker upp i realtid. Presence-prickar uppdateras.

### Fas 5 -- Chattskapande

- [x] "New Chat"-knapp i ChatList -> member picker (checkboxar fran gameStore.players)
- [x] Client-side SHA-256 hash av sorterade user_ids (samma format som DB-triggern)
- [x] Insert chats + chat_members, hantera unique constraint violation -> oppna befintlig chatt
- [x] Oppna den nya/befintliga chatten direkt

**Success criteria:** Kan skapa DM, duplicate returnerar befintlig chatt, ny chatt syns i listan.

## Spelregler och edge cases

- GM (campaigns.created_by) kan se alla chattar via `is_gm()` RLS
- GM-meddelanden far guld-border (matchar befintligt `.narrative`-monster fran HistoryPanel)
- Sabbat-spelare finns i bade Sabbat-chatt OCH sin publika sekt-chatt (hanteras av DB-triggern)
- member_hash-berakning maste matcha exakt mellan client och DB-trigger (kommaseparerade sorterade UUIDs -> SHA-256 hex)
- chat_members.custom_name ar per-anvandare, inte globalt

## Kanda risker

- **Hash-mismatch:** Client-side crypto.subtle och Postgres pgcrypto maste producera identisk hash. Verifieras i fas 5.
- **RLS + Realtime:** Supabase Realtime med RLS kraver att tabellen har RLS enabled (har den) och att subscription gors med anvandarens auth-token (standard). Testar i fas 4.
- **Prenumerations-livscykel:** Om GameView unmountas utan unsubscribe lacker kanaler. Saker via onUnmounted.

## Parking lot
*(Noteringar som dyker upp under implementation)*
