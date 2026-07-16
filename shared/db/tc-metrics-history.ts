// Task #354 — Storico metriche ThinkCentre (campioni ogni 60s, retention 7 giorni).
//
// Una riga per campione del sampler background. Tiene lo stato online/offline
// del TC e tutte le metriche di sistema rilevanti per l'analisi dei trend
// (temperatura CPU/GPU, utilizzo GPU, VRAM, load avg, RAM, rete, I/O disco).
// Tabella separata da db_monitor_history (carico Replit) e resource_samples.
// Retention: 7 giorni (compatta: ~10k righe/settimana con campionamento al minuto).
import { pgTable, serial, boolean, real, integer, timestamp, index } from "drizzle-orm/pg-core";

export const tcMetricsHistory = pgTable("tc_metrics_history", {
  id: serial("id").primaryKey(),
  sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
  online: boolean("online").notNull().default(false),

  // ── Termiche ───────────────────────────────────────────────────────────────
  cpuTempC: real("cpu_temp_c"),      // °C (null se non rilevata)
  gpuTempC: real("gpu_temp_c"),      // °C (null se GPU assente)

  // ── GPU NVIDIA (null se nvidia-smi non disponibile) ─────────────────────────
  gpuUtilPct: real("gpu_util_pct"),  // 0-100%
  vramUsedMb: integer("vram_used_mb"),
  vramTotalMb: integer("vram_total_mb"),

  // ── Sistema ───────────────────────────────────────────────────────────────
  loadAvg1: real("load_avg_1"),      // load average 1 minuto
  ramUsedPct: real("ram_used_pct"),  // 0-100% (calcolato da ramUsedMb/ramTotalMb)

  // ── Rete (KB/s) ────────────────────────────────────────────────────────────
  netRxKbs: real("net_rx_kbs"),
  netTxKbs: real("net_tx_kbs"),

  // ── I/O Disco (KB/s) ───────────────────────────────────────────────────────
  diskReadKbs: real("disk_read_kbs"),
  diskWriteKbs: real("disk_write_kbs"),
}, (t) => [
  index("tc_metrics_history_sampled_idx").on(t.sampledAt),
]);

export type TcMetricsHistoryRow = typeof tcMetricsHistory.$inferSelect;
export type InsertTcMetricsHistoryRow = typeof tcMetricsHistory.$inferInsert;
