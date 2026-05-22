import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { reportRateLimiter, getTrustedClientIp } from "../lib/abuse-rate-limit";

const ADMIN_EMAIL = "bikerlinkapp@gmail.com";

function buildReportEmailHtml(
  reporterNickname: string,
  reportedNickname: string,
  reason: string,
  description?: string,
): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #e74c3c; margin: 0; font-size: 28px;">&#x26A0;&#xFE0F; BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">Segnalazione utente</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <div style="display: inline-block; background: #e74c3c; border-radius: 6px; padding: 4px 12px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 13px; font-weight: bold;">Segnalazione</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Segnalante:</td>
            <td style="color: #fff; padding: 6px 0; font-size: 14px; font-weight: bold;">${reporterNickname}</td>
          </tr>
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Segnalato:</td>
            <td style="color: #e74c3c; padding: 6px 0; font-size: 14px; font-weight: bold;">${reportedNickname}</td>
          </tr>
          <tr>
            <td style="color: #888; padding: 6px 0; font-size: 13px; vertical-align: top;">Motivo:</td>
            <td style="color: #FF6B35; padding: 6px 0; font-size: 14px;">${reason}</td>
          </tr>
        </table>
        ${description ? `
        <div style="background: #16162a; border-radius: 8px; padding: 16px;">
          <p style="color: #aaa; font-size: 12px; margin: 0 0 6px 0;">Descrizione:</p>
          <p style="color: #ccc; line-height: 1.6; margin: 0; white-space: pre-wrap;">${description}</p>
        </div>
        ` : ""}
      </div>
      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        &copy; ${new Date().getFullYear()} BikerLink &mdash; Notifica automatica
      </p>
    </div>
  `;
}

import { requireUserId } from "../lib/auth-middleware";

const router = Router();

// Task #1125: rate-limit state lives in server/lib/abuse-rate-limit.ts so
// the legacy /api/users/:id/report endpoint shares the SAME counters as
// this newer endpoint. Without that shared state an attacker could file
// 10 reports here, then 10 more on the legacy route, doubling the limit.
const DESCRIPTION_MAX_LEN = 2000;

const createReportSchema = z.object({
  reportedUserId: z.string().min(1, "ID utente segnalato obbligatorio"),
  reason: z.string().min(1, "Motivo obbligatorio").max(100),
  description: z.string().max(DESCRIPTION_MAX_LEN, `La descrizione non può superare ${DESCRIPTION_MAX_LEN} caratteri`).optional(),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    // Task #1126: derive the rate-limit IP via the centralized helper so all
    // public telemetry endpoints share the same trust-proxy contract.
    const ip = getTrustedClientIp(req) ?? "";
    if (reportRateLimiter.isOverLimit(userId, ip)) {
      return sendError(res, 429, "Hai inviato troppe segnalazioni. Riprova tra un'ora.");
    }

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }

    const { reportedUserId, reason, description } = parsed.data;

    if (reportedUserId === userId) {
      return sendError(res, 400, "Non puoi segnalare te stesso");
    }

    const reportedUser = await storage.getUser(reportedUserId);
    if (!reportedUser) {
      return sendError(res, 404, "Utente segnalato non trovato");
    }

    const report = await storage.createReport({
      reporterId: userId,
      reportedUserId,
      reason,
      description,
    });

    try {
      const reporter = await storage.getUser(userId);
      const reporterNickname = reporter?.nickname || "Utente sconosciuto";
      const reportedNickname = reportedUser.nickname || "Utente sconosciuto";
      const emailSubject = `[BikerLink] Segnalazione: ${reporterNickname} → ${reportedNickname}`;
      const html = buildReportEmailHtml(reporterNickname, reportedNickname, reason, description);
      sendEmail(ADMIN_EMAIL, emailSubject, html).catch((err) =>
        console.error("[EMAIL] Errore invio notifica segnalazione:", err)
      );
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica segnalazione:", emailErr);
    }

    return res.status(201).json(report);
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
