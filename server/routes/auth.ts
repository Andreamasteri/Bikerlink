import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { registerSchema, loginSchema } from "@shared/schema";
import { storage } from "../storage";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordResetConfirmationEmail, sendInvitationGiftEmail, sendNewUserNotificationEmail } from "../email";
import { createClubInvitesForMoto, createRegionalClubInvite } from "./motoclubs";
import { onlineTracker } from "../online-tracker";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

const resendResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Troppi tentativi. Riprova più tardi." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const data = parsed.data;

    if (data.birthYear) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - data.birthYear;
      if (age < 18) {
        return res.status(400).json({ message: "Devi avere almeno 18 anni per registrarti" });
      }
    }

    data.email = data.email.trim().toLowerCase();

    const existingEmail = await storage.getUserByEmail(data.email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email già registrata" });
    }

    const reservedNicknames = ["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"];
    if (reservedNicknames.includes(data.nickname.toLowerCase())) {
      return res.status(400).json({ message: "Nickname non disponibile" });
    }

    const existingNickname = await storage.getUserByNickname(data.nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname già in uso" });
    }

    let invitationGiftMessage: string | null = null;
    let invitationImageUrl: string | null = null;
    let invitationCodeStr: string | null = null;
    if (data.invitationCode) {
      const invitation = await storage.getInvitationCode(data.invitationCode);
      if (!invitation || !invitation.isActive || invitation.currentUses >= invitation.maxUses) {
        return res.status(400).json({ message: "Codice invito non valido" });
      }
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Codice invito scaduto" });
      }
      await storage.incrementInvitationCodeUses(invitation.id);
      invitationGiftMessage = invitation.giftMessage ?? null;
      invitationImageUrl = invitation.imageUrl ?? null;
      invitationCodeStr = invitation.code;
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const primalSetting = await storage.getAppSetting("primal_user_enabled");
    const isPrimal = primalSetting?.value === "true";

    const user = await storage.createUser({
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
      consentAcceptedAt: new Date(),
      invitationCode: data.invitationCode,
      isPrimal,
    });

    await storage.createUserProfile({ userId: user.id });

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

    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    const emailVerificationEnabled = emailVerifSetting?.value === "true";

    if (emailVerificationEnabled && !isPrimal) {
      const token = crypto.randomBytes(3).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await storage.createEmailVerificationToken(user.id, token, expiresAt);
      const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
      if (emailSent) {
        console.log(`[EMAIL VERIFICATION] Email inviata a ${user.email}`);
      } else {
        console.warn(`[EMAIL VERIFICATION] Email NON inviata a ${user.email} - fallback notifica admin`);
      }

      try {
        const adminUser = await storage.getUserByNickname("admin");
        if (adminUser) {
          await storage.createNotification({
            userId: adminUser.id,
            title: "Nuova registrazione - Verifica Email",
            body: `L'utente ${user.nickname} (${user.email}) si è registrato. Codice verifica: ${token}${emailSent ? " (email inviata)" : " (email NON inviata - SMTP non configurato)"}`,
            notificationType: "system",
            referenceType: "user",
            referenceId: user.id,
          });
        }
      } catch (e) {
        console.error("Failed to notify admin about email verification:", e);
      }

      const { password: _, ...safeUser } = user;
      return res.status(201).json({ ...safeUser, requiresEmailVerification: true, giftMessage: invitationGiftMessage });
    }

    if (isPrimal) {
      await storage.markUserEmailVerified(user.id);
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    const { password: _, ...safeUser } = user;
    return res.status(201).json({ ...safeUser, giftMessage: invitationGiftMessage });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { identifier: rawIdentifier, password, latitude: loginLat, longitude: loginLng } = parsed.data;
    const identifier = rawIdentifier.trim();

    let user = await storage.getUserByEmail(identifier);
    if (!user) {
      user = await storage.getUserByNickname(identifier);
    }

    if (!user) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    if (user.status === "blocked" || user.status === "suspended") {
      return res.status(403).json({ message: "Account sospeso o bloccato" });
    }

    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    if (emailVerifSetting?.value === "true" && !user.emailVerified && !user.isPrimal && user.role !== "admin") {
      return res.status(403).json({ message: "Verifica la tua email prima di accedere. Controlla la tua casella di posta." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    const updateData: Record<string, unknown> = { lastLoginAt: new Date() };
    if (!user.firstLoginAt) {
      updateData.firstLoginAt = new Date();
    }
    await storage.updateUser(user.id, updateData as any);

    const effectiveRegion = user.region;
    const effectiveCountry = user.country;
    if (effectiveRegion && (!effectiveCountry || effectiveCountry === "IT")) {
      createRegionalClubInvite(user.id, effectiveRegion).catch(() => {});
    }

    const userRecord = await storage.getUser(user.id);
    if (!userRecord?.ghostMode) {
      await storage.upsertUserProfile(user.id, { isAvailable: true }).catch((e: Error) => {
        console.warn("[login] upsertUserProfile failed:", e?.message);
      });
    }
    if (typeof loginLat === "number" && typeof loginLng === "number") {
      storage.upsertUserProfile(user.id, { latitude: loginLat, longitude: loginLng }).catch(() => {});
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    const userProfile = await storage.getUserProfile(user.id).catch(() => null);
    const isGhost = userRecord?.ghostMode ?? false;
    const isAvail = !isGhost && (userProfile?.isAvailable ?? false);
    onlineTracker.setOnline(user.id, {
      userType: userRecord?.userType ?? user.userType ?? "biker",
      isAvailable: isAvail,
      ghostMode: isGhost,
      country: userRecord?.country ?? user.country ?? null,
    });

    const { password: _, ...safeUser } = userRecord ?? user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  const userId = req.session?.userId;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Errore durante il logout" });
    }
    if (userId) onlineTracker.setOffline(userId);
    res.clearCookie("connect.sid");
    return res.json({ message: "Logout effettuato" });
  });
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Utente non trovato" });
    }

    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(user.id);
    return res.json({
      ...safeUser,
      profileLatitude: profile?.latitude ?? null,
      profileLongitude: profile?.longitude ?? null,
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/forgot-password", forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Inserisci un'email valida" });
    }

    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ message: "Se l'email è registrata, riceverai un codice di recupero" });
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await storage.deletePasswordResetTokens(user.id);

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(crypto.randomInt(10000000, 100000000));
      try {
        await storage.createPasswordResetToken(user.id, code, expiresAt);
        break;
      } catch (e: any) {
        if (attempt === 4) throw e;
      }
    }

    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (emailSent) {
      console.log(`[PASSWORD RESET] Codice reset inviato a ${user.email}`);
    } else {
      console.warn(`[PASSWORD RESET] Email NON inviata a ${user.email}`);
    }

    return res.json({ message: "Se l'email è registrata, riceverai un codice di recupero" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/reset-password", resetPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ message: "Email, codice e password richiesti" });
    }

    if (!/^\d{8}$/.test(String(code).trim())) {
      return res.status(400).json({ message: "Il codice deve essere composto da 8 cifre" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }

    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(400).json({ message: "Codice non valido o scaduto" });
    }

    if (user.status === "blocked" || user.status === "suspended") {
      return res.status(403).json({ message: "Account sospeso o bloccato" });
    }

    const resetToken = await storage.getPasswordResetTokenByCode(user.id, String(code).trim());
    if (!resetToken) {
      return res.status(400).json({ message: "Codice non valido o già utilizzato" });
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Codice scaduto — richiedi un nuovo codice" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await storage.updateUser(user.id, { password: hashedPassword } as any);
    await storage.markPasswordResetTokenUsedById(resetToken.id);

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    sendPasswordResetConfirmationEmail(user.email, user.nickname).catch((e) =>
      console.warn("[PASSWORD RESET] Confirmation email failed:", e)
    );

    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, passwordReset: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/resend-reset-code", resendResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email richiesta" });
    }

    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ message: "Se l'email è registrata, riceverai un nuovo codice" });
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await storage.deletePasswordResetTokens(user.id);

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(crypto.randomInt(10000000, 100000000));
      try {
        await storage.createPasswordResetToken(user.id, code, expiresAt);
        break;
      } catch (e: any) {
        if (attempt === 4) throw e;
      }
    }

    const emailSent = await sendPasswordResetEmail(user.email, user.nickname, code);
    if (!emailSent) {
      console.warn(`[PASSWORD RESET] Resend: email NON inviata a ${user.email}`);
    }

    return res.json({ message: "Se l'email è registrata, riceverai un nuovo codice" });
  } catch (error) {
    console.error("Resend reset code error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ message: "Email e codice richiesti" });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const verif = await storage.getEmailVerificationToken(token.toUpperCase());
    if (!verif || verif.userId !== user.id) {
      return res.status(400).json({ message: "Codice non valido" });
    }

    if (new Date(verif.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Codice scaduto. Richiedi un nuovo codice." });
    }

    await storage.markUserEmailVerified(user.id);
    await storage.deleteEmailVerificationTokens(user.id);

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });
    const { password: _, ...safeUser } = user;
    return res.json({ ...safeUser, emailVerified: true });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email richiesta" });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email già verificata" });
    }

    await storage.deleteEmailVerificationTokens(user.id);
    const token = crypto.randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await storage.createEmailVerificationToken(user.id, token, expiresAt);
    const emailSent = await sendVerificationEmail(user.email, user.nickname, token);
    if (!emailSent) {
      console.warn(`[EMAIL VERIFICATION] Resend: email NON inviata a ${user.email}`);
    }

    return res.json({ message: "Nuovo codice inviato" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/email-configured", async (_req: Request, res: Response) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const configured = !!(
      (userSetting?.value && passSetting?.value) ||
      (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
    );
    return res.json({ configured });
  } catch {
    return res.json({ configured: false });
  }
});

router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ ok: false });
    await storage.updateUser(userId, { lastLoginAt: new Date() } as any);
    onlineTracker.touch(userId);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

export default router;
