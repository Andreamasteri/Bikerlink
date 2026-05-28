// Task #2637 — Correlate tool: cross-scope pattern detection con confidence.
// Esempio: "negli ultimi 60min ci sono stati molti crash watchdog e contemporaneamente
// un picco di report moderazione → confidence 0.72".
import { tool } from "ai";
import { z } from "zod";
import { desc, gte } from "drizzle-orm";
import { db } from "../../db";
import {
  systemSignals,
  systemHealthSnapshot,
  aiWatchdogLog,
  reports,
  anomalyEvents,
  dbIntegrityViolations,
  integrityViolations,
  otaBootEvents,
} from "@shared/db";

const ScopeEnum = z.enum(["moderation", "watchdog", "ota", "db-integrity", "app-integrity"]);
type CorrScope = z.infer<typeof ScopeEnum>;

type Bucket = { count: number; severitySum: number; samples: unknown[] };

async function bucketFor(scope: CorrScope, sinceDate: Date): Promise<Bucket> {
  const empty: Bucket = { count: 0, severitySum: 0, samples: [] };
  switch (scope) {
    case "moderation": {
      const [rows, anomalies] = await Promise.all([
        db.select({
          id: reports.id, severity: reports.severity, createdAt: reports.createdAt,
        }).from(reports).where(gte(reports.createdAt, sinceDate))
          .orderBy(desc(reports.createdAt)).limit(500),
        db.select().from(anomalyEvents).where(gte(anomalyEvents.createdAt, sinceDate)).limit(50),
      ]);
      const sev = rows.reduce((acc, r) => acc + severityWeight(r.severity), 0);
      return { count: rows.length + anomalies.length, severitySum: sev, samples: anomalies.slice(0, 5) };
    }
    case "watchdog": {
      const [signals, logs, snaps] = await Promise.all([
        db.select().from(systemSignals).where(gte(systemSignals.createdAt, sinceDate))
          .orderBy(desc(systemSignals.createdAt)).limit(500),
        db.select().from(aiWatchdogLog).where(gte(aiWatchdogLog.createdAt, sinceDate))
          .orderBy(desc(aiWatchdogLog.createdAt)).limit(200),
        db.select().from(systemHealthSnapshot).where(gte(systemHealthSnapshot.createdAt, sinceDate))
          .orderBy(desc(systemHealthSnapshot.createdAt)).limit(100),
      ]);
      const sev = signals.reduce((a, s) => a + severityWeight(s.severity), 0)
        + logs.reduce((a, l) => a + (l.status === "error" ? 3 : l.status === "warn" ? 2 : 0), 0)
        + snaps.reduce((a, s) => a + (s.status === "red" ? 4 : s.status === "orange" ? 3 : s.status === "yellow" ? 1 : 0), 0);
      return { count: signals.length + logs.length, severitySum: sev, samples: logs.slice(0, 5) };
    }
    case "ota": {
      const events = await db.select().from(otaBootEvents).where(gte(otaBootEvents.createdAt, sinceDate)).limit(500);
      const errs = events.filter((e) => (e.eventType ?? "").toLowerCase().includes("error"));
      return { count: events.length, severitySum: errs.length * 3, samples: errs.slice(0, 5) };
    }
    case "db-integrity": {
      const rows = await db.select().from(dbIntegrityViolations).where(gte(dbIntegrityViolations.createdAt, sinceDate)).limit(500);
      const sev = rows.reduce((a, v) => a + severityWeight(v.severity), 0);
      return { count: rows.length, severitySum: sev, samples: rows.slice(0, 5) };
    }
    case "app-integrity": {
      const rows = await db.select().from(integrityViolations).where(gte(integrityViolations.createdAt, sinceDate)).limit(500);
      const sev = rows.reduce((a, v) => a + severityWeight(v.severity), 0);
      return { count: rows.length, severitySum: sev, samples: rows.slice(0, 5) };
    }
    default: return empty;
  }
}

function severityWeight(s: string | null | undefined): number {
  switch ((s ?? "").toLowerCase()) {
    case "critical": case "high": return 4;
    case "warn": case "warning": case "medium": return 2;
    case "info": case "low": return 1;
    default: return 1;
  }
}

/** Confidence semplice basata su overlap temporale + densità eventi sotto soglia normale.
 *  Non è statistica rigorosa: è un heuristic per dare un segnale "vale la pena indagare". */
function computeConfidence(a: Bucket, b: Bucket): number {
  if (a.count === 0 || b.count === 0) return 0;
  const overlap = Math.min(a.count, b.count) / Math.max(a.count, b.count);
  const sevDensity = Math.min(1, (a.severitySum + b.severitySum) / (4 * (a.count + b.count) || 1));
  return Math.round((overlap * 0.6 + sevDensity * 0.4) * 100) / 100;
}

export const correlateTool = tool({
  description: "Calcola la correlazione tra due scope nella stessa finestra temporale. Ritorna count per scope, severitySum, e confidence 0-1.",
  inputSchema: z.object({
    scope1: ScopeEnum,
    scope2: ScopeEnum,
    timeWindowMs: z.number().int().min(60_000).max(7 * 24 * 3600_000).default(3600_000),
  }),
  execute: async ({ scope1, scope2, timeWindowMs }) => {
    if (scope1 === scope2) return { error: "scope1 e scope2 devono essere diversi" };
    const sinceDate = new Date(Date.now() - timeWindowMs);
    const [a, b] = await Promise.all([bucketFor(scope1, sinceDate), bucketFor(scope2, sinceDate)]);
    const confidence = computeConfidence(a, b);
    return {
      scope1: { name: scope1, count: a.count, severitySum: a.severitySum, samples: a.samples },
      scope2: { name: scope2, count: b.count, severitySum: b.severitySum, samples: b.samples },
      timeWindowMs,
      confidence,
      interpretation: confidence >= 0.6
        ? `Pattern correlato forte tra ${scope1} e ${scope2}`
        : confidence >= 0.3
          ? `Possibile correlazione tra ${scope1} e ${scope2}`
          : `Nessuna correlazione significativa`,
    };
  },
});

/** Pure helper export (per smoke test). */
export async function correlateScopes(
  scope1: CorrScope, scope2: CorrScope, timeWindowMs: number,
): Promise<{ confidence: number; scope1Count: number; scope2Count: number }> {
  if (scope1 === scope2) throw new Error("scope1 != scope2");
  const sinceDate = new Date(Date.now() - timeWindowMs);
  const [a, b] = await Promise.all([bucketFor(scope1, sinceDate), bucketFor(scope2, sinceDate)]);
  return { confidence: computeConfidence(a, b), scope1Count: a.count, scope2Count: b.count };
}
