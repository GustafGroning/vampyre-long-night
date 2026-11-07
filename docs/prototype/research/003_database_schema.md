# Databasschema — Fullständig referens

**Datum:** 2026-03-19
**Källa:** `information_schema.columns` från Supabase (public schema)

---

## Tabellöversikt

| Tabell | Kolumner | Syfte |
|--------|----------|-------|
| profiles | 5 | Per-user metadata (GM-flag, display name) |
| campaigns | 11 | Kampanjdata, rondnummer, status, deadlines |
| players | 22 | Spelarkaraktärer med stats, titel, blod, VP |
| cities | 18 | Städer med stats, kontroll, karta |
| city_adjacencies | 3 | Vilka städer gränsar till varandra |
| city_contests | 5 | Vilka spelare contestar vilka städer |
| city_problems | 9 | Negativa effekter på städer |
| city_specials | 11 | Positiva effekter/specials på städer |
| clan_definitions | 8 | 14 klaner med boons/curses/disciplines (referens) |
| action_definitions | 20 | ~60 aktionstyper med krav och metadata |
| actions | 17 | Inlämnade aktioner per ronda |
| active_modifiers | 9 | Temporära modifiers (stealth/str/intercept-buffs etc.) |
| minions | 14 | Spelarnas minions med typ, level, stats |
| player_disciplines | 5 | Vilka disciplines varje spelare har |
| artifacts | 8 | Artefakter i spel (vem bär, burned?) |
| artifact_definitions | 10 | 30 artefakter med aktioner/bonusar (referens) |
| combats | 21 | Stridsloggar med rolls, deal, press, wound |
| debates | 8 | Ivory Tower-debatter per ronda |
| debate_options | 7 | Alternativ i debatter |
| debate_votes | 5 | Röster per spelare och alternativ |
| missions | 11 | Justicar-missions med kriterier och belöning |
| sabbat_bases | 5 | Dolda sabbat-baser per stad |
| round_updates | 9 | Personaliserade rundresultat per spelare |
| round_news | 6 | Publika nyheter per ronda |
| game_log | 8 | GM-only fullständig händelselogg |
| chats | 6 | Chattkanaler per kampanj (auto-skapade + manuella) |
| chat_members | 6 | Vilka användare tillhör vilken chatt |
| messages | 5 | Chattmeddelanden |

---

## Detaljerat schema per tabell

### profiles
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | (FK → auth.users) |
| display_name | text | YES | |
| is_gm | boolean | NO | false |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Syfte:** Per-user metadata utanför `auth.users`. Auto-skapas via trigger vid signup.
**RLS:** Alla kan läsa (SELECT). Användare kan bara uppdatera sin egen rad, och bara `display_name`-kolumnen (column-level grant). `is_gm` sätts manuellt av admin/GM via dashboard eller SQL.
**Används av:** `is_gm()` helper-funktionen som alla chat-RLS-policys refererar till.

### campaigns
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | |
| created_by | uuid | NO | |
| status | USER-DEFINED (campaign_status) | NO | 'setup' |
| current_round | integer | NO | 0 |
| max_rounds | integer | NO | 8 |
| round_phase | USER-DEFINED (round_phase) | NO | 'action_submission' |
| action_deadline_hours | integer | NO | 168 |
| combat_negotiation_hours | integer | NO | 6 |
| masquerade_collapse | boolean | NO | false |
| settings | jsonb | NO | '{}' |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### players
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| user_id | uuid | NO | |
| name | text | NO | |
| clan | USER-DEFINED | NO | |
| sect | USER-DEFINED | NO | |
| title | USER-DEFINED | NO | |
| disguise_title | USER-DEFINED | YES | |
| is_exposed_sabbat | boolean | NO | false |
| base_strength | integer | NO | 0 |
| base_stealth | integer | NO | 0 |
| base_intercept | integer | NO | 0 |
| blood | integer | NO | 0 |
| vp | integer | NO | 0 |
| exp_total | integer | NO | 0 |
| royal_privileges | integer | NO | 0 |
| city_id | uuid | YES | |
| is_in_torpor | boolean | NO | false |
| torpor_awaken_count | integer | NO | 0 |
| is_burned | boolean | NO | false |
| blood_last_round | integer | YES | |
| has_used_trifle_this_round | boolean | NO | false |
| has_blood_hunt | boolean | NO | false |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### cities
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| name | text | NO | |
| display_name | text | NO | |
| controller_id | uuid | YES | |
| stability | integer | NO | 3 |
| max_stability | integer | NO | 5 |
| blood_flow | integer | NO | 100 |
| base_blood_flow | integer | NO | 100 |
| masquerade_status | integer | NO | 3 |
| max_masquerade | integer | NO | 5 |
| intercept | integer | NO | 1 |
| is_port | boolean | NO | false |
| sea_region | text | YES | |
| has_storm | boolean | NO | false |
| revolt_counters | integer | NO | 0 |
| influence | integer | NO | 0 |
| is_contested | boolean | NO | false |
| map_x | double precision | YES | |
| map_y | double precision | YES | |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### city_adjacencies
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| city_a_id | uuid | NO | |
| city_b_id | uuid | NO | |
| campaign_id | uuid | NO | |

