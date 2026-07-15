# BikerLink — Report di coerenza DB (dev vs prod)

> **Generato:** 2026-07-14T11:25:16.511Z
> **Modalità:** sola lettura — nessuna modifica applicata al database.
> **Script sorgente:** `scripts/generate-db-check-report.ts` (rieseguibile).

Questo report fotografa lo stato del **DB di sviluppo** (interrogato live via `DATABASE_URL`) e lo confronta strutturalmente con il **DB di produzione** tramite lo snapshot offline `server/data/deep-schema-parity.prod.json` (la prod non è raggiungibile con una connection string diretta dalla sandbox Replit). I check di integrità/logici/range delle sezioni 2–4 girano sul DB dev live, quasi vuoto: la §7 rilancia la STESSA checklist sui **dati reali di produzione** via la replica read-only (`executeSql` con `environment: "production"`), colmando il gap.

## 0. Contesto

| Metrica | Valore |
|---|---|
| Tabelle (public) | 166 |
| Colonne totali | 1595 |
| Tabelle con almeno 1 riga | 48 / 166 |
| Righe totali (dev) | 128619 |

> ⚠️ **Il DB di sviluppo è quasi vuoto.** La maggior parte delle tabelle ha 0 righe. Molti check dati (FK orfane, range, duplicati) restituiscono quindi 0 violazioni per **assenza di dati**, non necessariamente per correttezza garantita in prod. La sezione strutturale (5) è la più significativa in questo contesto.

Tabelle popolate in dev:

| Tabella | Righe |
|---|---:|
| `ai_events` | 66137 |
| `site_visits` | 20499 |
| `ai_watchdog_log` | 9435 |
| `spatial_ref_sys` | 8500 |
| `pipeline_probe_history` | 8281 |
| `system_signals` | 4330 |
| `server_restarts` | 2881 |
| `system_health_snapshot` | 2365 |
| `db_integrity_runs` | 1664 |
| `db_integrity_violations` | 1052 |
| `moderator_logs` | 1020 |
| `integrity_violations` | 607 |
| `ai_suggestions_log` | 602 |
| `thinkcentre_health_events` | 254 |
| `ota_releases` | 220 |
| `schema_migrations` | 173 |
| `app_settings` | 144 |
| `tags` | 72 |
| `text_aliases` | 45 |
| `conversations` | 40 |
| `moto_clubs` | 40 |
| `match_zero_snapshots` | 29 |
| `moderator_digests` | 28 |
| `conversation_participants` | 20 |
| `easter_eggs` | 20 |
| `integrity_runs` | 20 |
| `moto_club_members` | 20 |
| `translation_keys` | 20 |
| `bio_affinity_matches` | 15 |
| `ai_analysis_artifacts` | 12 |
| `embeddings` | 8 |
| `match_preferences` | 8 |
| `user_profiles` | 8 |
| `users` | 8 |
| `ai_analysis_runs` | 6 |
| `match_rules` | 5 |
| `match_feedback` | 4 |
| `match_thresholds` | 4 |
| `moderation_thresholds` | 4 |
| `ai_usage_budget` | 3 |
| `tag_categories` | 3 |
| `user_match_profile` | 3 |
| `biker_biker_matches` | 2 |
| `diagnostic_reports` | 2 |
| `invitation_codes` | 2 |
| `user_motorcycles` | 2 |
| `session` | 1 |
| `weekly_system_reports` | 1 |

## 1. Inventario schema (DB dev)

| Categoria | Conteggio |
|---|---:|
| Tabelle | 166 |
| Colonne | 1595 |
| Tabelle con PRIMARY KEY | 163 |
| UNIQUE constraint | 16 |
| Indici UNIQUE | 228 |
| FOREIGN KEY | 157 |
| CHECK constraint | 3 |

**Tabelle senza PRIMARY KEY (3):** `digest_read_state`, `maps_quota`, `spatial_ref_sys`

<details><summary>CHECK constraint presenti (3)</summary>

- `spatial_ref_sys.spatial_ref_sys_srid_check`: `CHECK (((srid > 0) AND (srid <= 998999)))`
- `user_sessions.user_sessions_exit_type_check`: `CHECK (((exit_type)::text = ANY ((ARRAY['background'::character varying, 'logout'::character varying, 'crash'::character varying])::text[])))`
- `user_sessions.user_sessions_exit_type_chk`: `CHECK (((exit_type)::text = ANY ((ARRAY['background'::character varying, 'logout'::character varying, 'crash'::character varying])::text[])))`

</details>

> Nota: lo schema fa affidamento quasi esclusivamente su tipi/NOT NULL e sulla logica applicativa; i vincoli `CHECK` a livello DB sono solo 3 (di cui 2 duplicati su `user_sessions.exit_type` e 1 di sistema PostGIS). I set-valore per gli enum-stato sono imposti dal codice, non dal DB — vedi checklist (f).

<details><summary>Inventario colonne per tabella (166 tabelle)</summary>

**`ab_assignments`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| experiment_key | character varying(100) | NO |  |
| user_id | character varying(36) | NO |  |
| variant | character varying(60) | NO |  |
| assigned_at | timestamp without time zone | NO | now() |

**`ab_events`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| experiment_key | character varying(100) | NO |  |
| variant | character varying(60) | NO |  |
| user_id | character varying(36) | YES |  |
| event_name | character varying(60) | NO |  |
| payload | jsonb | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ab_experiments`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| key | character varying(100) | NO |  |
| description | text | YES |  |
| variants | jsonb | NO |  |
| status | character varying(20) | NO | 'running'::character varying |
| started_at | timestamp without time zone | NO | now() |
| ended_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`ad_campaigns`** — 20 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| name | character varying(200) | NO |  |
| sponsor | character varying(200) | NO | 'Syneco Lubrificanti'::character varying |
| image_url | text | YES |  |
| link_url | text | YES |  |
| display_mode | character varying(30) | NO | 'banner'::character varying |
| description | text | YES |  |
| is_active | boolean | NO | true |
| impressions | integer | NO | 0 |
| start_date | timestamp without time zone | YES |  |
| end_date | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| target_user_type | character varying(30) | NO | 'biker'::character varying |
| rotation_duration | integer | NO | 10 |
| rotation_mode | character varying(20) | NO | 'sequential'::character varying |
| sort_order | integer | NO | 0 |
| placement | character varying(30) | NO | 'all'::character varying |
| image_version | integer | NO | 0 |
| group_id | text | YES |  |
| ghosted_at | timestamp without time zone | YES |  |

**`ad_clicks`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| campaign_id | character varying(36) | NO |  |
| user_id | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_analysis_artifacts`** — 11 colonne, 12 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| run_id | uuid | NO |  |
| kind | character varying(24) | NO |  |
| title | character varying(200) | NO |  |
| content | text | NO |  |
| sensitivity | character varying(16) | NO | 'internal'::character varying |
| shared_with | jsonb | YES | '[]'::jsonb |
| mirror_path | text | YES |  |
| content_hash | character varying(64) | YES |  |
| expires_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_analysis_runs`** — 11 colonne, 6 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| persona | character varying(16) | NO | 'horus'::character varying |
| trigger | character varying(16) | NO | 'schedule'::character varying |
| fingerprint | character varying(64) | YES |  |
| status | character varying(16) | NO | 'completed'::character varying |
| duration_ms | integer | YES |  |
| artifact_count | integer | NO | 0 |
| model_id | character varying(100) | YES |  |
| summary | text | YES |  |
| error_message | text | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_assistant_telemetry`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| event_type | character varying(40) | NO |  |
| platform | character varying(16) | NO |  |
| user_role | character varying(20) | YES |  |
| user_id | character varying(36) | YES |  |
| payload | jsonb | YES | '{}'::jsonb |
| created_at | timestamp without time zone | NO | now() |

**`ai_call_logs`** — 15 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| provider | character varying(40) | NO |  |
| model_id | character varying(100) | NO |  |
| tokens_in | integer | NO | 0 |
| tokens_out | integer | NO | 0 |
| latency_ms | integer | YES |  |
| cost_usd | double precision | NO | 0 |
| degraded | boolean | NO | false |
| error | text | YES |  |
| created_at | timestamp without time zone | NO | now() |
| security_blocked | boolean | NO | false |
| persona | character varying(16) | YES |  |
| source_app | character varying(32) | YES |  |
| notification_status | character varying(16) | YES |  |

**`ai_conflicts`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| event_id_a | character varying(36) | NO |  |
| event_id_b | character varying(36) | NO |  |
| conflict_type | character varying(80) | NO |  |
| resolved_by | character varying(16) | NO | 'none'::character varying |
| policy_rule_id | character varying(80) | YES |  |
| resolution_rationale | text | YES |  |
| resolved_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_conversation_state`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| source_app | character varying(32) | NO | 'main_app'::character varying |
| active_persona | character varying(16) | NO |  |
| handoff_reason | character varying(32) | YES |  |
| updated_at | timestamp without time zone | NO | now() |
| expires_at | timestamp without time zone | NO |  |
| intro_shown_personas | jsonb | NO | '[]'::jsonb |

**`ai_conversation_turns`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| role | character varying(20) | NO |  |
| content | text | NO |  |
| summary_of | uuid | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_conversations`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| admin_user_id | character varying(36) | NO |  |
| title | character varying(200) | YES |  |
| scopes_hint | jsonb | YES |  |
| summary | text | YES |  |
| entities | jsonb | YES |  |
| last_message_at | timestamp without time zone | NO | now() |
| archived_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`ai_decisions`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| ai_name | character varying(80) | NO |  |
| decision_type | character varying(80) | NO |  |
| input | jsonb | NO | '{}'::jsonb |
| output | jsonb | NO | '{}'::jsonb |
| rationale | text | YES |  |
| confidence | numeric | YES |  |
| took_ms | integer | NO | 0 |
| correlation_id | character varying(80) | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_events`** — 7 colonne, 66137 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| ai_name | character varying(80) | NO |  |
| event_type | character varying(80) | NO |  |
| payload | jsonb | NO | '{}'::jsonb |
| severity | character varying(16) | NO | 'info'::character varying |
| correlation_id | character varying(80) | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_knowledge_gaps`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fingerprint | character varying(64) | NO |  |
| question | text | NO |  |
| persona | character varying(16) | YES |  |
| source_app | character varying(32) | YES |  |
| top_score | double precision | YES |  |
| occurrences | integer | NO | 1 |
| status | character varying(16) | NO | 'open'::character varying |
| resolution_note | text | YES |  |
| last_seen_at | timestamp without time zone | NO | now() |
| created_at | timestamp without time zone | NO | now() |

**`ai_learned_knowledge`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fingerprint | character varying(64) | NO |  |
| question | text | NO |  |
| answer | text | NO |  |
| persona | character varying(16) | YES |  |
| source | character varying(24) | NO | 'auto-learn:gap'::character varying |
| model_id | character varying(100) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`ai_messages`** — 13 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_id | character varying(36) | NO |  |
| role | character varying(16) | NO |  |
| content | text | NO | ''::text |
| scopes | jsonb | YES |  |
| tool_calls | jsonb | YES |  |
| entities | jsonb | YES |  |
| model | character varying(80) | YES |  |
| provider | character varying(30) | YES |  |
| tokens_in | integer | NO | 0 |
| tokens_out | integer | NO | 0 |
| cost_usd | numeric | NO | '0'::numeric |
| created_at | timestamp without time zone | NO | now() |

**`ai_pinned_insights`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_id | character varying(36) | NO |  |
| message_id | character varying(36) | NO |  |
| admin_user_id | character varying(36) | NO |  |
| title | character varying(200) | YES |  |
| note | text | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`ai_suggestions_log`** — 18 colonne, 602 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| report_id | character varying(36) | YES |  |
| user_id | character varying(36) | YES |  |
| scope | character varying(30) | NO |  |
| prompt | text | YES |  |
| response | text | YES |  |
| model | character varying(80) | YES |  |
| provider | character varying(30) | YES |  |
| tokens_in | integer | NO | 0 |
| tokens_out | integer | NO | 0 |
| cost_usd | numeric | NO | '0'::numeric |
| suggestion | jsonb | YES |  |
| accepted_by_admin_id | character varying(36) | YES |  |
| accepted_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| rejected_by_admin_id | character varying(36) | YES |  |
| rejected_at | timestamp without time zone | YES |  |
| reject_reason | character varying(300) | YES |  |

**`ai_usage_budget`** — 6 colonne, 3 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| month | character varying(7) | NO |  |
| total_cost_usd | numeric | NO | '0'::numeric |
| limit_usd | numeric | NO | '55'::numeric |
| alert_sent_80 | boolean | NO | false |
| alert_sent_100 | boolean | NO | false |
| updated_at | timestamp without time zone | NO | now() |

**`ai_vps_jobs`** — 13 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_user_id | character varying | NO |  |
| kind | character varying(16) | NO | 'job'::character varying |
| command | text | NO |  |
| label | character varying(120) | YES |  |
| status | character varying(16) | NO | 'running'::character varying |
| results_path | text | YES |  |
| exit_code | integer | YES |  |
| result_summary | text | YES |  |
| error_message | text | YES |  |
| started_at | timestamp without time zone | NO | now() |
| finished_at | timestamp without time zone | YES |  |
| notified_at | timestamp without time zone | YES |  |

**`ai_watchdog_log`** — 14 colonne, 9435 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| kind | character varying(30) | NO |  |
| scope | character varying(60) | YES |  |
| status | character varying(20) | NO | 'ok'::character varying |
| summary | text | YES |  |
| details | jsonb | YES |  |
| proposal_id | character varying(36) | YES |  |
| accepted_by_admin_id | character varying(36) | YES |  |
| accepted_at | timestamp without time zone | YES |  |
| rejected_by_admin_id | character varying(36) | YES |  |
| rejected_at | timestamp without time zone | YES |  |
| reject_reason | character varying(300) | YES |  |
| cost_usd | double precision | NO | 0 |
| created_at | timestamp without time zone | NO | now() |

**`anomaly_events`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| type | character varying(40) | NO |  |
| category | character varying(40) | YES |  |
| window_minutes | integer | NO | 60 |
| observed | integer | NO | 0 |
| threshold | double precision | NO | 0 |
| details | jsonb | YES |  |
| notified_admins | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |

