// Task #2698 — Telemetria AI Assistant utente (eventi: conversazione, azione, tip, opt-out).
// Task #3017 — ai_call_logs e ai_conversation_turns (logging + memoria).
import { pgTable, uuid, varchar, jsonb, timestamp, index, uniqueIndex, integer, doublePrecision, text, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// Task #3017 — ai_call_logs: log completo di ogni chiamata AI (provider, latenza, token, costo).
export const aiCallLogs = pgTable("ai_call_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 40 }).notNull(),
  modelId: varchar("model_id", { length: 100 }).notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  latencyMs: integer("latency_ms"),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  degraded: boolean("degraded").notNull().default(false),
  // Task #5222 — true quando il filtro di sicurezza ha bloccato l'output AI
  // (tentato leak di credenziali/token/env). La risposta viene sostituita con
  // un messaggio di rifiuto e l'attempt resta tracciato qui per audit.
  securityBlocked: boolean("security_blocked").notNull().default(false),
  // Task #5228 — Bowie Standalone monitor: attribuzione persona/sorgente e
  // esito consegna delle risposte inviate via notifica (notification-reply).
  //   persona            → "bowie" | "horus" | "ares" (roster AI).
  //   sourceApp          → "main_app" | "bowie_terminal" (quale client ha originato).
  //   notificationStatus → "delivered" | "failed" SOLO sulle righe che tracciano
  //                         l'esito di una push notification-reply; NULL sui turni normali.
  persona: varchar("persona", { length: 16 }),
  sourceApp: varchar("source_app", { length: 32 }),
  notificationStatus: varchar("notification_status", { length: 16 }),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_call_logs_created_at_idx").on(t.createdAt.desc()),
  index("ai_call_logs_provider_idx").on(t.provider, t.createdAt.desc()),
  index("ai_call_logs_user_id_idx").on(t.userId),
  index("ai_call_logs_degraded_idx").on(t.degraded).where(sql`degraded = true`),
  index("ai_call_logs_security_blocked_idx").on(t.securityBlocked).where(sql`security_blocked = true`),
  index("ai_call_logs_source_app_idx").on(t.sourceApp),
]);

export type AiCallLog = typeof aiCallLogs.$inferSelect;
export type InsertAiCallLog = typeof aiCallLogs.$inferInsert;

// Task #5228 — Token push per-dispositivo del client "Bowie Terminal" (APK
// standalone). Separati da users.expoPushToken (che resta il token attivo per
// la consegna): questa tabella permette al monitor admin di elencare i device
// registrati, distinguere gli attivi (last_active_at recente) e revocarli uno
// a uno senza toccare il token principale dell'utente.
export const bowieTerminalTokens = pgTable("bowie_terminal_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pushToken: text("push_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  uniqueIndex("bowie_terminal_tokens_device_id_key").on(t.deviceId),
  index("bowie_terminal_tokens_user_id_idx").on(t.userId),
]);

export type BowieTerminalToken = typeof bowieTerminalTokens.$inferSelect;
export type InsertBowieTerminalToken = typeof bowieTerminalTokens.$inferInsert;

// Task #3017 — ai_conversation_turns: memoria conversazionale persistente per user.
export const aiConversationTurns = pgTable("ai_conversation_turns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  summaryOf: uuid("summary_of"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_conversation_turns_user_id_idx").on(t.userId, t.createdAt.desc()),
  index("ai_conversation_turns_summary_of_idx").on(t.summaryOf).where(sql`"summary_of" IS NOT NULL`),
]);

export type AiConversationTurn = typeof aiConversationTurns.$inferSelect;
export type InsertAiConversationTurn = typeof aiConversationTurns.$inferInsert;

