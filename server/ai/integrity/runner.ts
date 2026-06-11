// Task #2537 — Runner: esegue tutti i check (o famiglia singola), persiste run + violazioni.
import { db } from "../../db";
import { integrityRuns, integrityViolations } from "@shared/db";
import { desc, eq, inArray, and, notInArray } from "drizzle-orm";
import type { AppIntegrityCheck, Family, RunSummary, Severity } from "./types";
import { ALL_FAMILIES } from "./types";
import { loadAllChecks, loadFamilyChecks } from "./registry";
import { executeCheck, executeAutofix, hashViolation } from "./framework";
import { emitAppViolation, emitAppAutofix } from "../coordinator/integrations/app-integrity";

const _SEV_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export interface RunOptions {
  trigger?: "manual" | "scheduled" | "expensive" | "precommit";
  family?: Family | "all";
  includeExpensive?: boolean;
  onlyCheckIds?: string[];
  dryRun?: boolean;
  applySafeAutofix?: boolean;
}

export async function runIntegrityScan(opts: RunOptions = {}): Promise<RunSummary> {
  const trigger = opts.trigger ?? "manual";
  const family = opts.family ?? "all";
  const includeExpensive = !!opts.includeExpensive;
  const start = Date.now();
  const projectRoot = process.cwd();

  const all = family === "all" ? loadAllChecks() : loadFamilyChecks(family);
  let checks: AppIntegrityCheck[] = all.filter((c) => includeExpensive || !c.expensive);
  if (opts.onlyCheckIds?.length) {
    const set = new Set(opts.onlyCheckIds);
    checks = checks.filter((c) => set.has(c.id));
  }

  const [runRow] = await db.insert(integrityRuns).values({
    trigger,
    family,
    expensive: includeExpensive,
    checksRun: 0,
    violationsFound: 0,
    autoFixed: 0,
    manualPending: 0,
  }).returning();

  let violationsFound = 0;
  let autoFixed = 0;
  let autoResolved = 0;
  const byFamily: Record<Family, number> = ALL_FAMILIES.reduce((a, f) => { a[f] = 0; return a; }, {} as Record<Family, number>);
  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const currentHashes: string[] = [];
  const scannedCheckIds = checks.map((c) => c.id);

  try {
    for (const check of checks) {
      const { result } = await executeCheck(check, { dryRun: !!opts.dryRun, projectRoot });
      if (result.ok || result.count === 0) continue;
      violationsFound++;
      byFamily[check.family]++;
      bySeverity[check.severity]++;
      const hash = hashViolation(check.id, result);
      currentHashes.push(hash);

      // Tentativo autofix safe se richiesto
      let autoFixSummary: string | null = null; let didFix = false;
      if (opts.applySafeAutofix && check.autofix?.safe) {
        const r = await executeAutofix(check, { dryRun: !!opts.dryRun, projectRoot });
        didFix = !!r.applied; autoFixSummary = r.summary;
        if (didFix) autoFixed++;
        // Task #2654 — emit autofix al Coordinator (graceful)
        await emitAppAutofix({ runId: runRow.id, checkId: check.id, applied: didFix, affected: r.affected ?? 0, summary: r.summary ?? "" }).catch(() => { /* graceful */ });
      }
      // Task #2654 — emit violation al Coordinator (graceful)
      await emitAppViolation({
        runId: runRow.id, checkId: check.id, checkName: check.name,
        family: check.family, count: result.count, severity: check.severity,
      }).catch(() => { /* graceful */ });

      await db.insert(integrityViolations).values({
        runId: runRow.id,
        family: check.family,
        checkId: check.id,
        checkName: check.name,
        severity: check.severity,
        count: result.count,
        sample: result.sample,
        details: result.details ?? null,
        hash,
        status: didFix ? "auto_fixed" : "open",
        autoFixApplied: didFix,
        autoFixSummary,
        resolvedAt: didFix ? new Date() : null,
      });
    }

    // Riconciliazione auto: violazioni "open" precedenti che non sono più riprodotte
    // dai check eseguiti in questo run vengono marcate "auto_resolved".
    autoResolved = await reconcileAutoResolved(runRow.id, scannedCheckIds, currentHashes);
    if (trigger === "scheduled" || trigger === "expensive") {
      console.log(`[app-integrity ${trigger}] reconciliation: ${autoResolved} violation(s) auto-resolved, ${violationsFound} new found, ${autoFixed} auto-fixed`);
    }
  } catch (e) {
    console.error("[app-integrity runner] loop/reconcile error:", (e as Error).message);
  } finally {
    // Aggiorna sempre il run row, anche in caso di crash parziale, per evitare checksRun=0 spuri.
    const manualPending = violationsFound - autoFixed;
    await db.update(integrityRuns).set({
      durationMs: Date.now() - start,
      checksRun: checks.length,
      violationsFound,
      autoFixed,
      autoResolved,
      manualPending,
    }).where(eq(integrityRuns.id, runRow.id)).catch((e2) =>
      console.error("[app-integrity runner] failed to update run row:", (e2 as Error).message),
    );
  }

  const manualPending = violationsFound - autoFixed;
  return buildSummary(runRow.id, checks.length, violationsFound, autoFixed, autoResolved, manualPending, bySeverity, byFamily, start, trigger, family, includeExpensive);
}