**`app_crash_logs`** — 15 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| session_id | character varying(64) | NO |  |
| crash_type | character varying(20) | NO |  |
| app_version | character varying(32) | YES |  |
| platform | character varying(16) | YES |  |
| os_version | character varying(50) | YES |  |
| device_model | character varying(100) | YES |  |
| error_message | text | YES |  |
| stack_trace | text | YES |  |
| session_started_at | timestamp without time zone | YES |  |
| session_ended_at | timestamp without time zone | YES |  |
| reported_at | timestamp without time zone | NO | now() |
| device_brand | character varying(100) | YES |  |
| total_memory_mb | integer | YES |  |

**`app_settings`** — 6 colonne, 144 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| key | character varying(100) | NO |  |
| value | text | YES |  |
| value_json | jsonb | YES |  |
| description | text | YES |  |
| updated_at | timestamp without time zone | NO | now() |

**`arcade_scores`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| game | USER-DEFINED | NO |  |
| score | integer | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`biker_biker_matches`** — 12 colonne, 2 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| biker1_id | character varying(36) | NO |  |
| biker2_id | character varying(36) | NO |  |
| motorcycle_brand | character varying(100) | NO |  |
| status | character varying(20) | NO | 'new'::character varying |
| created_at | timestamp without time zone | NO | now() |
| is_supermatch | boolean | NO | false |
| pair_type | character varying(10) | NO | 'bb'::character varying |
| archived_at | timestamp without time zone | YES |  |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| score_breakdown | jsonb | NO | '{}'::jsonb |

**`biker_zavorrina_matches`** — 12 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| biker_id | character varying(36) | NO |  |
| zavorrina_id | character varying(36) | NO |  |
| biker_motorcycle_id | character varying(36) | NO |  |
| wishlist_moto_id | character varying(36) | NO |  |
| status | character varying(20) | NO | 'new'::character varying |
| created_at | timestamp without time zone | NO | now() |
| is_supermatch | boolean | NO | false |
| archived_at | timestamp without time zone | YES |  |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| score_breakdown | jsonb | NO | '{}'::jsonb |

**`bio_affinity_matches`** — 10 colonne, 15 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_a_id | character varying(36) | NO |  |
| user_b_id | character varying(36) | NO |  |
| similarity | double precision | NO |  |
| model | character varying(80) | YES |  |
| status | character varying(20) | NO | 'new'::character varying |
| archived_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |

**`bowie_terminal_tokens`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| device_id | character varying(128) | NO |  |
| user_id | character varying(36) | NO |  |
| push_token | text | NO |  |
| created_at | timestamp without time zone | NO | now() |
| last_active_at | timestamp without time zone | NO | now() |
| revoked_at | timestamp without time zone | YES |  |

**`business_clicks`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| business_id | character varying(36) | NO |  |
| user_id | character varying(36) | YES |  |
| action_type | character varying(20) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`business_passage_stats`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| business_id | character varying(36) | NO |  |
| period_month | character varying(7) | NO |  |
| qualified_passages | integer | NO | 0 |
| unique_riders | integer | NO | 0 |
| radius_m | integer | NO | 0 |
| computed_at | timestamp without time zone | NO | now() |

**`businesses`** — 20 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| type | character varying(20) | NO | 'locale'::character varying |
| name | character varying(200) | NO |  |
| address | text | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| phone | character varying(30) | YES |  |
| whatsapp | character varying(30) | YES |  |
| email | character varying(255) | YES |  |
| website | text | YES |  |
| description | text | YES |  |
| promo_text | text | YES |  |
| event_url | text | YES |  |
| opening_hours | jsonb | YES |  |
| logo_url | text | YES |  |
| is_approved | boolean | NO | false |
| is_active | boolean | NO | true |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| access_token | character varying(64) | YES |  |

**`collected_easter_eggs`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| easter_egg_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| collected_at | timestamp without time zone | NO | now() |

**`conversation_participants`** — 5 colonne, 20 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| joined_at | timestamp without time zone | NO | now() |
| last_read_at | timestamp without time zone | YES |  |

**`conversations`** — 6 colonne, 40 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_type | character varying(20) | NO | 'private'::character varying |
| title | character varying(200) | YES |  |
| proposal_id | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`coordinate_history`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| latitude | double precision | NO |  |
| longitude | double precision | NO |  |
| slot | integer | NO | 1 |
| created_at | timestamp without time zone | NO | now() |

**`custom_route_waypoints`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| route_id | character varying(36) | NO |  |
| order_index | integer | NO | 0 |
| name | character varying(200) | NO |  |
| description | text | YES |  |
| latitude | double precision | NO |  |
| longitude | double precision | NO |  |
| waypoint_type | character varying(20) | NO | 'stop'::character varying |
| created_at | timestamp without time zone | NO | now() |

**`custom_routes`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| title | character varying(200) | NO |  |
| description | text | YES |  |
| total_distance_km | double precision | YES | 0 |
| is_public | boolean | NO | true |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| visibility | character varying(20) | NO | 'public'::character varying |

**`daily_push_counts`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| day | character varying(10) | NO |  |
| individual_count | integer | NO | 0 |
| digest_count | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |

**`daily_vote_counts`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| vote_date | character varying(10) | NO |  |
| count | integer | NO | 0 |

**`db_integrity_quarantine`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| violation_id | character varying(36) | YES |  |
| source_table | character varying(80) | NO |  |
| source_pk | character varying(80) | NO |  |
| payload | jsonb | NO |  |
| reason | text | YES |  |
| ttl_expires_at | timestamp without time zone | NO |  |
| restored_at | timestamp without time zone | YES |  |
| purged_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`db_integrity_runs`** — 10 colonne, 1664 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| trigger | character varying(20) | NO | 'manual'::character varying |
| run_at | timestamp without time zone | NO | now() |
| duration_ms | integer | NO | 0 |
| checks_run | integer | NO | 0 |
| violations_found | integer | NO | 0 |
| auto_fixed | integer | NO | 0 |
| manual_pending | integer | NO | 0 |
| expensive | boolean | NO | false |
| notes | text | YES |  |

**`db_integrity_violations`** — 17 colonne, 1052 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| run_id | character varying(36) | NO |  |
| check_id | character varying(80) | NO |  |
| check_name | character varying(160) | NO |  |
| severity | character varying(10) | NO |  |
| category | character varying(40) | NO |  |
| count | integer | NO | 0 |
| sample | jsonb | NO | '[]'::jsonb |
| details | jsonb | YES |  |
| hash | character varying(64) | NO |  |
| status | character varying(20) | NO | 'open'::character varying |
| auto_fix_applied | boolean | NO | false |
| auto_fix_summary | text | YES |  |
| ai_explain | jsonb | YES |  |
| ai_explain_cost_usd | double precision | NO | 0 |
| created_at | timestamp without time zone | NO | now() |
| resolved_at | timestamp without time zone | YES |  |

**`device_metrics`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| session_id | character varying(64) | NO |  |
| platform | character varying(16) | YES |  |
| memory_used_mb | integer | YES |  |
| memory_total_mb | integer | YES |  |
| battery_level | integer | YES |  |
| battery_state | character varying(20) | YES |  |
| app_uptime_seconds | integer | YES |  |
| recorded_at | timestamp without time zone | NO | now() |

**`diagnostic_queue`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| commanded_by | character varying(36) | YES |  |
| show_banner | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |
| expires_at | timestamp without time zone | NO |  |
| executed_at | timestamp without time zone | YES |  |

**`diagnostic_reports`** — 12 colonne, 2 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| triggered_by | character varying(20) | NO | 'auto'::character varying |
| app_version | character varying(50) | YES |  |
| platform | character varying(20) | YES |  |
| device_model | character varying(100) | YES |  |
| run_at | timestamp without time zone | NO | now() |
| sentry_event_id | character varying(100) | YES |  |
| summary | jsonb | YES |  |
| results | jsonb | YES |  |
| reviewed_by_agent | timestamp without time zone | YES |  |
| build_profile | character varying(20) | YES |  |

**`digest_read_state`** — 3 colonne, 0 righe · ⚠️ no PK

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| moderator_id | character varying(36) | NO |  |
| digest_id | character varying(36) | NO |  |
| read_at | timestamp without time zone | NO | now() |

**`direct_match_requests`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| sender_id | character varying(36) | NO |  |
| receiver_id | character varying(36) | NO |  |
| status | character varying(20) | NO | 'pending'::character varying |
| created_at | timestamp without time zone | NO | now() |

**`easter_eggs`** — 10 colonne, 20 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| name | character varying(200) | NO |  |
| description | text | YES |  |
| latitude | double precision | NO |  |
| longitude | double precision | NO |  |
| radius | integer | NO | 100 |
| icon_url | text | YES |  |
| points | integer | NO | 10 |
| is_active | boolean | NO | true |
| created_at | timestamp without time zone | NO | now() |

