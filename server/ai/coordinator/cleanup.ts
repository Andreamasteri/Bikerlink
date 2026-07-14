// Task #2649 — Retention notturna per ai_events / ai_decisions / ai_conflicts.
// Retention configurabile via env `AI_AUDIT_RETENTION_DAYS` (default 30).
// Tutti e tre i tipi seguono la stessa finestra (nessun floor separato).
import { Cron } from "croner";
import { withJobGate } from "./gated-job";
import { lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiConflicts, aiDecisions, aiEvents } from "@shared/db";

const TZ = "Europe/Rome";
let cron: Cron | null = null;
let lastRunAt: string | null = null;
let lastError: { at: string; message: string } | null = null;
let lastDeleted: { events: number; decisions: number; conflicts: number } | null = null;

function getRetentionDays(): number {
  const raw = process.env.AI_AUDIT_RETENTION_DAYS;
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n < 7) return 30;
  return Math.min(3650, n);
}

export async function runCoordinatorCleanup(): Promise<{ events: number; decisions: number; conflicts: number }> {
  const retainDays = getRetentionDays();
  const cutoffEvents = new Date(Date.now() - retainDays * 86_400_000);
  const cutoffConflicts = new Date(Date.now() - retainDays * 86_400_000);

  const evDel = await db.delete(aiEvents).where(lt(aiEvents.createdAt, cutoffEvents))
    .returning({ id: aiEvents.id });
  const dcDel = await db.delete(aiDecisions).where(lt(aiDecisions.createdAt, cutoffEvents))
    .returning({ id: aiDecisions.id });
  const cfDel = await db.delete(aiConflicts).where(lt(aiConflicts.createdAt, cutoffConflicts))
    .returning({ id: aiConflicts.id });

  const summary = { events: evDel.length, decisions: dcDel.length, conflicts: cfDel.length };
  lastDeleted = summary;
  lastRunAt = new Date().toISOString();
  return summary;
}

export function startCoordinatorCleanupScheduler(): void {
  if (cron) return;
  cron = new Cron("30 4 * * *", { timezone: TZ, protect: true }, withJobGate("coordinator-cleanup", async () => {
    try {
      const s = await runCoordinatorCleanup();
      console.log(`[ai-coordinator/cleanup] retention OK: events=${s.events} decisions=${s.decisions} conflicts=${s.conflicts}`);
    } catch (err) {
      lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
      console.warn("[ai-coordinator/cleanup] retention error:", err);
    }
  }));
  console.log("[ai-coordinator/cleanup] scheduler avviato (04:30 Europe/Rome)");
}

export function stopCoordinatorCleanupScheduler(): void {
  cron?.stop();
  cron = null;
}

export function getCleanupStatus() {
  return {
    running: !!cron,
    nextRun: cron?.nextRun()?.toISOString() ?? null,
    lastRunAt,
    lastError,
    lastDeleted,
    retentionDays: getRetentionDays(),
  };
}

// keep sql referenced (unused-helper safeguard).
void sql;