async function reconcileAutoResolved(
  currentRunId: string,
  scannedCheckIds: string[],
  currentHashes: string[],
): Promise<number> {
  if (!scannedCheckIds.length) return 0;
  // Seleziona le violazioni "open" dei check coperti da questo run che NON
  // sono presenti tra gli hash correnti (problema scomparso).
  const stale = await db.select({ id: integrityViolations.id }).from(integrityViolations)
    .where(
      currentHashes.length
        ? and(
            eq(integrityViolations.status, "open"),
            inArray(integrityViolations.checkId, scannedCheckIds),
            notInArray(integrityViolations.hash, currentHashes),
          )
        : and(
            eq(integrityViolations.status, "open"),
            inArray(integrityViolations.checkId, scannedCheckIds),
          ),
    );
  if (!stale.length) return 0;
  const ids = stale.map((r) => r.id);
  await db.update(integrityViolations).set({
    status: "auto_resolved",
    autoFixSummary: `Risolto automaticamente: il problema non è più riprodotto dal run ${currentRunId}.`,
    resolvedAt: new Date(),
  }).where(inArray(integrityViolations.id, ids));
  return ids.length;
}

function buildSummary(
  id: string, checksRun: number, violationsFound: number, autoFixed: number, autoResolved: number, manualPending: number,
  bySeverity: Record<Severity, number>, byFamily: Record<Family, number>,
  start: number, trigger: string, family: string, expensive: boolean,
): RunSummary {
  return {
    id, runAt: new Date(start).toISOString(), durationMs: Date.now() - start,
    trigger, expensive, family, checksRun, violationsFound, autoFixed, autoResolved, manualPending,
    byFamily, bySeverity, health: computeHealth(bySeverity, violationsFound),
  };
}

function computeHealth(bySev: Record<Severity, number>, total: number): "green" | "yellow" | "orange" | "red" {
  if (bySev.critical > 0) return "red";
  if (bySev.high > 0) return "orange";
  if (bySev.medium > 0 || total > 10) return "yellow";
  return "green";
}

export async function getLatestRunSummary(): Promise<RunSummary | null> {
  const [row] = await db.select().from(integrityRuns).orderBy(desc(integrityRuns.runAt)).limit(1);
  if (!row) return null;
  const violations = await db.select().from(integrityViolations).where(eq(integrityViolations.runId, row.id));
  const bySev: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byFam: Record<Family, number> = ALL_FAMILIES.reduce((a, f) => { a[f] = 0; return a; }, {} as Record<Family, number>);
  for (const v of violations) {
    bySev[(v.severity as Severity)]++;
    byFam[(v.family as Family)] = (byFam[(v.family as Family)] ?? 0) + 1;
  }
  return {
    id: row.id,
    runAt: (row.runAt as Date).toISOString(),
    durationMs: row.durationMs,
    trigger: row.trigger,
    expensive: row.expensive,
    family: row.family,
    checksRun: row.checksRun,
    violationsFound: row.violationsFound,
    autoFixed: row.autoFixed,
    autoResolved: row.autoResolved ?? 0,
    manualPending: row.manualPending,
    byFamily: byFam, bySeverity: bySev,
    health: computeHealth(bySev, row.violationsFound),
  };
}

export async function listOpenViolations(limit = 200, family?: Family) {
  const rows = await db.select().from(integrityViolations)
    .where(eq(integrityViolations.status, "open"))
    .orderBy(desc(integrityViolations.createdAt))
    .limit(limit);
  const filtered = family ? rows.filter((r) => r.family === family) : rows;
  return filtered.map((r) => ({
    id: r.id, runId: r.runId, family: r.family, checkId: r.checkId, checkName: r.checkName,
    severity: r.severity, count: r.count,
    sample: (r.sample as Array<{ pk?: string; data: Record<string, unknown> }>) ?? [],
    details: r.details as Record<string, unknown> | null,
    status: r.status, autoFixApplied: r.autoFixApplied, autoFixSummary: r.autoFixSummary,
    aiExplain: r.aiExplain as object | null,
    createdAt: r.createdAt, resolvedAt: r.resolvedAt,
    hash: r.hash,
  }));
}

export async function bulkIgnore(ids: string[]) {
  if (!ids.length) return 0;
  const r = await db.update(integrityViolations).set({ status: "ignored", resolvedAt: new Date() })
    .where(inArray(integrityViolations.id, ids));
  return r.rowCount ?? ids.length;
}
