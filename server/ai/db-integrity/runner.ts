// Task #2536 — Runner: esegue 1+ check, persiste run + violazioni, applica
// gli autofix safe, restituisce sommario per UI / collector watchdog.
//
// Distributed lock: pg_try_advisory_lock garantisce che, anche con più repliche
// di backend, una sola istanza esegua uno scan alla volta (chiave 0x4242_4242).
// Critical push: violazioni critical→push immediato via watchdog/alerts.
import { db } from "../../db";
import { dbIntegrityRuns, dbIntegrityViolations } from "@shared/db";
import { eq, and, desc, ne, sql } from "drizzle-orm";
import { loadAllChecks } from "./registry";
import { executeCheck, hashViolation } from "./framework";
import { runSafeAutofixes } from "./autofix";
import type { Category, IntegrityCheck, RunSummary, Severity } from "./types";
import { emitDbViolation, emitDbAutofix } from "../coordinator/integrations/db-integrity";

const ADVISORY_LOCK_KEY = 0x4242_4242; // costante: solo lo scan db-integrity la usa.

export interface RunOptions {
  // "boot" = run post-migration al boot (solo check schema-registry). I run con
  // trigger "boot" sono ESCLUSI da getLatestRunSummary/collector così non
  // sovrascrivono il semaforo di salute basato sugli scan completi.
  trigger?: "manual" | "cron" | "weekly" | "watchdog" | "boot";
  includeExpensive?: boolean;
  onlyCheckIds?: string[];
  dryRun?: boolean;
  skipLock?: boolean;            // per UI manual run l'admin può forzare.
}

const SEVERITY_EMPTY: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
const CATEGORY_EMPTY: Record<Category, number> = {
  "orphans": 0, "invalid-states": 0, "jsonb-shapes": 0, "counters": 0,
  "logical-fks": 0, "embeddings": 0, "cross-table": 0, "time": 0, "duplicates": 0,
  "schema-registry": 0,
};

async function tryAdvisoryLock(): Promise<boolean> {
  try {
    const r = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS ok`);
    return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
  } catch (err) {
    console.warn("[db-integrity/runner] advisory lock check failed:", (err as Error).message);
    return false;
  }
}
async function releaseAdvisoryLock(): Promise<void> {
  try { await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`); } catch { /* ignore */ }
}

async function pushCriticalAlerts(violations: Array<{ checkId: string; name: string; count: number }>): Promise<void> {
  if (!violations.length) return;
  try {
    const { dispatchAlerts } = await import("../watchdog/alerts");
    // Costruisce un mini-snapshot critical-only per riusare il path watchdog.
    const snap = {
      status: "red" as const,
      score: 0,
      problems: violations.map((v) => ({
        id: `db-integrity.${v.checkId}`,
        title: `DB integrity: ${v.name} (${v.count})`,
        severity: "critical" as const,
        suggestion: "Apri admin/db-integrity per ispezione e azione.",
      })),
      timestamp: new Date().toISOString(),
    };
    await dispatchAlerts(snap as unknown as Parameters<typeof dispatchAlerts>[0]);
  } catch (err) {
    console.warn("[db-integrity/runner] critical push failed:", (err as Error).message);
  }
}

export async function runIntegrityScan(opts: RunOptions = {}): Promise<RunSummary> {
  const trigger = opts.trigger ?? "manual";
  const expensive = !!opts.includeExpensive;
  const _ctx = { dryRun: !!opts.dryRun };
  const useLock = !opts.skipLock;

  if (useLock) {
    const got = await tryAdvisoryLock();
    if (!got) {
      console.log("[db-integrity/runner] scan saltato — lock già acquisito da altra istanza");
      // Ritorna sommario vuoto coerente con il tipo.
      return {
        id: "skipped-lock", runAt: new Date().toISOString(), durationMs: 0, trigger, expensive,
        checksRun: 0, violationsFound: 0, autoFixed: 0, manualPending: 0,
        bySeverity: { ...SEVERITY_EMPTY }, byCategory: { ...CATEGORY_EMPTY }, health: "green",
      };
    }
  }

  try {
    return await runScanInternal(opts);
  } finally {
    if (useLock) await releaseAdvisoryLock();
  }
}

