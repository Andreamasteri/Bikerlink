import { sendError } from "../lib/api-response";
import express, { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { feedbackRateLimiter, getTrustedClientIp } from "../lib/abuse-rate-limit";
import { createFeedbackSchema, updateFeedbackTicketSchema } from "@shared/validators";

const ADMIN_EMAIL = "bikerlinkapp@gmail.com";

// Task #1125: per-route caps. The global parser bypass in server/index.ts
// excludes POST /api/feedback so this limit actually applies. 16 KB is
// roughly 10x the natural ticket size while still being trivially cheap
// to parse on every spammed request.
const FEEDBACK_BODY_LIMIT = "16kb";
const _FEEDBACK_SUBJECT_MAX_LEN = 200;
const _FEEDBACK_MESSAGE_MAX_LEN = 4000;
const _ALLOWED_TICKET_TYPES = new Set(["bug", "suggestion", "feature", "feedback", "other"]);
const feedbackJson = express.json({ limit: FEEDBACK_BODY_LIMIT });

const TICKET_TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  suggestion: "Suggerimento",
  feature: "Richiesta Funzione",
  feedback: "Feedback",
  other: "Altro",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDeviceInfo(deviceInfo?: { model?: string | null; platform?: string | null; osVersion?: string | null; appVersion?: string | null } | null): string {
  if (!deviceInfo) return "—";
  const parts: string[] = [];
  if (deviceInfo.model) parts.push(deviceInfo.model);
  const osPart = [deviceInfo.platform, deviceInfo.osVersion].filter(Boolean).join(" ");
  if (osPart) parts.push(osPart);
  if (deviceInfo.appVersion) parts.push(`v${deviceInfo.appVersion}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function buildFeedbackEmailHtml(nickname: string, ticketType: string, subject: string, message: string, deviceInfo?: { model?: string | null; platform?: string | null; osVersion?: string | null; appVersion?: string | null } | null): string {
  const typeLabel = TICKET_TYPE_LABELS[ticketType] || ticketType;
  const typeBadgeColor = ticketType === "bug" ? "#e74c3c" : ticketType === "suggestion" ? "#2ecc71" : "#FF6B35";
  const deviceText = escapeHtml(formatDeviceInfo(deviceInfo));
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">&#x1F6E1;&#xFE0F; BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">Nuovo ticket ricevuto</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <div style="display: inline-block; background: ${typeBadgeColor}; border-radius: 6px; padding: 4px 12px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 13px; font-weight: bold;">${typeLabel}</span>
        </div>
        <h2 style="margin-top: 0; font-size: 20px; color: #FF6B35;">${subject}</h2>
        <p style="color: #aaa; font-size: 13px; margin-bottom: 4px;">Da: <strong style="color: #fff;">${nickname}</strong></p>
        <p style="color: #aaa; font-size: 13px; margin-bottom: 4px;">Dispositivo: <span style="color: #fff;">${deviceText}</span></p>
        <div style="background: #16162a; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <p style="color: #ccc; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        &copy; ${new Date().getFullYear()} BikerLink &mdash; Notifica automatica
      </p>
    </div>
  `;
}

const router = Router();

router.post("/", feedbackJson, async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    // Task #1125: per-user + per-IP throttle. Each accepted feedback
    // ticket triggers an outbound email through the shared Gmail
    // transporter that also sends password resets and email
    // verifications, so unbounded ticket creation drains the same
    // sending quota legitimate signups depend on. The limit is shared
    // process-wide via abuse-rate-limit so future feedback variants
    // (e.g. a CSAT survey) can opt into the same bucket.
    // Task #1126: derive the rate-limit IP via the centralized helper so all
    // public telemetry endpoints share the same trust-proxy contract.
    const ip = getTrustedClientIp(req) ?? "";
    if (feedbackRateLimiter.isOverLimit(req.session.userId, ip)) {
      return res.status(429).json({
        message: "Hai inviato troppe segnalazioni. Riprova più tardi.",
      });
    }

    const parsed = createFeedbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { ticketType, subject, message, deviceInfo } = parsed.data;
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    const safeTicketType = ticketType ?? "feedback";
    const safeDeviceInfo = deviceInfo
      ? {
          model: deviceInfo.model ?? null,
          platform: deviceInfo.platform ?? null,
          osVersion: deviceInfo.osVersion ?? null,
          appVersion: deviceInfo.appVersion ?? null,
        }
      : null;

    const ticket = await storage.createFeedbackTicket({
      userId: req.session.userId,
      ticketType: safeTicketType,
      subject: trimmedSubject,
      message: trimmedMessage,
      deviceInfo: safeDeviceInfo,
    });

    try {
      const user = await storage.getUser(req.session.userId);
      const nickname = user?.nickname || "Utente sconosciuto";
      const emailSubject = `[BikerLink] ${TICKET_TYPE_LABELS[safeTicketType] || safeTicketType}: ${trimmedSubject}`;
      const html = buildFeedbackEmailHtml(nickname, safeTicketType, trimmedSubject, trimmedMessage, safeDeviceInfo);
      sendEmail(ADMIN_EMAIL, emailSubject, html).catch((err) =>
        console.error("[EMAIL] Errore invio notifica feedback:", err)
      );
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica feedback:", emailErr);
    }

    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Feedback create error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return sendError(res, 403, "Accesso negato");
    }

    const tickets = await storage.getFeedbackTickets();
    return res.json(tickets);
  } catch (error) {
    console.error("Feedback list error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return sendError(res, 403, "Accesso negato");
    }
    const parsedFbu = updateFeedbackTicketSchema.safeParse(req.body);
    if (!parsedFbu.success) return sendError(res, 400, parsedFbu.error.issues[0].message);
    const { status, internalNote } = parsedFbu.data;
    const updates: { status?: string; internalNote?: string } = {};
    if (status !== undefined) updates.status = status;
    if (internalNote !== undefined) updates.internalNote = internalNote;
    const ticket = await storage.updateFeedbackTicket(req.params.id as string, updates);
    if (!ticket) {
      return sendError(res, 404, "Ticket non trovato");
    }
    return res.json(ticket);
  } catch (error) {
    console.error("Feedback update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
