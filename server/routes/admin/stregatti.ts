import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users } from "@shared/db";
import { stregattaSchema } from "@shared/validators";
import { eq, sql, and } from "drizzle-orm";
import { sendSuccess, sendError } from "../../lib/api-response";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { setMotionEnabled, getMotionStatus, getPositions, getBoundingBox, setBoundingBox, getUserSpeedMap, removeUserFromSimulator, clearSimulatorUsers, addUserToSimulator } from "../../motion-simulator";
import { systemAccountConditions } from "../../lib/system-account-filter";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const type = String(req.query.type ?? "tutti");
    const result = await storage.getFakeUserStats(limit, offset, type);
    return res.json(result);
  } catch (_error) {
    console.error("Admin get stregatti error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsedSt = stregattaSchema.safeParse(req.body);
    if (!parsedSt.success) return sendError(res, 400, parsedSt.error.issues[0].message);
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio: _bio, moto: _moto, wishlistDescription: _wishlistDescription, wishlistMotos: _wishlistMotos, country: countryField } = parsedSt.data;
    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail && !existingEmail.isFake) {
      return sendError(res, 409, "Questo account esiste già come utente reale");
    }
    const fakeSecret = crypto.randomBytes(32).toString("base64url");
    const hashedPassword = await bcrypt.hash(fakeSecret, 10);
    const country = countryField || "IT";
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear != null ? Number(birthYear) : null,
      region: region || null,
      country,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: new Date(),
    });
    addUserToSimulator(user.id, user.nickname, 42, 12);
    return res.status(201).json(user);
  } catch (_error) {
    console.error("Admin create stregatto error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/toggle-all", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    await storage.upsertAppSetting("fake_users_enabled", enabled ? "true" : "false");
    await db.update(users).set({ 
      lastLoginAt: enabled ? new Date() : sql`last_login_at` 
    }).where(eq(users.isFake, true));
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore toggle globale");
  }
});

router.delete("/", async (_req: Request, res: Response) => {
  try {
    const realUsersMismarked = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE '%@fakeuser.bikerlink.it'
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
    `);
    type CntRow = { cnt: string };
    const mismarkedCount = parseInt((realUsersMismarked.rows[0] as CntRow)?.cnt ?? "0", 10);
    if (mismarkedCount > 0) {
      console.error(`[stregatti-delete] BLOCKED: ${mismarkedCount} real user(s) incorrectly marked as isFake=true would be deleted. Run /api/admin/users/fix-isfake first.`);
      return sendError(res, 409, `Impossibile eliminare: ${mismarkedCount} utenti reali risultano erroneamente marcati come fake. Esegui prima il fix "is_fake" (/api/admin/users/fix-isfake) e riprova.`);
    }
    const deleteCondition = and(eq(users.isFake, true), ...systemAccountConditions(users));
    const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(deleteCondition);
    const deleted = countResult[0]?.count ?? 0;
    await db.delete(users).where(deleteCondition);
    clearSimulatorUsers();
    return sendSuccess(res, { deleted });
  } catch (_error) {
    console.error("Admin delete all stregatti error:", _error);
    return sendError(res, 500, "Errore eliminazione globale: vincolo dati o errore interno");
  }
});

router.post("/wake-all", async (_req: Request, res: Response) => {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.isFake, true));
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore wake all");
  }
});

router.post("/distribute-to-clubs", async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore distribuzione");
  }
});

// ── Motion simulator endpoints ────────────────────────────────────────────────

router.get("/motion/positions", (_req: Request, res: Response) => {
  try {
    return res.json(getPositions());
  } catch (_error) {
    return sendError(res, 500, "Errore lettura posizioni");
  }
});

router.get("/motion/speeds", (_req: Request, res: Response) => {
  try {
    const speedMap = getUserSpeedMap();
    const payload = Array.from(speedMap.entries()).map(([userId, data]) => ({
      userId,
      currentSpeedKph: data.currentSpeedKph,
      speedProfile: data.speedProfile,
    }));
    return res.json(payload);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura velocità");
  }
});

router.get("/motion/status", (_req: Request, res: Response) => {
  try {
    return res.json(getMotionStatus());
  } catch (_error) {
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
  } catch (_error) {
    console.error("[MOTION] toggle error:", _error);
    return sendError(res, 500, "Errore toggle motion");
  }
});

router.get("/motion/bbox", (_req: Request, res: Response) => {
  try {
    return res.json(getBoundingBox());
  } catch (_error) {
    return sendError(res, 500, "Errore lettura bounding box");
  }
});

router.put("/motion/bbox", async (req: Request, res: Response) => {
  try {
    const { latMin, latMax, lngMin, lngMax, enabled } = req.body;
    const patch: Record<string, unknown> = {};
    if (typeof latMin === "number") patch.latMin = latMin;
    if (typeof latMax === "number") patch.latMax = latMax;
    if (typeof lngMin === "number") patch.lngMin = lngMin;
    if (typeof lngMax === "number") patch.lngMax = lngMax;
    if (typeof enabled === "boolean") patch.enabled = enabled;
    await setBoundingBox(patch);
    return res.json(getBoundingBox());
  } catch (_error) {
    console.error("[MOTION] bbox update error:", _error);
    return sendError(res, 500, "Errore aggiornamento bounding box");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const user = await storage.getUser(id);
    if (!user) return sendError(res, 404, "Utente non trovato");
    if (!user.isFake) return sendError(res, 403, "Non è uno stregatto");
    await storage.deleteUser(id);
    removeUserFromSimulator(id);
    return sendSuccess(res, { deleted: id });
  } catch (_error) {
    console.error("Admin delete stregatto error:", _error);
    return sendError(res, 500, "Errore eliminazione stregatto");
  }
});

export default router;
