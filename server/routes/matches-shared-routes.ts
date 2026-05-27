/**
 * Task #2528 — Endpoint inverso: `GET /api/matches/:id/shared-routes`.
 *
 * Risolve l'id di un match (cerca prima in `route_affinity_matches`, poi in
 * `biker_biker_matches`) per recuperare i due userId coinvolti e restituisce
 * fino a 3 planned route pubbliche/community che hanno geo-overlap tra i due.
 *
 * Score = jaccard celle(routeA, routeB) + bonus se departure window coincide.
 */
import { Router, type Request, type Response } from "express";
import { sendError } from "../lib/api-response";
import { db } from "../db";
import { plannedRoutes, routeAffinityMatches, bikerBikerMatches } from "@shared/db";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { requireUserId } from "../lib/auth-middleware";

const router = Router();

async function resolveMatchUsers(matchId: string): Promise<{ userA: string; userB: string } | null> {
  const [ra] = await db
    .select({ a: routeAffinityMatches.userAId, b: routeAffinityMatches.userBId })
    .from(routeAffinityMatches)
    .where(eq(routeAffinityMatches.id, matchId))
    .limit(1);
  if (ra) return { userA: ra.a, userB: ra.b };

  try {
    const [bb] = await db
      .select({ a: bikerBikerMatches.biker1Id, b: bikerBikerMatches.biker2Id })
      .from(bikerBikerMatches)
      .where(eq(bikerBikerMatches.id, matchId))
      .limit(1);
    if (bb) return { userA: bb.a, userB: bb.b };
  } catch { /* schema mismatch fallback */ }

  return null;
}

router.get("/:id/shared-routes", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;

  try {
    const pair = await resolveMatchUsers(id);
    if (!pair) return sendError(res, 404, "Match non trovato");
    if (userId !== pair.userA && userId !== pair.userB) {
      return sendError(res, 403, "Match non tuo");
    }

    const rows = await db
      .select({
        id: plannedRoutes.id,
        userId: plannedRoutes.userId,
        title: plannedRoutes.title,
        cells: plannedRoutes.geohashCells,
        curvy: plannedRoutes.curvyScoreAvg,
        distanceKm: plannedRoutes.distanceKm,
        durationMinutes: plannedRoutes.durationMinutes,
        departure: plannedRoutes.estimatedDepartureWindow,
        derivedTags: plannedRoutes.derivedTags,
      })
      .from(plannedRoutes)
      .where(and(
        isNotNull(plannedRoutes.analyzedAt),
        inArray(plannedRoutes.visibility, ["public", "community"]),
        or(eq(plannedRoutes.userId, pair.userA), eq(plannedRoutes.userId, pair.userB)),
      ));

    const byUser = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byUser.get(r.userId) ?? [];
      arr.push(r);
      byUser.set(r.userId, arr);
    }
    const aRoutes = byUser.get(pair.userA) ?? [];
    const bRoutes = byUser.get(pair.userB) ?? [];

    type Candidate = {
      a: typeof rows[number];
      b: typeof rows[number];
      score: number;
      commonCells: number;
    };
    const candidates: Candidate[] = [];

    for (const a of aRoutes) {
      const ac = new Set(((a.cells as string[] | null) ?? []));
      if (ac.size === 0) continue;
      for (const b of bRoutes) {
        const bc = ((b.cells as string[] | null) ?? []);
        if (bc.length === 0) continue;
        let common = 0;
        for (const c of bc) if (ac.has(c)) common++;
        const union = ac.size + bc.length - common;
        const jaccard = union > 0 ? common / union : 0;
        let bonus = 0;
        const ad = a.departure as { dow?: number; hour?: number } | null;
        const bd = b.departure as { dow?: number; hour?: number } | null;
        if (ad?.dow != null && bd?.dow != null && ad.dow === bd.dow) bonus += 0.05;
        if (ad?.hour != null && bd?.hour != null && Math.abs(ad.hour - bd.hour) <= 2) bonus += 0.05;
        const score = jaccard + bonus;
        if (score < 0.1) continue;
        candidates.push({ a, b, score, commonCells: common });
      }
    }

    candidates.sort((x, y) => y.score - x.score);
    const top = candidates.slice(0, 3).map((c) => ({
      score: Math.round(c.score * 1000) / 1000,
      commonCells: c.commonCells,
      routes: [
        { id: c.a.id, userId: c.a.userId, title: c.a.title, distanceKm: c.a.distanceKm, durationMinutes: c.a.durationMinutes, derivedTags: c.a.derivedTags },
        { id: c.b.id, userId: c.b.userId, title: c.b.title, distanceKm: c.b.distanceKm, durationMinutes: c.b.durationMinutes, derivedTags: c.b.derivedTags },
      ],
    }));

    return res.json({ matchId: id, count: top.length, suggestions: top });
  } catch (err) {
    console.error("[matches/shared-routes] error:", err);
    return sendError(res, 500, "Errore caricamento giri condivisi");
  }
});

export default router;
