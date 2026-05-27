// Task #2537 — Endpoint admin AI App Integrity (parallelo a db-integrity).
import { Router } from "express";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { integrityRuns, integrityViolations, integrityQuarantine } from "@shared/db";
import { desc, eq, isNull } from "drizzle-orm";
import { runIntegrityScan, getLatestRunSummary, listOpenViolations } from "../../ai/integrity/runner";
import { loadAllChecks } from "../../ai/integrity/registry";
import { runOneAutofix } from "../../ai/integrity/autofix";
import { explainViolation } from "../../ai/integrity/explain";
import { restoreFromQuarantine, purgeQuarantineRow } from "../../ai/integrity/quarantine";
import { getAppIntegrityScheduleInfo } from "../../ai/integrity/scheduler";
import { ALL_FAMILIES, type Family } from "../../ai/integrity/types";

const router = Router();

router.get("/app-integrity/status", async (_req, res) => {
  const [summary, schedule] = await Promise.all([
    getLatestRunSummary(),
    Promise.resolve(getAppIntegrityScheduleInfo()),
  ]);
  const checks = loadAllChecks();
  return res.json({
    summary,
    schedule,
    families: ALL_FAMILIES,
    totalChecks: checks.length,
    checksByFamily: ALL_FAMILIES.map((f) => ({
      family: f,
      count: checks.filter((c) => c.family === f).length,
      checks: checks.filter((c) => c.family === f).map((c) => ({
        id: c.id, name: c.name, severity: c.severity, cost: c.cost,
        expensive: !!c.expensive, hasAutofix: !!c.autofix, autofixSafe: !!c.autofix?.safe,
        description: c.description,
      })),
    })),
  });
});

const runSchema = z.object({
  family: z.enum(["all", ...ALL_FAMILIES] as [string, ...string[]]).optional(),
  checks: z.array(z.string()).optional(),
  includeExpensive: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  applySafeAutofix: z.boolean().optional(),
});

router.post("/app-integrity/run", async (req, res) => {
  const parsed = runSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    const summary = await runIntegrityScan({
      trigger: "manual",
      family: (parsed.data.family as Family | "all") ?? "all",
      onlyCheckIds: parsed.data.checks,
      includeExpensive: parsed.data.includeExpensive,
      dryRun: parsed.data.dryRun,
      applySafeAutofix: parsed.data.applySafeAutofix,
    });
    return res.json({ summary });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.get("/app-integrity/violations", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
  const family = (req.query.family as string | undefined) as Family | undefined;
  const rows = await listOpenViolations(limit, family);
  return res.json({
    violations: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
    })),
  });
});

router.get("/app-integrity/runs", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  const rows = await db.select().from(integrityRuns).orderBy(desc(integrityRuns.runAt)).limit(limit);
  return res.json({ runs: rows.map((r) => ({ ...r, runAt: (r.runAt as Date).toISOString() })) });
});

router.post("/app-integrity/violations/:id/explain", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const [row] = await db.select().from(integrityViolations).where(eq(integrityViolations.id, id));
  if (!row) return sendError(res, 404, "Violazione non trovata");
  const checks = loadAllChecks();
  const check = checks.find((c) => c.id === row.checkId);
  if (!check) return sendError(res, 404, "Check non più registrato");
  const sample = (row.sample as Array<{ pk?: string; data: Record<string, unknown> }>) ?? [];
  const out = await explainViolation({
    check, hash: row.hash, count: row.count, sample,
    details: (row.details as Record<string, unknown> | null) ?? undefined,
  });
  if (!out.ok) return sendError(res, 503, `AI explain non disponibile: ${out.reason}`);
  await db.update(integrityViolations).set({
    aiExplain: { ...out.value, modelUsed: out.modelUsed } as unknown as object,
    aiExplainCostUsd: row.aiExplainCostUsd + out.costUsd,
  }).where(eq(integrityViolations.id, id));
  return res.json({ explain: out.value, costUsd: out.costUsd, cached: out.cached, modelUsed: out.modelUsed });
});

router.post("/app-integrity/violations/:id/apply-fix", async (req, res) => {
  const id = String(req.params.id ?? "");
  const dryRun = req.body?.dryRun === true;
  if (!id) return sendError(res, 400, "id mancante");
  const [row] = await db.select().from(integrityViolations).where(eq(integrityViolations.id, id));
  if (!row) return sendError(res, 404, "Violazione non trovata");
  const checks = loadAllChecks();
  const check = checks.find((c) => c.id === row.checkId);
  if (!check) return sendError(res, 404, "Check non più registrato");
  if (!check.autofix) return sendError(res, 409, "Nessun autofix per questo check");
  const result = await runOneAutofix(check, { dryRun, violationId: id });
  if (result.applied && !dryRun) {
    await db.update(integrityViolations).set({
      status: "auto_fixed",
      autoFixApplied: true,
      autoFixSummary: `[${result.affected}] ${result.summary}`.slice(0, 4000),
      resolvedAt: new Date(),
    }).where(eq(integrityViolations.id, id));
  }
  return res.json({ result, dryRun });
});

router.post("/app-integrity/violations/:id/ignore", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  await db.update(integrityViolations).set({ status: "ignored", resolvedAt: new Date() })
    .where(eq(integrityViolations.id, id));
  return res.json({ id, status: "ignored" });
});

router.get("/app-integrity/quarantine", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
  const rows = await db.select().from(integrityQuarantine)
    .where(isNull(integrityQuarantine.purgedAt))
    .orderBy(desc(integrityQuarantine.createdAt)).limit(limit);
  return res.json({
    rows: rows.map((r) => ({
      ...r,
      createdAt: (r.createdAt as Date).toISOString(),
      ttlExpiresAt: (r.ttlExpiresAt as Date).toISOString(),
      restoredAt: r.restoredAt instanceof Date ? r.restoredAt.toISOString() : r.restoredAt,
    })),
  });
});

router.post("/app-integrity/quarantine/:id/restore", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const out = await restoreFromQuarantine(id);
  if (!out.ok) return sendError(res, 409, out.message);
  return res.json(out);
});

router.post("/app-integrity/quarantine/:id/purge", async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!id) return sendError(res, 400, "id mancante");
  const ok = await purgeQuarantineRow(id);
  if (!ok) return sendError(res, 500, "purge fallito");
  return res.json({ id, purged: true });
});

export default router;