### city_contests
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| city_id | uuid | NO | |
| player_id | uuid | NO | |
| started_round | integer | NO | |
| created_at | timestamptz | NO | now() |

### city_problems
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| city_id | uuid | NO | |
| name | text | NO | |
| description | text | YES | |
| effects | jsonb | NO | '{}' |
| is_resolved | boolean | NO | false |
| created_round | integer | NO | 0 |
| created_at | timestamptz | NO | now() |

### city_specials
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| city_id | uuid | NO | |
| name | text | NO | |
| special_key | text | NO | |
| description | text | YES | |
| effects | jsonb | NO | '{}' |
| is_burned | boolean | NO | false |
| duration_rounds | integer | YES | |
| created_round | integer | NO | 0 |
| created_at | timestamptz | NO | now() |

### clan_definitions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| clan | USER-DEFINED | NO | |
| name | text | NO | |
| description | text | NO | |
| disciplines | ARRAY | NO | |
| boon_name | text | NO | |
| boon_text | text | NO | |
| curse_name | text | NO | |
| curse_text | text | NO | |

### action_definitions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| action_key | text | NO | |
| name | text | NO | |
| category | text | NO | |
| description | text | NO | |
| base_cost | integer | NO | 0 |
| stealth_mod | integer | YES | |
| is_undetectable | boolean | NO | false |
| is_trifle | boolean | NO | false |
| uses_action_slot | boolean | NO | true |
| cant_be_hidden | boolean | NO | false |
| required_title | ARRAY | YES | |
| required_sect | ARRAY | YES | |
| required_discipline | USER-DEFINED | YES | |
| requires_mastered | boolean | NO | false |
| required_minion_type | USER-DEFINED | YES | |
| needs_target_city | boolean | NO | false |
| needs_target_player | boolean | NO | false |
| needs_target_minion | boolean | NO | false |
| once_per_turn | boolean | NO | false |
| once_per_city_per_turn | boolean | NO | false |

### actions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| player_id | uuid | NO | |
| round | integer | NO | |
| action_order | integer | NO | |
| action_category | text | NO | |
| action_key | text | NO | |
| performer_type | text | NO | 'player' |
| performer_minion_id | uuid | YES | |
| params | jsonb | NO | '{}' |
| blood_cost | integer | NO | 0 |
| is_trifle | boolean | NO | false |
| uses_action_slot | boolean | NO | true |
| stealth_modifier | integer | NO | 0 |
| status | USER-DEFINED (action_status) | NO | 'pending' |
| result | jsonb | YES | |
| failure_reason | text | YES | |
| created_at | timestamptz | NO | now() |
| resolved_at | timestamptz | YES | |

### active_modifiers
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| target_type | text | NO | |
| target_id | uuid | NO | |
| modifier_key | text | NO | |
| modifier_value | integer | NO | 0 |
| source | text | NO | |
| created_round | integer | NO | |
| expires_round | integer | YES | |
| created_at | timestamptz | NO | now() |

