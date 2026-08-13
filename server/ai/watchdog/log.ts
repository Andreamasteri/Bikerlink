// Task #2533 — Wrapper per scrivere su ai_watchdog_log.
import { EventEmitter } from "events";
import { db, withDbRetry } from "../../db";
import { aiWatchdogEventState, aiWatchdogLog } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "../../lib/dedup-logger";
import { buildWatchdogEventKey } from "./event-key";

export interface WatchdogLogEntry {
  /** Stable identity override; summary/details are never part of the identity. */
  eventKey?: string | null;
  // Task #5318 — "coordinator" audita le direttive Horus/admin sul matching
  // coordinator (pause/resume/force_cycle, fallback transitions) — unificato
  // in questa stessa tabella invece di una nuova, riusando retention+admin UI.
  kind: "auto_fix" | "proposal" | "alert" | "chat" | "report" | "signal" | "coordinator";
  scope?: string | null;
  status?: "ok" | "warn" | "error" | "pending" | "accepted" | "rejected";
  summary?: string | null;
  details?: unknown;
  costUsd?: number;
}

// In-process event emitter — subscribers receive immediate notification on
// each new watchdog log entry without polling the DB.
// Event: 'new-entry' — fired after a successful DB insert.
export const watchdogLogEmitter = new EventEmitter();
watchdogLogEmitter.setMaxListeners(50);

export async function writeWatchdogLog(entry: WatchdogLogEntry): Promise<string | null> {
  try {
    const status = entry.status ?? "ok";
    const eventKey = buildWatchdogEventKey(entry.kind, entry.scope, entry.eventKey);

    const outcome = await withDbRetry(() =>
      db.transaction(async (tx) => {
        // Seed the state row first so concurrent writers have a row to lock.
        await tx
          .insert(aiWatchdogEventState)
          .values({ eventKey, lastStatus: "__never__" })
          .onConflictDoNothing();

        const [state] = await tx
          .select({
            lastStatus: aiWatchdogEventState.lastStatus,
            lastLogId: aiWatchdogEventState.lastLogId,
          })
          .from(aiWatchdogEventState)
          .where(eq(aiWatchdogEventState.eventKey, eventKey))
          .for("update");

        // Same event state: changing counters/details must not create another row.
        if (state?.lastStatus === status) {
          return { inserted: false, id: state.lastLogId };
        }

        const [row] = await tx
          .insert(aiWatchdogLog)
          .values({
            eventKey,
            kind: entry.kind,
            scope: entry.scope ?? null,
            status,
            summary: entry.summary ? entry.summary.slice(0, 4000) : null,
            details: (entry.details ?? null) as object | null,
            costUsd: entry.costUsd ?? 0,
          })
          .returning({ id: aiWatchdogLog.id });

        if (!row?.id) return { inserted: false, id: null };

        await tx
          .update(aiWatchdogEventState)
          .set({ lastStatus: status, lastLogId: row.id, updatedAt: new Date() })
          .where(eq(aiWatchdogEventState.eventKey, eventKey));

        return { inserted: true, id: row.id };
      }),
    );

    if (outcome.inserted) {
      watchdogLogEmitter.emit("new-entry");
    }
    return outcome.id ?? null;
  } catch (err) {
    dedupWarn("watchdog/log", "insert error (non-fatal)", err);
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
