/**
 * Task #2531 — Pannello Admin Report (Hub di Moderazione)
 *
 * Endpoint che alimentano la nuova sezione "Report" dell'admin:
 *   • GET  /reports/hub-summary         dashboard
 *   • GET  /reports/patterns            top reportedUserId per peso
 *   • GET  /reports/active-bans         lista ban attivi
 *   • POST /reports/:id/claim           assegnazione atomica
 *   • POST /reports/:id/unclaim         rilascio
 *   • POST /reports/users/:id/unban     sblocco utente bannato
 *   • GET  /reports/export              export CSV/JSON
 */
import { Router, type Request, type Response } from "express";
import { sendError, sendSuccess } from "../../lib/api-response";
import { storage } from "../../storage";
import { db } from "../../db";
import { reports } from "@shared/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { toCSV } from "../../lib/csv-export";

const router = Router();

// Cache in-memory (60s) per evitare di rieseguire 8 query ad ogni refresh.
type SummaryCache = { at: number; payload: Awaited<ReturnType<typeof storage.getReportsHubSummary>> };
let summaryCache: SummaryCache | null = null;
const SUMMARY_TTL_MS = 60_000;

router.get("/reports/hub-summary", async (req: Request, res: Response) => {
  try {
    const force = String(req.query.force ?? "") === "1";
    if (!force && summaryCache && Date.now() - summaryCache.at < SUMMARY_TTL_MS) {
      return res.json({ ...summaryCache.payload, cached: true });
    }
    const payload = await storage.getReportsHubSummary();
    summaryCache = { at: Date.now(), payload };
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error("[Admin] reports/hub-summary error:", err);
    return sendError(res, 500, "Errore lettura hub");
  }
});

router.get("/reports/patterns", async (req: Request, res: Response) => {
  try {
    const minCount = Math.max(1, parseInt(String(req.query.minCount ?? "2"), 10) || 2);
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100));
    const rows = await storage.getReportsPatterns({ minCount, days, limit });
    return res.json({ patterns: rows, total: rows.length, params: { minCount, days, limit } });
  } catch (err) {
    console.error("[Admin] reports/patterns error:", err);
    return sendError(res, 500, "Errore lettura pattern");
  }
});

router.get("/reports/active-bans", async (_req: Request, res: Response) => {
  try {
    const bans = await storage.getActiveBans();
    return res.json({ bans, total: bans.length });
  } catch (err) {
    console.error("[Admin] reports/active-bans error:", err);
    return sendError(res, 500, "Errore lettura ban attivi");
  }
});

router.post("/reports/:id/claim", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const modId = (req.session?.userId as string | undefined);
    if (!modId) return sendError(res, 401, "Sessione scaduta");
    const claimed = await storage.claimReport(id, modId);
    if (!claimed) return sendError(res, 409, "Report già assegnato ad un altro moderatore");
    storage.createModeratorLog({
      moderatorId: modId,
      action: "report_claimed",
      targetType: "report",
      targetId: id,
      details: `claim by ${modId}`,
    }).catch(() => {});
    summaryCache = null;
    return res.json({ report: claimed });
  } catch (err) {
    console.error("[Admin] reports/claim error:", err);
    return sendError(res, 500, "Errore claim");
  }
});

router.post("/reports/:id/unclaim", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const modId = (req.session?.userId as string | undefined);
    if (!modId) return sendError(res, 401, "Sessione scaduta");
    const released = await storage.unclaimReport(id, modId);
    if (!released) return sendError(res, 409, "Non puoi rilasciare un report non tuo");
    storage.createModeratorLog({
      moderatorId: modId,
      action: "report_unclaimed",
      targetType: "report",
      targetId: id,
      details: `unclaim by ${modId}`,
    }).catch(() => {});
    summaryCache = null;
    return res.json({ report: released });
  } catch (err) {
    console.error("[Admin] reports/unclaim error:", err);
    return sendError(res, 500, "Errore unclaim");
  }
});

router.post("/reports/users/:id/unban", async (req: Request, res: Response) => {
  try {
    const targetId = String(req.params.id);
    const modId = (req.session?.userId as string | undefined) ?? "system";
    const ok = await storage.unbanUser(targetId);
    if (!ok) return sendError(res, 404, "Utente non trovato");
    storage.createModeratorLog({
      moderatorId: modId,
      action: "user_unbanned",
      targetType: "user",
      targetId,
      details: "ban rimosso da pannello admin report",
    }).catch(() => {});
    return sendSuccess(res, { id: targetId });
  } catch (err) {
    console.error("[Admin] reports/unban error:", err);
    return sendError(res, 500, "Errore sblocco utente");
  }
});

router.get("/reports/export", async (req: Request, res: Response) => {
  try {
    const { maskReporterId } = await import("../../services/reportingService");
    const viewerId = req.session?.userId as string | undefined;
    const viewer = viewerId ? await storage.getUser(viewerId) : null;
    const viewerRole = viewer?.role;

    const format = String(req.query.format ?? "csv").toLowerCase();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const conds = [] as Parameters<typeof and>[number][];
    if (from && !Number.isNaN(from.getTime())) conds.push(gte(reports.createdAt, from));
    if (to && !Number.isNaN(to.getTime())) conds.push(lte(reports.createdAt, to));
    if (typeof req.query.status === "string") conds.push(eq(reports.status, req.query.status));
    if (typeof req.query.category === "string") conds.push(eq(reports.category, req.query.category));
    if (typeof req.query.severity === "string") conds.push(eq(reports.severity, req.query.severity));

    const q = db.select().from(reports);
    const rows = await (conds.length ? q.where(and(...conds)) : q).orderBy(desc(reports.createdAt)).limit(10_000);

    const sanitized = rows.map((r) => ({
      id: r.id,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      status: r.status,
      severity: r.severity,
      category: r.category,
      context: r.context,
      reported_user_id: r.reportedUserId,
      reported_user_role: r.reportedUserRole,
      reporter_id: maskReporterId(r.reporterId, viewerRole),
      reporter_trust_score: r.reporterTrustScore,
      reason: r.reason,
      description: r.description,
      affected_feedback_loop: r.affectedFeedbackLoop,
      assigned_moderator_id: r.assignedModeratorId,
      assigned_at: r.assignedAt instanceof Date ? r.assignedAt.toISOString() : r.assignedAt,
      resolved_by: r.resolvedBy,
      resolved_at: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
    }));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="reports-${stamp}.json"`);
      return res.send(JSON.stringify({ rows: sanitized, total: sanitized.length, exportedAt: new Date().toISOString() }, null, 2));
    }
    const csv = toCSV(sanitized as unknown as Record<string, unknown>[]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reports-${stamp}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[Admin] reports/export error:", err);
    return sendError(res, 500, "Errore export");
  }
});

export default router;
