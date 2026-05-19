import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sprintResults, users, userMotorcycles } from "@shared/schema";
import { eq, asc, and, gte, lte, sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { sprint0to100Ms, maxAccelerationG, maxDecelerationG, maxTiltDeg, routeId } = req.body;

    if (typeof sprint0to100Ms !== "number" || !isFinite(sprint0to100Ms) || sprint0to100Ms <= 0) {
      return res.status(400).json({ message: "Tempo sprint non valido" });
    }
    // Preserve null to denote "sensor not active" — only store a value when it's a valid finite number.
    const safeAccelG = typeof maxAccelerationG === "number" && isFinite(maxAccelerationG) ? maxAccelerationG : null;
    const safeDecelG = typeof maxDecelerationG === "number" && isFinite(maxDecelerationG) ? maxDecelerationG : null;
    const safeTiltDeg = typeof maxTiltDeg === "number" && isFinite(maxTiltDeg) ? maxTiltDeg : null;

    const [result] = await db
      .insert(sprintResults)
      .values({
        userId,
        routeId: typeof routeId === "string" && routeId.length > 0 ? routeId : null,
        sprint0to100Ms: Math.round(sprint0to100Ms),
        maxAccelerationG: safeAccelG,
        maxDecelerationG: safeDecelG,
        maxTiltDeg: safeTiltDeg,
      })
      .returning();

    return res.status(201).json(result);
  } catch (error) {
    console.error("Save sprint error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const sprints = await db
      .select()
      .from(sprintResults)
      .where(eq(sprintResults.userId, userId))
      .orderBy(asc(sprintResults.sprint0to100Ms))
      .limit(100);

    return res.json(sprints);
  } catch (error) {
    console.error("Get sprints error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const currentUserId = requireAuth(req, res);
    if (!currentUserId) return;

    const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 100, 1), 200);

    const motorcycleType = typeof req.query.motorcycleType === "string" && req.query.motorcycleType.length > 0
      ? req.query.motorcycleType
      : null;
    const minDispRaw = parseInt(String(req.query.minDisplacement ?? ""), 10);
    const maxDispRaw = parseInt(String(req.query.maxDisplacement ?? ""), 10);
    const minDisplacement = isFinite(minDispRaw) ? minDispRaw : null;
    const maxDisplacement = isFinite(maxDispRaw) ? maxDispRaw : null;

    const needsMotoFilter = motorcycleType !== null || minDisplacement !== null || maxDisplacement !== null;

    // Pick exactly one best row per user with a deterministic tie-break
    // (earliest createdAt, then lowest id). This avoids LIMIT consuming
    // slots with duplicate rows when a rider has tied best times.
    const bestPerUser = db
      .selectDistinctOn([sprintResults.userId], {
        id: sprintResults.id,
        userId: sprintResults.userId,
        sprint0to100Ms: sprintResults.sprint0to100Ms,
        maxAccelerationG: sprintResults.maxAccelerationG,
        maxTiltDeg: sprintResults.maxTiltDeg,
        createdAt: sprintResults.createdAt,
      })
      .from(sprintResults)
      .orderBy(
        asc(sprintResults.userId),
        asc(sprintResults.sprint0to100Ms),
        asc(sprintResults.createdAt),
        asc(sprintResults.id),
      )
      .as("best_per_user");

    const motoConditions = [eq(userMotorcycles.userId, users.id), eq(userMotorcycles.isDefault, true)];
    if (motorcycleType) motoConditions.push(eq(userMotorcycles.motorcycleType, motorcycleType));
    if (minDisplacement !== null) motoConditions.push(gte(userMotorcycles.displacement, minDisplacement));
    if (maxDisplacement !== null) motoConditions.push(lte(userMotorcycles.displacement, maxDisplacement));

    const baseQuery = db
      .select({
        userId: users.id,
        nickname: users.nickname,
        avatarUrl: users.avatarUrl,
        sprint0to100Ms: bestPerUser.sprint0to100Ms,
        maxAccelerationG: bestPerUser.maxAccelerationG,
        maxTiltDeg: bestPerUser.maxTiltDeg,
        createdAt: bestPerUser.createdAt,
        motorcycleBrand: userMotorcycles.brand,
        motorcycleModel: userMotorcycles.model,
        motorcycleType: userMotorcycles.motorcycleType,
        displacement: userMotorcycles.displacement,
      })
      .from(bestPerUser)
      .innerJoin(users, eq(users.id, bestPerUser.userId));

    const withMoto = needsMotoFilter
      ? baseQuery.innerJoin(userMotorcycles, and(...motoConditions))
      : baseQuery.leftJoin(userMotorcycles, and(...motoConditions));

    const rows = await withMoto
      .orderBy(asc(bestPerUser.sprint0to100Ms), asc(bestPerUser.createdAt))
      .limit(limit);

    const leaderboard = rows.map((r, idx) => ({
      rank: idx + 1,
      userId: r.userId,
      nickname: r.nickname,
      avatarUrl: r.avatarUrl,
      sprint0to100Ms: r.sprint0to100Ms,
      maxAccelerationG: r.maxAccelerationG,
      maxTiltDeg: r.maxTiltDeg,
      createdAt: r.createdAt,
      motorcycleBrand: r.motorcycleBrand,
      motorcycleModel: r.motorcycleModel,
      motorcycleType: r.motorcycleType,
      displacement: r.displacement,
      isCurrentUser: r.userId === currentUserId,
    }));

    return res.json(leaderboard);
  } catch (error) {
    console.error("Get sprint leaderboard error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
