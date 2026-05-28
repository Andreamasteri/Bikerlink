// Task #2649 — Endpoint REST per il Layer AI Coordinato.
// Auth: requireConsoleRole (admin/moderator/superadmin) per read.
//        requireAdminOrSuper per /policies/reload.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";
import { getCoordinator } from "../../ai/coordinator";
import {
  getPolicyStatus,
  loadPolicies,
} from "../../ai/coordinator/policy-engine";
import {
  queryAudit,
  streamAuditAsCsv,
  streamAuditAsNdjson,
} from "../../ai/coordinator/audit";
import { getCleanupStatus, runCoordinatorCleanup } from "../../ai/coordinator/cleanup";
import { SEVERITIES, type Severity } from "../../ai/coordinator/types";

const router = Router();

async function requireConsoleRole(req: Request, res: Response, next: () => void): Promise<void> {
  const userId = (req.session as { userId?: string })?.userId;
  if (!userId) { sendError(res, 401, "Non autenticato"); return; }
  try {
    const user = await storage.getUser(userId);
    if (!user) { sendError(res, 401, "Sessione non valida"); return; }
    const role = (user.role ?? "").toLowerCase();
    if (role !== "admin" && role !== "moderator" && role !== "superadmin") {
      sendError(res, 403, "Accesso non autorizzato");
      return;
    }
    (req as Request & { coordinatorUser?: typeof user }).coordinatorUser = user;
    next();
  } catch (e) {
    console.error("[ai-coordinator/auth]", e);
    sendError(res, 500, "Errore autenticazione");
  }
}

async function requireAdminOrSuper(req: Request, res: Response, next: () => void): Promise<void> {
  const userId = (req.session as { userId?: string })?.userId;
  if (!userId) { sendError(res, 401, "Non autenticato"); return; }
  try {
    const user = await storage.getUser(userId);
    if (!user) { sendError(res, 401, "Sessione non valida"); return; }
    const role = (user.role ?? "").toLowerCase();
    if (role !== "admin" && role !== "superadmin") {
      sendError(res, 403, "Accesso riservato ad admin/superadmin");
      return;
    }
    next();
  } catch (e) {
    console.error("[ai-coordinator/auth-admin]", e);
    sendError(res, 500, "Errore autenticazione");
  }
}

router.use(requireConsoleRole);

// ── GET /ai/overview ──────────────────────────────────────────────────────
router.get("/ai/overview", async (req: Request, res: Response) => {
  try {
    const sinceHours = Math.min(720, Math.max(1, parseInt(String(req.query.sinceHours ?? "24"), 10) || 24));
    const t0 = Date.now();
    const overview = await getCoordinator().getOverview(sinceHours);
    res.json({ ...overview, queryMs: Date.now() - t0 });
  } catch (err) {
    console.error("[ai-coordinator/overview]", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/health ────────────────────────────────────────────────────────
router.get("/ai/health", async (req: Request, res: Response) => {
  try {
    const sinceHours = Math.min(720, Math.max(1, parseInt(String(req.query.sinceHours ?? "24"), 10) || 24));
    const health = await getCoordinator().getHealth(sinceHours);
    res.json(health);
  } catch (err) {
    console.error("[ai-coordinator/health]", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/audit ─────────────────────────────────────────────────────────
const AuditQuery = z.object({
  ai: z.string().optional(),
  type: z.string().optional(),
  severity: z.enum(SEVERITIES).optional(),
  kind: z.enum(["event", "decision", "all"]).optional(),
  correlationId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  format: z.enum(["json", "csv", "ndjson"]).optional(),
});

router.get("/ai/audit", async (req: Request, res: Response) => {
  const parsed = AuditQuery.safeParse(req.query);
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const q = parsed.data;
  try {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const { rows, limit, offset } = await queryAudit({
      aiName: q.ai,
      type: q.type,
      severity: q.severity as Severity | undefined,
      kind: q.kind,
      correlationId: q.correlationId,
      from: from && !isNaN(from.getTime()) ? from : undefined,
      to: to && !isNaN(to.getTime()) ? to : undefined,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      offset: q.offset ? parseInt(q.offset, 10) : undefined,
    });
    const format = q.format ?? "json";
    if (format === "csv") { streamAuditAsCsv(res, rows); return; }
    if (format === "ndjson") { streamAuditAsNdjson(res, rows); return; }
    res.json({ rows, limit, offset, count: rows.length });
  } catch (err) {
    console.error("[ai-coordinator/audit]", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/policies ──────────────────────────────────────────────────────
router.get("/ai/policies", (_req: Request, res: Response) => {
  res.json(getPolicyStatus());
});

// ── POST /ai/policies/reload (admin/superadmin) ───────────────────────────
router.post("/ai/policies/reload", requireAdminOrSuper, (req: Request, res: Response) => {
  const file = typeof req.body?.file === "string" ? req.body.file : undefined;
  const r = loadPolicies(file);
  if (!r.ok) { sendError(res, 400, r.error ?? "policy reload failed"); return; }
  res.json({ reloaded: true, count: r.count, status: getPolicyStatus() });
});

// ── GET /ai/cleanup-status ────────────────────────────────────────────────
router.get("/ai/cleanup-status", (_req: Request, res: Response) => {
  res.json(getCleanupStatus());
});

// ── POST /ai/cleanup-run (admin/superadmin) ───────────────────────────────
router.post("/ai/cleanup-run", requireAdminOrSuper, async (_req: Request, res: Response) => {
  try {
    const s = await runCoordinatorCleanup();
    res.json({ ok: true, deleted: s });
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

export default router;
