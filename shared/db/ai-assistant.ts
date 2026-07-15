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
  // Task #51 — "Superficie" della chiamata AI: distingue la chat diretta con una
  // singola persona ("direct", default per le righe legacy/omesse) dai turni di
  // una conversazione di gruppo osservabile ("group"). Permette al monitoraggio
  // admin (ai/metrics) di separare i due flussi.
  //   surface             → "direct" | "group" (NULL = legacy, trattato come direct).
  //   groupConversationId → riferimento alla conversazione di gruppo quando
  //                         surface="group"; NULL per la chat diretta.
  surface: varchar("surface", { length: 16 }),
  groupConversationId: uuid("group_conversation_id"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_call_logs_created_at_idx").on(t.createdAt.desc()),
  index("ai_call_logs_provider_idx").on(t.provider, t.createdAt.desc()),
  index("ai_call_logs_user_id_idx").on(t.userId),
  index("ai_call_logs_degraded_idx").on(t.degraded).where(sql`degraded = true`),
  index("ai_call_logs_security_blocked_idx").on(t.securityBlocked).where(sql`security_blocked = true`),
  index("ai_call_logs_source_app_idx").on(t.sourceApp),
  index("ai_call_logs_surface_idx").on(t.surface),
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
  // Task #5331 — Persone (Horus/Ares) la cui intro poetica è GIA' stata mostrata
  // in questa conversazione. A differenza di activePersona (che torna a "bowie"
  // quando l'utente esce dall'handoff) questo elenco NON viene mai svuotato al
  // ritorno a Bowie — solo dalla scadenza del TTL della riga (nuova conversazione).
  introShownPersonas: jsonb("intro_shown_personas").$type<string[]>().notNull().default([]),
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

// ── Task #5326 — Analisi continua autonoma di Horus (dual-write DB + file) ────
//
// Horus, nelle finestre di basso carico (load-aware via online-tracker), esegue
// cicli di analisi in SOLA LETTURA che riusano l'engine db-integrity (problemi DB)
// + il watchdog (salute sistema) come fonti primarie, più esplorazione mirata del
// codice via GitHub read-only. Ogni ciclo produce UN run (metadati) e N artifact
// (i contenuti veri: report, insight, domande aperte). Dual-write: la riga in
// ai_analysis_artifacts È la fonte di verità; il file logs/horus-analysis-<ts>.md
// (stesso contenuto) è uno specchio leggibile/grep-abile per debug umano, mai
// l'inverso — se il file manca il dato in DB resta valido.
//
//   trigger     → "schedule" (ciclo autonomo) | "manual" (admin on-demand) | "repo-study".
//   fingerprint → hash dei dati sorgente (violazioni db-integrity + snapshot watchdog):
//                 se identico all'ultimo run, il ciclo si ferma dopo il fingerprint
//                 check (nessun lavoro/chiamata Ollama duplicata).
export const aiAnalysisRuns = pgTable("ai_analysis_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  persona: varchar("persona", { length: 16 }).notNull().default("horus"),
  trigger: varchar("trigger", { length: 16 }).notNull().default("schedule"),
  fingerprint: varchar("fingerprint", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("completed"),
  durationMs: integer("duration_ms"),
  artifactCount: integer("artifact_count").notNull().default(0),
  // Modello Ollama locale che ha generato l'analisi (audit; mai un secret).
  modelId: varchar("model_id", { length: 100 }),
  // Riassunto brevissimo per liste/notifiche (mai dati sensibili).
  summary: text("summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_analysis_runs_created_at_idx").on(t.createdAt.desc()),
  index("ai_analysis_runs_persona_idx").on(t.persona, t.createdAt.desc()),
]);

export type AiAnalysisRun = typeof aiAnalysisRuns.$inferSelect;
export type InsertAiAnalysisRun = typeof aiAnalysisRuns.$inferInsert;

// Contenuto vero degli artifact prodotti da un run. Un run può produrre più
// artifact (es. uno per categoria: db-integrity, watchdog, repo-study, code-review).
//   kind        → "db-integrity" | "watchdog" | "repo-study" | "code-review" | "web-research".
//   sensitivity → "internal" (default, mai esposto a utenti finali) | "shareable"
//                 (può essere iniettato nel contesto di Ares/Bowie via RAG).
//   sharedWith  → array persona ("bowie","ares") a cui l'artifact è stato iniettato
//                 (bidirezionale: traccia il flusso di conoscenza per audit).
//   mirrorPath  → path del file logs/horus-analysis-*.md gemello (dual-write).
//   expiresAt   → TTL di retention: gli artifact scaduti vengono ripuliti (evita
//                 crescita illimitata + conoscenza stantia iniettata nel RAG).
export const aiAnalysisArtifacts = pgTable("ai_analysis_artifacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id")
    .notNull()
    .references(() => aiAnalysisRuns.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 24 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  sensitivity: varchar("sensitivity", { length: 16 }).notNull().default("internal"),
  sharedWith: jsonb("shared_with").$type<string[]>().default([]),
  mirrorPath: text("mirror_path"),
  contentHash: varchar("content_hash", { length: 64 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ai_analysis_artifacts_run_id_idx").on(t.runId),
  index("ai_analysis_artifacts_kind_idx").on(t.kind, t.createdAt.desc()),
  index("ai_analysis_artifacts_expires_at_idx").on(t.expiresAt).where(sql`expires_at IS NOT NULL`),
]);

export type AiAnalysisArtifact = typeof aiAnalysisArtifacts.$inferSelect;
export type InsertAiAnalysisArtifact = typeof aiAnalysisArtifacts.$inferInsert;

// ── Task #41 — Visibilità admin su timeout/troncamenti dei tool AI ───────────
//
// guardTool (server/ai/assistant/tools.ts) mette già un tetto uniforme di
// tempo (TOOL_EXECUTION_TIMEOUT_MS) e di dimensione (MAX_TOOL_RESULT_CHARS) su
// ogni tool-call, ma finora l'evento era visibile SOLO dentro il singolo
// turno (il modello riceve un {error}/{truncated:true} e va avanti). Questa
// tabella è un contatore-per-combinazione (non un log riga-per-evento, per
// restare piccola): una riga per (tool, roster, tipo evento), incrementata a
// ogni occorrenza — stesso pattern dedup di ai_knowledge_gaps. Permette
// all'admin di capire, a posteriori, SE e QUANTO spesso un tool/persona
// specifico sta timeout-ando o troncando (query mirata, non serve grep log).
//
//   roster    → "bowie" | "horus" (quale set di tool/persona ha invocato il tool;
//               lo stesso tool sottostante è condiviso ma OLLAMA_TOOLS/HORUS_TOOLS
//               lo avvolgono separatamente con un'etichetta statica diversa).
//   eventType → "timeout" | "truncated".
export const aiToolEvents = pgTable("ai_tool_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  roster: varchar("roster", { length: 16 }).notNull(),
  eventType: varchar("event_type", { length: 16 }).notNull(),
  occurrences: integer("occurrences").notNull().default(1),
  // Ultimo messaggio (errore di timeout o dimensione troncata), troncato per
  // audit — mai un secret (i tool non ne maneggiano).
  lastMessage: text("last_message"),
  lastOccurredAt: timestamp("last_occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ai_tool_events_key").on(t.toolName, t.roster, t.eventType),
  index("ai_tool_events_last_occurred_idx").on(t.lastOccurredAt.desc()),
]);

export type AiToolEvent = typeof aiToolEvents.$inferSelect;
export type InsertAiToolEvent = typeof aiToolEvents.$inferInsert;

// ── Task #51 — Conversazione osservabile a più agenti (Horus/Bowie/Quebracho) ─
//
// A differenza della chat diretta (UNA persona attiva per turno, con handoff che
// SOSTITUISCE), qui l'admin propone un ARGOMENTO e 2-3 agenti (bowie/horus/
// quebracho — Ares è escluso: resta l'analisi asincrona) discutono a TURNI, in
// diretta, mentre l'admin osserva. Il transcript è persistito così che, se la
// connessione cade a metà, riaprendo la stessa conversazione si vedono i turni
// già avvenuti e la si può far ripartire dall'ultimo turno completato.
//
//   participants → sottoinsieme del roster in ordine di turno (a rotazione:
//                  persona del turno = participants[turnIndex % participants.length]).
//   maxTurns     → default 6, cap 20; la conversazione si conclude da sola al
//                  raggiungimento, o quando l'admin la interrompe.
//   status       → "running" (in corso o interrotta a metà = riprendibile) |
//                  "completed" (raggiunti maxTurns) | "aborted" (stop admin).
//   turnCount    → numero di turni COMPLETATI e persistiti (source of truth per
//                  la ripresa: si riparte da turnIndex = turnCount).
export const aiGroupConversations = pgTable("ai_group_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  topic: text("topic").notNull(),
  participants: jsonb("participants").$type<string[]>().notNull().default([]),
  maxTurns: integer("max_turns").notNull().default(6),
  turnCount: integer("turn_count").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("running"),
  // Task #130 — Lingua dell'utente presente alla tavola rotonda: persistita così
  // la ripresa (resume) genera i turni nella stessa lingua dell'avvio. Default
  // italiano (sorgente app), coerente col comportamento storico.
  language: varchar("language", { length: 8 }).notNull().default("it"),
  // Admin che ha avviato la conversazione (audit). set null se l'utente è rimosso.
  createdBy: varchar("created_by", { length: 36 })
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
}, (t) => [
  index("ai_group_conversations_created_at_idx").on(t.createdAt.desc()),
  index("ai_group_conversations_status_idx").on(t.status, t.createdAt.desc()),
]);

export type AiGroupConversation = typeof aiGroupConversations.$inferSelect;
export type InsertAiGroupConversation = typeof aiGroupConversations.$inferInsert;

// Un turno completato della conversazione di gruppo. Persistito NON appena il
// turno finisce (streaming a parte): la coppia (conversationId, turnIndex) è
// UNIQUE — la ripresa non può duplicare un turno già scritto.
export const aiGroupConversationTurns = pgTable("ai_group_conversation_turns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => aiGroupConversations.id, { onDelete: "cascade" }),
  turnIndex: integer("turn_index").notNull(),
  persona: varchar("persona", { length: 16 }).notNull(),
  content: text("content").notNull(),
  // Provider/modello che ha generato il turno (audit; mai un secret).
  provider: varchar("provider", { length: 40 }),
  modelId: varchar("model_id", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ai_group_conversation_turns_conv_turn_key").on(t.conversationId, t.turnIndex),
  index("ai_group_conversation_turns_conv_idx").on(t.conversationId, t.turnIndex),
]);

export type AiGroupConversationTurn = typeof aiGroupConversationTurns.$inferSelect;
export type InsertAiGroupConversationTurn = typeof aiGroupConversationTurns.$inferInsert;
