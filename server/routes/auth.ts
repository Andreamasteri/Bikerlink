import { Router } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { registerSchema, loginSchema } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { authRateLimit, checkAccountLockout, recordFailedLogin, clearLoginAttempts } from "../middleware/security";

export const authRouter = Router();

authRouter.post("/register", authRateLimit, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }

    const { email, phone, password, nickname, sex, birthYear, region, userType, coupleSexConfig, eulaAccepted, invitationCode } = parsed.data;

    if (!eulaAccepted) {
      return res.status(400).json({ message: "Devi accettare i termini e le condizioni" });
    }

    if (invitationCode && invitationCode.trim()) {
      const validation = await storage.validateInvitationCode(invitationCode.trim());
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }
    }

    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email già registrata" });
    }

    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname già in uso" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (invitationCode && invitationCode.trim()) {
      await storage.useInvitationCode(invitationCode.trim());
    }

    const user = await storage.createUser({
      email,
      phone,
      passwordHash,
      nickname,
      sex,
      birthYear,
      region,
      userType,
      coupleSexConfig,
      eulaAccepted,
      invitationCode: invitationCode?.trim() || undefined,
    });

    req.session.userId = user.id;

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ user: safeUser });
  } catch (err: any) {
    console.error("Errore registrazione:", err);
    res.status(500).json({ message: "Errore durante la registrazione" });
  }
});

authRouter.post("/login", authRateLimit, checkAccountLockout, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi" });
    }

    const { email, password } = parsed.data;
    const user = await storage.getUserByEmail(email);
    if (!user) {
      recordFailedLogin(req);
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ message: "Account bloccato. Contatta l'amministratore." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedLogin(req);
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    if (user.status === "suspended" && user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      return res.status(403).json({ message: `Account sospeso fino al ${new Date(user.suspendedUntil).toLocaleDateString("it-IT")}` });
    }

    if (user.status === "suspended") {
      await storage.updateUser(user.id, { status: "active", suspendedUntil: null });
    }

    clearLoginAttempts(req);

    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) {
        console.error("Errore salvataggio sessione:", err);
        return res.status(500).json({ message: "Errore durante il login" });
      }
      const { passwordHash: _, ...safeUser } = user;
      res.json({ user: safeUser });
    });
  } catch (err: any) {
    console.error("Errore login:", err);
    res.status(500).json({ message: "Errore durante il login" });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: "Logout effettuato" });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { passwordHash: _, ...safeUser } = user;
  const profile = await storage.getUserProfile(user.id);
  res.json({ user: safeUser, profile });
});

authRouter.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email obbligatoria" });

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.json({ message: "Se l'email è registrata, riceverai un codice di recupero" });
    }

    await storage.createVerificationCode(email, "password_reset");
    res.json({ message: "Se l'email è registrata, riceverai un codice di recupero" });
  } catch (err) {
    console.error("Errore forgot-password:", err);
    res.status(500).json({ message: "Errore durante il recupero password" });
  }
});

authRouter.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Dati mancanti" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "La password deve avere almeno 6 caratteri" });
    }

    const valid = await storage.verifyCode(email, code, "password_reset");
    if (!valid) {
      return res.status(400).json({ message: "Codice non valido o scaduto" });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await storage.updateUser(user.id, { passwordHash });

    res.json({ message: "Password aggiornata con successo" });
  } catch (err) {
    console.error("Errore reset-password:", err);
    res.status(500).json({ message: "Errore durante il reset password" });
  }
});

authRouter.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Dati mancanti" });

    const valid = await storage.verifyCode(email, code, "email");
    if (!valid) return res.status(400).json({ message: "Codice non valido o scaduto" });

    res.json({ message: "Email verificata con successo" });
  } catch (err) {
    res.status(500).json({ message: "Errore durante la verifica" });
  }
});

authRouter.post("/verify-phone", async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ message: "Dati mancanti" });

    const valid = await storage.verifyCode(phone, code, "phone");
    if (!valid) return res.status(400).json({ message: "Codice non valido o scaduto" });

    res.json({ message: "Telefono verificato con successo" });
  } catch (err) {
    res.status(500).json({ message: "Errore durante la verifica" });
  }
});

authRouter.get("/eula", async (_req, res) => {
  try {
    const eulaText = await storage.getSetting("eula_text");
    res.json({ text: eulaText || "" });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento EULA" });
  }
});
