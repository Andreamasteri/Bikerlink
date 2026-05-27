// Task #2536 — Endpoint admin AI DB Integrity.
import { Router } from "express";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { dbIntegrityRuns, dbIntegrityViolations, dbIntegrityQuarantine } from "@shared/db";
import { desc, eq, isNull } from "drizzle-orm";
import { runIntegrityScan, getLatestRunSummary, listOpenViolations } from "../../ai/db-integrity/runner";
import { loadAllChecks } from "../../ai/db-integrity/registry";
import { runOneAutofix } from "../../ai/db-integrity/autofix";
import { explainViolation } from "../../ai/db-integrity/explain";
import { analyzeSqlSafety } from "../../ai/db-integrity/safety-guard";
import { restoreFromQuarantine, purgeQuarantineRow } from "../../ai/db-integrity/quarantine";
import { getDbIntegrityScheduleInfo } from "../../ai/db-integrity/scheduler";
import { collectDbIntegrity } from "../../ai/db-integrity/collector";
import { hashViolation } from "../../ai/db-integrity/framework";

const router = Router();

router.get("/db-integrity/status", async (_req, res) => {
  const [summary, schedule, snapshot, checks] = await Promise.all([
    getLatestRunSummary(),
    Promise.resolve(getDbIntegrityScheduleInfo()),
    collectDbIntegrity(),
    loadAllChecks(),
  ]);
  return res.json({
    summary,
    schedule,
    snapshot,
    totalChecks: checks.length,
    checks: checks.map((c) => ({
      id: c.id, name: c.name, category: c.category, severity: c.severity,
      cost: c.cost, expensive: !!c.expensive, hasAutofix: !!c.autofix, autofixSafe: !!c.autofix?.safe,
    })),
  });
});

const runSchema = z.object({
  checks: z.array(z.string()).optional(),
  includeExpensive: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

router.post("/db-integrity/run", async (req, res) => {
  const parsed = runSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    const summary = await runIntegrityScan({
      trigger: "manual",
      onlyCheckIds: parsed.data.checks,
      includeExpensive: parsed.data.includeExpensive,
      dryRun: parsed.data.dryRun,
    });
    return res.json({ summary });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.get("/db-integrity/violations", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
  const rows = await listOpenViolations(limit);
  return res.json({
    violations: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
    })),
  });
});

router.get("/db-integrity/runs", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  const rows = await db.select().from(dbIntegrityRuns).orderBy(desc(dbIntegrityRuns.runAt)).limit(limit);
  return res.json({
    runs: rows.map((r) => ({ ...r, runAt: (r.runAt as Date).toISOString() })),
  });
});

router.post("/db-integrity/violations/:id/explain", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const [row] = await db.select().from(dbIntegrityViolations).where(eq(dbIntegrityViolations.id, id));
  if (!row) return sendError(res, 404, "Violazione non trovata");
  const checks = await loadAllChecks();
  const check = checks.find((c) => c.id === row.checkId);
  if (!check) return sendError(res, 404, "Check non più registrato");
  const sample = (row.sample as Array<{ pk?: string; data: Record<string, unknown> }>) ?? [];
  const out = await explainViolation({
    check, hash: row.hash, count: row.count, sample,
    details: (row.details as Record<string, unknown> | null) ?? undefined,
  });
  if (!out.ok) return sendError(res, 503, `AI explain non disponibile: ${out.reason}`);
  let safety: ReturnType<typeof analyzeSqlSafety> | null = null;
  if (out.value.sql) safety = analyzeSqlSafety(out.value.sql);
  await db.update(dbIntegrityViolations).set({
    aiExplain: out.value as unknown as object,
    aiExplainCostUsd: row.aiExplainCostUsd + out.costUsd,
  }).where(eq(dbIntegrityViolations.id, id));
  return res.json({ explain: out.value, costUsd: out.costUsd, cached: out.cached, safety });
});

async function applyAutofixHandler(req: import("express").Request, res: import("express").Response) {
  const id = String(req.params.id ?? "");
  const dryRun = req.body?.dryRun === true;
  if (!id) return sendError(res, 400, "id mancante");
  const [row] = await db.select().from(dbIntegrityViolations).where(eq(dbIntegrityViolations.id, id));
  if (!row) return sendError(res, 404, "Violazione non trovata");
  const checks = await loadAllChecks();
  const check = checks.find((c) => c.id === row.checkId);
  if (!check) return sendError(res, 404, "Check non più registrato");
  if (!check.autofix) return sendError(res, 409, "Nessun autofix dichiarato per questo check");
  const result = await runOneAutofix(check, { dryRun });
  if (result.applied && !dryRun) {
    await db.update(dbIntegrityViolations).set({
      status: "auto_fixed",
      autoFixApplied: true,
      autoFixSummary: `[${result.affected}] ${result.summary}`.slice(0, 4000),
      resolvedAt: new Date(),
    }).where(eq(dbIntegrityViolations.id, id));
  }
  return res.json({ result, dryRun });
}

