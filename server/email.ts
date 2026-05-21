import {
  type EmailErrorCode,
  type EmailSendResult,
  type EmailDiagnostics,
  createTransporter,
  classifyEmailError,
  recordEmailSendStatus,
  getEmailDiagnostics,
  maskEmail
} from "./email/templates";

export { EmailErrorCode, EmailSendResult, EmailDiagnostics };

/**
 * Invia un'email e ritorna risultato strutturato + persiste l'esito in app_settings
 * (chiavi email_last_send_status/error/error_code/recipient/at).
 */
export async function sendEmailDetailed(to: string, subject: string, html: string): Promise<EmailSendResult> {
  const t = await createTransporter();
  if (!t) {
    const result: EmailSendResult = {
      ok: false,
      errorCode: "no-credentials",
      error: "Credenziali Gmail non configurate (né in DB app_settings né in env GMAIL_USER/GMAIL_APP_PASSWORD).",
      recipient: to,
      source: "none",
    };
    await recordEmailSendStatus(result);
    return result;
  }

  try {
    const info = await t.transporter.sendMail({
      from: `"BikerLink" <${t.creds.user}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Email inviata a ${to}: ${subject} (msgId=${info.messageId})`);
    const result: EmailSendResult = {
      ok: true,
      messageId: info.messageId,
      recipient: to,
      source: t.creds.source,
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
      source: t.creds.source,
    };
    await recordEmailSendStatus(result);
    return result;
  }
}

/**
 * Wrapper compat: ritorna boolean per i call site esistenti che non hanno bisogno
 * della diagnostica dettagliata. Lo stato dell'ultimo invio viene comunque persistito.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const r = await sendEmailDetailed(to, subject, html);
  return r.ok;
}

export { getEmailDiagnostics };

// Re-export specific email functions from sub-modules
export * from "./email/auth";
export * from "./email/marketing";
export * from "./email/notifications";