### minions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| owner_id | uuid | NO | |
| name | text | NO | |
| minion_type | USER-DEFINED | NO | |
| level | integer | NO | 1 |
| city_id | uuid | YES | |
| is_burned | boolean | NO | false |
| loyalty_counters | integer | NO | 0 |
| artifact_id | uuid | YES | |
| temp_strength_mod | integer | NO | 0 |
| temp_stealth_mod | integer | NO | 0 |
| temp_intercept_mod | integer | NO | 0 |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### player_disciplines
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| player_id | uuid | NO | |
| discipline | USER-DEFINED | NO | |
| is_mastered | boolean | NO | false |

### artifacts
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| definition_id | integer | NO | |
| carrier_player_id | uuid | YES | |
| carrier_minion_id | uuid | YES | |
| city_id | uuid | YES | |
| is_burned | boolean | NO | false |
| created_at | timestamptz | NO | now() |

### artifact_definitions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | integer | NO | |
| name | text | NO | |
| description | text | NO | |
| action_text | text | NO | |
| minion_bonus | text | YES | |
| cost | integer | NO | 0 |
| stealth_mod | integer | YES | |
| is_undetectable | boolean | NO | false |
| is_consumable | boolean | NO | false |

### combats
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| round | integer | NO | |
| city_id | uuid | NO | |
| attacker_player_id | uuid | YES | |
| attacker_minion_id | uuid | YES | |
| defender_player_id | uuid | YES | |
| defender_minion_id | uuid | YES | |
| attacker_strength | integer | NO | 0 |
| defender_strength | integer | NO | 0 |
| attacker_blood_spent | integer | NO | 0 |
| defender_blood_spent | integer | NO | 0 |
| attacker_roll | integer | YES | |
| defender_roll | integer | YES | |
| has_ambush | boolean | NO | false |
| winner_side | text | YES | |
| wound_roll | integer | YES | |
| was_deal_made | boolean | NO | false |
| deal_details | jsonb | YES | |
| press_count | integer | NO | 0 |
| status | text | NO | 'pending' |
| deadline | timestamptz | YES | |
| created_at | timestamptz | NO | now() |
| resolved_at | timestamptz | YES | |

### debates
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| round | integer | NO | |
| title | text | NO | |
| description | text | YES | |
| is_resolved | boolean | NO | false |
| winning_option_id | uuid | YES | |
| created_at | timestamptz | NO | now() |

### debate_options
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| debate_id | uuid | NO | |
| option_number | integer | NO | |
| name | text | NO | |
| description | text | YES | |
| effects | jsonb | NO | '{}' |
| total_votes | integer | NO | 0 |

### debate_votes
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| debate_id | uuid | NO | |
| option_id | uuid | NO | |
| player_id | uuid | NO | |
| votes | integer | NO | 1 |

### missions
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| player_id | uuid | NO | |
| title | text | NO | |
| description | text | NO | |
| criteria | jsonb | NO | '{}' |
| reward_blood | integer | NO | 0 |
| reward_vp | integer | NO | 0 |
| is_completed | boolean | NO | false |
| completed_round | integer | YES | |
| assigned_round | integer | NO | |
| created_at | timestamptz | NO | now() |

### sabbat_bases
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| city_id | uuid | NO | |
| level | integer | NO | 1 |
| created_at | timestamptz | NO | now() |

### round_updates
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| round | integer | NO | |
| player_id | uuid | NO | |
| entries | jsonb | NO | '[]' |
| blood_income | integer | NO | 0 |
| blood_spent | integer | NO | 0 |
| vp_gained | integer | NO | 0 |
| vp_lost | integer | NO | 0 |
| created_at | timestamptz | NO | now() |

### round_news
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| round | integer | NO | |
| entries | jsonb | NO | '[]' |
| gm_narrative | text | YES | |
| created_at | timestamptz | NO | now() |

### game_log
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | |
| round | integer | NO | |
| action_order | integer | YES | |
| log_type | text | NO | |
| message | text | NO | |
| details | jsonb | NO | '{}' |
| created_at | timestamptz | NO | now() |

