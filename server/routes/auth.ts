import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { registerSchema, loginSchema } from "@shared/schema";
import { storage } from "../storage";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const data = parsed.data;

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
    });

    await storage.createUserProfile({ userId: user.id });

    const emailVerifSetting = await storage.getAppSetting("email_verification_enabled");
    const emailVerificationEnabled = emailVerifSetting?.value === "true";

    if (emailVerificationEnabled) {
      const token = crypto.randomBytes(3).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await storage.createEmailVerificationToken(user.id, token, expiresAt);
      console.log(`[EMAIL VERIFICATION] User: ${user.email}, Token: ${token}`);
      const { password: _, ...safeUser } = user;
      return res.status(201).json({ ...safeUser, requiresEmailVerification: true });
    }

    req.session.userId = user.id;

    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
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

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    await storage.updateUser(user.id, { lastLoginAt: new Date() } as any);

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
    return res.json(safeUser);
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/forgot-password", async (req: Request, res: Response) => {
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

    console.log(`\n========== PASSWORD RESET ==========`);
    console.log(`User: ${user.nickname} (${user.email})`);
    console.log(`Token: ${token}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log(`====================================\n`);

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
    console.log(`[EMAIL VERIFICATION] User: ${user.email}, Token: ${token}`);

    return res.json({ message: "Nuovo codice inviato" });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
