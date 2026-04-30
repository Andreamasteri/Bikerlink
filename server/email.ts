import nodemailer, { type SendMailOptions } from "nodemailer";

// Tipo Attachment locale: nodemailer non lo esporta più dai tipi pubblici, ma
// la struttura accettata da sendMail è questa (sottoinsieme dei campi usati qui).
type Attachment = {
  filename: string;
  content: Buffer | string;
  cid?: string;
  contentType?: string;
};
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { storage } from "./storage";

// Task #56: diagnostica strutturata invio email.
// Classificazione errori per dare all'admin informazioni azionabili:
//   - 'no-credentials' : nessuna credenziale Gmail né in DB né in env
//   - 'auth'           : EAUTH/535 — App Password revocata o errata
//   - 'network'        : ETIMEDOUT/ECONNECTION/ENOTFOUND — rete/firewall
//   - 'other'          : tutto il resto (invalid recipient, quota, ecc.)
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

interface EmailCredentials {
  user: string;
  pass: string;
  source: "db" | "env";
}

async function getEmailCredentials(): Promise<EmailCredentials | null> {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    if (userSetting?.value && passSetting?.value) {
      return { user: userSetting.value, pass: passSetting.value, source: "db" };
    }
  } catch {
    // fallback to env vars
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    return { user, pass, source: "env" };
  }

  return null;
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email.substring(0, 3) + "***";
  return local.substring(0, Math.min(3, local.length)) + "***@" + domain;
}

function classifyEmailError(err: unknown): { code: EmailErrorCode; message: string; smtpResponse?: string } {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string } | null;
  const message = e?.message ?? String(err);
  const smtpResponse = typeof e?.response === "string" ? e.response : undefined;

  // nodemailer / Gmail SMTP auth failures
  if (e?.code === "EAUTH" || e?.responseCode === 535 || /5\.7\.8/.test(smtpResponse ?? "") || /Username and Password not accepted/i.test(message)) {
    return { code: "auth", message, smtpResponse };
  }

  // network-level failures
  const networkCodes = new Set(["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNREFUSED", "ENOTFOUND", "EDNS", "EAI_AGAIN"]);
  if (e?.code && networkCodes.has(e.code)) {
    return { code: "network", message, smtpResponse };
  }

  return { code: "other", message, smtpResponse };
}

