// Task #2532 — Unban scheduler. Ogni 5 min riporta a "active" gli utenti il cui
// suspendedUntil è scaduto. Garantisce che i ban temporanei (durationDays>0)
// applicati via AI Co-Pilot non diventino sospensioni a tempo indefinito.
//
// Sfasamento thundering-herd: cron al minuto :01 di ogni slot di 5 min.
// OTA auto-rollback è al :00, critical-reports al :02 → ognuno a 60s di distanza.
import { db } from "../../db";
import { users } from "@shared/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { withDbRetry } from "../../lib/db-retry";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { Cron } from "croner";
import { withJobGate } from "../coordinator/gated-job";

let cron: Cron | null = null;

export async function runUnbanScan(): Promise<{ unbanned: number }> {
  const now = new Date();
  const result = await withBgDbSlot(() => withDbRetry("[ai-unban]", () =>
    db.update(users)
      .set({ status: "active", suspendedUntil: null })
      .where(and(
        eq(users.status, "suspended"),
        isNotNull(users.suspendedUntil),
        lte(users.suspendedUntil, now),
      ))
      .returning({ id: users.id }),
  ));
  if (result.length > 0) {
    console.log(`[ai-unban] auto-unban ${result.length} utenti scaduti`);
  }
  return { unbanned: result.length };
}

export function startUnbanScheduler(): void {
  if (cron) return;
  // Task #9 — subsystem moderation, gate unico Quebracho.
  const gatedUnban = withJobGate("moderation-unban", runUnbanScan);
  // Cron al minuto :01 di ogni slot di 5 min → :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56
  // Garantisce dephasing stabile in steady-state (non solo al boot).
  cron = new Cron("1-59/5 * * * *", { timezone: "Europe/Rome" }, () => {
    gatedUnban().catch((err) => console.warn("[ai-unban] scan error:", err));
  });
  cron.trigger(); // primo run immediato al boot
  console.log("[ai-unban] scheduler started (cron slot :01, ogni 5 min)");
}

export function stopUnbanScheduler(): void {
  if (cron) { cron.stop(); cron = null; }
}