### chats
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | NO | (FK → campaigns) |
| name | text | YES | |
| is_auto_created | boolean | NO | false |
| member_hash | text | YES | |
| created_at | timestamptz | NO | now() |

**Constraint:** UNIQUE (campaign_id, member_hash) — förhindrar dubbla 1-on-1-chattar.
**member_hash** beräknas automatiskt via trigger vid INSERT i chat_members (SHA-256 av sorterade user_ids).
**is_auto_created:** true för de 4 chattar som skapas automatiskt vid kampanjaktivering (All Players, Camarilla, Anarchs, Sabbat).

### chat_members
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| chat_id | uuid | NO | (FK → chats) |
| user_id | uuid | NO | (FK → auth.users) |
| custom_name | text | YES | |
| last_read_at | timestamptz | NO | now() |
| joined_at | timestamptz | NO | now() |

**Constraint:** UNIQUE (chat_id, user_id).
**RLS:** Användare kan bara UPDATE:a sin egen rad, och bara kolumnerna `custom_name` och `last_read_at` (column-level grant). Ingen DELETE-policy — spelare kan inte lämna chattar.
**Sabbat-spelare** läggs i BÅDE Sabbat-chatten OCH den publika sektchatten baserat på `disguise_title`.

### messages
| Kolumn | Typ | Null? | Default |
|--------|-----|-------|---------|
| id | uuid | NO | gen_random_uuid() |
| chat_id | uuid | NO | (FK → chats) |
| sender_id | uuid | NO | (FK → auth.users) |
| content | text | NO | |
| created_at | timestamptz | NO | now() |

**RLS:** Användare kan bara läsa/skicka meddelanden i chattar de är medlem i. GM (`is_gm()`) kan läsa/skicka i alla chattar.

---

## Observationer — schema vs spelregler

### Väl täckt i schemat
- **Alla spelarmekaniker**: blood, VP, EXP, stats, torpor, blood_hunt, trifle-tracking, disguise
- **Stadsmekaniker**: stability, MS, intercept, blood_flow, revolt_counters, influence, contested, storms
- **Combat**: Komplett 21-kolumns tabell med ambush, press, wound, deal, deadline
- **Ivory Tower**: debates + options + votes, fullt normaliserat
- **Sabbat**: baser med nivå, exponerings-flag på spelare
- **Missions**: kriterier, belöning, completion-tracking
- **Modifiers**: generiskt system för temporära buffs/debuffs med expiry

### Tabeller som frontenden INTE använder ännu
- `active_modifiers` — inte läst i game.js
- `city_contests` — inte läst (frontenden kollar bara `is_contested` boolean)
- `combats` — inte läst
- `debates`, `debate_options`, `debate_votes` — inte läst
- `missions` — inte läst
- `sabbat_bases` — inte läst
- `game_log` — inte läst (GM-only)

### Saknas i schemat (kan behövas)
- **Conquered cities tracking** — "VP from conquering a city once per city" behöver en tabell/kolumn
- **Sabbat scheme extra actions** — var lagras de delade extra-aktionerna?
- **Obsession tracking** (Toreador curse) — slumpmässig obsession per spelare
- **Diablerie history** — vilka har utfört diablerie (påverkar Sword of Judgment)

### Enum-typer och deras värden

**campaign_status:** setup → recruiting → active → paused → finished

**round_phase:** action_submission → resolving → combat_pending → resolved → income

**action_status:** pending → resolved → failed → refunded

**sect_type:** camarilla, anarch, sabbat

**title_type:** inner_circle, justicar, prince, baron, archbishop

**clan_type:** banu_haqim, brujah, ministry, gangrel, hecata, lasombra, malkavian, nosferatu, ravnos, salubri, toreador, tremere, tzimisce, ventrue (14 st)

**discipline_type:** animalism, auspex, celerity, chimerstry, dementation, dominate, fortitude, obfuscate, oblivion, potence, presence, protean, thaumaturgy, vicissitude (14 st)

**minion_type:** ghoul, harpy, eye, primogen, archon (5 st)

Alla matchar spelreglerna i game_design.txt exakt.
