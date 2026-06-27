import nodemailer from "nodemailer";
import { storage } from "../storage";

// Attachment type for internal use
export type Attachment = {
  filename: string;
  content: Buffer | string;
  cid?: string;
  contentType?: string;
};

export type EmailErrorCode = "no-credentials" | "auth" | "network" | "other";

export interface EmailSendResult {
  ok: boolean;
  messageId?: string;
  errorCode?: EmailErrorCode;
  error?: string;
  smtpResponse?: string;
  recipient?: string;
  source?: "db" | "env" | "none";
}

export interface EmailDiagnostics {
  credentials: {
    present: boolean;
    source: "db" | "env" | "none";
    maskedUser: string | null;
  };
  lastSend: {
    status: "ok" | "error" | null;
    errorCode: EmailErrorCode | null;
    error: string | null;
    recipient: string | null;
    at: string | null;
  };
}

export interface EmailCredentials {
  user: string;
  pass: string;
  source: "env";
}

// Credenziali SMTP lette ESCLUSIVAMENTE da env (process.env.GMAIL_USER /
// GMAIL_APP_PASSWORD). Il vecchio fallback a app_settings è stato rimosso: i
// segreti nel DB operativo allargano la superficie di esposizione.
export async function getEmailCredentials(): Promise<EmailCredentials | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    return { user, pass, source: "env" };
  }

  return null;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email.substring(0, 3) + "***";
  return local.substring(0, Math.min(3, local.length)) + "***@" + domain;
}

export function classifyEmailError(err: unknown): { code: EmailErrorCode; message: string; smtpResponse?: string } {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string } | null;
  const message = e?.message ?? String(err);
  const smtpResponse = typeof e?.response === "string" ? e.response : undefined;

  if (e?.code === "EAUTH" || e?.responseCode === 535 || /5\.7\.8/.test(smtpResponse ?? "") || /Username and Password not accepted/i.test(message)) {
    return { code: "auth", message, smtpResponse };
  }

  const networkCodes = new Set(["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNREFUSED", "ENOTFOUND", "EDNS", "EAI_AGAIN"]);
  if (e?.code && networkCodes.has(e.code)) {
    return { code: "network", message, smtpResponse };
  }

  return { code: "other", message, smtpResponse };
}

export async function recordEmailSendStatus(result: EmailSendResult): Promise<void> {
  try {
    await storage.upsertAppSetting("email_last_send_status", result.ok ? "ok" : "error");
    await storage.upsertAppSetting("email_last_send_error", result.ok ? "" : (result.error ?? "unknown"));
    await storage.upsertAppSetting("email_last_send_error_code", result.ok ? "" : (result.errorCode ?? "other"));
    await storage.upsertAppSetting("email_last_send_recipient", result.recipient ?? "");
    await storage.upsertAppSetting("email_last_send_at", new Date().toISOString());
  } catch (e) {
    console.warn("[EMAIL] Impossibile persistere stato ultimo invio:", e);
  }
}

export async function createTransporter(): Promise<{ transporter: nodemailer.Transporter; creds: EmailCredentials } | null> {
  const creds = await getEmailCredentials();
  if (!creds) {
    console.warn("[EMAIL] Credenziali Gmail non configurate. Email non inviata.");
    return null;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: creds.user, pass: creds.pass },
  });

  return { transporter, creds };
}

export function getBaseTemplate(content: string, preheader: string = "U'll never ride alone"): string {
  // Anti-spam / deliverability: il preheader nascosto migliora l'anteprima nella
  // inbox senza mostrare testo extra nel corpo (tecnica standard email marketing).
  return `
    <div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;color:#1a1a2e;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        ${content}
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati
      </p>
    </div>
  `;
}

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Converte l'HTML di una email in testo semplice leggibile, usato come parte
 * `text` del messaggio multipart. Una versione text/plain presente accanto
 * all'HTML migliora sensibilmente lo spam score (Gmail/Outlook penalizzano le
 * email html-only).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export async function getEmailDiagnostics(): Promise<EmailDiagnostics> {
  const creds = await getEmailCredentials();
  const status = await storage.getAppSetting("email_last_send_status").catch(() => undefined);
  const error = await storage.getAppSetting("email_last_send_error").catch(() => undefined);
  const errorCode = await storage.getAppSetting("email_last_send_error_code").catch(() => undefined);
  const recipient = await storage.getAppSetting("email_last_send_recipient").catch(() => undefined);
  const at = await storage.getAppSetting("email_last_send_at").catch(() => undefined);

  return {
    credentials: {
      present: !!creds,
      source: creds?.source ?? "none",
      maskedUser: maskEmail(creds?.user ?? null),
    },
    lastSend: {
      status: (status?.value as "ok" | "error" | undefined) ?? null,
      errorCode: ((errorCode?.value || null) as EmailErrorCode | null) || null,
      error: error?.value || null,
      recipient: recipient?.value || null,
      at: at?.value || null,
    },
  };
}
