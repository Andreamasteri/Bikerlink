/**
 * users.next.ts — file successore di users.ts
 *
 * Quando users.ts supererà la soglia delle 800 righe, spostare qui
 * i nuovi blocchi (handler, helper, schema) invece di aggiungerne altri
 * all'originale.
 *
 * Convenzione di utilizzo:
 *   - Aggiungere qui SOLO codice nuovo (non spostare codice esistente da users.ts).
 *   - Esportare dal file e importare in admin.ts (o nel router principale) quanto necessario.
 *   - Aggiornare questo commento man mano che il file cresce.
 *
 * Stato attuale di users.ts al momento della creazione di questo file: 729 righe.
 *
 * Contenuto attuale:
 *   - POST / — Creazione manuale utente reale da parte dell'admin (Task #2836)
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendError } from "../../lib/api-response";

const router = Router();

const adminCreateUserSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio").max(30, "Nickname troppo lungo").transform((s) => s.trim()),
  email: z.string().email("Email non valida").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  userType: z.enum(["biker", "zavorrina", "coppia"], {
    error: "Tipo utente non valido (biker / zavorrina / coppia)",
  }),
  sex: z.enum(["M", "F"]).optional().nullable(),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear()).optional().nullable(),
  region: z.string().optional().nullable().transform((s) => s?.trim() || null),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { nickname, email, password, userType, sex, birthYear, region } = parsed.data;

    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }

    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return sendError(res, 409, "Email già registrata");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      birthYear: birthYear ?? null,
      region: region || null,
      country: "IT",
      isFake: false,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
    });

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_user_manual",
      targetType: "user",
      targetId: newUser.id,
      details: `Utente creato manualmente dall'admin: ${nickname} (${email})`,
    });

    const { password: _pw, ...safeUser } = newUser;
    return res.status(201).json(safeUser);
  } catch (err) {
    console.error("[admin] create user error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
