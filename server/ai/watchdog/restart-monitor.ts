// Unexpected-restart detection: on every boot, records a server_boot signal
// then checks if the previous boot was within the alert threshold. If so,
// writes an unexpected_restart signal and sends an immediate push to admins.
import fs from "fs";
import { db } from "../../db";
import { systemSignals } from "@shared/db";
import { desc, eq, and, gt } from "drizzle-orm";
import { sendSystemAlertPushToAdmins } from "../../push-notifications";
import { storage } from "../../storage";
import { evaluateCrashBackoffAlert } from "../../lib/crash-backoff";

const SOURCE = "app" as const;
const BOOT_METRIC = "server.boot";
const RESTART_METRIC = "server.unexpected_restart";
const DB_SLOW_BOOT_METRIC = "server.db_slow_boot";
export const CRASH_REASON_METRIC = "server.crash_reason";
const CRASH_LOG_PATH = "/tmp/server-crash.log";
const CRASH_LOG_MAX_LINES = 50;

const DEFAULT_THRESHOLD_MIN = 5;
// How long an unexpected_restart signal is surfaced by the panel collector (min).
export const RESTART_VISIBLE_WINDOW_MIN = 30;

async function getThresholdMinutes(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("restart_alert_threshold_minutes");
    if (!setting?.value) return DEFAULT_THRESHOLD_MIN;
    const n = parseInt(setting.value, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD_MIN;
  } catch {
    return DEFAULT_THRESHOLD_MIN;
  }
}

// ── Crash log helpers ─────────────────────────────────────────────────────────

interface CrashEntry {
  at: Date;
  type: string;
  message: string;
  stack: string;
}

function parseCrashEntries(content: string): CrashEntry[] {
  const entries: CrashEntry[] = [];
  const blocks = content.split(/^--- CRASH /m).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = new Date(lines[0]?.replace(/ ---$/, "").trim() ?? "");
    if (isNaN(at.getTime())) continue;
    let type = "";
    let message = "";
    const stackLines: string[] = [];
    let inStack = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.startsWith("type: ")) { type = line.slice(6); inStack = false; }
      else if (line.startsWith("message: ")) { message = line.slice(9); inStack = false; }
      else if (line.startsWith("stack: ")) { stackLines.push(line.slice(7)); inStack = true; }
      else if (inStack && line !== "") { stackLines.push(line); }
      else { inStack = false; }
    }
    entries.push({ at, type, message, stack: stackLines.join("\n") });
  }
  return entries;
}

async function processCrashLog(lastBootAt: Date | null): Promise<void> {
  try {
    if (!fs.existsSync(CRASH_LOG_PATH)) return;
    const content = fs.readFileSync(CRASH_LOG_PATH, "utf8");
    const entries = parseCrashEntries(content);
    if (!entries.length) return;

    const newEntries = lastBootAt ? entries.filter((e) => e.at > lastBootAt) : entries;

    for (const entry of newEntries) {
      console.warn(
        `[CRASH-REASON] ${entry.at.toISOString()} — type=${entry.type} — ${entry.message}\n${entry.stack}`,
      );
      await db.insert(systemSignals).values({
        source: SOURCE,
        metric: CRASH_REASON_METRIC,
        severity: "critical",
        details: {
          type: entry.type,
          message: entry.message.slice(0, 500),
          stack: entry.stack.slice(0, 2000),
          crashedAt: entry.at.toISOString(),
        } as object,
      });
    }

    // Tronca a max 50 righe (le più recenti)
    const allLines = content.split("\n");
    if (allLines.length > CRASH_LOG_MAX_LINES) {
      fs.writeFileSync(CRASH_LOG_PATH, allLines.slice(-CRASH_LOG_MAX_LINES).join("\n"), "utf8");
    }
  } catch (err) {
    console.warn("[restart-monitor] processCrashLog error (non-fatal):", err);
  }
}

async function getLastBootTime(): Promise<Date | null> {
  try {
    const rows = await db
      .select({ createdAt: systemSignals.createdAt })
      .from(systemSignals)
      .where(
        and(
          eq(systemSignals.source, SOURCE),
          eq(systemSignals.metric, BOOT_METRIC),
        ),
      )
      .orderBy(desc(systemSignals.createdAt))
      .limit(1);
    return rows[0]?.createdAt ?? null;
  } catch {
    return null;
  }
}

