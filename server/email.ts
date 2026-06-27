import {
  type EmailErrorCode,
  type EmailSendResult,
  type EmailDiagnostics,
  createTransporter,
  classifyEmailError,
  recordEmailSendStatus,
  getEmailDiagnostics,
  htmlToPlainText
} from "./email/templates";

export { EmailErrorCode, EmailSendResult, EmailDiagnostics };

export interface SendEmailOptions {
  /** Versione text/plain. Se omessa viene derivata dall'HTML (anti-spam multipart). */
  text?: string;
  /** Indirizzo Reply-To. Default: lo stesso mittente (account Gmail configurato). */
  replyTo?: string;
}

/**
 * Invia un'email e ritorna risultato strutturato + persiste l'esito in app_settings
 * (chiavi email_last_send_status/error/error_code/recipient/at).
 *
 * Anti-spam: invia sempre multipart (text + html) e imposta Reply-To per
 * migliorare la deliverability (Gmail/Outlook penalizzano le email html-only).
 */
export async function sendEmailDetailed(to: string, subject: string, html: string, opts?: SendEmailOptions): Promise<EmailSendResult> {
  const t = await createTransporter();
  if (!t) {
    const result: EmailSendResult = {
      ok: false,
      errorCode: "no-credentials",
      error: "Credenziali Gmail non configurate (env GMAIL_USER/GMAIL_APP_PASSWORD mancanti).",
      recipient: to,
      source: "none"
    };
    await recordEmailSendStatus(result);
    return result;
  }

  try {
    const text = opts?.text ?? htmlToPlainText(html);
    const replyTo = opts?.replyTo ?? t.creds.user;
    const info = await t.transporter.sendMail({
      from: `"BikerLink" <${t.creds.user}>`,
      to,
      replyTo,
      subject,
      text,
      html
    });
    console.log(`[EMAIL] Email inviata a ${to}: ${subject} (msgId=${info.messageId})`);
    const result: EmailSendResult = {
      ok: true,
      messageId: info.messageId,
      recipient: to,
      source: t.creds.source
    };
    await recordEmailSendStatus(result);
    return result;
  } catch (error) {
    const cls = classifyEmailError(error);
    console.error(`[EMAIL] Errore invio a ${to} (${cls.code}): ${cls.message}${cls.smtpResponse ? " | smtp: " + cls.smtpResponse : ""}`);
    const result: EmailSendResult = {
      ok: false,
      errorCode: cls.code,
      error: cls.message,
      smtpResponse: cls.smtpResponse,
      recipient: to,
      source: t.creds.source
    };
    await recordEmailSendStatus(result);
    return result;
  }
}

/**
 * Wrapper compat: ritorna boolean per i call site esistenti che non hanno bisogno
 * della diagnostica dettagliata. Lo stato dell'ultimo invio viene comunque persistito.
 */
export async function sendEmail(to: string, subject: string, html: string, opts?: SendEmailOptions): Promise<boolean> {
  const r = await sendEmailDetailed(to, subject, html, opts);
  return r.ok;
}

export { getEmailDiagnostics };

// Re-export specific email functions from sub-modules
export * from "./email/auth";
export * from "./email/marketing";
export * from "./email/notifications";
