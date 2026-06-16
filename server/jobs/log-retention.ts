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
} from "@shared/db";
import { withDbRetry } from "../lib/db-retry";

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
];

const GPS_ERRORS_FULL_PURGE_FLAG = "logRetention.gpsErrorsPurgedV1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
const INITIAL_DELAY_MS = 2 * 60 * 1000;

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
  if (count > 0) {
    await withDbRetry(`[log-retention:${target.name}]`, () =>
      db.delete(target.table).where(lt(target.tsColumn, cutoff)),
    );
    console.log(
      `[LOG-RETENTION] ${target.name}: rimosse ${count} righe più vecchie di ${target.retentionDays}gg`
    );
  }
  return count;
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
  console.log(`[LOG-RETENTION] Completato — totale righe rimosse: ${totalDeleted}`);
}

let scheduled = false;

export function scheduleLogRetention(): void {
  if (scheduled) return;
  scheduled = true;
  // Prima esecuzione poco dopo il boot (per non contendere con il carico di avvio),
  // poi ogni 5 giorni.
  setTimeout(() => {
    runLogRetention().catch((e) => console.warn("[LOG-RETENTION] run iniziale error:", e));
    setInterval(() => {
      runLogRetention().catch((e) => console.warn("[LOG-RETENTION] run schedulato error:", e));
    }, FIVE_DAYS_MS);
  }, INITIAL_DELAY_MS);
  console.log("[INIT] Log retention scheduled (run iniziale + ogni 5 giorni)");
}
