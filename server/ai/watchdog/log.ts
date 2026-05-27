// Task #2533 — Wrapper per scrivere su ai_watchdog_log.
import { db } from "../../db";
import { aiWatchdogLog } from "@shared/db";
import { eq } from "drizzle-orm";

export interface WatchdogLogEntry {
  kind: "auto_fix" | "proposal" | "alert" | "chat" | "report" | "signal";
  scope?: string | null;
  status?: "ok" | "warn" | "error" | "pending" | "accepted" | "rejected";
  summary?: string | null;
  details?: unknown;
  costUsd?: number;
}

export async function writeWatchdogLog(entry: WatchdogLogEntry): Promise<string | null> {
  try {
    const [row] = await db.insert(aiWatchdogLog).values({
      kind: entry.kind,
      scope: entry.scope ?? null,
      status: entry.status ?? "ok",
      summary: entry.summary ? entry.summary.slice(0, 4000) : null,
      details: (entry.details ?? null) as object | null,
      costUsd: entry.costUsd ?? 0,
    }).returning({ id: aiWatchdogLog.id });
    return row?.id ?? null;
  } catch (err) {
    console.warn("[watchdog/log] insert error (non-fatal):", err);
    return null;
  }
}

export async function markProposalAccepted(id: string, adminId: string): Promise<void> {
  try {
    await db.update(aiWatchdogLog).set({
      status: "accepted",
      acceptedByAdminId: adminId,
      acceptedAt: new Date(),
    }).where(eq(aiWatchdogLog.id, id));
  } catch (err) {
    console.warn("[watchdog/log] accept error:", err);
  }
}

export async function markProposalRejected(id: string, adminId: string, reason?: string): Promise<void> {
  try {
    await db.update(aiWatchdogLog).set({
      status: "rejected",
      rejectedByAdminId: adminId,
      rejectedAt: new Date(),
      rejectReason: reason ? reason.slice(0, 300) : null,
    }).where(eq(aiWatchdogLog.id, id));
  } catch (err) {
    console.warn("[watchdog/log] reject error:", err);
  }
}
