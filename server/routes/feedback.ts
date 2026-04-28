import express, { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { feedbackRateLimiter } from "../lib/abuse-rate-limit";

const ADMIN_EMAIL = "bikerlinkapp@gmail.com";

// Task #1125: per-route caps. The global parser bypass in server/index.ts
// excludes POST /api/feedback so this limit actually applies. 16 KB is
// roughly 10x the natural ticket size while still being trivially cheap
// to parse on every spammed request.
const FEEDBACK_BODY_LIMIT = "16kb";
const FEEDBACK_SUBJECT_MAX_LEN = 200;
const FEEDBACK_MESSAGE_MAX_LEN = 4000;
const ALLOWED_TICKET_TYPES = new Set(["bug", "suggestion", "feedback", "other"]);
const feedbackJson = express.json({ limit: FEEDBACK_BODY_LIMIT });

const TICKET_TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  suggestion: "Suggerimento",
  feedback: "Feedback",
  other: "Altro",
};

function buildFeedbackEmailHtml(nickname: string, ticketType: string, subject: string, message: string): string {
  const typeLabel = TICKET_TYPE_LABELS[ticketType] || ticketType;
  const typeBadgeColor = ticketType === "bug" ? "#e74c3c" : ticketType === "suggestion" ? "#2ecc71" : "#FF6B35";
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
      return res.status(401).json({ message: "Non autenticato" });
    }

    // Task #1125: per-user + per-IP throttle. Each accepted feedback
    // ticket triggers an outbound email through the shared Gmail
    // transporter that also sends password resets and email
    // verifications, so unbounded ticket creation drains the same
    // sending quota legitimate signups depend on. The limit is shared
    // process-wide via abuse-rate-limit so future feedback variants
    // (e.g. a CSAT survey) can opt into the same bucket.
    const ip = req.ip ?? req.socket?.remoteAddress ?? "";
    if (feedbackRateLimiter.isOverLimit(req.session.userId, ip)) {
      return res.status(429).json({
        message: "Hai inviato troppe segnalazioni. Riprova più tardi.",
      });
    }

    const { ticketType, subject, message } = req.body ?? {};

    // Task #1125: tight server-side type/length validation. The body
    // parser already caps the request at 16 KB, but a single 4 KB
    // message field is enough for a real bug report and small enough
    // that storage and the rendered HTML email cannot be weaponised.
    if (typeof subject !== "string" || typeof message !== "string") {
      return res.status(400).json({ message: "Oggetto e messaggio sono obbligatori" });
    }
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject || !trimmedMessage) {
      return res.status(400).json({ message: "Oggetto e messaggio sono obbligatori" });
    }
    if (trimmedSubject.length > FEEDBACK_SUBJECT_MAX_LEN) {
      return res.status(400).json({
        message: `L'oggetto non può superare ${FEEDBACK_SUBJECT_MAX_LEN} caratteri`,
      });
    }
    if (trimmedMessage.length > FEEDBACK_MESSAGE_MAX_LEN) {
      return res.status(400).json({
        message: `Il messaggio non può superare ${FEEDBACK_MESSAGE_MAX_LEN} caratteri`,
      });
    }
    const safeTicketType = typeof ticketType === "string" && ALLOWED_TICKET_TYPES.has(ticketType)
      ? ticketType
      : "feedback";

    const ticket = await storage.createFeedbackTicket({
      userId: req.session.userId,
      ticketType: safeTicketType,
      subject: trimmedSubject,
      message: trimmedMessage,
    });

    try {
      const user = await storage.getUser(req.session.userId);
      const nickname = user?.nickname || "Utente sconosciuto";
      const emailSubject = `[BikerLink] ${TICKET_TYPE_LABELS[safeTicketType] || safeTicketType}: ${trimmedSubject}`;
      const html = buildFeedbackEmailHtml(nickname, safeTicketType, trimmedSubject, trimmedMessage);
      sendEmail(ADMIN_EMAIL, emailSubject, html).catch((err) =>
        console.error("[EMAIL] Errore invio notifica feedback:", err)
      );
    } catch (emailErr) {
      console.error("[EMAIL] Errore preparazione notifica feedback:", emailErr);
    }

    return res.status(201).json(ticket);
  } catch (error) {
    console.error("Feedback create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const tickets = await storage.getFeedbackTickets();
    return res.json(tickets);
  } catch (error) {
    console.error("Feedback list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const { status, internalNote } = req.body;
    const updates: { status?: string; internalNote?: string } = {};
    if (status !== undefined) updates.status = status;
    if (internalNote !== undefined) updates.internalNote = internalNote;
    const ticket = await storage.updateFeedbackTicket(req.params.id, updates);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket non trovato" });
    }
    return res.json(ticket);
  } catch (error) {
    console.error("Feedback update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