**`email_verification_tokens`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| token | character varying(64) | NO |  |
| expires_at | timestamp without time zone | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`embedding_call_log`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('embedding_call_log_id_seq'::reg |
| entity_type | text | NO |  |
| entity_id | text | NO |  |
| field | text | NO |  |
| model | text | NO |  |
| cached | boolean | NO | false |
| created_at | timestamp with time zone | NO | now() |

**`embeddings`** — 9 colonne, 8 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| entity_type | character varying(40) | NO |  |
| entity_id | character varying(36) | NO |  |
| field | character varying(40) | NO |  |
| embedding | USER-DEFINED | NO |  |
| model | character varying(80) | NO |  |
| source_hash | character varying(64) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`entity_tags`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| entity_type | character varying(30) | NO |  |
| entity_id | character varying(36) | NO |  |
| tag_id | character varying(36) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`event_club_invites`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| event_id | character varying(36) | NO |  |
| club_id | character varying(36) | NO |  |
| invited_at | timestamp without time zone | NO | now() |

**`event_images`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| event_id | character varying(36) | NO |  |
| image_url | character varying(1000) | NO |  |
| sort_order | integer | NO | 0 |
| uploaded_at | timestamp without time zone | NO | now() |

**`event_participants`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| event_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| participation_status | character varying(20) | NO | 'going'::character varying |
| joined_at | timestamp without time zone | NO | now() |

**`events`** — 24 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| title | character varying(200) | NO |  |
| description | text | YES |  |
| event_type | character varying(30) | NO | 'raduno'::character varying |
| creator_id | character varying(36) | NO |  |
| location_name | character varying(300) | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| event_date | timestamp without time zone | NO |  |
| event_time | character varying(5) | YES |  |
| is_recurring | boolean | NO | false |
| recurrence_info | text | YES |  |
| max_participants | integer | YES |  |
| website_url | character varying(500) | YES |  |
| auto_invite_reason | text | YES |  |
| auto_invite_region | character varying(100) | YES |  |
| auto_invite_brand | character varying(100) | YES |  |
| status | character varying(20) | NO | 'pending'::character varying |
| rejection_reason | text | YES |  |
| approved_by | character varying(36) | YES |  |
| approved_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| geom | USER-DEFINED | YES |  |

**`fake_user_interactions`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| fake_user_id | character varying(36) | NO |  |
| real_user_id | character varying(36) | NO |  |
| interaction_type | character varying(30) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`feedback_tickets`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| ticket_type | character varying(30) | NO | 'feedback'::character varying |
| subject | character varying(200) | NO |  |
| message | text | NO |  |
| status | character varying(20) | NO | 'open'::character varying |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| internal_note | text | YES |  |
| device_info | jsonb | YES |  |

**`geo_cell_labels`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| geohash | character varying(12) | NO |  |
| label | character varying(200) | NO |  |
| center_lat | double precision | YES |  |
| center_lon | double precision | YES |  |
| visit_count | integer | NO | 0 |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`gps_errors`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| route_id | character varying(36) | YES |  |
| platform | character varying(20) | YES |  |
| os_version | character varying(50) | YES |  |
| context | character varying(200) | YES |  |
| error_message | text | YES |  |
| stack_trace | text | YES |  |
| speed_kmh | double precision | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`gps_rejection_stats`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| device_id | character varying(128) | NO | 'unknown'::character varying |
| platform | character varying(20) | YES |  |
| rejection_count | integer | NO | 0 |
| last_rejected_payload | text | YES |  |
| last_rejected_at | timestamp without time zone | NO | now() |
| last_source | character varying(20) | YES |  |

**`integrity_quarantine`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| violation_id | character varying(36) | YES |  |
| family | character varying(20) | NO |  |
| source_path | character varying(500) | NO |  |
| payload | jsonb | NO |  |
| reason | text | YES |  |
| ttl_expires_at | timestamp without time zone | NO |  |
| restored_at | timestamp without time zone | YES |  |
| purged_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`integrity_runs`** — 12 colonne, 20 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| trigger | character varying(20) | NO | 'manual'::character varying |
| family | character varying(20) | NO | 'all'::character varying |
| run_at | timestamp without time zone | NO | now() |
| duration_ms | integer | NO | 0 |
| checks_run | integer | NO | 0 |
| violations_found | integer | NO | 0 |
| auto_fixed | integer | NO | 0 |
| manual_pending | integer | NO | 0 |
| expensive | boolean | NO | false |
| notes | text | YES |  |
| auto_resolved | integer | NO | 0 |

**`integrity_violations`** — 17 colonne, 607 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| run_id | character varying(36) | NO |  |
| family | character varying(20) | NO |  |
| check_id | character varying(120) | NO |  |
| check_name | character varying(200) | NO |  |
| severity | character varying(10) | NO |  |
| count | integer | NO | 0 |
| sample | jsonb | NO | '[]'::jsonb |
| details | jsonb | YES |  |
| hash | character varying(64) | NO |  |
| status | character varying(20) | NO | 'open'::character varying |
| auto_fix_applied | boolean | NO | false |
| auto_fix_summary | text | YES |  |
| ai_explain | jsonb | YES |  |
| ai_explain_cost_usd | double precision | NO | 0 |
| created_at | timestamp without time zone | NO | now() |
| resolved_at | timestamp without time zone | YES |  |

**`invitation_codes`** — 12 colonne, 2 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| code | character varying(50) | NO |  |
| created_by | character varying(36) | YES |  |
| used_by | character varying(36) | YES |  |
| max_uses | integer | NO | 1 |
| current_uses | integer | NO | 0 |
| is_active | boolean | NO | true |
| expires_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| label | character varying(100) | YES |  |
| gift_message | text | YES |  |
| image_url | text | YES |  |

**`maps_quota`** — 4 colonne, 0 righe · ⚠️ no PK

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| provider_id | character varying(100) | NO |  |
| year_month | character varying(7) | NO |  |
| count | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |

**`maps_telemetry_events`** — 12 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| event | character varying(40) | NO |  |
| renderer | character varying(30) | YES |  |
| component | character varying(60) | YES |  |
| engine | character varying(30) | YES |  |
| duration_ms | integer | YES |  |
| error_message | character varying(500) | YES |  |
| platform | character varying(20) | YES |  |
| app_version | character varying(30) | YES |  |
| details | jsonb | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`match_feedback`** — 9 colonne, 4 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| other_user_id | character varying(36) | NO |  |
| match_kind | character varying(40) | NO |  |
| feature_key | character varying(80) | NO |  |
| action | character varying(20) | NO |  |
| reason_tag | character varying(60) | YES |  |
| match_ref_id | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`match_negative_preferences`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| kind | character varying(40) | NO |  |
| value | jsonb | NO |  |
| source | character varying(20) | NO | 'manual'::character varying |
| created_at | timestamp without time zone | NO | now() |

**`match_notification_deliveries`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| match_table | character varying(40) | NO |  |
| match_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| channel | character varying(20) | NO | 'push'::character varying |
| delivered_at | timestamp without time zone | NO | now() |

**`match_preferences`** — 29 colonne, 8 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| biker_biker_brand | boolean | NO | true |
| biker_zavorrina_brand | boolean | NO | true |
| biker_club_brand | boolean | NO | true |
| zavorrina_club_brand | boolean | NO | true |
| biker_biker_type_style | boolean | NO | true |
| biker_zavorrina_type_style | boolean | NO | true |
| biker_biker_distance | boolean | NO | true |
| biker_zavorrina_distance | boolean | NO | true |
| biker_biker_music | boolean | NO | true |
| biker_zavorrina_music | boolean | NO | true |
| biker_biker_lean_angle | boolean | NO | true |
| biker_biker_route_type_zone | boolean | NO | true |
| biker_zavorrina_route_type_zone | boolean | NO | true |
| biker_biker_avg_speed | boolean | NO | true |
| biker_biker_avg_duration | boolean | NO | true |
| biker_biker_day_time | boolean | NO | true |
| biker_biker_events | boolean | NO | true |
| direct_match | boolean | NO | true |
| updated_at | timestamp without time zone | NO | now() |
| top_matches_only | boolean | NO | false |
| route_affinity | boolean | NO | true |
| bio_affinity | boolean | NO | true |
| music_affinity | boolean | NO | true |
| planned_route_invite | boolean | NO | true |
| time_overlap | boolean | NO | true |
| weekly_recap | boolean | NO | true |
| telemetry_affinity | boolean | NO | true |

**`match_rules`** — 8 colonne, 5 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| search_type_a | character varying(60) | NO |  |
| search_type_b | character varying(60) | NO |  |
| compatible | boolean | NO | true |
| weight | double precision | NO | 1 |
| notes | text | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`match_thresholds`** — 4 colonne, 4 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| category | character varying(40) | NO |  |
| jaccard_threshold | double precision | NO | 0.3 |
| min_common_tags | integer | NO | 1 |
| updated_at | timestamp without time zone | NO | now() |

**`match_zero_snapshots`** — 5 colonne, 29 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| snapshot_date | date | NO |  |
| total_users | integer | NO | 0 |
| zero_match_count | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |

**`media_library`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| type | character varying(10) | NO | 'pdf'::character varying |
| title_it | character varying(300) | NO |  |
| title_en | character varying(300) | NO |  |
| url | text | NO |  |
| thumbnail_url | text | YES |  |
| sort_order | integer | NO | 0 |
| created_at | timestamp without time zone | NO | now() |

**`messages`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_id | character varying(36) | NO |  |
| sender_id | character varying(36) | NO |  |
| message_type | character varying(20) | NO | 'text'::character varying |
| content | text | YES |  |
| image_url | text | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| is_filtered | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |
| playlist_id | integer | YES |  |

**`moderation_thresholds`** — 5 colonne, 4 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| target_role | character varying(20) | NO |  |
| action | character varying(20) | NO |  |
| threshold | integer | NO |  |
| updated_at | timestamp without time zone | NO | now() |

**`moderator_digests`** — 5 colonne, 28 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| moderator_id | character varying(36) | NO |  |
| date | character varying(10) | NO |  |
| payload | jsonb | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`moderator_logs`** — 7 colonne, 1020 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| moderator_id | character varying(36) | NO |  |
| action | character varying(100) | NO |  |
| target_type | character varying(50) | NO |  |
| target_id | character varying(36) | NO |  |
| details | text | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`moto_club_invites`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| club_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| invited_by | character varying(36) | YES |  |
| status | character varying(20) | NO | 'pending'::character varying |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`moto_club_members`** — 7 colonne, 20 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| club_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| role | character varying(20) | NO | 'member'::character varying |
| status | character varying(20) | NO | 'active'::character varying |
| joined_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`moto_club_requests`** — 16 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| name | character varying(200) | NO |  |
| club_type | character varying(20) | NO |  |
| brand_name | character varying(100) | YES |  |
| model_name | character varying(100) | YES |  |
| requested_by | character varying(36) | YES |  |
| status | character varying(20) | NO | 'pending'::character varying |
| review_note | text | YES |  |
| reviewed_by | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| parent_club_id | character varying(36) | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| invite_radius_km | integer | YES |  |
| invite_user_ids | text | YES |  |

**`moto_clubs`** — 27 colonne, 40 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| name | character varying(200) | NO |  |
| club_type | character varying(20) | NO |  |
| brand_name | character varying(100) | YES |  |
| model_name | character varying(100) | YES |  |
| country | character varying(2) | YES |  |
| region | character varying(100) | YES |  |
| logo_url | text | YES |  |
| cover_url | text | YES |  |
| description | text | YES |  |
| is_approved | boolean | NO | false |
| is_featured | boolean | NO | false |
| member_count | integer | NO | 0 |
| activity_score | integer | NO | 0 |
| conversation_id | character varying(36) | YES |  |
| created_by | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| parent_club_id | character varying(36) | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| proposed_latitude | double precision | YES |  |
| proposed_longitude | double precision | YES |  |
| proposed_address | text | YES |  |
| proposed_by | character varying(36) | YES |  |
| proposed_at | timestamp without time zone | YES |  |
| allow_zavorrine | boolean | NO | true |

**`motorcycle_photos`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| motorcycle_id | character varying(36) | NO |  |
| photo_url | text | NO |  |
| sort_order | integer | NO | 0 |
| created_at | timestamp without time zone | NO | now() |

**`music_affinity_matches`** — 12 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_a_id | character varying(36) | NO |  |
| user_b_id | character varying(36) | NO |  |
| tag_score | double precision | NO | 0 |
| embedding_score | double precision | NO | 0 |
| combined_score | double precision | NO |  |
| tag_common | integer | NO | 0 |
| status | character varying(20) | NO | 'new'::character varying |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| archived_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`music_match_dismissals`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('music_match_dismissals_id_seq': |
| user_id | character varying(36) | NO |  |
| dismissed_user_id | character varying(36) | NO |  |
| dismissed_at | timestamp without time zone | NO | now() |

**`newsletter_subscribers`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('newsletter_subscribers_id_seq': |
| email | character varying(254) | NO |  |
| notify_rides | boolean | NO | true |
| created_at | timestamp without time zone | NO | now() |

**`notification_history`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| notification_type | character varying(60) | NO | 'unknown'::character varying |
| token | text | YES |  |
| status | character varying(20) | NO | 'sent'::character varying |
| error_message | text | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`notifications`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| title | character varying(200) | NO |  |
| body | text | YES |  |
| notification_type | character varying(50) | NO |  |
| reference_type | character varying(50) | YES |  |
| reference_id | character varying(36) | YES |  |
| is_read | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |

**`ota_assistant_runs`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| admin_id | character varying(36) | YES |  |
| prompt | text | NO |  |
| response | text | YES |  |
| tool_calls | text | YES |  |
| status | character varying(20) | NO | 'completed'::character varying |
| error | text | YES |  |
| log_path | text | YES |  |
| started_at | timestamp without time zone | NO | now() |
| finished_at | timestamp without time zone | YES |  |

**`ota_boot_events`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| release_id | character varying(36) | NO |  |
| user_id | character varying(36) | YES |  |
| device_id | character varying(80) | NO |  |
| event_type | character varying(20) | NO |  |
| platform | character varying(16) | YES |  |
| app_version | character varying(32) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| device_model | text | YES |  |

**`ota_releases`** — 22 colonne, 220 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| eas_update_id | character varying(200) | NO |  |
| channel | character varying(50) | NO | 'staging'::character varying |
| runtime_version | character varying(50) | YES |  |
| message | text | YES |  |
| ota_version | character varying(50) | YES |  |
| status | character varying(20) | NO | 'pending'::character varying |
| published_at | timestamp without time zone | NO | now() |
| approved_at | timestamp without time zone | YES |  |
| approved_by | character varying(36) | YES |  |
| rejected_at | timestamp without time zone | YES |  |
| rejected_by | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| eas_group_id | character varying(200) | YES |  |
| boot_success_count | integer | NO | 0 |
| boot_failure_count | integer | NO | 0 |
| download_count | integer | NO | 0 |
| auto_rollback_enabled | boolean | NO | false |
| auto_rollback_threshold | integer | NO | 70 |
| auto_rollback_min_downloads | integer | NO | 10 |
| auto_rollback_window_minutes | integer | NO | 30 |
| auto_rolled_back_at | timestamp without time zone | YES |  |

**`ota_watchdog_reports`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| generated_at | timestamp without time zone | NO | now() |
| triggered_by | character varying(36) | YES |  |
| candidate_count | integer | NO | 0 |
| payload | text | NO |  |
| threshold | integer | NO |  |
| min_downloads | integer | NO |  |

**`password_reset_tokens`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| token | character varying(64) | NO |  |
| expires_at | timestamp without time zone | NO |  |
| used | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |

**`pending_auto_suggestions`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| kind | character varying(40) | NO |  |
| value | jsonb | NO |  |
| reject_count | integer | NO | 0 |
| status | character varying(20) | NO | 'pending'::character varying |
| created_at | timestamp without time zone | NO | now() |
| resolved_at | timestamp without time zone | YES |  |

**`phone_sharing_tracker`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| conversation_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| shared_count | integer | NO | 0 |

**`photo_contest_entries`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| photo_url | text | YES |  |
| caption | text | YES |  |
| week_number | integer | NO |  |
| year | integer | NO |  |
| votes_count | integer | NO | 0 |
| is_approved | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |
| performance_data | text | YES |  |

**`photo_votes`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| entry_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`photo_winners`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| entry_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| week_number | integer | NO |  |
| year | integer | NO |  |
| total_votes | integer | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`pipeline_flow_events`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| pipeline | character varying(60) | NO |  |
| trace_id | character varying(32) | NO |  |
| checkpoint | character varying(80) | NO |  |
| ts | timestamp without time zone | NO | now() |
| meta_json | jsonb | YES |  |
| resolved | boolean | NO | false |

**`pipeline_probe_history`** — 6 colonne, 8281 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('pipeline_probe_history_id_seq': |
| pipeline | character varying(60) | NO |  |
| overall | character varying(20) | NO |  |
| steps | jsonb | NO |  |
| duration_ms | integer | NO |  |
| run_at | timestamp without time zone | NO | now() |

**`planned_route_invites`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| route_id | character varying(36) | NO |  |
| owner_id | character varying(36) | NO |  |
| suggested_user_id | character varying(36) | NO |  |
| score | double precision | NO |  |
| reasons | jsonb | NO | '{}'::jsonb |
| priority | character varying(10) | NO | 'normal'::character varying |
| status | character varying(20) | NO | 'suggested'::character varying |
| notified_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`planned_routes`** — 26 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| title | character varying(200) | NO |  |
| description | text | YES |  |
| waypoints | jsonb | YES | '[]'::jsonb |
| polyline | text | YES |  |
| distance_km | double precision | YES | 0 |
| duration_minutes | integer | YES | 0 |
| biker_score | double precision | YES | 0 |
| real_curvature_score | double precision | YES |  |
| style | character varying(20) | NO | 'curvy'::character varying |
| visibility | character varying(20) | NO | 'public'::character varying |
| is_multi_day | boolean | NO | false |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| navigation_steps | jsonb | YES |  |
| elevation_profile | jsonb | YES |  |
| elevation_gain_m | integer | YES |  |
| altitude_min_m | integer | YES |  |
| altitude_max_m | integer | YES |  |
| geohash_cells | jsonb | NO | '[]'::jsonb |
| curvy_score_avg | double precision | YES |  |
| estimated_departure_window | jsonb | YES |  |
| derived_tags | ARRAY | NO | ARRAY[]::text[] |
| analyzed_at | timestamp without time zone | YES |  |

**`proposal_matches`** — 13 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| proposal_id_1 | character varying(36) | NO |  |
| proposal_id_2 | character varying(36) | NO |  |
| user_id_1 | character varying(36) | NO |  |
| user_id_2 | character varying(36) | NO |  |
| status | character varying(20) | NO | 'pending'::character varying |
| accepted_by_user_1 | boolean | NO | false |
| accepted_by_user_2 | boolean | NO | false |
| conversation_id | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| archived_at | timestamp without time zone | YES |  |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |

**`proposal_participants`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| proposal_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| joined_at | timestamp without time zone | NO | now() |

**`proposal_profile_matches`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| proposal_id | character varying(36) | NO |  |
| biker_id | character varying(36) | NO |  |
| zavorrina_id | character varying(36) | NO |  |
| distance_km | double precision | YES |  |
| status | character varying(20) | NO | 'new'::character varying |
| created_at | timestamp without time zone | NO | now() |
| archived_at | timestamp without time zone | YES |  |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| reset_count | integer | NO | 0 |

**`proposal_zone_notifications`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| proposal_id | character varying(36) | NO |  |
| sent_at | timestamp without time zone | NO | now() |

**`proposals`** — 33 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| proposal_type | character varying(30) | NO |  |
| title | character varying(200) | NO |  |
| description | text | YES |  |
| departure_latitude | double precision | YES |  |
| departure_longitude | double precision | YES |  |
| departure_address | text | YES |  |
| scheduled_at | timestamp without time zone | YES |  |
| max_participants | integer | YES |  |
| status | character varying(20) | NO | 'active'::character varying |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| search_type | character varying(30) | YES |  |
| search_radius | integer | YES |  |
| motorcycle_id | character varying(36) | YES |  |
| wishlist_moto_id | character varying(36) | YES |  |
| any_moto_ok | boolean | NO | false |
| destination_address | text | YES |  |
| destination_latitude | double precision | YES |  |
| destination_longitude | double precision | YES |  |
| departure_time_from | timestamp without time zone | YES |  |
| departure_time_to | timestamp without time zone | YES |  |
| return_deadline | timestamp without time zone | YES |  |
| stops | jsonb | YES |  |
| expires_at | timestamp without time zone | YES |  |
| club_id | character varying(36) | YES |  |
| extend_to_destination | boolean | NO | false |
| destination_search_radius | integer | YES |  |
| search_types | jsonb | YES |  |
| target_user_types | jsonb | YES |  |
| departure_geom | USER-DEFINED | YES |  |
| destination_geom | USER-DEFINED | YES |  |

**`push_tokens`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| app_id | character varying(32) | NO | 'main'::character varying |
| device_id | character varying(128) | YES |  |
| token | text | NO |  |
| platform | character varying(16) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`reports`** — 22 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| reporter_id | character varying(36) | NO |  |
| reported_user_id | character varying(36) | NO |  |
| reason | character varying(100) | NO |  |
| description | text | YES |  |
| status | character varying(20) | NO | 'pending'::character varying |
| resolved_by | character varying(36) | YES |  |
| resolved_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| category | character varying(40) | YES |  |
| context | character varying(20) | YES |  |
| context_id | character varying(64) | YES |  |
| reported_user_role | character varying(20) | YES |  |
| severity | character varying(10) | NO | 'low'::character varying |
| affected_feedback_loop | boolean | NO | false |
| reporter_trust_score | double precision | NO | 1.0 |
| assigned_moderator_id | character varying(36) | YES |  |
| assigned_at | timestamp without time zone | YES |  |
| ai_analysis | jsonb | YES |  |
| ai_analyzed_at | timestamp without time zone | YES |  |
| ai_model | text | YES |  |
| disable_ai_analysis | boolean | NO | false |

**`resource_samples`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| sampled_at | timestamp without time zone | NO | now() |
| avg_ram_pct | integer | YES |  |
| avg_battery_pct | integer | YES |  |
| online_users | integer | YES |  |
| db_size_mb | integer | YES |  |
| backend_rss_mb | integer | YES |  |
| avg_ios_ram_pct | integer | YES |  |
| avg_android_ram_pct | integer | YES |  |
| source | character varying(40) | YES |  |

**`ride_telemetry`** — 20 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('ride_telemetry_id_seq'::regclas |
| user_id | character varying(36) | NO |  |
| session_id | character varying(36) | NO |  |
| session_type | character varying(10) | NO | 'ride'::character varying |
| ts | bigint | NO |  |
| lat | double precision | YES |  |
| lon | double precision | YES |  |
| speed_kmh | real | YES |  |
| lean_angle | real | YES |  |
| gforce_x | real | YES |  |
| gforce_y | real | YES |  |
| gforce_z | real | YES |  |
| heading | real | YES |  |
| altitude_m | real | YES |  |
| matched | boolean | NO | false |
| created_at | timestamp with time zone | NO | now() |
| lap_name | character varying(60) | YES |  |
| match_status | character varying(12) | NO | 'pending'::character varying |
| match_attempts | integer | NO | 0 |
| last_match_attempt_at | timestamp with time zone | YES |  |

**`road_hazard_comments`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| hazard_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| text | character varying(140) | NO |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`road_hazard_confirms`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| hazard_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`road_hazards`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| type | character varying(20) | NO |  |
| lat | double precision | NO |  |
| lng | double precision | NO |  |
| description | character varying(140) | YES |  |
| confirm_count | integer | NO | 0 |
| is_approved | boolean | NO | true |
| expires_at | timestamp without time zone | YES |  |
| deleted_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`route_affinity_matches`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_a_id | character varying(36) | NO |  |
| user_b_id | character varying(36) | NO |  |
| common_cells | integer | NO |  |
| score | double precision | NO |  |
| top_places | jsonb | NO | '[]'::jsonb |
| status | character varying(20) | NO | 'new'::character varying |
| created_at | timestamp without time zone | NO | now() |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| archived_at | timestamp without time zone | YES |  |

**`route_points`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| route_id | character varying(36) | NO |  |
| latitude | double precision | NO |  |
| longitude | double precision | NO |  |
| altitude | double precision | YES |  |
| speed_kmh | double precision | YES |  |
| timestamp | timestamp without time zone | NO | now() |
| accel_g | double precision | YES |  |
| tilt_deg | double precision | YES |  |

**`route_voice_notes`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| route_id | character varying(36) | NO |  |
| text | text | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`route_weather_cache`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| route_id | character varying(36) | NO |  |
| departure_time | timestamp without time zone | NO |  |
| weather_data | jsonb | YES | '{}'::jsonb |
| created_at | timestamp without time zone | NO | now() |

**`routes`** — 23 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| title | character varying(200) | YES |  |
| tracking_frequency | integer | NO | 5 |
| status | character varying(20) | NO | 'active'::character varying |
| total_distance_km | double precision | YES | 0 |
| max_speed_kmh | double precision | YES | 0 |
| avg_speed_kmh | double precision | YES | 0 |
| max_altitude | double precision | YES | 0 |
| duration_seconds | integer | YES | 0 |
| likes | integer | NO | 0 |
| started_at | timestamp without time zone | NO | now() |
| stopped_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| idle_time_seconds | integer | YES | 0 |
| max_tilt_deg | double precision | YES |  |
| max_acceleration_g | double precision | YES |  |
| is_sprint | boolean | NO | false |
| sprint_0to100_ms | integer | YES |  |
| max_deceleration_g | double precision | YES |  |
| gps_blackout_count | integer | NO | 0 |
| gps_blackout_seconds | integer | NO | 0 |
| max_lateral_g | double precision | YES |  |

**`schema_migrations`** — 2 colonne, 173 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| filename | text | NO |  |
| applied_at | timestamp with time zone | NO | now() |

**`segment_telemetry`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| osm_way_id | bigint | NO |  |
| avg_lean_angle | double precision | YES |  |
| max_lean_angle | double precision | YES |  |
| avg_gforce | double precision | YES |  |
| sample_count | integer | NO | 0 |
| last_updated | timestamp without time zone | NO | now() |
| curvy_score | double precision | YES |  |

**`server_restarts`** — 3 colonne, 2881 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| started_at | timestamp without time zone | NO | now() |
| reason | character varying(50) | NO | 'restart'::character varying |

**`session`** — 3 colonne, 1 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| sid | character varying | NO |  |
| sess | json | NO |  |
| expire | timestamp without time zone | NO |  |

**`shared_playlists`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('shared_playlists_id_seq'::regcl |
| from_user_id | character varying(36) | NO |  |
| to_user_id | character varying(36) | NO |  |
| conversation_id | character varying(36) | YES |  |
| tracks_data | jsonb | NO |  |
| track_count | integer | NO |  |
| shared_at | timestamp without time zone | NO | now() |
| merged_at | timestamp without time zone | YES |  |

**`site_visits`** — 12 colonne, 20499 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| visitor_id | character varying(64) | NO |  |
| user_id | character varying(36) | YES |  |
| event | character varying(20) | NO | 'view'::character varying |
| path | text | NO |  |
| referrer | text | YES |  |
| user_agent | text | YES |  |
| ip_hash | character varying(64) | YES |  |
| ip_prefix | character varying(48) | YES |  |
| lang | character varying(10) | YES |  |
| country | character varying(2) | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`sos_requests`** — 11 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| requester_id | character varying(36) | NO |  |
| helper_id | character varying(36) | YES |  |
| reason | text | NO |  |
| status | character varying(20) | NO | 'active'::character varying |
| latitude | double precision | NO |  |
| longitude | double precision | NO |  |
| conversation_id | character varying(36) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| radius_km | integer | NO | 10 |

**`spatial_ref_sys`** — 5 colonne, 8500 righe · ⚠️ no PK

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| srid | integer | NO |  |
| auth_name | character varying(256) | YES |  |
| auth_srid | integer | YES |  |
| srtext | character varying(2048) | YES |  |
| proj4text | character varying(2048) | YES |  |

**`sprint_results`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| route_id | character varying(36) | YES |  |
| sprint_0to100_ms | integer | NO |  |
| max_acceleration_g | double precision | YES |  |
| max_deceleration_g | double precision | YES |  |
| max_tilt_deg | double precision | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`system_health_snapshot`** — 6 colonne, 2365 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| status | character varying(10) | NO |  |
| score | integer | NO | 100 |
| problems | jsonb | NO | '[]'::jsonb |
| metrics | jsonb | NO | '{}'::jsonb |
| created_at | timestamp without time zone | NO | now() |

**`system_signals`** — 8 colonne, 4330 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| source | character varying(40) | NO |  |
| metric | character varying(80) | NO |  |
| value | double precision | YES |  |
| unit | character varying(20) | YES |  |
| severity | character varying(10) | NO | 'info'::character varying |
| details | jsonb | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`tag_categories`** — 5 colonne, 3 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| slug | character varying(50) | NO |  |
| label | character varying(100) | NO |  |
| description | text | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`tags`** — 5 colonne, 72 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| category_id | character varying(36) | NO |  |
| slug | character varying(80) | NO |  |
| label | character varying(120) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`telemetry_affinity_matches`** — 12 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_a_id | character varying(36) | NO |  |
| user_b_id | character varying(36) | NO |  |
| algorithmic_score | double precision | NO | 0 |
| embedding_score | double precision | NO | 0 |
| combined_score | double precision | NO |  |
| style_labels | jsonb | NO | '[]'::jsonb |
| status | character varying(20) | NO | 'new'::character varying |
| notification_priority | character varying(10) | NO | 'normal'::character varying |
| notified_at | timestamp without time zone | YES |  |
| archived_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`text_aliases`** — 8 colonne, 45 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| category | character varying(50) | NO |  |
| input_normalized | character varying(200) | NO |  |
| target_id | character varying(36) | YES |  |
| target_value | character varying(200) | YES |  |
| confidence | real | NO | 1.0 |
| source | character varying(20) | NO | 'seed'::character varying |
| created_at | timestamp without time zone | NO | now() |

**`thinkcentre_health_events`** — 5 colonne, 254 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| service_key | character varying(30) | YES |  |
| transition_from | character varying(20) | NO |  |
| transition_to | character varying(20) | NO |  |
| occurred_at | timestamp without time zone | NO | now() |

**`translation_keys`** — 9 colonne, 20 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| key | character varying(200) | NO |  |
| position | character varying(200) | YES |  |
| it | text | YES |  |
| en | text | YES |  |
| de | text | YES |  |
| es | text | YES |  |
| fr | text | YES |  |
| el | text | YES |  |
| tr | text | YES |  |

**`user_blocks`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| blocker_id | character varying(36) | NO |  |
| blocked_id | character varying(36) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`user_curvy_profile`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| avg_curvy | double precision | NO | 0 |
| sample_count | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |

**`user_devices`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| model | character varying(100) | NO |  |
| platform | character varying(16) | YES |  |
| os_version | character varying(50) | YES |  |
| first_seen_at | timestamp without time zone | NO | now() |
| last_seen_at | timestamp without time zone | NO | now() |

**`user_favorites`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| favorite_user_id | character varying(36) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`user_lastfm_sessions`** — 4 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| lastfm_username | character varying(200) | NO |  |
| session_key | character varying(500) | NO |  |
| connected_at | timestamp without time zone | NO | now() |

**`user_match_profile`** — 5 colonne, 3 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| feature_weights | jsonb | NO | '{}'::jsonb |
| feature_stats | jsonb | NO | '{}'::jsonb |
| feedback_count | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |

**`user_motorcycles`** — 14 colonne, 2 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| brand | character varying(100) | NO |  |
| model | character varying(100) | NO |  |
| year | integer | YES |  |
| displacement | integer | YES |  |
| motorcycle_type | character varying(50) | YES |  |
| riding_style | character varying(50) | YES |  |
| photo_url | text | YES |  |
| created_at | timestamp without time zone | NO | now() |
| is_for_sale | boolean | NO | false |
| sale_description | text | YES |  |
| is_default | boolean | NO | false |
| moto_description | text | YES |  |

**`user_music_tokens`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| provider_user_id | character varying(200) | NO |  |
| display_name | character varying(200) | YES |  |
| access_token | text | NO |  |
| refresh_token | text | NO |  |
| expires_at | timestamp without time zone | NO |  |
| connected_at | timestamp without time zone | NO | now() |
| last_sync_at | timestamp without time zone | YES |  |

**`user_music_tracks`** — 12 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | integer | NO | nextval('user_music_tracks_id_seq'::regc |
| user_id | character varying(36) | NO |  |
| lastfm_track_id | character varying(200) | NO |  |
| track_name | character varying(500) | NO |  |
| artist_id | character varying(200) | NO |  |
| artist_name | character varying(300) | NO |  |
| album_name | character varying(500) | YES |  |
| genres | ARRAY | YES | '{}'::text[] |
| popularity | integer | YES | 0 |
| added_at | timestamp without time zone | NO | now() |
| image_url | character varying(500) | YES |  |
| provider | character varying(20) | NO | 'lastfm'::character varying |

**`user_photos`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| photo_url | text | NO |  |
| sort_order | integer | NO | 0 |
| is_approved | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |

**`user_playlist_snapshots`** — 3 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| tracks_json | jsonb | NO |  |
| saved_at | timestamp without time zone | NO | now() |

**`user_privacy_log`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| setting_key | character varying(64) | NO |  |
| new_value | boolean | NO |  |
| changed_at | timestamp without time zone | NO | now() |

**`user_profiles`** — 53 colonne, 8 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| is_available | boolean | NO | false |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| max_pickup_distance | integer | YES | 50 |
| bio | text | YES |  |
| total_km | double precision | NO | 0 |
| total_rides | integer | NO | 0 |
| easter_eggs_collected | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |
| search_preference | character varying(20) | NO | 'both'::character varying |
| admin_override_until | timestamp without time zone | YES |  |
| preferred_map_style | character varying(20) | YES |  |
| email_chat_notifications | boolean | NO | false |
| hide_from_map | boolean | NO | false |
| position_fuzz | boolean | NO | false |
| position_fuzz_km | integer | NO | 1 |
| fake_home_enabled | boolean | NO | false |
| home_latitude | double precision | YES |  |
| home_longitude | double precision | YES |  |
| fake_home_latitude | double precision | YES |  |
| fake_home_longitude | double precision | YES |  |
| fake_home_radius | integer | NO | 2 |
| coordinates_updated_at | timestamp without time zone | YES |  |
| gps_precision | character varying(30) | NO | 'balanced'::character varying |
| units_preference | jsonb | YES |  |
| offline_position_randomize | boolean | NO | true |
| fake_work_enabled | boolean | NO | false |
| work_latitude | double precision | YES |  |
| work_longitude | double precision | YES |  |
| fake_work_latitude | double precision | YES |  |
| fake_work_longitude | double precision | YES |  |
| fake_work_radius | integer | NO | 2 |
| fake_whatever_enabled | boolean | NO | false |
| whatever_latitude | double precision | YES |  |
| whatever_longitude | double precision | YES |  |
| fake_whatever_latitude | double precision | YES |  |
| fake_whatever_longitude | double precision | YES |  |
| fake_whatever_radius | integer | NO | 2 |
| last_offline_lat | double precision | YES |  |
| last_offline_lng | double precision | YES |  |
| map_filters | jsonb | YES |  |
| notification_preferences | jsonb | NO | '{"chat": true, "eventi": true, "matches |
| push_notifications_enabled | boolean | NO | true |
| hide_online_status | boolean | NO | false |
| hide_last_seen | boolean | NO | false |
| hide_distance | boolean | NO | false |
| geom | USER-DEFINED | YES |  |
| music_taste_text | text | YES |  |
| fixed_position_enabled | boolean | NO | false |
| fixed_position_lat | double precision | YES |  |
| fixed_position_lng | double precision | YES |  |

**`user_route_fingerprints`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| cells | jsonb | NO | '{}'::jsonb |
| cell_count | integer | NO | 0 |
| center_lat | double precision | YES |  |
| center_lon | double precision | YES |  |
| last_route_at | timestamp without time zone | YES |  |
| updated_at | timestamp without time zone | NO | now() |

**`user_sessions`** — 10 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| started_at | timestamp without time zone | NO | now() |
| last_heartbeat_at | timestamp without time zone | YES |  |
| ended_at | timestamp without time zone | YES |  |
| duration_seconds | integer | YES |  |
| exit_type | character varying(20) | YES |  |
| device_model | character varying(100) | YES |  |
| platform | character varying(16) | YES |  |
| app_version | character varying(32) | YES |  |

**`user_telemetry_profile`** — 15 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| user_id | character varying(36) | NO |  |
| total_sessions | integer | NO | 0 |
| total_km | double precision | NO | 0 |
| avg_speed_kmh | double precision | NO | 0 |
| p75_speed_kmh | double precision | NO | 0 |
| avg_lean_angle | double precision | NO | 0 |
| max_lean_avg | double precision | NO | 0 |
| avg_duration_min | double precision | NO | 0 |
| fraction_morning | double precision | NO | 0 |
| fraction_evening | double precision | NO | 0 |
| speed_bucket | character varying(10) | NO | 'medium'::character varying |
| lean_bucket | character varying(10) | NO | 'touring'::character varying |
| duration_bucket | character varying(10) | NO | 'medium'::character varying |
| data_quality | integer | NO | 0 |
| updated_at | timestamp without time zone | NO | now() |

**`user_time_profile`** — 6 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| histogram | jsonb | NO |  |
| total_rides | integer | NO | 0 |
| label | character varying(50) | YES |  |
| updated_at | timestamp without time zone | NO | now() |

**`users`** — 58 colonne, 8 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| nickname | character varying(50) | NO |  |
| email | character varying(255) | NO |  |
| phone | character varying(30) | YES |  |
| password | text | NO |  |
| user_type | character varying(20) | NO | 'biker'::character varying |
| sex | character varying(5) | YES |  |
| couple_sex_config | character varying(10) | YES |  |
| role | character varying(20) | NO | 'user'::character varying |
| status | character varying(20) | NO | 'active'::character varying |
| birth_year | integer | YES |  |
| region | character varying(100) | YES |  |
| avatar_url | text | YES |  |
| eula_accepted | boolean | NO | false |
| invitation_code | character varying(50) | YES |  |
| last_login_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |
| email_verified | boolean | NO | false |
| deletion_requested_at | timestamp without time zone | YES |  |
| deletion_scheduled_for | timestamp without time zone | YES |  |
| is_fake | boolean | NO | false |
| is_primal | boolean | NO | false |
| country | character varying(2) | YES |  |
| spoken_languages | jsonb | YES | '[]'::jsonb |
| auto_join_clubs | boolean | NO | true |
| ghost_mode | boolean | NO | false |
| privacy_accepted | boolean | NO | false |
| consent_accepted_at | timestamp without time zone | YES |  |
| first_login_at | timestamp without time zone | YES |  |
| first_login_lat | double precision | YES |  |
| first_login_lng | double precision | YES |  |
| floating_widget_enabled | boolean | NO | true |
| last_logout_at | timestamp without time zone | YES |  |
| last_app_close_at | timestamp without time zone | YES |  |
| last_app_version | character varying(32) | YES |  |
| last_platform | character varying(16) | YES |  |
| expo_push_token | text | YES |  |
| last_seen_match_at | timestamp without time zone | YES |  |
| map_tester | boolean | NO | false |
| last_device_model | character varying(100) | YES |  |
| shadow_banned_at | timestamp without time zone | YES |  |
| shadow_ban_reason | text | YES |  |
| shadow_banned_until | timestamp without time zone | YES |  |
| suspended_until | timestamp without time zone | YES |  |
| admin_prefs | jsonb | YES | '{}'::jsonb |
| assistant_prefs | jsonb | YES | '{}'::jsonb |
| is_system | boolean | NO | false |
| telemetry_disabled | boolean | NO | false |
| marketing_consent | boolean | NO | false |
| matching_disabled | boolean | NO | false |
| mount_calibration | jsonb | YES |  |
| ais_enabled | boolean | NO | false |
| push_token_error | character varying(48) | YES |  |
| push_token_error_detail | text | YES |  |
| push_token_error_platform | character varying(16) | YES |  |
| push_token_error_at | timestamp without time zone | YES |  |
| last_main_app_foreground_at | timestamp without time zone | YES |  |

**`verification_codes`** — 8 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | YES |  |
| code_type | character varying(30) | NO |  |
| code | character varying(10) | NO |  |
| target | character varying(255) | NO |  |
| is_used | boolean | NO | false |
| expires_at | timestamp without time zone | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`weekly_recaps`** — 9 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| week_start | timestamp without time zone | NO |  |
| top_matches | jsonb | NO | '[]'::jsonb |
| stats | jsonb | NO | '{}'::jsonb |
| push_sent_at | timestamp without time zone | YES |  |
| opened_at | timestamp without time zone | YES |  |
| match_clicked_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | NO | now() |

**`weekly_system_reports`** — 6 colonne, 1 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| week_start | character varying(10) | NO |  |
| payload | jsonb | NO |  |
| model_used | character varying(80) | YES |  |
| cost_usd | double precision | NO | 0 |
| created_at | timestamp without time zone | NO | now() |

**`workshop_contacts`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| workshop_id | character varying(36) | NO |  |
| user_id | character varying(36) | NO |  |
| contact_type | character varying(20) | NO |  |
| created_at | timestamp without time zone | NO | now() |

**`workshops`** — 17 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| name | character varying(200) | NO |  |
| address | text | YES |  |
| latitude | double precision | YES |  |
| longitude | double precision | YES |  |
| phone | character varying(30) | YES |  |
| whatsapp | character varying(30) | YES |  |
| email | character varying(255) | YES |  |
| website | text | YES |  |
| description | text | YES |  |
| opening_hours | jsonb | YES |  |
| logo_url | text | YES |  |
| qr_code | text | YES |  |
| is_syneco_partner | boolean | NO | false |
| is_approved | boolean | NO | false |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

**`zavorrina_wishlist_motos`** — 7 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| wishlist_id | character varying(36) | NO |  |
| brand | character varying(100) | YES |  |
| model | character varying(100) | YES |  |
| riding_style | character varying(50) | YES |  |
| created_at | timestamp without time zone | NO | now() |
| motorcycle_type | character varying(50) | YES |  |

**`zavorrina_wishlist_photos`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| wishlist_id | character varying(36) | NO |  |
| photo_url | text | NO |  |
| sort_order | integer | NO | 0 |
| created_at | timestamp without time zone | NO | now() |

**`zavorrina_wishlists`** — 5 colonne, 0 righe

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| id | character varying(36) | NO | gen_random_uuid() |
| user_id | character varying(36) | NO |  |
| description | text | YES |  |
| created_at | timestamp without time zone | NO | now() |
| updated_at | timestamp without time zone | NO | now() |

</details>

## 2. Integrità referenziale (FK)

Per ogni FK: conteggio delle righe figlio il cui valore (tupla, composite-safe) non-NULL non ha un parent corrispondente, con fino a 5 esempi.

> ⚠️ **Confidenza limitata:** le FK sulle tabelle con 0 righe (la maggioranza in dev) sono saltate — nessuna violazione possibile senza dati. Questo check è forte solo in un DB popolato (prod).

✅ **Nessuna violazione FK rilevata** sulle tabelle popolate (157 FK ispezionate; le tabelle con 0 righe sono saltate).

## 3. Check logici e range (checklist deterministica chiusa)

Elenco fisso di controlli (a–f). Nessun check al di fuori di questo elenco. Per ciascuno: conteggio + fino a 5 esempi.

> ⚠️ **Confidenza limitata:** i check girano solo sulle tabelle popolate del DB dev (quasi tutte a 0 righe). Un esito "0 violazioni" qui NON garantisce assenza di anomalie in prod: significa solo che i pochi dati dev sono puliti. Le colonne/entità ispezionate sono elencate per rendere esplicita la copertura.

### (a) Coordinate fuori range

Latitudine ∉ [-90, 90] o longitudine ∉ [-180, 180]. Colonne `double precision` con nome lat/lon (incluse le coordinate "fuzz/fake" della privacy, che restano valori geografici validi).

Colonne ispezionate: 28 latitudine, 28 longitudine.

✅ Nessuna coordinata fuori range (0 violazioni).

### (b) Timestamp impossibili

`created_at` nel futuro; `updated_at` < `created_at`.

✅ Nessun timestamp impossibile (0 violazioni).

### (c) Contatori negativi

Colonne numeriche che non dovrebbero mai essere negative (km, distanze, contatori, like, punti, impression, click, ecc.).

Colonne-contatore ispezionate: 65 (`ad_campaigns.impressions`, `ai_analysis_runs.artifact_count`, `ai_knowledge_gaps.top_score`, `arcade_scores.score`, `custom_routes.total_distance_km`, `daily_push_counts.individual_count`, `daily_push_counts.digest_count`, `daily_vote_counts.count`, `db_integrity_violations.count`, `easter_eggs.points`, `events.max_participants`, `geo_cell_labels.visit_count`, `gps_rejection_stats.rejection_count`, `integrity_violations.count`, `maps_quota.count`, `match_zero_snapshots.zero_match_count`, `moto_club_requests.invite_radius_km`, `moto_clubs.member_count`, `moto_clubs.activity_score`, `music_affinity_matches.tag_score`, `music_affinity_matches.embedding_score`, `music_affinity_matches.combined_score`, `ota_releases.boot_success_count`, `ota_releases.boot_failure_count`, `ota_releases.download_count`, `ota_watchdog_reports.candidate_count`, `pending_auto_suggestions.reject_count`, `phone_sharing_tracker.shared_count`, `photo_contest_entries.votes_count`, `planned_route_invites.score`, …).

✅ Nessun contatore negativo (0 violazioni).

### (d) Entità pubblicate/attive con campi obbligatori NULL o vuoti

Set curato di controlli domain-specific sulle entità "visibili/attive/pubblicate".

| Check | Tabella | Violazioni | Esempi |
|---|---|---:|---|
| profili visibili in mappa (`hide_from_map=false`) senza coordinate condivise | `user_profiles` | 6 | `{"id":"a5fa9b18-b640-471e-af4e-e416be17b939","user`, `{"id":"82ec4893-6b98-425a-b9b7-384411956e75","user`, `{"id":"872cb06c-af1f-4678-80cf-c2f27d745a33","user`, `{"id":"f3d3062b-99f6-4366-ba9a-318431f0ede7","user`, `{"id":"a5c7bd9b-7389-4624-8947-139c9fd5538d","user` |

### (e) Telemetria / tracce senza GPS associato

✅ Nessuna traccia/telemetria senza GPS (0 violazioni).

### (f) Valori-stato fuori dal set ammesso

Poiché il DB ha quasi nessun `CHECK` constraint sugli stati, il set ammesso è definito dal codice. Set curato per le tabelle di dominio principali; per le altre colonne-stato viene elencata la distribuzione dei valori presenti (informativa).

✅ Nessun valore-stato fuori dal set ammesso sulle tabelle di dominio curate (0 violazioni).

<details><summary>Distribuzione valori-stato (colonne non curate, informativo)</summary>

- `ai_analysis_runs.status`: `completed`(6)
- `ai_watchdog_log.status`: `ok`(6239), `pending`(1597), `error`(1230), `warn`(369)
- `biker_biker_matches.status`: `new`(2)
- `bio_affinity_matches.status`: `new`(15)
- `db_integrity_violations.status`: `manual_pending`(1044), `ignored`(8)
- `integrity_violations.status`: `auto_resolved`(409), `open`(188), `auto_fixed`(10)
- `ota_releases.status`: `pending`(145), `rejected`(74), `approved`(1)
- `system_health_snapshot.status`: `red`(1590), `orange`(532), `yellow`(243)

</details>

## 4. Duplicati su colonne candidate-unique

Colonne semanticamente uniche (email, slug, nickname, ...) — verifica presenza di UNIQUE constraint/indice e rilevazione duplicati sui valori presenti.

> ⚠️ **Confidenza limitata:** la colonna "Copertura UNIQUE" (dai cataloghi) è affidabile a prescindere dai dati; la colonna "Duplicati" riflette solo i dati dev (scarsi) — l'assenza di duplicati in dev non implica assenza in prod.

| Colonna | Copertura UNIQUE (DB) | Duplicati (dev) |
|---|---|---|
| `businesses.email` | ⚠️ **nessuno** | — |
| `newsletter_subscribers.email` | ✅ single-col | — |
| `tag_categories.slug` | ✅ single-col | nessun duplicato |
| `tags.slug` | ➖ composita (category_id, slug) | `tourer`×2 — atteso (unique composta (category_id, slug)) |
| `users.email` | ✅ single-col | nessun duplicato |
| `users.nickname` | ⚠️ **nessuno** | nessun duplicato |
| `workshops.email` | ⚠️ **nessuno** | — |

> Legenda: **single-col** = UNIQUE su colonna singola (duplicati impossibili); **composita** = colonna parte di una UNIQUE multi-colonna (duplicati sul singolo valore leciti); **nessuno** = nessun vincolo di unicità a livello DB.

## 5. Parità dev↔prod e schema-in-DB vs schema-nel-codice

### 5a. Parità strutturale dev↔prod (deep-schema-parity)

Confronto `DATABASE_URL` (dev, live) ↔ `server/data/deep-schema-parity.prod.json` (snapshot prod catturato **2026-06-28T12:58:52.982Z**, 16 giorni fa). Confronta le DEFINIZIONI complete (tipo, default, constraint, indici, enum, trigger, extension, sequence).

**Esito: DRIFT strutturale rilevato** — ma unidirezionale (dev → prod).

| Direzione | Oggetti | Significato |
|---|---:|---|
| Solo in **dev** (assenti nello snapshot prod) | 246 | Dev è avanti: nuove colonne/constraint/indici non ancora nel snapshot prod |
| Solo in **prod** (assenti in dev) | 0 | Oggetti orfani in prod (regressione) |
| Definizione divergente | 0 | Conflitto reale di definizione |

**Aree (tabelle) dove dev è avanti rispetto allo snapshot prod (10):** `ai_analysis_artifacts`, `ai_analysis_runs`, `ai_call_logs`, `ai_conversation_state`, `ai_knowledge_gaps`, `ai_learned_knowledge`, `ai_vps_jobs`, `bowie_terminal_tokens`, `push_tokens`, `users`

> ✅ **Nessun oggetto presente solo in prod e nessuna definizione divergente.** Tutto il drift è "dev avanti a prod": nuovi oggetti in dev che lo snapshot prod (16 giorni fa) non contiene. Poiché §5b conferma che registry↔migration è pulito, questi oggetti sono coperti da migration numerate e verranno applicati a prod al prossimo publish. **Non è un conflitto di schema**: è drift di deploy pendente + snapshot prod da rinfrescare. Classificato come *Importante*, non *Bloccante*.

<details><summary>Dettaglio diff deep-schema-parity</summary>

```
══════════════════════════════════════════════════════════════
  BikerLink — Deep Schema Parity Guard (dev ↔ prod)
══════════════════════════════════════════════════════════════
  source: DATABASE_URL  (overall 853781fbb384)
  target: production  (overall cb888229b50d)

  Firme per categoria (source → target):
    ✖ columns      240509d52f → 3808f385bc
    ✖ constraints  e10842c6c0 → 10c591fe92
    ✖ indexes      782d863b81 → 3341f259fc
    ✔ enums        48b9f50a88 → 48b9f50a88
    ✔ triggers     e3b0c44298 → e3b0c44298
    ✖ extensions   88a46b990a → c566291764
    ✔ sequences    6398ed9413 → 6398ed9413

[deep-parity] differenze note (allow-list, non bloccanti): 5
  • constraints:spatial_ref_sys.spatial_ref_sys_pkey
  • constraints:user_sessions.user_sessions_exit_type_check
  • constraints:user_sessions.user_sessions_exit_type_chk
  • indexes:spatial_ref_sys.spatial_ref_sys_pkey
  • extensions:postgis

──────────────────────────────────────────────────────────────
[deep-parity] NUOVO DRIFT DI DEFINIZIONE RILEVATO
──────────────────────────────────────────────────────────────

[columns]
  − solo in source: ai_analysis_artifacts.content
      text notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.content_hash
      character varying(64) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_analysis_artifacts.expires_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_analysis_artifacts.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_analysis_artifacts.kind
      character varying(24) notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.mirror_path
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.run_id
      uuid notnull=true default= identity=- collation=-
  − solo in source: ai_analysis_artifacts.sensitivity
      character varying(16) notnull=true default='internal'::character varying identity=- collation=default
  − solo in source: ai_analysis_artifacts.shared_with
      jsonb notnull=false default='[]'::jsonb identity=- collation=-
  − solo in source: ai_analysis_artifacts.title
      character varying(200) notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_runs.artifact_count
      integer notnull=true default=0 identity=- collation=-
  − solo in source: ai_analysis_runs.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_analysis_runs.duration_ms
      integer notnull=false default= identity=- collation=-
  − solo in source: ai_analysis_runs.error_message
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.fingerprint
      character varying(64) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_analysis_runs.model_id
      character varying(100) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.persona
      character varying(16) notnull=true default='horus'::character varying identity=- collation=default
  − solo in source: ai_analysis_runs.status
      character varying(16) notnull=true default='completed'::character varying identity=- collation=default
  − solo in source: ai_analysis_runs.summary
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.trigger
      character varying(16) notnull=true default='schedule'::character varying identity=- collation=default
  − solo in source: ai_call_logs.notification_status
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_call_logs.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_call_logs.security_blocked
      boolean notnull=true default=false identity=- collation=-
  − solo in source: ai_call_logs.source_app
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_conversation_state.active_persona
      character varying(16) notnull=true default= identity=- collation=default
  − solo in source: ai_conversation_state.expires_at
      timestamp without time zone notnull=true default= identity=- collation=-
  − solo in source: ai_conversation_state.handoff_reason
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_conversation_state.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_conversation_state.intro_shown_personas
      jsonb notnull=true default='[]'::jsonb identity=- collation=-
  − solo in source: ai_conversation_state.source_app
      character varying(32) notnull=true default='main_app'::character varying identity=- collation=default
  − solo in source: ai_conversation_state.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_conversation_state.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_knowledge_gaps.fingerprint
      character varying(64) notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_knowledge_gaps.last_seen_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_knowledge_gaps.occurrences
      integer notnull=true default=1 identity=- collation=-
  − solo in source: ai_knowledge_gaps.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.question
      text notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.resolution_note
      text notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.source_app
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.status
      character varying(16) notnull=true default='open'::character varying identity=- collation=default
  − solo in source: ai_knowledge_gaps.top_score
      double precision notnull=false default= identity=- collation=-
  − solo in source: ai_learned_knowledge.answer
      text notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_learned_knowledge.fingerprint
      character varying(64) notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_learned_knowledge.model_id
      character varying(100) notnull=false default= identity=- collation=default
  − solo in source: ai_learned_knowledge.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_learned_knowledge.question
      text notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.source
      character varying(24) notnull=true default='auto-learn:gap'::character varying identity=- collation=default
  − solo in source: ai_learned_knowledge.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_vps_jobs.admin_user_id
      character varying notnull=true default= identity=- collation=default
  − solo in source: ai_vps_jobs.command
      text notnull=true default= identity=- collation=default
  − solo in source: ai_vps_jobs.error_message
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.exit_code
      integer notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.finished_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_vps_jobs.kind
      character varying(16) notnull=true default='job'::character varying identity=- collation=default
  − solo in source: ai_vps_jobs.label
      character varying(120) notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.notified_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.result_summary
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.results_path
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.started_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_vps_jobs.status
      character varying(16) notnull=true default='running'::character varying identity=- collation=default
  − solo in source: bowie_terminal_tokens.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: bowie_terminal_tokens.device_id
      character varying(128) notnull=true default= identity=- collation=default
  − solo in source: bowie_terminal_tokens.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: bowie_terminal_tokens.last_active_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: bowie_terminal_tokens.push_token
      text notnull=true default= identity=- collation=default
  − solo in source: bowie_terminal_tokens.revoked_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: bowie_terminal_tokens.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: push_tokens.app_id
      character varying(32) notnull=true default='main'::character varying identity=- collation=default
  − solo in source: push_tokens.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: push_tokens.device_id
      character varying(128) notnull=false default= identity=- collation=default
  − solo in source: push_tokens.id
      character varying(36) notnull=true default=gen_random_uuid() identity=- collation=default
  − solo in source: push_tokens.platform
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: push_tokens.token
      text notnull=true default= identity=- collation=default
  − solo in source: push_tokens.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: push_tokens.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: users.last_main_app_foreground_at
      timestamp without time zone notnull=false default= identity=- collation=-

[constraints]
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_pkey
      PRIMARY KEY (id)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES ai_analysis_runs(id) ON DELETE CASCADE
  − solo in source: ai_analysis_runs.ai_analysis_runs_pkey
      PRIMARY KEY (id)
  − solo in source: ai_conversation_state.ai_conversation_state_pkey
      PRIMARY KEY (id)
  − solo in source: ai_conversation_state.ai_conversation_state_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_pkey
      PRIMARY KEY (id)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_pkey
      PRIMARY KEY (id)
  − solo in source: ai_vps_jobs.ai_vps_jobs_pkey
      PRIMARY KEY (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_pkey
      PRIMARY KEY (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  − solo in source: push_tokens.push_tokens_pkey
      PRIMARY KEY (id)
  − solo in source: push_tokens.push_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

[indexes]
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_expires_at_idx
      CREATE INDEX ai_analysis_artifacts_expires_at_idx ON public.ai_analysis_artifacts USING btree (expires_at) WHERE (expires_at IS NOT NULL)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_kind_idx
      CREATE INDEX ai_analysis_artifacts_kind_idx ON public.ai_analysis_artifacts USING btree (kind, created_at DESC)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_pkey
      CREATE UNIQUE INDEX ai_analysis_artifacts_pkey ON public.ai_analysis_artifacts USING btree (id)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_run_id_idx
      CREATE INDEX ai_analysis_artifacts_run_id_idx ON public.ai_analysis_artifacts USING btree (run_id)
  − solo in source: ai_analysis_runs.ai_analysis_runs_created_at_idx
      CREATE INDEX ai_analysis_runs_created_at_idx ON public.ai_analysis_runs USING btree (created_at DESC)
  − solo in source: ai_analysis_runs.ai_analysis_runs_persona_idx
      CREATE INDEX ai_analysis_runs_persona_idx ON public.ai_analysis_runs USING btree (persona, created_at DESC)
  − solo in source: ai_analysis_runs.ai_analysis_runs_pkey
      CREATE UNIQUE INDEX ai_analysis_runs_pkey ON public.ai_analysis_runs USING btree (id)
  − solo in source: ai_call_logs.ai_call_logs_security_blocked_idx
      CREATE INDEX ai_call_logs_security_blocked_idx ON public.ai_call_logs USING btree (security_blocked) WHERE (security_blocked = true)
  − solo in source: ai_call_logs.ai_call_logs_source_app_idx
      CREATE INDEX ai_call_logs_source_app_idx ON public.ai_call_logs USING btree (source_app)
  − solo in source: ai_conversation_state.ai_conversation_state_expires_at_idx
      CREATE INDEX ai_conversation_state_expires_at_idx ON public.ai_conversation_state USING btree (expires_at)
  − solo in source: ai_conversation_state.ai_conversation_state_pkey
      CREATE UNIQUE INDEX ai_conversation_state_pkey ON public.ai_conversation_state USING btree (id)
  − solo in source: ai_conversation_state.ai_conversation_state_user_source_key
      CREATE UNIQUE INDEX ai_conversation_state_user_source_key ON public.ai_conversation_state USING btree (user_id, source_app)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_fingerprint_key
      CREATE UNIQUE INDEX ai_knowledge_gaps_fingerprint_key ON public.ai_knowledge_gaps USING btree (fingerprint)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_pkey
      CREATE UNIQUE INDEX ai_knowledge_gaps_pkey ON public.ai_knowledge_gaps USING btree (id)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_status_idx
      CREATE INDEX ai_knowledge_gaps_status_idx ON public.ai_knowledge_gaps USING btree (status, last_seen_at DESC)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_fingerprint_key
      CREATE UNIQUE INDEX ai_learned_knowledge_fingerprint_key ON public.ai_learned_knowledge USING btree (fingerprint)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_pkey
      CREATE UNIQUE INDEX ai_learned_knowledge_pkey ON public.ai_learned_knowledge USING btree (id)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_updated_at_idx
      CREATE INDEX ai_learned_knowledge_updated_at_idx ON public.ai_learned_knowledge USING btree (updated_at DESC)
  − solo in source: ai_vps_jobs.ai_vps_jobs_admin_idx
      CREATE INDEX ai_vps_jobs_admin_idx ON public.ai_vps_jobs USING btree (admin_user_id, started_at DESC)
  − solo in source: ai_vps_jobs.ai_vps_jobs_pkey
      CREATE UNIQUE INDEX ai_vps_jobs_pkey ON public.ai_vps_jobs USING btree (id)
  − solo in source: ai_vps_jobs.ai_vps_jobs_status_idx
      CREATE INDEX ai_vps_jobs_status_idx ON public.ai_vps_jobs USING btree (status, started_at DESC)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_device_id_key
      CREATE UNIQUE INDEX bowie_terminal_tokens_device_id_key ON public.bowie_terminal_tokens USING btree (device_id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_pkey
      CREATE UNIQUE INDEX bowie_terminal_tokens_pkey ON public.bowie_terminal_tokens USING btree (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_user_id_idx
      CREATE INDEX bowie_terminal_tokens_user_id_idx ON public.bowie_terminal_tokens USING btree (user_id)
  − solo in source: push_tokens.push_tokens_pkey
      CREATE UNIQUE INDEX push_tokens_pkey ON public.push_tokens USING btree (id)
  − solo in source: push_tokens.push_tokens_token_uq
      CREATE UNIQUE INDEX push_tokens_token_uq ON public.push_tokens USING btree (token)
  − solo in source: push_tokens.push_tokens_user_app_idx
      CREATE INDEX push_tokens_user_app_idx ON public.push_tokens USING btree (user_id, app_id)
  − solo in source: push_tokens.push_tokens_user_id_idx
      CREATE INDEX push_tokens_user_id_idx ON public.push_tokens USING btree (user_id)

Azione: se la differenza è reale, allinea lo schema (migration numerata in
migrations/ per il drift dev→prod, o aggiorna il registry). Se è una nuova
eccezione infrastrutturale NON fixabile, aggiungila ad ALLOWLIST con commento.
Command failed: npx tsx scripts/check-deep-schema-parity.ts compare env:DATABASE_URL server/data/deep-schema-parity.prod.json

──────────────────────────────────────────────────────────────
[deep-parity] NUOVO DRIFT DI DEFINIZIONE RILEVATO
──────────────────────────────────────────────────────────────

[columns]
  − solo in source: ai_analysis_artifacts.content
      text notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.content_hash
      character varying(64) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_analysis_artifacts.expires_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_analysis_artifacts.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_analysis_artifacts.kind
      character varying(24) notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.mirror_path
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_artifacts.run_id
      uuid notnull=true default= identity=- collation=-
  − solo in source: ai_analysis_artifacts.sensitivity
      character varying(16) notnull=true default='internal'::character varying identity=- collation=default
  − solo in source: ai_analysis_artifacts.shared_with
      jsonb notnull=false default='[]'::jsonb identity=- collation=-
  − solo in source: ai_analysis_artifacts.title
      character varying(200) notnull=true default= identity=- collation=default
  − solo in source: ai_analysis_runs.artifact_count
      integer notnull=true default=0 identity=- collation=-
  − solo in source: ai_analysis_runs.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_analysis_runs.duration_ms
      integer notnull=false default= identity=- collation=-
  − solo in source: ai_analysis_runs.error_message
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.fingerprint
      character varying(64) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_analysis_runs.model_id
      character varying(100) notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.persona
      character varying(16) notnull=true default='horus'::character varying identity=- collation=default
  − solo in source: ai_analysis_runs.status
      character varying(16) notnull=true default='completed'::character varying identity=- collation=default
  − solo in source: ai_analysis_runs.summary
      text notnull=false default= identity=- collation=default
  − solo in source: ai_analysis_runs.trigger
      character varying(16) notnull=true default='schedule'::character varying identity=- collation=default
  − solo in source: ai_call_logs.notification_status
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_call_logs.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_call_logs.security_blocked
      boolean notnull=true default=false identity=- collation=-
  − solo in source: ai_call_logs.source_app
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_conversation_state.active_persona
      character varying(16) notnull=true default= identity=- collation=default
  − solo in source: ai_conversation_state.expires_at
      timestamp without time zone notnull=true default= identity=- collation=-
  − solo in source: ai_conversation_state.handoff_reason
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_conversation_state.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_conversation_state.intro_shown_personas
      jsonb notnull=true default='[]'::jsonb identity=- collation=-
  − solo in source: ai_conversation_state.source_app
      character varying(32) notnull=true default='main_app'::character varying identity=- collation=default
  − solo in source: ai_conversation_state.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_conversation_state.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_knowledge_gaps.fingerprint
      character varying(64) notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_knowledge_gaps.last_seen_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_knowledge_gaps.occurrences
      integer notnull=true default=1 identity=- collation=-
  − solo in source: ai_knowledge_gaps.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.question
      text notnull=true default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.resolution_note
      text notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.source_app
      character varying(32) notnull=false default= identity=- collation=default
  − solo in source: ai_knowledge_gaps.status
      character varying(16) notnull=true default='open'::character varying identity=- collation=default
  − solo in source: ai_knowledge_gaps.top_score
      double precision notnull=false default= identity=- collation=-
  − solo in source: ai_learned_knowledge.answer
      text notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_learned_knowledge.fingerprint
      character varying(64) notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_learned_knowledge.model_id
      character varying(100) notnull=false default= identity=- collation=default
  − solo in source: ai_learned_knowledge.persona
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: ai_learned_knowledge.question
      text notnull=true default= identity=- collation=default
  − solo in source: ai_learned_knowledge.source
      character varying(24) notnull=true default='auto-learn:gap'::character varying identity=- collation=default
  − solo in source: ai_learned_knowledge.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_vps_jobs.admin_user_id
      character varying notnull=true default= identity=- collation=default
  − solo in source: ai_vps_jobs.command
      text notnull=true default= identity=- collation=default
  − solo in source: ai_vps_jobs.error_message
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.exit_code
      integer notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.finished_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: ai_vps_jobs.kind
      character varying(16) notnull=true default='job'::character varying identity=- collation=default
  − solo in source: ai_vps_jobs.label
      character varying(120) notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.notified_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: ai_vps_jobs.result_summary
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.results_path
      text notnull=false default= identity=- collation=default
  − solo in source: ai_vps_jobs.started_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: ai_vps_jobs.status
      character varying(16) notnull=true default='running'::character varying identity=- collation=default
  − solo in source: bowie_terminal_tokens.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: bowie_terminal_tokens.device_id
      character varying(128) notnull=true default= identity=- collation=default
  − solo in source: bowie_terminal_tokens.id
      uuid notnull=true default=gen_random_uuid() identity=- collation=-
  − solo in source: bowie_terminal_tokens.last_active_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: bowie_terminal_tokens.push_token
      text notnull=true default= identity=- collation=default
  − solo in source: bowie_terminal_tokens.revoked_at
      timestamp without time zone notnull=false default= identity=- collation=-
  − solo in source: bowie_terminal_tokens.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: push_tokens.app_id
      character varying(32) notnull=true default='main'::character varying identity=- collation=default
  − solo in source: push_tokens.created_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: push_tokens.device_id
      character varying(128) notnull=false default= identity=- collation=default
  − solo in source: push_tokens.id
      character varying(36) notnull=true default=gen_random_uuid() identity=- collation=default
  − solo in source: push_tokens.platform
      character varying(16) notnull=false default= identity=- collation=default
  − solo in source: push_tokens.token
      text notnull=true default= identity=- collation=default
  − solo in source: push_tokens.updated_at
      timestamp without time zone notnull=true default=now() identity=- collation=-
  − solo in source: push_tokens.user_id
      character varying(36) notnull=true default= identity=- collation=default
  − solo in source: users.last_main_app_foreground_at
      timestamp without time zone notnull=false default= identity=- collation=-

[constraints]
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_pkey
      PRIMARY KEY (id)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES ai_analysis_runs(id) ON DELETE CASCADE
  − solo in source: ai_analysis_runs.ai_analysis_runs_pkey
      PRIMARY KEY (id)
  − solo in source: ai_conversation_state.ai_conversation_state_pkey
      PRIMARY KEY (id)
  − solo in source: ai_conversation_state.ai_conversation_state_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_pkey
      PRIMARY KEY (id)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_pkey
      PRIMARY KEY (id)
  − solo in source: ai_vps_jobs.ai_vps_jobs_pkey
      PRIMARY KEY (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_pkey
      PRIMARY KEY (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  − solo in source: push_tokens.push_tokens_pkey
      PRIMARY KEY (id)
  − solo in source: push_tokens.push_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

[indexes]
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_expires_at_idx
      CREATE INDEX ai_analysis_artifacts_expires_at_idx ON public.ai_analysis_artifacts USING btree (expires_at) WHERE (expires_at IS NOT NULL)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_kind_idx
      CREATE INDEX ai_analysis_artifacts_kind_idx ON public.ai_analysis_artifacts USING btree (kind, created_at DESC)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_pkey
      CREATE UNIQUE INDEX ai_analysis_artifacts_pkey ON public.ai_analysis_artifacts USING btree (id)
  − solo in source: ai_analysis_artifacts.ai_analysis_artifacts_run_id_idx
      CREATE INDEX ai_analysis_artifacts_run_id_idx ON public.ai_analysis_artifacts USING btree (run_id)
  − solo in source: ai_analysis_runs.ai_analysis_runs_created_at_idx
      CREATE INDEX ai_analysis_runs_created_at_idx ON public.ai_analysis_runs USING btree (created_at DESC)
  − solo in source: ai_analysis_runs.ai_analysis_runs_persona_idx
      CREATE INDEX ai_analysis_runs_persona_idx ON public.ai_analysis_runs USING btree (persona, created_at DESC)
  − solo in source: ai_analysis_runs.ai_analysis_runs_pkey
      CREATE UNIQUE INDEX ai_analysis_runs_pkey ON public.ai_analysis_runs USING btree (id)
  − solo in source: ai_call_logs.ai_call_logs_security_blocked_idx
      CREATE INDEX ai_call_logs_security_blocked_idx ON public.ai_call_logs USING btree (security_blocked) WHERE (security_blocked = true)
  − solo in source: ai_call_logs.ai_call_logs_source_app_idx
      CREATE INDEX ai_call_logs_source_app_idx ON public.ai_call_logs USING btree (source_app)
  − solo in source: ai_conversation_state.ai_conversation_state_expires_at_idx
      CREATE INDEX ai_conversation_state_expires_at_idx ON public.ai_conversation_state USING btree (expires_at)
  − solo in source: ai_conversation_state.ai_conversation_state_pkey
      CREATE UNIQUE INDEX ai_conversation_state_pkey ON public.ai_conversation_state USING btree (id)
  − solo in source: ai_conversation_state.ai_conversation_state_user_source_key
      CREATE UNIQUE INDEX ai_conversation_state_user_source_key ON public.ai_conversation_state USING btree (user_id, source_app)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_fingerprint_key
      CREATE UNIQUE INDEX ai_knowledge_gaps_fingerprint_key ON public.ai_knowledge_gaps USING btree (fingerprint)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_pkey
      CREATE UNIQUE INDEX ai_knowledge_gaps_pkey ON public.ai_knowledge_gaps USING btree (id)
  − solo in source: ai_knowledge_gaps.ai_knowledge_gaps_status_idx
      CREATE INDEX ai_knowledge_gaps_status_idx ON public.ai_knowledge_gaps USING btree (status, last_seen_at DESC)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_fingerprint_key
      CREATE UNIQUE INDEX ai_learned_knowledge_fingerprint_key ON public.ai_learned_knowledge USING btree (fingerprint)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_pkey
      CREATE UNIQUE INDEX ai_learned_knowledge_pkey ON public.ai_learned_knowledge USING btree (id)
  − solo in source: ai_learned_knowledge.ai_learned_knowledge_updated_at_idx
      CREATE INDEX ai_learned_knowledge_updated_at_idx ON public.ai_learned_knowledge USING btree (updated_at DESC)
  − solo in source: ai_vps_jobs.ai_vps_jobs_admin_idx
      CREATE INDEX ai_vps_jobs_admin_idx ON public.ai_vps_jobs USING btree (admin_user_id, started_at DESC)
  − solo in source: ai_vps_jobs.ai_vps_jobs_pkey
      CREATE UNIQUE INDEX ai_vps_jobs_pkey ON public.ai_vps_jobs USING btree (id)
  − solo in source: ai_vps_jobs.ai_vps_jobs_status_idx
      CREATE INDEX ai_vps_jobs_status_idx ON public.ai_vps_jobs USING btree (status, started_at DESC)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_device_id_key
      CREATE UNIQUE INDEX bowie_terminal_tokens_device_id_key ON public.bowie_terminal_tokens USING btree (device_id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_pkey
      CREATE UNIQUE INDEX bowie_terminal_tokens_pkey ON public.bowie_terminal_tokens USING btree (id)
  − solo in source: bowie_terminal_tokens.bowie_terminal_tokens_user_id_idx
      CREATE INDEX bowie_terminal_tokens_user_id_idx ON public.bowie_terminal_tokens USING btree (user_id)
  − solo in source: push_tokens.push_tokens_pkey
      CREATE UNIQUE INDEX push_tokens_pkey ON public.push_tokens USING btree (id)
  − solo in source: push_tokens.push_tokens_token_uq
      CREATE UNIQUE INDEX push_tokens_token_uq ON public.push_tokens USING btree (token)
  − solo in source: push_tokens.push_tokens_user_app_idx
      CREATE INDEX push_tokens_user_app_idx ON public.push_tokens USING btree (user_id, app_id)
  − solo in source: push_tokens.push_tokens_user_id_idx
      CREATE INDEX push_tokens_user_id_idx ON public.push_tokens USING btree (user_id)

Azione: se la differenza è reale, allinea lo schema (migration numerata in
migrations/ per il drift dev→prod, o aggiorna il registry). Se è una nuova
eccezione infrastrutturale NON fixabile, aggiungila ad ALLOWLIST con commento.
```

</details>

> **Prod non raggiungibile live:** i check dati (§2–4) NON sono stati eseguiti su prod. `BIKERLINK_DATABASE_URL` non è impostata. Per estenderli a prod serve una connection string prod raggiungibile o un dump.

### 5b. Drift registry Drizzle ↔ migration numerate

**Esito: OK** ✅ — tabelle/colonne del registry coperte dalle migration.

```
[schema-drift] OK — tabelle dichiarate coperte dalle migration (verifica table-qualified); nessun NUOVO drift registry↔migration.
```

### 5c. Index drift (statico)

**Esito: OK** ✅ — nessuna regressione/inverse-drift negli indici speciali (DESC/WHERE).

```
[INDEX-DRIFT] ══════════════════════════════════════════════
[INDEX-DRIFT]   BikerLink — Index Drift Check (statico, no DB live)
[INDEX-DRIFT] ══════════════════════════════════════════════

[INDEX-DRIFT]   Indici speciali dallo schema Drizzle TS: 20
[INDEX-DRIFT]     • user_sessions_ended_at_idx (user_sessions) [WHERE]
[INDEX-DRIFT]     • user_privacy_log_user_id_changed_at_idx (user_privacy_log) [DESC[changed_at]]
[INDEX-DRIFT]     • ppm_biker_zavorrina_active_idx (proposal_profile_matches) [WHERE]
[INDEX-DRIFT]     • reports_assigned_moderator_idx (reports) [WHERE]
[INDEX-DRIFT]     • ota_assistant_runs_started_at_idx (ota_assistant_runs) [DESC[started_at]]
[INDEX-DRIFT]     • ai_analysis_artifacts_kind_idx (ai_analysis_artifacts) [DESC[created_at]]
[INDEX-DRIFT]     • ai_analysis_artifacts_expires_at_idx (ai_analysis_artifacts) [WHERE]
[INDEX-DRIFT]     • ai_analysis_runs_created_at_idx (ai_analysis_runs) [DESC[created_at]]
[INDEX-DRIFT]     • ai_analysis_runs_persona_idx (ai_analysis_runs) [DESC[created_at]]
[INDEX-DRIFT]     • ai_call_logs_created_at_idx (ai_call_logs) [DESC[created_at]]
[INDEX-DRIFT]     • ai_call_logs_provider_idx (ai_call_logs) [DESC[created_at]]
[INDEX-DRIFT]     • ai_call_logs_degraded_idx (ai_call_logs) [WHERE]
[INDEX-DRIFT]     • ai_call_logs_security_blocked_idx (ai_call_logs) [WHERE]
[INDEX-DRIFT]     • ai_conversation_turns_user_id_idx (ai_conversation_turns) [DESC[created_at]]
[INDEX-DRIFT]     • ai_conversation_turns_summary_of_idx (ai_conversation_turns) [WHERE]
[INDEX-DRIFT]     • ai_knowledge_gaps_status_idx (ai_knowledge_gaps) [DESC[last_seen_at]]
[INDEX-DRIFT]     • ai_learned_knowledge_updated_at_idx (ai_learned_knowledge) [DESC[updated_at]]
[INDEX-DRIFT]     • ai_vps_jobs_status_idx (ai_vps_jobs) [DESC[started_at]]
[INDEX-DRIFT]     • ai_vps_jobs_admin_idx (ai_vps_jobs) [DESC[started_at]]
[INDEX-DRIFT]     • pipeline_probe_history_pipeline_run_at_idx (pipeline_probe_history) [DESC[run_at]]

[INDEX-DRIFT]   Analisi migration SQL per regressioni...
[INDEX-DRIFT]   ✔  Nessuna regressione nelle migration SQL
[INDEX-DRIFT]   Analisi inverse drift (migration DESC ≠ schema ASC)...
[INDEX-DRIFT]   ✔  Nessun inverse drift rilevato
[INDEX-DRIFT] ══════════════════════════════════════════════
[INDEX-DRIFT]   RESULT: OK — nessuna regressione e nessun inverse drift, verifica live al boot
[INDEX-DRIFT] ══════════════════════════════════════════════
```

### 5d. Schema-in-DB (dev) vs schema-nel-codice (registry Drizzle)

**Esito: OK** ✅ — il DB dev combacia col registry `@shared/db` (colonne/tipi/nullability).

```
  ✔  user_playlist_snapshots
  ✔  event_club_invites
  ✔  event_images
  ✔  event_participants
  ✔  events
  ✔  arcade_scores
  ✔  coordinate_history
  ✔  gps_errors
  ✔  gps_rejection_stats
  ✔  ride_telemetry
  ✔  segment_telemetry
  ✔  user_telemetry_profile
  ✔  road_hazard_comments
  ✔  road_hazard_confirms
  ✔  road_hazards
  ✔  ota_assistant_runs
  ✔  ota_boot_events
  ✔  ota_releases
  ✔  ota_watchdog_reports
  ✔  entity_tags
  ✔  tag_categories
  ✔  tags
  ✔  text_aliases
  ✔  embedding_call_log
  ✔  embeddings
  ✔  ai_watchdog_log
  ✔  maps_telemetry_events
  ✔  system_health_snapshot
  ✔  system_signals
  ✔  weekly_system_reports
  ✔  db_integrity_quarantine
  ✔  db_integrity_runs
  ✔  db_integrity_violations
  ✔  integrity_quarantine
  ✔  integrity_runs
  ✔  integrity_violations
  ✔  ai_conversations
  ✔  ai_pinned_insights
  ✔  ai_messages
  ✔  ai_conflicts
  ✔  ai_decisions
  ✔  ai_events
  ✔  ai_analysis_artifacts
  ✔  ai_analysis_runs
  ✔  ai_assistant_telemetry
  ✔  ai_call_logs
  ✔  ai_conversation_state
  ✔  ai_conversation_turns
  ✔  ai_knowledge_gaps
  ✔  ai_learned_knowledge
  ✔  ai_vps_jobs
  ✔  bowie_terminal_tokens
  ✔  diagnostic_queue
  ✔  diagnostic_reports
  ✔  pipeline_flow_events
  ✔  pipeline_probe_history

══════════════════════════════════════════════
  RESULT: OK — 162 tables in sync, no drift
══════════════════════════════════════════════
```

## 6. Azioni consigliate

### 🔴 Bloccante

_Nessun problema bloccante rilevato._

### 🟠 Importante

- Deploy pendente: 10 aree di schema esistono in dev ma non nello snapshot prod (2026-06-28T12:58:52.982Z). Applicare le migration a prod al prossimo publish e ricatturare lo snapshot `server/data/deep-schema-parity.prod.json`.
- **Confermato sui dati reali (§7.2.d):** 6 righe in `user_profiles` (prod) hanno `hide_from_map=false` ma `latitude`/`longitude` NULL — profili che dovrebbero essere visibili in mappa ma non lo sono. Vedi esempi in §7.2.d.

### 🟡 Cosmetic

- Tabella `digest_read_state` priva di PRIMARY KEY — verificare se intenzionale.
- Tabella `maps_quota` priva di PRIMARY KEY — verificare se intenzionale.
- Campo obbligatorio mancante: profili visibili in mappa (`hide_from_map=false`) senza coordinate condivise (6).
- Colonna candidate-unique `businesses.email` priva di UNIQUE constraint a livello DB — valutare se aggiungerlo (o se i duplicati sono leciti).
- Colonna candidate-unique `users.nickname` priva di UNIQUE constraint a livello DB — valutare se aggiungerlo (o se i duplicati sono leciti).
- Colonna candidate-unique `workshops.email` priva di UNIQUE constraint a livello DB — valutare se aggiungerlo (o se i duplicati sono leciti).

## 7. Verifica sui dati REALI di produzione (read-only, DB replica)

> **Generato:** 2026-07-15T01:09:52.000Z
> **Metodo:** query `SELECT`-only eseguite dalla skill database con `environment: "production"` (replica in sola lettura del DB di produzione; nessuna scrittura possibile). Prod **non** è raggiungibile via connection string dalla sandbox — questa sezione colma il gap lasciato aperto dalle sezioni 2–4 (che girano solo su dev, quasi vuoto) rieseguendo la STESSA logica di check sui dati reali.

Le sezioni 2–4 sopra restano a bassa confidenza (dev quasi vuoto); questa sezione è la verifica ad alta confidenza sui dati reali, e ne conferma o smentisce gli esiti.

### 7.0 Popolamento tabelle (prod)

49 tabelle su 168 hanno almeno 1 riga in produzione (conteggio esatto, non stima da `pg_stat_user_tables` — quella era stale/azzerata su questo DB).

| Tabella | Righe |
|---|---:|
| `ai_events` | 49616 |
| `system_signals` | 44664 |
| `site_visits` | 18935 |
| `ai_watchdog_log` | 9878 |
| `spatial_ref_sys` | 8500 |
| `pipeline_probe_history` | 8216 |
| `system_health_snapshot` | 6823 |
| `server_restarts` | 2875 |
| `db_integrity_runs` | 1658 |
| `db_integrity_violations` | 1046 |
| `moderator_logs` | 920 |
| `ai_suggestions_log` | 678 |
| `integrity_violations` | 609 |
| `thinkcentre_health_events` | 292 |
| `ota_releases` | 220 |
| `schema_migrations` | 175 |
| `app_settings` | 148 |
| `tags` | 72 |
| `ai_coordinator_jobs` | 53 |
| `text_aliases` | 45 |
| `conversations` | 40 |
| `moto_clubs` | 40 |
| `moderator_digests` | 28 |
| `match_zero_snapshots` | 27 |
| `integrity_runs` | 21 |
| `translation_keys` | 20 |
| `moto_club_members` | 20 |
| `easter_eggs` | 20 |
| `conversation_participants` | 20 |
| `bio_affinity_matches` | 15 |
| `ai_analysis_artifacts` | 14 |
| `users` | 8 |
| `user_profiles` | 8 |
| `match_preferences` | 8 |
| `embeddings` | 8 |
| `ai_analysis_runs` | 7 |
| `match_rules` | 5 |
| `moderation_thresholds` | 4 |
| `match_thresholds` | 4 |
| `match_feedback` | 4 |
| `user_match_profile` | 3 |
| `tag_categories` | 3 |
| `ai_usage_budget` | 3 |
| `user_motorcycles` | 2 |
| `invitation_codes` | 2 |
| `diagnostic_reports` | 2 |
| `biker_biker_matches` | 2 |
| `weekly_system_reports` | 1 |
| `session` | 1 |

### 7.1 Integrità referenziale (FK) — dati reali

27 FK con tabella figlia popolata sono state verificate (le altre 130 FK hanno 0 righe lato figlio in prod, quindi nessuna violazione è possibile per costruzione).

✅ **Nessuna riga orfana rilevata** su nessuna delle 27 FK controllate (dati reali: utenti, moto club, match, conversazioni, ecc.).

### 7.2 Checklist deterministica (a–f) — dati reali

**(a) Coordinate fuori range:** 13 colonne latitudine + 13 longitudine ispezionate su dati reali (utenti, moto club, easter egg, posizioni fake/fuzz per privacy). ✅ 0 violazioni.

**(b) Timestamp impossibili:** 34 check (`created_at` nel futuro / `updated_at` < `created_at`) su tutte le tabelle popolate con quelle colonne. ✅ 0 violazioni.

**(c) Contatori negativi:** 20 colonne-contatore ispezionate (km, punteggi, contatori boot/OTA, feedback, member_count, ecc.). ✅ 0 violazioni.

**(d) Entità attive con campi obbligatori mancanti:**

| Check | Violazioni |
|---|---:|
| utenti `active` senza email | 0 |
| utenti `active` senza nickname | 0 |
| profili visibili in mappa (`hide_from_map=false`) senza coordinate | **6** ⚠️ |
| moto club senza nome | 0 |

⚠️ **Violazione reale confermata:** 6 righe in `user_profiles` hanno `hide_from_map=false` (quindi il profilo dovrebbe essere visibile in mappa) ma `latitude`/`longitude` NULL — utenti che non compaiono in mappa nonostante l'intento di condividere la posizione. Stessa cifra già segnalata (a bassa confidenza) dalla sezione 3(d) sul DB dev — qui è confermata sui dati reali. Impatto: UX (utente si aspetta di essere visibile, non lo è), non integrità/sicurezza. Severità: **Importante**, non bloccante.

**(e) Telemetria/tracce senza GPS:** nessuna delle tabelle di telemetria (`ride_telemetry`, `route_points`, `routes`, `planned_routes`, `segment_telemetry`, `maps_telemetry_events`) ha righe in produzione al momento del check (0 corse/percorsi registrati finora). Check non applicabile — nessun dato da validare, non un "0 violazioni" su dati popolati.

**(f) Valori-stato fuori dal set ammesso:** distribuzione valori-stato calcolata su 11 colonne stato/state/visibility popolate (`users.status`, `moto_club_members.status`, `biker_biker_matches.status`, `bio_affinity_matches.status`, `ai_*`, `ota_releases.status`, ecc.). ✅ `users.status` = solo `active` (8/8); `moto_club_members.status` = solo `active` (20/20) — entrambi dentro il set ammesso. Nessun valore-stato fuori dal set curato.

### 7.3 Duplicati su colonne candidate-unique — dati reali

Colonne candidate (`email`, `slug`, `username`, `nickname`, `external_id`, `normalized_email`) presenti su tabelle popolate: `tag_categories.slug`, `tags.slug`, `users.nickname`, `users.email`.

| Colonna | Copertura UNIQUE (DB) | Duplicati reali |
|---|---|---|
| `users.email` | ✅ single-col (`users_email_unique`) | nessuno (garantito dal DB) |
| `users.nickname` | ⚠️ nessuno | nessun duplicato tra gli 8 utenti reali |
| `tag_categories.slug` | ✅ single-col (`tag_categories_slug_unique`) | nessuno (garantito dal DB) |
| `tags.slug` | ➖ composita (`category_id, slug`) | `tourer`×2 — **atteso**, categorie diverse (verificato: 2 `category_id` distinti) |

✅ Nessun duplicato illecito sui dati reali.

### 7.4 Conclusione

Sui dati reali di produzione (49 tabelle popolate, incluse tutte le entità di dominio con dati: utenti, profili, moto club, match, tag): **0 violazioni bloccanti**, **1 violazione Importante** (6 profili "visibili in mappa" senza coordinate — §7.2.d), **0 violazioni cosmetic aggiuntive** rispetto a quelle già note dalla sezione 5. Le tabelle di telemetria/percorsi (routes, ride_telemetry, planned_routes) sono a 0 righe in prod: nessuna corsa/percorso è ancora stato registrato, quindi i check su quei dati non sono applicabili (non "puliti per assenza di anomalie", ma "non ancora testabili per assenza di dati").

---

> Report generato in sola lettura. Le decisioni di migrazione sono demandate a un task successivo (dopo review). Rieseguibile con `npx tsx scripts/generate-db-check-report.ts`. La sezione 7 (dati reali di produzione) è rieseguibile via `executeSql({ environment: "production" })` dalla skill database — non richiede `DATABASE_URL` di prod.
