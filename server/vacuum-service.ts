import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { withBgDbConnection } from "./lib/bg-db-limiter";

const VACUUM_LAST_RUN_KEY = "db_vacuum_smart_v1";
const VACUUM_DETAIL_KEY = "db_vacuum_smart_v1_detail";

// Soglia di bloat (dead tuple ratio) oltre la quale si esegue VACUUM FULL ANALYZE
// invece del semplice VACUUM ANALYZE. Configurabile via AppSetting.
const VACUUM_FULL_BLOAT_THRESHOLD_KEY = "vacuum_full_bloat_threshold";
const DEFAULT_BLOAT_THRESHOLD = 0.2;

export const VACUUM_LAST_RUN_SETTING_KEY = VACUUM_LAST_RUN_KEY;
export const VACUUM_DETAIL_SETTING_KEY = VACUUM_DETAIL_KEY;

export const VACUUM_TABLES = [
  "conversation_participants",
  "moto_club_members",
  "messages",
  "user_motorcycles",
  "users",
  "conversations",
  "biker_biker_matches",
  "biker_zavorrina_matches",
  "user_profiles",
  "user_playlist_snapshots",
  "proposals",
  "moto_clubs",
  "app_settings",
] as const;

let isRunning = false;

export function isVacuumRunning(): boolean {
  return isRunning;
}

/**
 * Legge il dead-tuple ratio di una tabella da `pg_stat_user_tables`.
 * ratio = n_dead_tup / (n_dead_tup + n_live_tup), nell'intervallo 0–1.
 * Se la tabella non compare nelle stats (o la query fallisce) ritorna 0,
 * così la tabella riceve solo un VACUUM ANALYZE (nessun FULL inutile).
 */
async function getTableBloatRatio(
  client: import("pg").PoolClient,
  table: string,
): Promise<number> {
  try {
    const r = await client.query<{ dead: string; live: string }>(
      `SELECT n_dead_tup AS dead, n_live_tup AS live
         FROM pg_stat_user_tables
        WHERE schemaname = 'public' AND relname = $1`,
      [table],
    );
    const row = r.rows[0];
    if (!row) return 0;
    const dead = parseInt(row.dead ?? "0", 10);
    const live = parseInt(row.live ?? "0", 10);
    const total = dead + live;
    if (total <= 0) return 0;
    return dead / total;
  } catch {
    return 0;
  }
}

/** Legge la soglia di bloat (0–1) dall'AppSetting `vacuum_full_bloat_threshold`. */
async function getBloatThreshold(): Promise<number> {
  try {
    const setting = await storage.getAppSetting(VACUUM_FULL_BLOAT_THRESHOLD_KEY);
    if (setting?.value) {
      const parsed = parseFloat(setting.value);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1) return parsed;
    }
  } catch {
    // usa il default
  }
  return DEFAULT_BLOAT_THRESHOLD;
}

/**
 * VACUUM smart: per ogni tabella esegue `VACUUM ANALYZE` (nessun lock esclusivo);
 * solo le tabelle con bloat (dead-tuple ratio) oltre la soglia ricevono il
 * `VACUUM FULL ANALYZE` (lock esclusivo, più lento). L'intera esecuzione passa
 * da `withBgDbSlot` per non affamare il pool del traffico utente.
 *
 * Returns "executed" if the run completed, "skipped" if another run was already active.
 */
export async function runVacuumSmart(): Promise<"executed" | "skipped"> {
  if (isRunning) {
    console.warn("[VACUUM] Giro già in corso — skip.");
    return "skipped";
  }
  isRunning = true;
  const startTotal = Date.now();
  type TableDetail = {
    table: string;
    mode: "analyze" | "full";
    bloatRatio: number;
    bytesBefore: number;
    bytesAfter: number;
  };
  const tableDetails: TableDetail[] = [];
  try {
    const threshold = await getBloatThreshold();
    console.log(
      `[VACUUM] Avvio VACUUM smart sulle tabelle principali (soglia bloat FULL: ${(threshold * 100).toFixed(0)}%)...`,
    );
    await withBgDbConnection(async (client) => {
      for (const table of VACUUM_TABLES) {
        let sizeBefore = 0;
        let sizeAfter = 0;
        try {
          const r = await client.query<{ size: string }>(
            `SELECT pg_total_relation_size($1::regclass) AS size`,
            [table],
          );
          sizeBefore = parseInt(r.rows[0]?.size ?? "0", 10);
        } catch {
          sizeBefore = 0;
        }
        const bloatRatio = await getTableBloatRatio(client, table);
        const mode: "analyze" | "full" = bloatRatio > threshold ? "full" : "analyze";
        const t0 = Date.now();
        if (mode === "full") {
          await client.query(`VACUUM FULL ANALYZE ${table}`);
        } else {
          await client.query(`VACUUM ANALYZE ${table}`);
        }
        const elapsed = Date.now() - t0;
        try {
          const r = await client.query<{ size: string }>(
            `SELECT pg_total_relation_size($1::regclass) AS size`,
            [table],
          );
          sizeAfter = parseInt(r.rows[0]?.size ?? "0", 10);
        } catch {
          sizeAfter = 0;
        }
        tableDetails.push({ table, mode, bloatRatio, bytesBefore: sizeBefore, bytesAfter: sizeAfter });
        const savedMB = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2);
        const beforeMB = (sizeBefore / 1024 / 1024).toFixed(2);
        const afterMB = (sizeAfter / 1024 / 1024).toFixed(2);
        const bloatPct = (bloatRatio * 100).toFixed(1);
        console.log(
          `[VACUUM] ${table}: mode=${mode.toUpperCase()} bloat=${bloatPct}% ${beforeMB}MB → ${afterMB}MB (risparmio ${savedMB}MB) in ${elapsed}ms`,
        );
      }
    });
    const totalElapsed = Date.now() - startTotal;
    const fullCount = tableDetails.filter((d) => d.mode === "full").length;
    console.log(
      `[VACUUM] Completato in ${totalElapsed}ms — ${fullCount}/${tableDetails.length} tabelle in VACUUM FULL.`,
    );
    try {
      await storage.upsertAppSetting(VACUUM_LAST_RUN_KEY, new Date().toISOString());
    } catch (err) {
      console.warn("[VACUUM] Impossibile salvare il timestamp dell'ultimo VACUUM:", err);
    }
    try {
      await storage.upsertAppSetting(VACUUM_DETAIL_KEY, JSON.stringify(tableDetails));
    } catch (err) {
      console.warn("[VACUUM] Impossibile salvare il dettaglio per-tabella:", err);
    }
    return "executed";
  } catch (err) {
    console.error("[VACUUM] Errore durante VACUUM smart:", err);
    throw err;
  } finally {
    isRunning = false;
  }
}

