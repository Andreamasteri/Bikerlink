// Task #2657 — Endpoint governance Layer AI: pause/resume/override/policies-save.
// Auth policy:
//   • READ (GET /ai/paused, /ai/conflicts, /ai/policies/yaml): admin |
//     moderator | superadmin — coerente con `requireConsoleRole` di
//     ai-coordinator.ts (i moderator devono vedere il tab "AI Layer").
//   • WRITE (POST /ai/pause, /ai/resume, /ai/conflicts/:id/override,
//     PUT /ai/policies, POST /ai/policies/validate): admin | superadmin —
//     kill switch e override hanno impatto operativo.
// Companion file di `ai-coordinator.ts` per non superare 600 righe.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../../db";
import { aiConflicts } from "@shared/db";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";
import {
  getCoordinator,
  pauseAi,
  resumeAi,
  listPaused,
} from "../../ai/coordinator";
import { PolicyFileSchema } from "../../ai/coordinator/types";
import { loadPolicies, getPolicyStatus } from "../../ai/coordinator/policy-engine";

const router = Router();
const KNOWN_AIS = new Set([
  "moderation", "watchdog", "ota-orchestrator",
  "db-integrity", "app-integrity", "console", "*", "admin",
]);

function makeRoleGuard(allowed: ReadonlyArray<string>, label: string) {
  return async function guard(req: Request, res: Response, next: () => void): Promise<void> {
    const userId = (req.session as { userId?: string })?.userId;
    if (!userId) { sendError(res, 401, "Non autenticato"); return; }
    try {
      const user = await storage.getUser(userId);
      if (!user) { sendError(res, 401, "Sessione non valida"); return; }
      const role = (user.role ?? "").toLowerCase();
      if (!allowed.includes(role)) {
        sendError(res, 403, `Riservato ${label}`);
        return;
      }
      (req as Request & { adminUserId?: string }).adminUserId = userId;
      next();
    } catch (e) {
      console.error("[ai-layer/auth]", e);
      sendError(res, 500, "Errore autenticazione");
    }
  };
}
const requireConsoleRead = makeRoleGuard(["admin", "moderator", "superadmin"], "admin/moderator/superadmin");
const requireAdminWrite = makeRoleGuard(["admin", "superadmin"], "admin/superadmin");

// ── GET /ai/paused — elenco AI in pausa con TTL ───────────────────────────
router.get("/ai/paused", requireConsoleRead, async (_req: Request, res: Response) => {
  try { res.json({ paused: await listPaused() }); }
  catch (err) { sendError(res, 500, (err as Error).message); }
});

// ── POST /ai/pause ────────────────────────────────────────────────────────
const PauseBody = z.object({
  aiName: z.string().min(1).max(80),
  reason: z.string().min(3).max(400),
  ttlSeconds: z.number().int().min(10).max(86400).optional(),
});
router.post("/ai/pause", requireAdminWrite, async (req: Request, res: Response) => {
  const parsed = PauseBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const { aiName, reason, ttlSeconds } = parsed.data;
  if (!KNOWN_AIS.has(aiName)) { sendError(res, 400, `aiName non riconosciuta: ${aiName}`); return; }
  const adminId = (req as Request & { adminUserId?: string }).adminUserId!;
  try {
    await pauseAi(aiName, ttlSeconds ?? 3600, reason);
    // Audit via coordinator.emit() per propagazione WS real-time agli admin.
    await getCoordinator().emit({
      aiName: "admin", eventType: "pause",
      payload: { target: aiName, scope: aiName === "*" ? "layer" : "ai",
        reason, ttlSeconds: ttlSeconds ?? 3600, adminId },
      severity: "warn", correlationId: `pause-${aiName}`,
    });
    res.json({ paused: true, aiName, ttlSeconds: ttlSeconds ?? 3600 });
  } catch (err) { sendError(res, 500, (err as Error).message); }
});

// ── POST /ai/resume ───────────────────────────────────────────────────────
const ResumeBody = z.object({ aiName: z.string().min(1).max(80) });
router.post("/ai/resume", requireAdminWrite, async (req: Request, res: Response) => {
  const parsed = ResumeBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const { aiName } = parsed.data;
  if (!KNOWN_AIS.has(aiName)) { sendError(res, 400, `aiName non riconosciuta: ${aiName}`); return; }
  const adminId = (req as Request & { adminUserId?: string }).adminUserId!;
  try {
    await resumeAi(aiName);
    await getCoordinator().emit({
      aiName: "admin", eventType: "resume",
      payload: { target: aiName, scope: aiName === "*" ? "layer" : "ai", adminId },
      severity: "warn", correlationId: `resume-${aiName}`,
    });
    res.json({ resumed: true, aiName });
  } catch (err) { sendError(res, 500, (err as Error).message); }
});

