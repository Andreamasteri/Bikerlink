import { sendError } from "../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { sprintResults, users, userMotorcycles } from "@shared/db";
import { createSprintSchema } from "@shared/validators";
import { eq, asc, and, gte, lte, sql } from "drizzle-orm";
import { requireUserId } from "../lib/auth-middleware";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsed = createSprintSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { sprint0to100Ms, maxAccelerationG, maxDecelerationG, maxTiltDeg, routeId } = parsed.data;
    const safeAccelG = maxAccelerationG ?? null;
    const safeDecelG = maxDecelerationG ?? null;
    const safeTiltDeg = maxTiltDeg ?? null;

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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const sprints = await withDbRetry(() => db
      .select()
      .from(sprintResults)
      .where(eq(sprintResults.userId, userId))
      .orderBy(asc(sprintResults.sprint0to100Ms))
      .limit(100));

    return res.json(sprints);
  } catch (error) {
    console.error("Get sprints error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const currentUserId = requireUserId(req, res);
    if (!currentUserId) return;

    const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 100, 1), 500);

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

    // Optional: always include a specific user's row even if outside top-N
    const includeUserId = typeof req.query.includeUserId === "string" && req.query.includeUserId.length > 0
      ? req.query.includeUserId
      : null;

    const leaderboardQuery = withMoto
      .orderBy(asc(bestPerUser.sprint0to100Ms), asc(bestPerUser.createdAt), asc(bestPerUser.id))
      .limit(limit);
    const rows = await withDbRetry(() => leaderboardQuery);

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

    // If includeUserId is set and that user is not already in the results,
    // fetch their row separately and append it with their actual rank.
    if (includeUserId && !leaderboard.some((e) => e.userId === includeUserId)) {
      const focusBaseQuery = db
        .select({
          userId: users.id,
          nickname: users.nickname,
          avatarUrl: users.avatarUrl,
          sprint0to100Ms: bestPerUser.sprint0to100Ms,
          maxAccelerationG: bestPerUser.maxAccelerationG,
          maxTiltDeg: bestPerUser.maxTiltDeg,
          createdAt: bestPerUser.createdAt,
          id: bestPerUser.id,
          motorcycleBrand: userMotorcycles.brand,
          motorcycleModel: userMotorcycles.model,
          motorcycleType: userMotorcycles.motorcycleType,
          displacement: userMotorcycles.displacement,
        })
        .from(bestPerUser)
        .innerJoin(users, eq(users.id, bestPerUser.userId))
        .where(eq(bestPerUser.userId, includeUserId));

      const focusQuery = needsMotoFilter
        ? focusBaseQuery.innerJoin(userMotorcycles, and(...motoConditions))
        : focusBaseQuery.leftJoin(userMotorcycles, and(...motoConditions));
      const focusRows = await withDbRetry(() => focusQuery);

      if (focusRows.length > 0) {
        const fr = focusRows[0];
        // Compute rank for this user
        const [countRow] = await withDbRetry(() => db
          .select({ count: sql<number>`count(*)::int` })
          .from(bestPerUser)
          .where(
            sql`${bestPerUser.sprint0to100Ms} < ${fr.sprint0to100Ms}
              OR (${bestPerUser.sprint0to100Ms} = ${fr.sprint0to100Ms} AND ${bestPerUser.createdAt} < ${fr.createdAt})
              OR (${bestPerUser.sprint0to100Ms} = ${fr.sprint0to100Ms} AND ${bestPerUser.createdAt} = ${fr.createdAt} AND ${bestPerUser.id} < ${fr.id})`
          ));
        const focusRank = (countRow?.count ?? 0) + 1;
        leaderboard.push({
          rank: focusRank,
          userId: fr.userId,
          nickname: fr.nickname,
          avatarUrl: fr.avatarUrl,
          sprint0to100Ms: fr.sprint0to100Ms,
          maxAccelerationG: fr.maxAccelerationG,
          maxTiltDeg: fr.maxTiltDeg,
          createdAt: fr.createdAt,
          motorcycleBrand: fr.motorcycleBrand,
          motorcycleModel: fr.motorcycleModel,
          motorcycleType: fr.motorcycleType,
          displacement: fr.displacement,
          isCurrentUser: fr.userId === currentUserId,
        });
      }
    }

    // Keep response strictly rank-sorted (includeUserId may have appended an out-of-order row)
    if (includeUserId) {
      leaderboard.sort((a, b) => a.rank - b.rank || a.sprint0to100Ms - b.sprint0to100Ms);
    }

    return res.json(leaderboard);
  } catch (error) {
    console.error("Get sprint leaderboard error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/leaderboard/rank/:userId", async (req: Request, res: Response) => {
  try {
    const requesterId = requireUserId(req, res);
    if (!requesterId) return;

    const userId = req.params.userId as string;
    if (!userId) return sendError(res, 400, "userId richiesto");

    const bestPerUser = db
      .selectDistinctOn([sprintResults.userId], {
        userId: sprintResults.userId,
        sprint0to100Ms: sprintResults.sprint0to100Ms,
        createdAt: sprintResults.createdAt,
        id: sprintResults.id,
      })
      .from(sprintResults)
      .orderBy(
        asc(sprintResults.userId),
        asc(sprintResults.sprint0to100Ms),
        asc(sprintResults.createdAt),
        asc(sprintResults.id),
      )
      .as("best_per_user");

    const targetRow = await withDbRetry(() => db
      .select({ sprint0to100Ms: bestPerUser.sprint0to100Ms, createdAt: bestPerUser.createdAt, id: bestPerUser.id })
      .from(bestPerUser)
      .where(eq(bestPerUser.userId, userId!))
      .limit(1));

    if (targetRow.length === 0) {
      return res.json({ rank: null, sprint0to100Ms: null });
    }

    const { sprint0to100Ms: targetMs, createdAt: targetCreatedAt, id: targetId } = targetRow[0];

    const [countRow] = await withDbRetry(() => db
      .select({ count: sql<number>`count(*)::int` })
      .from(bestPerUser)
      .where(
        sql`${bestPerUser.sprint0to100Ms} < ${targetMs}
          OR (${bestPerUser.sprint0to100Ms} = ${targetMs} AND ${bestPerUser.createdAt} < ${targetCreatedAt})
          OR (${bestPerUser.sprint0to100Ms} = ${targetMs} AND ${bestPerUser.createdAt} = ${targetCreatedAt} AND ${bestPerUser.id} < ${targetId})`
      ));

    const rank = (countRow?.count ?? 0) + 1;
    return res.json({ rank, sprint0to100Ms: targetMs });
  } catch (error) {
    console.error("Get sprint rank error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