// Spec: apply-fix; legacy alias apply-autofix.
router.post("/db-integrity/violations/:id/apply-fix", applyAutofixHandler);
router.post("/db-integrity/violations/:id/apply-autofix", applyAutofixHandler);

const sqlSchema = z.object({ sql: z.string().min(1).max(8000), dryRun: z.boolean().optional() });

router.post("/db-integrity/violations/:id/apply-sql", async (req, res) => {
  const id = String(req.params.id ?? "");
  const parsed = sqlSchema.safeParse(req.body ?? {});
  if (!id) return sendError(res, 400, "id mancante");
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const [row] = await db.select().from(dbIntegrityViolations).where(eq(dbIntegrityViolations.id, id));
  if (!row) return sendError(res, 404, "Violazione non trovata");
  const safety = analyzeSqlSafety(parsed.data.sql);
  if (!safety.safe) return sendError(res, 400, `SQL bloccato: ${safety.reasons.join("; ")}`);
  if (parsed.data.dryRun) return res.json({ safety, dryRun: true, executed: false });
  // Solo statement mutanti (UPDATE/DELETE/INSERT) possono risolvere la violation.
  // SELECT/CTE letti vengono eseguiti ma NON marcano resolved per evitare di
  // chiudere violazioni senza modifiche reali (audit-trust).
  const isMutating = /^\s*(update|delete|insert)\b/i.test(parsed.data.sql);
  try {
    const result = await db.execute(parsed.data.sql);
    const affected = result.rowCount ?? 0;
    if (isMutating && affected > 0) {
      await db.update(dbIntegrityViolations).set({
        status: "resolved",
        autoFixSummary: `manual SQL applicato (${affected} righe)`,
        resolvedAt: new Date(),
      }).where(eq(dbIntegrityViolations.id, id));
      return res.json({ safety, executed: true, rowCount: affected, resolved: true });
    }
    return res.json({
      safety, executed: true, rowCount: affected, resolved: false,
      note: isMutating ? "0 righe modificate — violation NON risolta" : "statement non mutante — violation NON risolta",
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.post("/db-integrity/violations/:id/ignore", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  await db.update(dbIntegrityViolations).set({
    status: "ignored", resolvedAt: new Date(),
  }).where(eq(dbIntegrityViolations.id, id));
  return res.json({ id, status: "ignored" });
});

router.get("/db-integrity/quarantine", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
  const rows = await db.select().from(dbIntegrityQuarantine)
    .where(isNull(dbIntegrityQuarantine.purgedAt))
    .orderBy(desc(dbIntegrityQuarantine.createdAt)).limit(limit);
  return res.json({
    rows: rows.map((r) => ({
      ...r,
      createdAt: (r.createdAt as Date).toISOString(),
      ttlExpiresAt: (r.ttlExpiresAt as Date).toISOString(),
      restoredAt: r.restoredAt instanceof Date ? r.restoredAt.toISOString() : r.restoredAt,
    })),
  });
});

router.post("/db-integrity/quarantine/:id/restore", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const out = await restoreFromQuarantine(id);
  if (!out.ok) return sendError(res, 409, out.message);
  return res.json(out);
});

router.post("/db-integrity/quarantine/:id/purge", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const ok = await purgeQuarantineRow(id);
  if (!ok) return sendError(res, 500, "purge fallito");
  return res.json({ id, purged: true });
});

router.post("/db-integrity/check-sql-safety", async (req, res) => {
  const parsed = z.object({ sql: z.string().min(1).max(8000) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  return res.json({ safety: analyzeSqlSafety(parsed.data.sql) });
});

// Stub utile per i test smoke: ricalcola hash dato un sample (vedi step 25).
router.post("/db-integrity/hash-preview", async (req, res) => {
  const parsed = z.object({
    checkId: z.string(),
    count: z.number(),
    sample: z.array(z.object({ pk: z.string().optional(), data: z.record(z.string(), z.unknown()) })),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  return res.json({ hash: hashViolation(parsed.data.checkId, { ok: false, count: parsed.data.count, sample: parsed.data.sample }) });
});

export default router;
