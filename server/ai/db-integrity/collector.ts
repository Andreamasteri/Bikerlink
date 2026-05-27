// Task #2536 — Collector per watchdog (#2533).
// Legge l'ultimo run e contribuisce al traffic light di sistema.
import { db } from "../../db";
import { dbIntegrityRuns, dbIntegrityViolations } from "@shared/db";
import { desc, eq } from "drizzle-orm";
import type { Severity } from "./types";

export interface DbIntegritySnapshot {
  hasRun: boolean;
  lastRunAt?: string;
  health: "green" | "yellow" | "orange" | "red";
  bySeverity: Record<Severity, number>;
  criticalSamples: Array<{ checkId: string; checkName: string; count: number }>;
}

export async function collectDbIntegrity(): Promise<DbIntegritySnapshot> {
  const [run] = await db.select().from(dbIntegrityRuns).orderBy(desc(dbIntegrityRuns.runAt)).limit(1);
  if (!run) return { hasRun: false, health: "green", bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, criticalSamples: [] };
  const vs = await db.select({
    severity: dbIntegrityViolations.severity,
    checkId: dbIntegrityViolations.checkId,
    checkName: dbIntegrityViolations.checkName,
    count: dbIntegrityViolations.count,
    status: dbIntegrityViolations.status,
  }).from(dbIntegrityViolations).where(eq(dbIntegrityViolations.runId, run.id));
  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const v of vs) {
    if (v.status === "resolved" || v.status === "auto_fixed" || v.status === "ignored") continue;
    bySeverity[v.severity as Severity] = (bySeverity[v.severity as Severity] ?? 0) + 1;
  }
  const health =
    bySeverity.critical > 0 ? "red" :
    bySeverity.high > 0 ? "orange" :
    bySeverity.medium > 0 ? "yellow" : "green";
  const criticalSamples = vs
    .filter((v) => v.severity === "critical" && v.status !== "auto_fixed" && v.status !== "resolved")
    .slice(0, 5)
    .map((v) => ({ checkId: v.checkId, checkName: v.checkName, count: v.count }));
  return { hasRun: true, lastRunAt: (run.runAt as Date).toISOString(), health, bySeverity, criticalSamples };
}