async function runScanInternal(opts: RunOptions): Promise<RunSummary> {
  const trigger = opts.trigger ?? "manual";
  const expensive = !!opts.includeExpensive;
  const ctx = { dryRun: !!opts.dryRun };
  const all = await loadAllChecks();
  const checks = all.filter((c) => {
    if (opts.onlyCheckIds?.length) return opts.onlyCheckIds.includes(c.id);
    if (c.expensive && !expensive) return false;
    return true;
  });

  const [runRow] = await db.insert(dbIntegrityRuns).values({
    trigger, runAt: new Date(), durationMs: 0, checksRun: 0,
    violationsFound: 0, autoFixed: 0, manualPending: 0, expensive,
  }).returning({ id: dbIntegrityRuns.id, runAt: dbIntegrityRuns.runAt });

  const runId = runRow.id;
  const startedAt = Date.now();
  const bySeverity: Record<Severity, number> = { ...SEVERITY_EMPTY };
  const byCategory: Record<Category, number> = { ...CATEGORY_EMPTY };
  let violationsFound = 0;
  let manualPending = 0;
  const criticals: Array<{ checkId: string; name: string; count: number }> = [];

  const violatingChecks: IntegrityCheck[] = [];
  for (const c of checks) {
    const exec = await executeCheck(c, ctx);
    // Errore di esecuzione check → NON viene mascherato come "ok": emettiamo
    // una violation sintetica severity=high, categoria del check, status=manual_pending.
    // Così un check rotto non può far apparire il sistema verde.
    if (exec.error) {
      violationsFound++;
      manualPending++;
      bySeverity.high = (bySeverity.high ?? 0) + 1;
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      const hashErr = hashViolation(`${c.id}::broken`, { ok: false, count: 1, sample: [{ data: { error: exec.error } }] });
      try {
        await db.insert(dbIntegrityViolations).values({
          runId, checkId: `${c.id}::broken`, checkName: `[CHECK ROTTO] ${c.name}`,
          severity: "high", category: c.category,
          count: 1, sample: [{ data: { error: exec.error } }],
          details: { broken: true, originalCheckId: c.id, error: exec.error },
          hash: hashErr,
          status: "manual_pending",
          autoFixApplied: false,
        });
      } catch (err) {
        console.warn(`[db-integrity/runner] insert broken-check violation failed for ${c.id}:`, (err as Error).message);
      }
      continue;
    }
    if (exec.result.count <= 0) continue;
    violationsFound++;
    bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    violatingChecks.push(c);
    if (c.severity === "critical") criticals.push({ checkId: c.id, name: c.name, count: exec.result.count });
    // Task #2654 — emit al Coordinator (graceful)
    await emitDbViolation({
      runId, checkId: c.id, checkName: c.name, category: c.category,
      count: exec.result.count, severity: c.severity,
    });
    const hash = hashViolation(c.id, exec.result);
    try {
      await db.insert(dbIntegrityViolations).values({
        runId, checkId: c.id, checkName: c.name, severity: c.severity, category: c.category,
        count: exec.result.count, sample: exec.result.sample,
        details: exec.result.details ?? null,
        hash,
        status: c.autofix?.safe ? "open" : "manual_pending",
        autoFixApplied: false,
      });
      if (!c.autofix?.safe) manualPending++;
    } catch (err) {
      console.warn(`[db-integrity/runner] insert violation failed for ${c.id}:`, (err as Error).message);
    }
  }

  // Critical push immediato (best-effort, non blocca lo scan).
  // De-dup (Task #5124): i run "boot" sono SOLO osservazione precoce dello schema
  // (vedi boot-schema-check.ts) e NON sono l'emitter primario degli alert: senza
  // questo gate, un drift critico persistente genererebbe un push duplicato a OGNI
  // avvio, in aggiunta a quello dello scan schedulato (cron/weekly/manual), che
  // resta l'unica sorgente di alerting/health per l'integrità DB.
  if (criticals.length && trigger !== "boot") {
    pushCriticalAlerts(criticals).catch(() => { /* logged inside */ });
  }

  const fixes = await runSafeAutofixes(violatingChecks, ctx);
  let autoFixed = 0;
  for (const [checkId, fix] of fixes.entries()) {
    // Task #2654 — emit autofix (sia applied che rejected)
    await emitDbAutofix({ runId, checkId, applied: !!fix.applied, affected: fix.affected ?? 0, summary: fix.summary ?? "" });
    if (!fix.applied) continue;
    autoFixed++;
    try {
      await db.update(dbIntegrityViolations).set({
        status: "auto_fixed",
        autoFixApplied: true,
        autoFixSummary: `[${fix.affected}] ${fix.summary}`.slice(0, 4000),
        resolvedAt: new Date(),
      }).where(and(eq(dbIntegrityViolations.runId, runId), eq(dbIntegrityViolations.checkId, checkId)));
    } catch (err) {
      console.warn(`[db-integrity/runner] update autofix failed for ${checkId}:`, (err as Error).message);
    }
  }

  const durationMs = Date.now() - startedAt;
  await db.update(dbIntegrityRuns).set({
    durationMs, checksRun: checks.length, violationsFound, autoFixed, manualPending,
  }).where(eq(dbIntegrityRuns.id, runId));

  const health = healthFromSeverity(bySeverity);
  return {
    id: runId, runAt: (runRow.runAt as Date).toISOString(), durationMs, trigger, expensive,
    checksRun: checks.length, violationsFound, autoFixed, manualPending,
    bySeverity, byCategory, health,
  };
}

