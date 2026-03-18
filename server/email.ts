import nodemailer, { type Attachment, type SendMailOptions } from "nodemailer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { storage } from "./storage";

async function getEmailCredentials(): Promise<{ user: string; pass: string } | null> {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    if (userSetting?.value && passSetting?.value) {
      return { user: userSetting.value, pass: passSetting.value };
    }
  } catch (e) {
    // fallback to env vars
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    return { user, pass };
  }

  return null;
}

async function createTransporter() {
  const creds = await getEmailCredentials();
  if (!creds) {
    console.warn("[EMAIL] Credenziali Gmail non configurate. Email non inviata.");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: creds.user,
      pass: creds.pass,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = await createTransporter();
  if (!transporter) return false;

  const creds = await getEmailCredentials();
  if (!creds) return false;

  try {
    await transporter.sendMail({
      from: `"BikerLink" <${creds.user}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Email inviata a ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Errore invio email a ${to}:`, error);
    return false;
  }
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
  const transporter = await createTransporter();
  if (!transporter) return false;

  const creds = await getEmailCredentials();
  if (!creds) return false;

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

export async function sendPasswordResetEmail(to: string, nickname: string, token: string): Promise<boolean> {
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
          Hai richiesto il recupero della password del tuo account BikerLink. Usa il seguente codice per reimpostare la password nell'app:
        </p>

        <div style="background: #FF6B35; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 14px; font-weight: bold; letter-spacing: 2px; color: #fff; word-break: break-all;">${token}</span>
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
