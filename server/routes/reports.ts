/**
 * Task #2530 — endpoint `POST /api/reports` esteso con categoria/contesto.
 * Mantiene backward compat con i client legacy (campo `reason` solo).
 */
import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { reportRateLimiter, getTrustedClientIp } from "../lib/abuse-rate-limit";
import { reportsRateLimiter } from "../lib/rate-limiters";
import { requireUserId } from "../lib/auth-middleware";
import { userReportSchema } from "@shared/validators";
import { categoryToSeverity, type ReportCategory, type ReportContext } from "@shared/db";
import { computeTrustScore, evaluateAutoActions, hookFeedbackLoop } from "../services/reportingService";
import { sendModeratorReportPush } from "../push-notifications";
import { enqueueTriage } from "../ai/moderation/queue";

const ADMIN_EMAIL = "bikerlinkapp@gmail.com";

function buildReportEmailHtml(
  reporterNickname: string,
  reportedNickname: string,
  reason: string,
  description?: string,
  category?: string,
  severity?: string,
): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #e74c3c; margin: 0; font-size: 28px;">&#x26A0;&#xFE0F; BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">Segnalazione utente${severity ? ` — ${severity}` : ""}</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <div style="display: inline-block; background: #e74c3c; border-radius: 6px; padding: 4px 12px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 13px; font-weight: bold;">${category ?? "Segnalazione"}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr><td style="color: #888; padding: 6px 0; font-size: 13px;">Segnalante:</td><td style="color: #fff; padding: 6px 0; font-size: 14px; font-weight: bold;">${reporterNickname}</td></tr>
          <tr><td style="color: #888; padding: 6px 0; font-size: 13px;">Segnalato:</td><td style="color: #e74c3c; padding: 6px 0; font-size: 14px; font-weight: bold;">${reportedNickname}</td></tr>
          <tr><td style="color: #888; padding: 6px 0; font-size: 13px;">Motivo:</td><td style="color: #FF6B35; padding: 6px 0; font-size: 14px;">${reason}</td></tr>
        </table>
        ${description ? `<div style="background: #16162a; border-radius: 8px; padding: 16px;"><p style="color: #aaa; font-size: 12px; margin: 0 0 6px 0;">Descrizione:</p><p style="color: #ccc; line-height: 1.6; margin: 0; white-space: pre-wrap;">${description}</p></div>` : ""}
      </div>
      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">&copy; ${new Date().getFullYear()} BikerLink &mdash; Notifica automatica</p>
    </div>
  `;
}

const router = Router();

const createReportSchema = userReportSchema.extend({});

router.post("/", reportsRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const ip = getTrustedClientIp(req) ?? "";
    if (reportRateLimiter.isOverLimit(userId, ip)) {
      return sendError(res, 429, "Hai inviato troppe segnalazioni. Riprova tra un'ora.");
    }

    // Schema accetta sia il payload nuovo (con category/context) sia quello
    // legacy (solo reason). `reportedUserId` è ancora obbligatorio.
    const reportedUserId = String(req.body?.reportedUserId ?? "").trim();
    if (!reportedUserId) return sendError(res, 400, "ID utente segnalato obbligatorio");
    if (reportedUserId === userId) return sendError(res, 400, "Non puoi segnalare te stesso");

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { reason, description, category, context, contextId } = parsed.data;

    const reportedUser = await storage.getUser(reportedUserId);
    if (!reportedUser) return sendError(res, 404, "Utente segnalato non trovato");

    const cat: ReportCategory | undefined = category;
    const ctx: ReportContext | undefined = context;
    const severity = cat ? categoryToSeverity(cat) : "low";
    const trustScore = await computeTrustScore(userId);

    const affectedFeedbackLoop = cat
      ? await hookFeedbackLoop({
          reporterId: userId,
          reportedUserId,
          category: cat,
          context: ctx ?? "other",
          contextId: contextId ?? null,
        })
      : false;

    const report = await storage.createReport({
      reporterId: userId,
      reportedUserId,
      reason,
      description: description ?? null,
      category: cat ?? null,
      context: ctx ?? null,
      contextId: contextId ?? null,
      reportedUserRole: reportedUser.userType,
      severity,
      affectedFeedbackLoop,
      reporterTrustScore: trustScore,
    });

    // Valutazione automatica + push moderatori (non-fatal).
    evaluateAutoActions(reportedUserId)
      .then(async (out) => {
        if (out.notified || severity === "high" || severity === "critical") {
          await sendModeratorReportPush({
            reportedNickname: reportedUser.nickname ?? "Utente",
            category: cat ?? reason,
            severity,
            reportedUserId,
            reportId: report.id,
          });
        }
        if (out.shadowBanned) {
          await storage.createModeratorLog({
            moderatorId: userId, // attribuito al trigger reporter, action = system
            action: "auto_shadow_ban_triggered",
            targetType: "user",
            targetId: reportedUserId,
            details: `report=${report.id} weighted=${out.weightedCount.toFixed(2)} threshold=${out.thresholds.shadowBan}`,
          }).catch(() => {});
        }
      })
      .catch((err) => console.warn("[Reports] evaluateAutoActions failed:", err));

    // Task #2532 — enqueue triage AI (best-effort, non-fatal).
    try { enqueueTriage(report.id); } catch (err) { console.warn("[ai-triage] enqueue error:", err); }

    // Email amministrativa (best-effort)
    try {
      const reporter = await storage.getUser(userId);
      const html = buildReportEmailHtml(
        reporter?.nickname ?? "Utente",
        reportedUser.nickname ?? "Utente",
        reason,
        description ?? undefined,
        cat,
        severity,
      );
      sendEmail(ADMIN_EMAIL, `[BikerLink] Segnalazione (${severity}): ${reportedUser.nickname}`, html)
        .catch((err) => console.error("[EMAIL] Errore invio notifica segnalazione:", err));
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica segnalazione:", emailErr);
    }

    return res.status(201).json({ ...report, _affectedFeedbackLoop: affectedFeedbackLoop });
  } catch (error) {
    console.error("Create report error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return sendError(res, 403, "Accesso non autorizzato");
    }
    const status = req.query.status as string | undefined;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Get reports error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
