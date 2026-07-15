// Task #64 — History compatta per il Database Monitor admin.
//
// Una riga per tick dell'aggregator watchdog (~60s). Tiene INSIEME il carico DB
// (saturazione pool, latenza ping, errori, restart, flag sovraccarico) e il
// carico del BACKEND Node (CPU, event-loop lag, RSS, flag sovraccarico) così che
// un admin possa vedere, sullo stesso asse temporale, se il collo di bottiglia è
// il database, il server, o entrambi.
//
// Tabella DELIBERATAMENTE separata da:
//   - system_signals        (retention 7 giorni)
//   - resource_samples      (retention 24 ore)
// perché qui serve una retention di 30+ giorni senza toccare quelle esistenti.
// Compatta per costruzione (colonne numeriche + due bool), quindi 30 giorni di
// campioni al minuto (~43k righe) restano leggeri; le query sono SEMPRE bucketate
// server-side e l'indice su sampled_at serve sia il range che il cleanup.
import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const dbMonitorHistory = pgTable("db_monitor_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sampledAt: timestamp("sampled_at").notNull().defaultNow(),

  // ── Carico DB ──────────────────────────────────────────────────────────────
  poolActivePct: integer("pool_active_pct").notNull().default(0),   // saturazione pool 0..100
  poolWaiting: integer("pool_waiting").notNull().default(0),        // client in coda sul pool
  pingMs: integer("ping_ms"),                                       // latenza SELECT 1 (null se non misurata)
  dbErrorCount: integer("db_error_count").notNull().default(0),     // problemi DB high/critical in questo ciclo
  dbRestartCount: integer("db_restart_count").notNull().default(0), // restart backend inattesi nell'ultima finestra
  dbOverload: boolean("db_overload").notNull().default(false),

  // ── Carico backend Node ──────────────────────────────────────────────────────
  backendCpuPct: integer("backend_cpu_pct").notNull().default(0),
  backendEventLoopLagMs: integer("backend_event_loop_lag_ms").notNull().default(0),
  backendRssMb: integer("backend_rss_mb").notNull().default(0),
  backendOverload: boolean("backend_overload").notNull().default(false),
}, (t) => [
  index("db_monitor_history_sampled_idx").on(t.sampledAt),
]);

export type DbMonitorHistoryRow = typeof dbMonitorHistory.$inferSelect;
export type InsertDbMonitorHistoryRow = typeof dbMonitorHistory.$inferInsert;
