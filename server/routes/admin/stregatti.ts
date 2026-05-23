import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users } from "@shared/db";
import { stregattaSchema } from "@shared/validators";
import { eq, sql } from "drizzle-orm";
import { sendSuccess, sendError } from "../../lib/api-response";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { setMotionEnabled, getMotionStatus } from "../../motion-simulator";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const type = String(req.query.type ?? "tutti");
    const result = await storage.getFakeUserStats(limit, offset, type);
    return res.json(result);
  } catch (error) {
    console.error("Admin get stregatti error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsedSt = stregattaSchema.safeParse(req.body);
    if (!parsedSt.success) return sendError(res, 400, parsedSt.error.issues[0].message);
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio, moto, wishlistDescription, wishlistMotos } = parsedSt.data as any;
    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const fakeSecret = crypto.randomBytes(32).toString("base64url");
    const hashedPassword = await bcrypt.hash(fakeSecret, 10);
    const country = (parsedSt.data as any).country || "IT";
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear || null,
      region: region || null,
      country,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: new Date(),
    });
    return res.status(201).json(user);
  } catch (error) {
    console.error("Admin create stregatto error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/toggle-all", async (req: Request, res: Response) => {
  try {
    const { online } = req.body;
    await db.update(users).set({ 
      lastLoginAt: online ? new Date() : sql`last_login_at` 
    }).where(eq(users.isFake, true));
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore toggle globale");
  }
});

router.delete("/", async (req: Request, res: Response) => {
  try {
    const fakes = await db.select({ id: users.id }).from(users).where(eq(users.isFake, true));
    for (const f of fakes) {
      await storage.deleteUser(f.id);
    }
    return sendSuccess(res, { deleted: fakes.length });
  } catch (error) {
    return sendError(res, 500, "Errore eliminazione globale");
  }
});

router.post("/wake-all", async (_req: Request, res: Response) => {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.isFake, true));
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore wake all");
  }
});

router.post("/distribute-to-clubs", async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore distribuzione");
  }
});

// ── Motion simulator endpoints ────────────────────────────────────────────────

router.get("/motion/status", (_req: Request, res: Response) => {
  try {
    return res.json(getMotionStatus());
  } catch (error) {
    return sendError(res, 500, "Errore lettura stato motion");
  }
});

router.post("/motion/toggle", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' booleano richiesto");
    }
    await setMotionEnabled(enabled);
    return res.json(getMotionStatus());
  } catch (error) {
    console.error("[MOTION] toggle error:", error);
    return sendError(res, 500, "Errore toggle motion");
  }
});

export default router;