async function recordEmailSendStatus(result: EmailSendResult): Promise<void> {
  try {
    await storage.upsertAppSetting("email_last_send_status", result.ok ? "ok" : "error");
    await storage.upsertAppSetting("email_last_send_error", result.ok ? "" : (result.error ?? "unknown"));
    await storage.upsertAppSetting("email_last_send_error_code", result.ok ? "" : (result.errorCode ?? "other"));
    await storage.upsertAppSetting("email_last_send_recipient", result.recipient ?? "");
    await storage.upsertAppSetting("email_last_send_at", new Date().toISOString());
  } catch (e) {
    // Non bloccare l'invio email se la persistenza fallisce
    console.warn("[EMAIL] Impossibile persistere stato ultimo invio:", e);
  }
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

async function createTransporter(): Promise<{ transporter: nodemailer.Transporter; creds: EmailCredentials } | null> {
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

export async function sendVerificationEmail(to: string, nickname: string, token: string): Promise<boolean> {
  const subject = "BikerLink - Codice di verifica email";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">🏍️ BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          Benvenuto su BikerLink! Per completare la registrazione, inserisci il seguente codice di verifica nell'app:
        </p>

        <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff;">${token}</span>
        </div>

        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Il codice scade tra 30 minuti.<br/>
          Se non hai richiesto questa verifica, ignora questa email.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati
      </p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

export async function sendInvitationGiftEmail(
  to: string,
  code: string,
  imageUrl: string | null,
  giftMessage: string | null,
  expiryDate: Date
): Promise<boolean> {
  const t = await createTransporter();
  if (!t) return false;
  const { transporter, creds } = t;

  const expiryStr = expiryDate.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
  const expiryTime = expiryDate.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
  const expiryLabel = `Scade il ${expiryStr} alle ${expiryTime}`;

  let imageAttachment: Attachment | null = null;
  let imageHtml = "";

  if (imageUrl) {
    try {
      const filePath = path.join(process.cwd(), imageUrl);
      if (fs.existsSync(filePath)) {
        const inputBuffer = fs.readFileSync(filePath);
        const meta = await sharp(inputBuffer).metadata();
        const imgWidth = meta.width ?? 600;
        const imgHeight = meta.height ?? 400;

        const overlayHeight = 54;
        const overlayY = imgHeight - overlayHeight;
        const svgOverlay = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
            <rect x="0" y="${overlayY}" width="${imgWidth}" height="${overlayHeight}" fill="rgba(0,0,0,0.65)"/>
            <text
              x="${imgWidth / 2}"
              y="${overlayY + 34}"
              font-family="Arial, sans-serif"
              font-size="22"
              font-weight="bold"
              fill="white"
              text-anchor="middle"
            >${expiryLabel}</text>
          </svg>`;

        const outputBuffer = await sharp(inputBuffer)
          .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
          .jpeg({ quality: 85 })
          .toBuffer();

        imageAttachment = {
          filename: "gadget.jpg",
          content: outputBuffer,
          cid: "gadget",
        };
        imageHtml = `<img src="cid:gadget" alt="Il tuo gadget" style="width:100%;max-width:480px;border-radius:10px;display:block;margin:20px auto 0;" />`;
      }
    } catch (err) {
      console.warn("[EMAIL] Errore compositing immagine gadget:", err);
    }
  }

  const subject = `BikerLink — Il tuo gadget omaggio ti aspetta!`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:30px;">
        <h1 style="color:#FF6B35;margin:0;font-size:28px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:14px;margin-top:4px;">U'll never ride alone</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:30px;color:#fff;">
        <h2 style="margin-top:0;font-size:20px;">Benvenuto su BikerLink!</h2>
        <p style="color:#ccc;line-height:1.6;">
          Hai usato il codice <strong style="color:#FF6B35;">${code}</strong> al momento della registrazione.<br/>
          Il tuo gadget omaggio è pronto per te!
        </p>
        ${imageHtml}
        <div style="background:#FF6B35;border-radius:10px;padding:18px;text-align:center;margin:24px 0 0;">
          <span style="font-size:17px;font-weight:bold;color:#fff;">🎁 Riscatta il tuo gadget entro 5 giorni!</span>
        </div>
        ${giftMessage ? `<p style="color:#bbb;font-size:14px;line-height:1.6;margin-top:20px;">${giftMessage}</p>` : ""}
      </div>
      <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">
        © ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati
      </p>
    </div>
  `;

  try {
    const mailOptions: SendMailOptions = {
      from: `"BikerLink" <${creds.user}>`,
      to,
      subject,
      html,
      ...(imageAttachment ? { attachments: [imageAttachment] } : {}),
    };
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Gift email inviata a ${to} per codice ${code}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Errore invio gift email a ${to}:`, error);
    return false;
  }
}

export async function sendNewUserNotificationEmail(user: {
  nickname: string;
  email: string;
  phone?: string | null;
  userType?: string | null;
  sex?: string | null;
  birthYear?: number | null;
  region?: string | null;
  country?: string | null;
}, invitationCode?: string | null): Promise<boolean> {
  const adminEmail = "bikerlinkapp@gmail.com";
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const now = new Date();
  const registrationTime = now.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Rome",
  });

  const rows = [
    ["Nickname", esc(user.nickname)],
    ["Email", esc(user.email)],
    ["Telefono", user.phone ? esc(user.phone) : "—"],
    ["Tipo utente", user.userType ? esc(user.userType) : "—"],
    ["Sesso", user.sex ? esc(user.sex) : "—"],
    ["Anno di nascita", user.birthYear ? String(user.birthYear) : "—"],
    ["Regione", user.region ? esc(user.region) : "—"],
    ["Paese", user.country ? esc(user.country) : "—"],
    ["Data/ora registrazione", esc(registrationTime)],
    ["Codice invito/promo", invitationCode ? esc(invitationCode) : "—"],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#aaa;white-space:nowrap;font-size:14px;">${label}</td><td style="padding:8px 12px;color:#fff;font-size:14px;">${value}</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] Nuova registrazione: ${user.nickname}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Notifica nuova registrazione</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:#FF6B35;">Nuovo utente registrato</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${tableRows}
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  return sendEmail(adminEmail, subject, html);
}

export async function sendPasswordResetEmail(to: string, nickname: string, code: string): Promise<boolean> {
  const subject = "BikerLink - Recupero password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">🏍️ BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          Hai richiesto il recupero della password del tuo account BikerLink.<br/>
          Inserisci il seguente codice nell'app per reimpostare la password:
        </p>

        <div style="background: #FF6B35; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #fff;">${code}</span>
        </div>

        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Il codice scade tra 1 ora.<br/>
          Se non hai richiesto il recupero password, ignora questa email. Il tuo account è al sicuro.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati
      </p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

export async function sendNewEventNotificationEmail(evt: {
  title: string;
  eventType: string;
  eventDate: string;
  locationName?: string | null;
  creatorNickname: string;
}): Promise<void> {
  const adminEmail = "bikerlinkapp@gmail.com";
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const now = new Date();
  const createdAt = now.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });

  const typeLabels: Record<string, string> = {
    raduno: "Raduno", uscita_gruppo: "Uscita di gruppo", festa: "Festa", gara: "Gara", altro: "Altro",
  };

  const rows = [
    ["Titolo", esc(evt.title)],
    ["Tipo", typeLabels[evt.eventType] ?? esc(evt.eventType)],
    ["Data evento", esc(evt.eventDate)],
    ["Luogo", evt.locationName ? esc(evt.locationName) : "—"],
    ["Organizzatore", esc(evt.creatorNickname)],
    ["Creato il", esc(createdAt)],
  ];

  const tableRows = rows
    .map(([label, value]) =>
      `<tr><td style="padding:8px 12px;color:#aaa;white-space:nowrap;font-size:14px;">${label}</td><td style="padding:8px 12px;color:#fff;font-size:14px;">${value}</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] Nuovo evento: ${evt.title}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Nuovo evento creato e pubblicato</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:#FF6B35;">📅 Nuovo Evento Pubblicato</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${tableRows}
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  try {
    const allUsers = await storage.getAllUsers();
    const adminModEmails = allUsers
      .filter((u) => (u.role === "admin" || u.role === "moderator") && u.email)
      .map((u) => u.email as string);

    const recipients = Array.from(new Set([adminEmail, ...adminModEmails]));
    for (const to of recipients) {
      sendEmail(to, subject, html).catch((e) =>
        console.warn("[EMAIL] sendNewEventNotificationEmail error:", e)
      );
    }
  } catch (err) {
    console.warn("[EMAIL] sendNewEventNotificationEmail fetch users error:", err);
    sendEmail(adminEmail, subject, html).catch(() => {});
  }
}

export async function sendPasswordResetConfirmationEmail(to: string, nickname: string): Promise<boolean> {
  const subject = "BikerLink - Password aggiornata";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 28px;">🏍️ BikerLink</h1>
        <p style="color: #888; font-size: 14px; margin-top: 4px;">U'll never ride alone</p>
      </div>

      <div style="background: #1a1a2e; border-radius: 12px; padding: 30px; color: #fff;">
        <h2 style="margin-top: 0; font-size: 20px;">Ciao ${nickname}!</h2>
        <p style="color: #ccc; line-height: 1.6;">
          La tua password è stata aggiornata con successo. Ora sei di nuovo in pista! 🏍️
        </p>
        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          Se non hai effettuato questa modifica, contatta subito il supporto.
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati
      </p>
    </div>
  `;

  return sendEmail(to, subject, html);
}