function healthFromSeverity(s: Record<Severity, number>): "green" | "yellow" | "orange" | "red" {
  if (s.critical > 0) return "red";
  if (s.high > 0) return "orange";
  if (s.medium > 0) return "yellow";
  return "green";
}

export async function getLatestRunSummary(): Promise<RunSummary | null> {
  // Esclude i run "boot" (scan parziale solo-schema) dal concetto di "ultimo run".
  const [row] = await db.select().from(dbIntegrityRuns)
    .where(ne(dbIntegrityRuns.trigger, "boot"))
    .orderBy(desc(dbIntegrityRuns.runAt)).limit(1);
  if (!row) return null;
  const violations = await db
    .select({ severity: dbIntegrityViolations.severity, category: dbIntegrityViolations.category })
    .from(dbIntegrityViolations).where(eq(dbIntegrityViolations.runId, row.id));
  const bySeverity: Record<Severity, number> = { ...SEVERITY_EMPTY };
  const byCategory: Record<Category, number> = { ...CATEGORY_EMPTY };
  for (const v of violations) {
    bySeverity[v.severity as Severity] = (bySeverity[v.severity as Severity] ?? 0) + 1;
    byCategory[v.category as Category] = (byCategory[v.category as Category] ?? 0) + 1;
  }
  return {
    id: row.id,
    runAt: (row.runAt as Date).toISOString(),
    durationMs: row.durationMs, trigger: row.trigger, expensive: row.expensive,
    checksRun: row.checksRun, violationsFound: row.violationsFound,
    autoFixed: row.autoFixed, manualPending: row.manualPending,
    bySeverity, byCategory,
    health: healthFromSeverity(bySeverity),
  };
}

export async function listOpenViolations(limit = 200) {
  const rows = await db.select().from(dbIntegrityViolations)
    .where(sql`status in ('open','manual_pending')`)
    .orderBy(desc(dbIntegrityViolations.severity), desc(dbIntegrityViolations.createdAt))
    .limit(limit);
  return rows;
}
