import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
// @ts-ignore
import signature from "cookie-signature";
import { storage } from "../../storage";
import { withDbTimeout, DbTimeoutError } from "../../db";
import { sendPasswordResetEmail, sendPasswordResetConfirmationEmail } from "../../email";
import { revokeAllUserSessions } from "../../session-utils";
import { closeSseClient } from "../../chat-sse";
import { sendSuccess, sendError } from "../../lib/api-response";

function buildSessionToken(sessionID: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "";
  return "s:" + signature.sign(sessionID, secret);
}

const router = Router();

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

const resendResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

router.post("/forgot-password", forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return sendError(res, 400, "Inserisci un'email valida");
    }

    const user = await withDbTimeout(storage.getUserByEmail(email.trim().toLowerCase()));
    if (!user) {
      return sendSuccess(res, undefined, "Se l'email è registrata, riceverai un codice di recupero");
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await withDbTimeout(storage.deletePasswordResetTokens(user.id));

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(crypto.randomInt(10000000, 100000000));
      try {
        await withDbTimeout(storage.createPasswordResetToken(user.id, code, expiresAt));
        break;
      } catch (e: unknown) {
        if (attempt === 4) throw e;
      }
    }

    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (emailSent) {
      console.log(`[PASSWORD RESET] Codice reset inviato a utente ${user.id}`);
    } else {
      console.warn(`[PASSWORD RESET] Email NON inviata a utente ${user.id}`);
    }

    return sendSuccess(res, undefined, "Se l'email è registrata, riceverai un codice di recupero");
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[forgot-password] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Forgot password error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/reset-password", resetPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return sendError(res, 400, "Email, codice e password richiesti");
    }

    if (!/^\d{8}$/.test(String(code).trim())) {
      return sendError(res, 400, "Il codice deve essere composto da 8 cifre");
    }

    if (password.length < 8) {
      return sendError(res, 400, "La password deve avere almeno 8 caratteri");
    }

    const user = await withDbTimeout(storage.getUserByEmail(email.trim().toLowerCase()));
    if (!user) {
      return sendError(res, 400, "Codice non valido o scaduto");
    }

    if (user.status === "blocked" || user.status === "suspended") {
      return sendError(res, 403, "Account sospeso o bloccato");
    }

    const resetToken = await withDbTimeout(storage.getPasswordResetTokenByCode(user.id, String(code).trim()));
    if (!resetToken) {
      return sendError(res, 400, "Codice non valido o già utilizzato");
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return sendError(res, 400, "Codice scaduto — richiedi un nuovo codice");
    }

    let revoked = 0;
    try {
      revoked = await revokeAllUserSessions(user.id);
    } catch (e) {
      console.error("[PASSWORD RESET] revokeAllUserSessions failed — password NOT changed:", e);
      return sendError(res, 500, "Errore temporaneo nella revoca delle sessioni. Riprova tra qualche istante.");
    }
    closeSseClient(user.id);
    if (revoked > 0) {
      console.log(`[PASSWORD RESET] Revoked ${revoked} session(s) for user ${user.id}`);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await withDbTimeout(storage.updateUser(user.id, { password: hashedPassword }));
    await withDbTimeout(storage.markPasswordResetTokenUsedById(resetToken.id));

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    sendPasswordResetConfirmationEmail(user.email, user.nickname).catch((e) =>
      console.warn("[PASSWORD RESET] Confirmation email failed:", e)
    );

    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, passwordReset: true, sessionToken: buildSessionToken(req.sessionID) });
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[reset-password] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Reset password error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/resend-reset-code", resendResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return sendError(res, 400, "Email richiesta");
    }

    const user = await withDbTimeout(storage.getUserByEmail(email.trim().toLowerCase()));
    if (!user) {
      return sendSuccess(res, undefined, "Se l'email è registrata, riceverai un nuovo codice");
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await withDbTimeout(storage.deletePasswordResetTokens(user.id));

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(crypto.randomInt(10000000, 100000000));
      try {
        await withDbTimeout(storage.createPasswordResetToken(user.id, code, expiresAt));
        break;
      } catch (e: unknown) {
        if (attempt === 4) throw e;
      }
    }

    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (!emailSent) {
      console.warn(`[PASSWORD RESET] Resend: email NON inviata a utente ${user.id}`);
    }

    return sendSuccess(res, undefined, "Se l'email è registrata, riceverai un nuovo codice");
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[resend-reset-code] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Resend reset code error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
