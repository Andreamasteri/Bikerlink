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
const RETENTION_BATCH_SIZE = 1000;

// notification_history ha ora anche una definizione Drizzle, ma il purge
// resta SQL grezzo per mantenere il cleanup semplice, indicizzato e a basso impatto.
// La retention effettiva è sempre compresa tra 7 e 30 giorni: il default è 30gg
// e un vecchio AppSetting più permissivo non può allungare la finestra.
const NOTIFICATION_HISTORY_RETENTION_KEY = "notification_history_retention_days";
const NOTIFICATION_HISTORY_RETENTION_START_KEY = "notification_history_retention_started_at";
const NOTIFICATION_HISTORY_DEFAULT_RETENTION = 30;
const NOTIFICATION_HISTORY_MIN_RETENTION = 7;
const NOTIFICATION_HISTORY_MAX_RETENTION = 30;

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
  const count = await countOlderThan(target, cutoff);
  if (count <= 0) return 0;

  // Delete in bounded batches to avoid long transactions, lock amplification,
  // and large WAL/temp bursts on append-only tables.
  let deleted = 0;
  const tableName = `public.${target.name}`;

  while (deleted < count) {
    const result = await withDbRetry(`[log-retention:${target.name}]`, () =>
      db.execute(sql.raw(`
        WITH doomed AS (
          SELECT ctid
          FROM ${tableName}
          WHERE ${target.tsColumn.name} < '${cutoff.toISOString()}'
          LIMIT ${RETENTION_BATCH_SIZE}
        )
        DELETE FROM ${tableName} AS target
        USING doomed
        WHERE target.ctid = doomed.ctid
      `)),
    );

    const batchDeleted = Number((result as { rowCount?: number }).rowCount ?? 0);
    deleted += batchDeleted;
    if (batchDeleted === 0) break;
  }

  console.log(
    `[LOG-RETENTION] ${target.name}: rimosse ${deleted} righe più vecchie di ${target.retentionDays}gg in batch da ${RETENTION_BATCH_SIZE}`
  );
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

// Il baseline è inserito atomicamente dalla migration 0159 prima dell'avvio
// dell'app. Questo job lo legge soltanto: non può spostarlo né includere per
// errore nuove notifiche nella finestra legacy.
export async function getNotificationHistoryRetentionStart(): Promise<Date | null> {
  try {
    const existing = await storage.getAppSetting(NOTIFICATION_HISTORY_RETENTION_START_KEY);
    if (!existing?.value) return null;
    const parsed = new Date(existing.value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (err) {
    console.warn("[LOG-RETENTION] Lettura baseline notification_history fallita:", err);
    return null;
  }
}

// La retention è letta dall'AppSetting `notification_history_retention_days`;
// se assente o non valida ricade sul default. Usa la colonna indicizzata created_at.
async function purgeNotificationHistory(): Promise<number> {
  let retentionDays = NOTIFICATION_HISTORY_DEFAULT_RETENTION;
  try {
    const setting = await storage.getAppSetting(NOTIFICATION_HISTORY_RETENTION_KEY);
    if (setting?.value) {
      const parsed = parseInt(setting.value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retentionDays = Math.min(
          NOTIFICATION_HISTORY_MAX_RETENTION,
          Math.max(NOTIFICATION_HISTORY_MIN_RETENTION, parsed),
        );
      }
    }
  } catch {
    // usa il default
  }

  const retentionStart = await getNotificationHistoryRetentionStart();
  if (!retentionStart) return 0;

  const cutoff = new Date(Date.now() - retentionDays * ONE_DAY_MS);
  try {
    const result = await withDbRetry("[log-retention:notification_history]", () =>
      db.execute(sql`
        DELETE FROM notification_history
        WHERE created_at >= ${retentionStart}
          AND created_at < ${cutoff}
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
