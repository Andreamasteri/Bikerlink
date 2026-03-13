import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { registerSchema, loginSchema } from "@shared/schema";
import { storage } from "../storage";
import { sendVerificationEmail } from "../email";

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
        return res.status(403).json({ message: "Devi avere almeno 18 anni per registrarti" });
      }
    }

    const existingEmail = await storage.getUserByEmail(data.email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email già registrata" });
    }

    const existingNickname = await storage.getUserByNickname(data.nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname già in uso" });
    }

    if (data.invitationCode) {
      const invitation = await storage.getInvitationCode(data.invitationCode);
      if (!invitation || !invitation.isActive || invitation.currentUses >= invitation.maxUses) {
        return res.status(400).json({ message: "Codice invito non valido" });
      }
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Codice invito scaduto" });
      }
      await storage.incrementInvitationCodeUses(invitation.id);
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
      eulaAccepted: data.eulaAccepted,
      invitationCode: data.invitationCode,
      isPrimal,
    });

    await storage.createUserProfile({ userId: user.id });

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
      return res.status(201).json({ ...safeUser, requiresEmailVerification: true });
    }

    if (isPrimal) {
      await storage.markUserEmailVerified(user.id);
    }

    req.session.userId = user.id;

    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
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

    const { identifier, password } = parsed.data;

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

    await storage.updateUser(user.id, { lastLoginAt: new Date() } as any);
    await storage.updateUserProfile(user.id, { isAvailable: true }).catch(() => {});

    req.session.userId = user.id;

    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Errore durante il logout" });
    }
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
      return res.json({ message: "Se l'email è registrata, riceverai un link di recupero" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await storage.createPasswordResetToken(user.id, token, expiresAt);

    console.log(`[PASSWORD RESET] Richiesta reset per ${user.email}`);

    return res.json({ message: "Se l'email è registrata, riceverai un link di recupero" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token e password richiesti" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }

    const resetToken = await storage.getPasswordResetToken(token);
    if (!resetToken) {
      return res.status(400).json({ message: "Token non valido o già utilizzato" });
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Token scaduto" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await storage.updateUser(resetToken.userId, { password: hashedPassword } as any);
    await storage.markPasswordResetTokenUsed(token);

    return res.json({ message: "Password aggiornata con successo" });
  } catch (error) {
    console.error("Reset password error:", error);
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

export default router;