/**
 * Returns milliseconds until the next 03:00:00 in Europe/Rome timezone.
 * Uses Intl.DateTimeFormat to read the current Rome-local time components,
 * then computes the delta in seconds. Handles DST transitions correctly.
 */
function msUntilNextRomeThreeAM(): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const romeH = parseInt(parts.hour ?? "0", 10);
  const romeM = parseInt(parts.minute ?? "0", 10);
  const romeS = parseInt(parts.second ?? "0", 10);
  const secondsSinceMidnight = romeH * 3600 + romeM * 60 + romeS;
  const targetSeconds = 3 * 3600; // 03:00:00
  let delta = targetSeconds - secondsSinceMidnight;
  if (delta <= 0) delta += 24 * 3600;
  return delta * 1000;
}

/** Format a future UTC Date as "YYYY-MM-DD HH:MM Europe/Rome" for readable log output. */
function formatRomeTime(date: Date): string {
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AI_AUDIT_RETENTION_KEY = "ai_audit_retention_days";
const AI_AUDIT_DEFAULT_RETENTION = 30;

/**
 * Cancella le righe `ai_token_audit_YYYY-MM-DD` da app_settings
 * più vecchie di `retentionDays` giorni (default: 30, configurabile
 * tramite AppSetting `ai_audit_retention_days`).
 *
 * Il pattern di matching usa il prefisso fisso + il formato data ISO
 * (10 caratteri), quindi non tocca mai altre chiavi.
 */
export async function purgeOldAiAuditRows(): Promise<number> {
  let retentionDays = AI_AUDIT_DEFAULT_RETENTION;
  try {
    const setting = await storage.getAppSetting(AI_AUDIT_RETENTION_KEY);
    if (setting?.value) {
      const parsed = parseInt(setting.value, 10);
      if (!isNaN(parsed) && parsed > 0) retentionDays = parsed;
    }
  } catch {
    // usa il default
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const result = await db.execute(sql`
      DELETE FROM app_settings
      WHERE key LIKE 'ai_token_audit_%'
        AND substring(key FROM 16 FOR 10) < ${cutoffStr}
    `);
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    console.log(
      `[AI-AUDIT-PURGE] Eliminate ${deleted} righe ai_token_audit_* più vecchie di ${retentionDays} giorni (cutoff: ${cutoffStr})`,
    );
    return deleted;
  } catch (err) {
    console.error("[AI-AUDIT-PURGE] Errore durante la pulizia dei contatori AI:", err);
    return 0;
  }
}

export function scheduleNightlyVacuum(): void {
  if (process.env.DISABLE_NIGHTLY_VACUUM === "1") {
    console.log("[VACUUM] Scheduler notturno disabilitato (DISABLE_NIGHTLY_VACUUM=1).");
    return;
  }

  const fireAndReschedule = async () => {
    if (isRunning) {
      console.warn("[VACUUM] Esecuzione notturna saltata: giro precedente ancora in corso.");
    } else {
      try {
        await runVacuumSmart();
      } catch (err) {
        console.error("[VACUUM] Errore nel giro notturno:", err);
      }
    }
    // Pulizia contatori AI indipendente dal vacuum principale
    try {
      await purgeOldAiAuditRows();
    } catch (err) {
      console.error("[AI-AUDIT-PURGE] Errore nel giro notturno:", err);
    }
    // Recalculate next 03:00 Europe/Rome from now (handles DST transitions correctly)
    const delayMs = msUntilNextRomeThreeAM();
    const nextAt = new Date(Date.now() + delayMs);
    console.log(
      `[VACUUM] Prossima esecuzione programmata: ${formatRomeTime(nextAt)} (Europe/Rome) — tra ${Math.round(delayMs / 60_000)} minuti`,
    );
    setTimeout(fireAndReschedule, delayMs);
  };

  const initialDelayMs = msUntilNextRomeThreeAM();
  const firstAt = new Date(Date.now() + initialDelayMs);
  console.log(
    `[VACUUM] Prossima esecuzione programmata: ${formatRomeTime(firstAt)} (Europe/Rome) — tra ${Math.round(initialDelayMs / 60_000)} minuti`,
  );
  setTimeout(fireAndReschedule, initialDelayMs);
}
