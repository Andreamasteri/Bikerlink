import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db, withDbTimeout, DbTimeoutError } from "../../db";
import { matchPreferences } from "@shared/db";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { registerSchema } from "@shared/validators";
import { storage } from "../../storage";
import { sendVerificationEmail, sendInvitationGiftEmail, sendNewUserNotificationEmail } from "../../email";
import { createRegionalClubInvite } from "../motoclubs";
import { parseVisitorCookie, recordVisit } from "../../lib/visitor-tracking";
// @ts-ignore
import signature from "cookie-signature";

function buildSessionToken(sessionID: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "";
  return "s:" + signature.sign(sessionID, secret);
}

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

export const verifyEmailStore = new MemoryStore();
export const resendVerificationStore = new MemoryStore();
export const VERIFY_EMAIL_WINDOW_MS = 15 * 60 * 1000;
export const VERIFY_EMAIL_MAX = 10;
export const RESEND_VERIFICATION_WINDOW_MS = 60 * 60 * 1000;
export const RESEND_VERIFICATION_MAX = 5;

const verifyEmailLimiter = rateLimit({
  windowMs: VERIFY_EMAIL_WINDOW_MS,
  max: VERIFY_EMAIL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: verifyEmailStore,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

const resendVerificationLimiter = rateLimit({
  windowMs: RESEND_VERIFICATION_WINDOW_MS,
  max: RESEND_VERIFICATION_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: resendVerificationStore,
  handler: (_req, res) => {
    sendError(res, 429, "Troppi tentativi. Riprova più tardi.");
  },
});

export const VERIFY_MAX_ATTEMPTS = 5;
export const VERIFY_ATTEMPT_WINDOW_MS = 30 * 60 * 1000;
export const verifyAttempts = new Map<string, { count: number; firstAt: number }>();

function recordVerifyFailure(userId: string): number {
  const now = Date.now();
  const entry = verifyAttempts.get(userId);
  if (!entry || now - entry.firstAt > VERIFY_ATTEMPT_WINDOW_MS) {
    verifyAttempts.set(userId, { count: 1, firstAt: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export function clearVerifyAttempts(userId: string): void {
  verifyAttempts.delete(userId);
}

function isVerifyLockedOut(userId: string): boolean {
  const entry = verifyAttempts.get(userId);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > VERIFY_ATTEMPT_WINDOW_MS) {
    verifyAttempts.delete(userId);
    return false;
  }
  return entry.count >= VERIFY_MAX_ATTEMPTS;
}

const VERIFY_TOKEN_RE = /^[A-F0-9]{8}$/;

import bcrypt from "bcryptjs";

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }

    const data = parsed.data;

    if (data.birthYear) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - data.birthYear;
      if (age < 18) {
        return sendError(res, 400, "Devi avere almeno 18 anni per registrarti");
      }
    }

    data.email = data.email.trim().toLowerCase();

    // BLOCCO ACCOUNT SMOKE — impedisce la creazione di account di test "smoke"
    // (es. smoke+<ts>@bikerlink.test / nickname smoke<ts>) che possono restare
    // "in limbo" e sporcare il DB. Vale per qualsiasi chiamante.
    const SMOKE_EMAIL_RE = /^smoke\+[^@]+@bikerlink\.test$/i;
    const SMOKE_NICKNAME_RE = /^smoke\d{6,}$/i;
    if (
      SMOKE_EMAIL_RE.test(data.email) ||
      data.email.endsWith("@bikerlink.test") ||
      SMOKE_NICKNAME_RE.test(data.nickname.trim())
    ) {
      console.warn(`[REGISTER] Bloccata creazione account smoke: email=${data.email} nickname=${data.nickname}`);
      return sendError(res, 403, "Registrazione non consentita");
    }

    const existingEmail = await withDbTimeout(storage.getUserByEmail(data.email));
    if (existingEmail) {
      return sendError(res, 409, "Email già registrata");
    }

    const reservedNicknames = ["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"];
    if (reservedNicknames.includes(data.nickname.toLowerCase())) {
      return sendError(res, 400, "Nickname non disponibile");
    }

    const existingNickname = await withDbTimeout(storage.getUserByNickname(data.nickname));
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }

    let invitationGiftMessage: string | null = null;
    let invitationImageUrl: string | null = null;
    let invitationCodeStr: string | null = null;
    if (data.invitationCode) {
      const invitation = await withDbTimeout(storage.getInvitationCode(data.invitationCode));
      if (!invitation || !invitation.isActive || invitation.currentUses >= invitation.maxUses) {
        return sendError(res, 400, "Codice invito non valido");
      }
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return sendError(res, 400, "Codice invito scaduto");
      }
      await withDbTimeout(storage.incrementInvitationCodeUses(invitation.id));
      invitationGiftMessage = invitation.giftMessage ?? null;
      invitationImageUrl = invitation.imageUrl ?? null;
      invitationCodeStr = invitation.code;
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const primalSetting = await withDbTimeout(storage.getAppSetting("primal_user_enabled"));
    const isPrimal = primalSetting?.value === "true";

    const user = await withDbTimeout(storage.createUser({
      nickname: data.nickname,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      userType: data.userType,
      sex: data.sex,
      coupleSexConfig: data.coupleSexConfig,
      birthYear: data.birthYear,
      region: data.region,
      country: data.country,
      eulaAccepted: true,
      privacyAccepted: true,
      marketingConsent: data.marketingAccepted ?? false,
      consentAcceptedAt: new Date(),
      invitationCode: data.invitationCode,
      isPrimal,
    }));

    await withDbTimeout(storage.createUserProfile({ userId: user.id }));

    // Crea subito la riga match_preferences con i valori di default: il motore
    // di matching vede il nuovo utente senza aspettare che salvi manualmente le
    // preferenze (altrimenti la riga veniva inserita solo al primo PUT, rendendo
    // l'utente invisibile al motore per tutta la fase iniziale di utilizzo).
    db.insert(matchPreferences)
      .values({ userId: user.id })
      .onConflictDoNothing()
      .catch((e) => console.warn("[REGISTER] match_preferences insert fallito (non bloccante):", e));

    storage.getUserByNickname("admin").then(async (adminUser) => {
      if (!adminUser) return;
      const conv = await storage.createConversation({ conversationType: "private" });
      await storage.addConversationParticipant({ conversationId: conv.id, userId: adminUser.id });
      await storage.addConversationParticipant({ conversationId: conv.id, userId: user.id });
      await storage.createMessage({
        conversationId: conv.id,
        senderId: adminUser.id,
        messageType: "text",
        content: "Ricordati di aggiungere le tue moto al garage, nel tab profilo",
      });
      await storage.updateConversationTimestamp(conv.id);
    }).catch((e) => console.warn("[WELCOME] Messaggio admin non inviato:", e));

    sendNewUserNotificationEmail(
      {
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        sex: user.sex,
        birthYear: user.birthYear,
        region: user.region,
        country: user.country,
      },
      invitationCodeStr ?? null
    ).catch((e) => console.warn("[EMAIL] Admin notification failed (non-blocking):", e));

    if (data.region) {
      createRegionalClubInvite(user.id, data.region).catch(() => {});
    }

    if (invitationCodeStr) {
      try {
        const registrationDate = new Date();
        const expiryDate = new Date(registrationDate.getTime() + 5 * 24 * 60 * 60 * 1000);
        await sendInvitationGiftEmail(user.email, invitationCodeStr, invitationImageUrl, invitationGiftMessage, expiryDate);
      } catch (e) {
        console.warn("[EMAIL] Errore invio gift email (non bloccante):", e);
      }
    }

    const emailVerifSetting = await withDbTimeout(storage.getAppSetting("email_verification_enabled"));
    const emailVerificationEnabled = emailVerifSetting?.value === "true";

    if (emailVerificationEnabled && !isPrimal) {
      const token = crypto.randomBytes(4).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await withDbTimeout(storage.createEmailVerificationToken(user.id, token, expiresAt));
      const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
      if (emailSent) {
        console.log(`[EMAIL VERIFICATION] Email inviata a utente ${user.id}`);
      } else {
        console.warn(`[EMAIL VERIFICATION] Email NON inviata a utente ${user.id} - fallback notifica admin`);
      }

      let emailStatusMsg = " (email inviata)";
      if (!emailSent) {
        const errCode = (await withDbTimeout(storage.getAppSetting("email_last_send_error_code")).catch(() => undefined))?.value || "other";
        const errMsg = (await withDbTimeout(storage.getAppSetting("email_last_send_error")).catch(() => undefined))?.value || "errore sconosciuto";
        const codeLabel: Record<string, string> = {
          "no-credentials": "credenziali Gmail non configurate",
          "auth": "autenticazione Gmail rifiutata (App Password revocata o errata)",
          "network": "errore di rete verso Gmail",
          "other": "errore SMTP",
        };
        emailStatusMsg = ` (email NON inviata — ${codeLabel[errCode] ?? errCode}: ${errMsg.substring(0, 200)})`;
      }

      try {
        const adminUser = await withDbTimeout(storage.getUserByNickname("admin"));
        if (adminUser) {
          await withDbTimeout(storage.createNotification({
            userId: adminUser.id,
            title: "Nuova registrazione - Verifica Email",
            body: `L'utente ${user.nickname} (ID: ${user.id}) si è registrato. Codice verifica: ${token}${emailStatusMsg}`,
            notificationType: "system",
            referenceType: "user",
            referenceId: user.id,
          }));
        }
      } catch (e) {
        console.error("Failed to notify admin about email verification:", e);
      }

      const { password: _, ...safeUser } = user;
      return res.status(201).json({ ...safeUser, requiresEmailVerification: true, giftMessage: invitationGiftMessage });
    }

    if (isPrimal) {
      await withDbTimeout(storage.markUserEmailVerified(user.id));
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    try {
      const vid = parseVisitorCookie(req);
      if (vid) recordVisit({ req, visitorId: vid, event: "register", userId: user.id, path: "/api/auth/register" });
    } catch { /* no-op: visitor tracking failure */ }

    const { password: _, ...safeUser } = user;
    return res.status(201).json({ ...safeUser, giftMessage: invitationGiftMessage, sessionToken: buildSessionToken(req.sessionID) });
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[register] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Register error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/verify-email", verifyEmailLimiter, async (req: Request, res: Response) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return sendError(res, 400, "Email e codice richiesti");
    }
    const normalizedToken = String(token).trim().toUpperCase();
    if (!VERIFY_TOKEN_RE.test(normalizedToken)) {
      return sendError(res, 400, "Codice non valido");
    }

    const user = await withDbTimeout(storage.getUserByEmail(email.trim().toLowerCase()));
    if (!user) {
      return sendError(res, 400, "Codice non valido");
    }

    if (user.emailVerified) {
      return sendError(res, 409, "Codice già utilizzato. Hai già verificato la tua email.");
    }

    if (isVerifyLockedOut(user.id)) {
      await storage.deleteEmailVerificationTokens(user.id).catch(() => {});
      return sendError(res, 429, "Troppi tentativi. Richiedi un nuovo codice.");
    }

    const verif = await withDbTimeout(storage.getEmailVerificationToken(normalizedToken));
    if (!verif || verif.userId !== user.id) {
      const attempts = recordVerifyFailure(user.id);
      if (attempts >= VERIFY_MAX_ATTEMPTS) {
        await storage.deleteEmailVerificationTokens(user.id).catch(() => {});
      }
      return sendError(res, 400, "Codice non valido");
    }

    if (new Date(verif.expiresAt) < new Date()) {
      recordVerifyFailure(user.id);
      return sendError(res, 400, "Codice scaduto. Richiedi un nuovo codice.");
    }

    await withDbTimeout(storage.markUserEmailVerified(user.id));
    await withDbTimeout(storage.deleteEmailVerificationTokens(user.id));
    clearVerifyAttempts(user.id);

    db.insert(matchPreferences)
      .values({ userId: user.id })
      .onConflictDoNothing()
      .catch((e) => console.warn("[VERIFY-EMAIL] match_preferences insert fallito (non bloccante):", e));

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, emailVerified: true, sessionToken: buildSessionToken(req.sessionID) });
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[verify-email] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Verify email error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/resend-verification", resendVerificationLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return sendError(res, 400, "Email richiesta");
    }

    const genericResponse = { message: "Se l'email è registrata e in attesa di verifica, riceverai un nuovo codice." };

    const user = await withDbTimeout(storage.getUserByEmail(email.trim().toLowerCase()));
    if (!user || user.emailVerified) {
      return res.json(genericResponse);
    }

    await withDbTimeout(storage.deleteEmailVerificationTokens(user.id));
    clearVerifyAttempts(user.id);
    const token = crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await withDbTimeout(storage.createEmailVerificationToken(user.id, token, expiresAt));
    const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
    if (!emailSent) {
      console.warn(`[EMAIL VERIFICATION] Resend: email NON inviata a utente ${user.id}`);
    }

    return res.json(genericResponse);
  } catch (error) {
    const isPgStatementTimeout =
      error instanceof Error &&
      (error as unknown as { code?: string }).code === "57014";
    if (error instanceof DbTimeoutError || isPgStatementTimeout) {
      console.error("[resend-verification] DB timeout:", (error as Error).message);
      return sendError(res, 503, "Servizio temporaneamente non disponibile. Riprova.");
    }
    console.error("Resend verification error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