export const aiAssistantTelemetry = pgTable("ai_assistant_telemetry", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  userRole: varchar("user_role", { length: 20 }),
  userId: varchar("user_id", { length: 36 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_assistant_telemetry_created_at_idx").on(t.createdAt),
  index("ai_assistant_telemetry_event_platform_idx").on(t.eventType, t.platform),
]);

export type AiAssistantTelemetry = typeof aiAssistantTelemetry.$inferSelect;
export type InsertAiAssistantTelemetry = typeof aiAssistantTelemetry.$inferInsert;

// ── Task #5322 — Stato "persona attiva" della conversazione (multi-persona) ───
//
// Rende l'handoff Bowie ⇄ Horus ⇄ Ares PERSISTENTE tra un turno e l'altro: senza
// questo, ogni messaggio ripartirebbe da Bowie e si perderebbe la stickiness
// (es. l'utente resta con Horus finché non torna esplicitamente indietro).
//
//   activePersona → "bowie" | "horus" | "ares" (roster AI).
//   handoffReason → come è stata scelta la persona ("route-intent", "sticky", …).
//   sourceApp     → separa il contesto per client ("main_app" | "bowie_terminal").
//   expiresAt     → TTL: dopo l'inattività lo stato scade e si riparte da Bowie.
//
// Chiave naturale: (userId, sourceApp) → un solo stato attivo per utente/client
// (upsert). Le righe scadute vengono ignorate in lettura e ripulite dal job.
export const aiConversationState = pgTable("ai_conversation_state", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceApp: varchar("source_app", { length: 32 }).notNull().default("main_app"),
  activePersona: varchar("active_persona", { length: 16 }).notNull(),
  handoffReason: varchar("handoff_reason", { length: 32 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [
  uniqueIndex("ai_conversation_state_user_source_key").on(t.userId, t.sourceApp),
  index("ai_conversation_state_expires_at_idx").on(t.expiresAt),
]);

export type AiConversationState = typeof aiConversationState.$inferSelect;
export type InsertAiConversationState = typeof aiConversationState.$inferInsert;

// ── Task #5322 — Lacune di conoscenza (domande a cui l'AI non sa rispondere) ──
//
// Quando una domanda utente ottiene un punteggio RAG troppo basso (nessuna FAQ /
// conoscenza pertinente) la registriamo qui. Serve a due cose:
//  1. Dare all'admin visibilità su COSA gli utenti chiedono e l'app non copre.
//  2. Alimentare lo scheduler di auto-apprendimento LOCALE (Ollama) che genera
//     una risposta e la ributta nel RAG (via "extra"), chiudendo la lacuna.
//
// Dedup: `fingerprint` (hash della domanda normalizzata) è UNIQUE. Le occorrenze
// successive incrementano `occurrences` e aggiornano `lastSeenAt` invece di
// creare righe nuove — evita di floodare la tabella con la stessa domanda.
//   status → "open" (da imparare) | "learned" (auto-appreso) | "dismissed".
export const aiKnowledgeGaps = pgTable("ai_knowledge_gaps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  question: text("question").notNull(),
  persona: varchar("persona", { length: 16 }),
  sourceApp: varchar("source_app", { length: 32 }),
  // Miglior similarità RAG ottenuta (bassa = lacuna). NULL se il RAG era vuoto.
  topScore: doublePrecision("top_score"),
  occurrences: integer("occurrences").notNull().default(1),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  // Nota generata dall'auto-apprendimento (per audit) quando status → learned.
  resolutionNote: text("resolution_note"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ai_knowledge_gaps_fingerprint_key").on(t.fingerprint),
  index("ai_knowledge_gaps_status_idx").on(t.status, t.lastSeenAt.desc()),
]);

export type AiKnowledgeGap = typeof aiKnowledgeGaps.$inferSelect;
export type InsertAiKnowledgeGap = typeof aiKnowledgeGaps.$inferInsert;

// ── Task #5322 — Conoscenza auto-appresa (auto-learning LOCALE, solo Ollama) ──
//
// Lo scheduler di auto-apprendimento (server/ai/assistant/auto-learn.ts) gira in
// Phase 5 usando ESCLUSIVAMENTE il modello Ollama locale di Bowie (nessun costo
// cloud). Esplora in sola lettura le lacune (ai_knowledge_gaps) e i flussi noti
// dell'app, genera una risposta e la persiste QUI. Queste voci vengono poi
// iniettate nel RAG (via il parametro `extra` di retrieveContext), SENZA toccare
// la knowledge base statica (ASSISTANT_KNOWLEDGE).
//
// Dedup: `fingerprint` (hash della domanda normalizzata) è UNIQUE — un secondo
// ciclo sulla stessa domanda aggiorna la risposta invece di duplicare la riga.
//   source → "auto-learn:gap" | "auto-learn:explore" (provenienza della voce).
export const aiLearnedKnowledge = pgTable("ai_learned_knowledge", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  persona: varchar("persona", { length: 16 }),
  source: varchar("source", { length: 24 }).notNull().default("auto-learn:gap"),
  // Modello Ollama che ha generato la voce (audit; nessun secret).
  modelId: varchar("model_id", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ai_learned_knowledge_fingerprint_key").on(t.fingerprint),
  index("ai_learned_knowledge_updated_at_idx").on(t.updatedAt.desc()),
]);

export type AiLearnedKnowledge = typeof aiLearnedKnowledge.$inferSelect;
export type InsertAiLearnedKnowledge = typeof aiLearnedKnowledge.$inferInsert;

// ── Task #5322 — Job operativi sulla VM Google "dragonfly" (solo admin) ───────
//
// Quando un admin, in chat, chiede a Bowie/Horus di operare sul VPS Google
// (install/rimozione software, esecuzione script, job lunghi tipo "24h di ping"),
// l'esecuzione avviene SERVER-SIDE via helper (server/ai/assistant/vps-ops.ts →
// scripts/gce/gce.py, SSH con secret GCE_SSH_*). I job lunghi partono in modo
// ASINCRONO (nohup distaccato sul VPS): questa tabella ne traccia il ciclo di
// vita, e un poller in Phase 5 raccoglie l'esito e lo recapita all'admin.
//
// Guardrail (enforce nell'endpoint/executor, non solo prompt): solo admin,
// conferma esplicita prima di ogni op mutante (doppia per i distruttivi), audit
// log, output limitato, nessun secret stampato.
export const aiVpsJobs = pgTable("ai_vps_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  // "exec" = comando sincrono breve; "job" = processo lungo distaccato (nohup).
  kind: varchar("kind", { length: 16 }).notNull().default("job"),
  command: text("command").notNull(),
  label: varchar("label", { length: 120 }),
  // running | done | failed | error (error = fallimento infrastrutturale/timeout).
  status: varchar("status", { length: 16 }).notNull().default("running"),
  // Path del log sul VPS (mai un secret).
  resultsPath: text("results_path"),
  exitCode: integer("exit_code"),
  // Coda dell'output raccolto, SANIFICATA e troncata (no PII/secret).
  resultSummary: text("result_summary"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  // Impostato quando il poller ha notificato l'admin (una sola volta).
  notifiedAt: timestamp("notified_at"),
}, (t) => [
  index("ai_vps_jobs_status_idx").on(t.status, t.startedAt.desc()),
  index("ai_vps_jobs_admin_idx").on(t.adminUserId, t.startedAt.desc()),
]);

export type AiVpsJob = typeof aiVpsJobs.$inferSelect;
export type InsertAiVpsJob = typeof aiVpsJobs.$inferInsert;
