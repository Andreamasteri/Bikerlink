// Retention dei log diagnostici a rischio di saturare lo storage.
//
// Motivazione: tabelle append-only di diagnostica (errori GPS, crash, eventi A/B,
// snapshot di health, segnali e telemetria mappe) crescono indefinitamente e
// possono riempire il database. Questo job, schedulato ogni 5 giorni, elimina
// le righe più vecchie della finestra di retention per ciascuna tabella.
//
// In più, esegue UNA-TANTUM uno svuotamento totale di `gps_errors` per ripulire
// il flood storico accumulato prima della rimozione del buffer GPS offline lato
// client. Il purge è idempotente (gated da un flag in app_settings).
import { lt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { storage } from "../storage";
import { withJobGate } from "../ai/coordinator/gated-job";
import {
  gpsErrors,
  appCrashLogs,
  abEvents,
  systemHealthSnapshot,
  systemSignals,
  mapsTelemetryEvents,
  embeddingCallLog,
  appSettings,
  aiCallLogs,
  aiWatchdogLog,
  aiSuggestionsLog,
  moderatorLogs,
  siteVisits,
  pipelineProbeHistory,
  pipelineFlowEvents,
} from "@shared/db";
import { withDbRetry } from "../lib/db-retry";
import { purgeOldAssistantImages } from "./assistant-images-retention";

interface RetentionTarget {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle table objects have heterogeneous types
  table: any;
  tsColumn: PgColumn;
  retentionDays: number;
}

// Per estendere la regola ad altri log: aggiungere una riga qui con la tabella,
// la colonna timestamp e i giorni di retention. Nessun'altra modifica richiesta.
const RETENTION_TARGETS: RetentionTarget[] = [
  { name: "gps_errors", table: gpsErrors, tsColumn: gpsErrors.createdAt, retentionDays: 14 },
  { name: "app_crash_logs", table: appCrashLogs, tsColumn: appCrashLogs.reportedAt, retentionDays: 30 },
  { name: "ab_events", table: abEvents, tsColumn: abEvents.createdAt, retentionDays: 30 },
  { name: "system_health_snapshot", table: systemHealthSnapshot, tsColumn: systemHealthSnapshot.createdAt, retentionDays: 14 },
  // system_signals e maps_telemetry_events hanno già un cleanup proprio del
  // watchdog a 7 giorni: qui allineiamo la finestra (safety net se il watchdog
  // non gira), così la policy di retention resta coerente a 7gg.
  { name: "system_signals", table: systemSignals, tsColumn: systemSignals.createdAt, retentionDays: 7 },
  { name: "maps_telemetry_events", table: mapsTelemetryEvents, tsColumn: mapsTelemetryEvents.createdAt, retentionDays: 7 },
  { name: "embedding_call_log", table: embeddingCallLog, tsColumn: embeddingCallLog.createdAt, retentionDays: 30 },
  { name: "ai_call_logs", table: aiCallLogs, tsColumn: aiCallLogs.createdAt, retentionDays: 30 },
  { name: "ai_suggestions_log", table: aiSuggestionsLog, tsColumn: aiSuggestionsLog.createdAt, retentionDays: 30 },
  { name: "ai_watchdog_log", table: aiWatchdogLog, tsColumn: aiWatchdogLog.createdAt, retentionDays: 30 },
  { name: "moderator_logs", table: moderatorLogs, tsColumn: moderatorLogs.createdAt, retentionDays: 30 },
  { name: "site_visits", table: siteVisits, tsColumn: siteVisits.createdAt, retentionDays: 30 },
  { name: "pipeline_probe_history", table: pipelineProbeHistory, tsColumn: pipelineProbeHistory.runAt, retentionDays: 30 },
  { name: "pipeline_flow_events", table: pipelineFlowEvents, tsColumn: pipelineFlowEvents.ts, retentionDays: 30 },
];

const GPS_ERRORS_FULL_PURGE_FLAG = "logRetention.gpsErrorsPurgedV1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
const INITIAL_DELAY_MS = 2 * 60 * 1000;
const PURGE_BATCH_SIZE = 1_000;

// notification_history non è una tabella drizzle (è creata via SQL raw in
// boot-phase3-db-init.ts), quindi ha un purge dedicato con SQL grezzo. La
// finestra di retention è configurabile tramite AppSetting (default 60gg,
// range consigliato 30-90gg) per non avere la soglia hardcoded.
const NOTIFICATION_HISTORY_RETENTION_KEY = "notification_history_retention_days";
const NOTIFICATION_HISTORY_DEFAULT_RETENTION = 60;

async function countOlderThan(target: RetentionTarget, cutoff: Date): Promise<number> {
  const [row] = await withDbRetry(`[log-retention:${target.name}]`, () =>
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(target.table)
      .where(lt(target.tsColumn, cutoff)),
  );
  return row?.c ?? 0;
}

async function purgeTarget(target: RetentionTarget): Promise<number> {
  const cutoff = new Date(Date.now() - target.retentionDays * ONE_DAY_MS);
  let deleted = 0;

  // A single DELETE can retain locks and generate a large WAL burst. Delete
  // bounded physical batches so foreground writes can keep progressing.
  while (true) {
    const result = await withDbRetry(`[log-retention:${target.name}]`, () =>
      db.execute(sql`
        WITH victims AS (
          SELECT ctid
          FROM ${target.table}
          WHERE ${target.tsColumn} < ${cutoff}
          LIMIT ${PURGE_BATCH_SIZE}
        )
        DELETE FROM ${target.table} AS retained
        USING victims
        WHERE retained.ctid = victims.ctid
      `),
    );
    const batch = (result as { rowCount?: number }).rowCount ?? 0;
    deleted += batch;
    if (batch < PURGE_BATCH_SIZE) break;
  }

  if (deleted > 0) {
    console.log(
      `[LOG-RETENTION] ${target.name}: rimosse ${deleted} righe più vecchie di ${target.retentionDays}gg in batch da ${PURGE_BATCH_SIZE}`,
    );
  }
  return deleted;
}

// Svuotamento totale una-tantum di gps_errors (flood storico pre-fix buffer offline).
// Delete + set flag avvengono nella STESSA transazione: o entrambi o nessuno.
// Questo evita il caso in cui il delete riesce ma il flag no, che farebbe
// ripetere il purge totale ai run successivi cancellando di continuo la telemetria.
export async function runOneTimeGpsErrorsPurge(): Promise<void> {
  try {
    const flag = await storage.getAppSetting(GPS_ERRORS_FULL_PURGE_FLAG);
    if (flag?.value === "done") return;
    await withDbRetry("[log-retention:gps-purge]", () =>
      db.transaction(async (tx) => {
        const [row] = await tx.select({ c: sql<number>`count(*)::int` }).from(gpsErrors);
        const total = row?.c ?? 0;
        if (total > 0) {
          await tx.delete(gpsErrors);
          console.log(`[LOG-RETENTION] Purge una-tantum gps_errors: rimosse ${total} righe`);
        }
        await tx
          .insert(appSettings)
          .values({ key: GPS_ERRORS_FULL_PURGE_FLAG, value: "done", updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [appSettings.key],
            set: { value: "done", updatedAt: new Date() },
          });
      }),
    );
  } catch (err) {
    console.warn("[LOG-RETENTION] Purge una-tantum gps_errors fallita:", err);
  }
}

// Purge di notification_history (tabella raw SQL, non drizzle). La retention
// è letta dall'AppSetting `notification_history_retention_days`; se assente o
// non valida ricade sul default. Usa la colonna indicizzata created_at.
async function purgeNotificationHistory(): Promise<number> {
  let retentionDays = NOTIFICATION_HISTORY_DEFAULT_RETENTION;
  try {
    const setting = await storage.getAppSetting(NOTIFICATION_HISTORY_RETENTION_KEY);
    if (setting?.value) {
      const parsed = parseInt(setting.value, 10);
      if (!isNaN(parsed) && parsed > 0) retentionDays = parsed;
    }
  } catch {
    // usa il default
  }

  const cutoff = new Date(Date.now() - retentionDays * ONE_DAY_MS);
  try {
    const result = await withDbRetry("[log-retention:notification_history]", () =>
      db.execute(sql`
        DELETE FROM notification_history WHERE created_at < ${cutoff}
      `),
    );
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    if (deleted > 0) {
      console.log(
        `[LOG-RETENTION] notification_history: rimosse ${deleted} righe più vecchie di ${retentionDays}gg`,
      );
    }
    return deleted;
  } catch (err) {
    console.warn("[LOG-RETENTION] Errore purge notification_history:", err);
    return 0;
  }
}

export async function runLogRetention(): Promise<void> {
  await runOneTimeGpsErrorsPurge();
  let totalDeleted = 0;
  for (const target of RETENTION_TARGETS) {
    try {
      totalDeleted += await purgeTarget(target);
    } catch (err) {
      console.warn(`[LOG-RETENTION] Errore purge ${target.name}:`, err);
    }
  }
  totalDeleted += await purgeNotificationHistory();
  try {
    await purgeOldAssistantImages();
  } catch (err) {
    console.warn("[LOG-RETENTION] Errore purge assistant images:", err);
  }
  console.log(`[LOG-RETENTION] Completato — totale righe rimosse: ${totalDeleted}`);
}

let scheduled = false;

export function scheduleLogRetention(): void {
  if (scheduled) return;
  scheduled = true;
  // Prima esecuzione poco dopo il boot (per non contendere con il carico di avvio),
  // poi ogni 5 giorni.
  const gatedRun = withJobGate("log-retention", () =>
    runLogRetention().catch((e) => console.warn("[LOG-RETENTION] run error:", e)));
  setTimeout(() => {
    gatedRun();
    setInterval(gatedRun, FIVE_DAYS_MS);
  }, INITIAL_DELAY_MS);
  console.log("[INIT] Log retention scheduled (run iniziale + ogni 5 giorni)");
}
