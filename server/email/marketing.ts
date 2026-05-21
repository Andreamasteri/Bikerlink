import { type SendMailOptions } from "nodemailer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { createTransporter, type Attachment } from "./templates";

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