// ── GET /ai/conflicts — lista conflitti aperti ────────────────────────────
router.get("/ai/conflicts", requireConsoleRead, async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100));
  const onlyOpen = req.query.open !== "0";
  try {
    const rows = await db.select().from(aiConflicts)
      .where(onlyOpen ? isNull(aiConflicts.resolvedAt) : undefined)
      .orderBy(desc(aiConflicts.createdAt))
      .limit(limit);
    res.json({ conflicts: rows, count: rows.length });
  } catch (err) { sendError(res, 500, (err as Error).message); }
});

// ── POST /ai/conflicts/:id/override ───────────────────────────────────────
const OverrideBody = z.object({
  decision: z.enum(["useEventA", "useEventB", "custom"]),
  rationale: z.string().min(5).max(2000),
});
router.post("/ai/conflicts/:id/override", requireAdminWrite, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const parsed = OverrideBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const adminId = (req as Request & { adminUserId?: string }).adminUserId!;
  try {
    const [conflict] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, id)).limit(1);
    if (!conflict) { sendError(res, 404, "Conflitto non trovato"); return; }
    const c = getCoordinator();
    const decisionId = await c.recordDecision({
      aiName: "admin",
      decisionType: "conflict_override",
      input: { conflictId: id, eventIdA: conflict.eventIdA, eventIdB: conflict.eventIdB, conflictType: conflict.conflictType },
      output: { decision: parsed.data.decision },
      rationale: parsed.data.rationale,
      tookMs: 0,
      correlationId: `override-${id.slice(0, 12)}`,
    });
    await db.update(aiConflicts).set({
      resolvedBy: "admin",
      resolutionRationale: `[admin:${adminId}] ${parsed.data.decision} — ${parsed.data.rationale}`,
      resolvedAt: new Date(),
    }).where(eq(aiConflicts.id, id));
    await c.emit({
      aiName: "admin", eventType: "override",
      payload: { conflictId: id, decision: parsed.data.decision, adminId, decisionId },
      severity: "warn", correlationId: `override-${id.slice(0, 12)}`,
    });
    res.json({ overridden: true, conflictId: id, decisionId });
  } catch (err) {
    console.error("[ai-layer/override]", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/policies/yaml — restituisce sorgente YAML + status ────────────
router.get("/ai/policies/yaml", requireConsoleRead, (_req: Request, res: Response) => {
  try {
    const file = path.resolve(process.cwd(), "config/ai-policies.yaml");
    const yamlText = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    res.json({ yaml: yamlText, status: getPolicyStatus() });
  } catch (err) { sendError(res, 500, (err as Error).message); }
});

// ── PUT /ai/policies — salva YAML + reload ────────────────────────────────
const PoliciesBody = z.object({ yaml: z.string().min(2).max(200_000) });
router.put("/ai/policies", requireAdminWrite, async (req: Request, res: Response) => {
  const parsed = PoliciesBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const adminId = (req as Request & { adminUserId?: string }).adminUserId!;
  try {
    const obj = yaml.load(parsed.data.yaml);
    PolicyFileSchema.parse(obj ?? {});
  } catch (err) {
    sendError(res, 400, `YAML non valido: ${(err as Error).message}`); return;
  }
  try {
    const file = path.resolve(process.cwd(), "config/ai-policies.yaml");
    const backup = `${file}.bak-${Date.now()}`;
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    fs.writeFileSync(file, parsed.data.yaml, "utf8");
    const r = loadPolicies(file);
    if (!r.ok) { sendError(res, 400, r.error ?? "reload failed"); return; }
    await getCoordinator().emit({
      aiName: "admin", eventType: "policies_saved",
      payload: { adminId, rulesCount: r.count, backup: path.basename(backup) },
      severity: "warn", correlationId: `policies-${Date.now().toString(36)}`,
    });
    res.json({ saved: true, count: r.count, status: getPolicyStatus() });
  } catch (err) {
    console.error("[ai-layer/policies-save]", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /ai/policies/validate — solo validazione, senza scrittura ────────
router.post("/ai/policies/validate", requireAdminWrite, (req: Request, res: Response) => {
  const parsed = PoliciesBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  try {
    const obj = yaml.load(parsed.data.yaml);
    const file_ = PolicyFileSchema.parse(obj ?? {});
    res.json({ valid: true, version: file_.version, rulesCount: file_.rules.length });
  } catch (err) {
    res.json({ valid: false, error: (err as Error).message });
  }
});

// Suppress unused-helper warning for `and` (kept for future filter expansions).
void and;

export default router;
