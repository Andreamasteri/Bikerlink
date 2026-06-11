// Unexpected-restart detection: on every boot, records a server_boot signal
// then checks if the previous boot was within the alert threshold. If so,
// writes an unexpected_restart signal and sends an immediate push to admins.
import { db } from "../../db";
import { systemSignals } from "@shared/db";
import { desc, eq, and, gt } from "drizzle-orm";
import { sendSystemAlertPushToAdmins } from "../../push-notifications";
import { storage } from "../../storage";

const SOURCE = "app" as const;
const BOOT_METRIC = "server.boot";
const RESTART_METRIC = "server.unexpected_restart";

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