export async function recordBootSignal(): Promise<void> {
  try {
    const now = new Date();
    const thresholdMin = await getThresholdMinutes();
    const lastBoot = await getLastBootTime();

    // Determine if this is an unexpected restart
    let isUnexpected = false;
    let minutesSinceLast: number | null = null;
    if (lastBoot) {
      minutesSinceLast = Math.floor((now.getTime() - lastBoot.getTime()) / 60_000);
      if (minutesSinceLast < thresholdMin) {
        isUnexpected = true;
      }
    }

    // Always record the current boot (info — not persisted by aggregator, so insert directly)
    await db.insert(systemSignals).values({
      source: SOURCE,
      metric: BOOT_METRIC,
      severity: "info",
      details: { pid: process.pid, isUnexpected, thresholdMin } as object,
    });

    // Leggi crash log del processo precedente (se esiste) e inserisci in system_signals
    await processCrashLog(lastBoot);

    if (!isUnexpected) {
      if (minutesSinceLast !== null) {
        console.log(
          `[restart-monitor] boot normale — ultimo boot ${minutesSinceLast} min fa (soglia ${thresholdMin} min)`,
        );
      } else {
        console.log("[restart-monitor] primo boot rilevato — nessun boot precedente in DB");
      }
      return;
    }

    // Record the unexpected_restart signal (high severity — visible in watchdog panel)
    await db.insert(systemSignals).values({
      source: SOURCE,
      metric: RESTART_METRIC,
      severity: "high",
      value: minutesSinceLast,
      unit: "min",
      details: {
        lastBootAt: lastBoot!.toISOString(),
        minutesSinceLast,
        thresholdMin,
        pid: process.pid,
      } as object,
    });

    console.warn(
      `[restart-monitor] ⚠️  RIAVVIO INATTESO rilevato — ultimo boot ${minutesSinceLast} min fa (soglia ${thresholdMin} min)`,
    );

    // Immediate push to admins (non-fatal)
    try {
      const n = await sendSystemAlertPushToAdmins(
        "⚠️ Riavvio server inatteso",
        `Il server si è riavviato solo ${minutesSinceLast} min dopo il boot precedente`,
        {
          type: "watchdog_restart",
          minutesSinceLast,
          thresholdMin,
        },
      );
      if (n > 0) {
        console.log(`[restart-monitor] push inviata a ${n} admin`);
      }
    } catch (pushErr) {
      console.warn("[restart-monitor] push admin fallita (non-fatal):", pushErr);
    }
  } catch (err) {
    console.warn("[restart-monitor] recordBootSignal error (non-fatal):", err);
  }
}

// ── DB-slow-boot alert ────────────────────────────────────────────────────────
// Il backoff anti crash-loop (lib/crash-backoff.ts) sopravvive a un Postgres
// managed lento al boot, ma se la lentezza persiste il server resta degradato in
// silenzio. Qui, a boot avvenuto (DB pronto), controlliamo se il backoff è
// scattato ≥N volte nella finestra recente: in tal caso emettiamo un alert
// (system_signal + push admin), throttlato a monte da evaluateCrashBackoffAlert.
export async function checkAndAlertDbSlowBoot(): Promise<void> {
  try {
    const decision = evaluateCrashBackoffAlert();
    if (!decision.emit) return;

    const { crashCount, windowMinutes, threshold } = decision;
    console.warn(
      `[restart-monitor] ⚠️  DB lento al boot — backoff anti crash-loop scattato ${crashCount} volte ` +
        `negli ultimi ${windowMinutes} min (soglia ${threshold}). Postgres managed probabilmente degradato.`,
    );

    try {
      await db.insert(systemSignals).values({
        source: SOURCE,
        metric: DB_SLOW_BOOT_METRIC,
        severity: "high",
        value: crashCount,
        unit: "crash",
        details: {
          crashCount,
          windowMinutes,
          threshold,
          pid: process.pid,
        } as object,
      });
    } catch (sigErr) {
      console.warn("[restart-monitor] insert db_slow_boot signal fallito (non-fatal):", sigErr);
    }

    try {
      const n = await sendSystemAlertPushToAdmins(
        "🐢 DB lento al boot — backoff attivo",
        `Il backoff anti crash-loop è scattato ${crashCount} volte negli ultimi ${windowMinutes} min. ` +
          `Il Postgres managed sembra degradato all'avvio — da indagare.`,
        {
          type: "db_slow_boot",
          crashCount,
          windowMinutes,
          threshold,
        },
      );
      if (n > 0) console.log(`[restart-monitor] alert DB lento al boot inviato a ${n} admin`);
    } catch (pushErr) {
      console.warn("[restart-monitor] push DB lento al boot fallita (non-fatal):", pushErr);
    }
  } catch (err) {
    console.warn("[restart-monitor] checkAndAlertDbSlowBoot error (non-fatal):", err);
  }
}

// Query recent unexpected_restart signals for the watchdog panel collector.
export async function getRecentUnexpectedRestarts(): Promise<
  Array<{ minutesSinceLast: number | null; createdAt: Date }>
> {
  try {
    const cutoff = new Date(Date.now() - RESTART_VISIBLE_WINDOW_MIN * 60_000);
    const rows = await db
      .select({
        value: systemSignals.value,
        details: systemSignals.details,
        createdAt: systemSignals.createdAt,
      })
      .from(systemSignals)
      .where(
        and(
          eq(systemSignals.source, SOURCE),
          eq(systemSignals.metric, RESTART_METRIC),
          gt(systemSignals.createdAt, cutoff),
        ),
      )
      .orderBy(desc(systemSignals.createdAt));
    return rows.map((r) => ({
      minutesSinceLast: typeof r.value === "number" ? r.value : null,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

// Query crash-reason signals per il collector (ultimi 30 min).
export async function getRecentCrashReasons(): Promise<
  Array<{ crashedAt: string | null; type: string | null; message: string | null; createdAt: Date }>
> {
  try {
    const cutoff = new Date(Date.now() - RESTART_VISIBLE_WINDOW_MIN * 60_000);
    const rows = await db
      .select({ details: systemSignals.details, createdAt: systemSignals.createdAt })
      .from(systemSignals)
      .where(
        and(
          eq(systemSignals.source, SOURCE),
          eq(systemSignals.metric, CRASH_REASON_METRIC),
          gt(systemSignals.createdAt, cutoff),
        ),
      )
      .orderBy(desc(systemSignals.createdAt));
    return rows.map((r) => {
      const d = r.details as Record<string, unknown> | null;
      return {
        crashedAt: typeof d?.crashedAt === "string" ? d.crashedAt : null,
        type: typeof d?.type === "string" ? d.type : null,
        message: typeof d?.message === "string" ? d.message : null,
        createdAt: r.createdAt,
      };
    });
  } catch {
    return [];
  }
}
