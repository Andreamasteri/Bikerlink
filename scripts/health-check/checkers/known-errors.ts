// Task #4825 — Checker errori noti: TODO/FIXME nel codice + crash recenti dal DB.
import { listSourceFiles, safeRead, offsetToLine, lineSnippet } from "../scan-utils";
import type { CheckResult } from "../types";
import { db } from "../../../server/db";
import { appCrashLogs } from "@shared/db";
import { desc, gte } from "drizzle-orm";

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX|BUG)\b[:\s]/g;

async function scanMarkers(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const f of listSourceFiles()) {
    const text = safeRead(f.abs);
    if (!text) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(MARKER_RE.source, "g");
    let count = 0;
    while ((m = re.exec(text)) !== null && count < 3) {
      const line = offsetToLine(text, m.index);
      out.push({
        checkId: `KE-${m[1]}`,
        category: "known-errors",
        severity: m[1] === "FIXME" || m[1] === "BUG" ? "warning" : "info",
        file: f.rel,
        line,
        description: `Marcatore ${m[1]} nel codice`,
        evidence: lineSnippet(text, line),
      });
      count++;
    }
  }
  return out;
}

async function scanCrashLogs(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        crashType: appCrashLogs.crashType,
        errorMessage: appCrashLogs.errorMessage,
        appVersion: appCrashLogs.appVersion,
        reportedAt: appCrashLogs.reportedAt,
      })
      .from(appCrashLogs)
      .where(gte(appCrashLogs.reportedAt, since))
      .orderBy(desc(appCrashLogs.reportedAt))
      .limit(20);

    // Aggrega per messaggio per non spammare risultati identici.
    const grouped = new Map<string, number>();
    for (const r of rows) {
      const key = (r.errorMessage ?? r.crashType ?? "crash").slice(0, 120);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    for (const [msg, n] of grouped) {
      out.push({
        checkId: "KE-crash",
        category: "known-errors",
        severity: n >= 3 ? "critical" : "warning",
        description: `Crash riportato dai device (${n}× ultimi 7gg)`,
        evidence: msg,
      });
    }
  } catch {
    /* DB non disponibile: ignora, non blocca lo scan statico */
  }
  return out;
}

export async function runKnownErrors(): Promise<CheckResult[]> {
  const [markers, crashes] = await Promise.all([scanMarkers(), scanCrashLogs()]);
  return [...markers, ...crashes];
}
