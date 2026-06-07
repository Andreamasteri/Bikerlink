// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendError } from "../../../lib/api-response";

import { requireAuth } from "../../../lib/auth-middleware";

const router = Router();

router.get("/route-affinity-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const list = await storage.getRouteAffinityMatchesForUser(userId);

    const filtered = list.filter((m) => {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      return !blockedIds.has(otherId);
    });

    const otherIds = [...new Set(filtered.map((m) => (m.userAId === userId ? m.userBId : m.userAId)))];
    const allIds = [...new Set(filtered.flatMap((m) => [m.userAId, m.userBId]))];

    const [bulkUsers, _otherProfiles, { enrichTopPlaces }] = await Promise.all([
      storage.getUsersByIds(allIds),
      storage.getUserProfilesByIds(otherIds),
      import("../../../matching/run-route-similarity"),
    ]);
    const userMap = new Map(bulkUsers.map((u) => [u.id, u]));

    const results = await Promise.all(filtered.map(async (m) => {
      const userA = userMap.get(m.userAId);
      const userB = userMap.get(m.userBId);
      const otherUser = m.userAId === userId ? userB : userA;
      if (!otherUser || isSystemAccount(otherUser)) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb shape
      const rawTop = Array.isArray(m.topPlaces) ? (m.topPlaces as any[]) : [];
      const topPlaces = await enrichTopPlaces(rawTop);
      return {
        ...m,
        userANickname: userA?.nickname,
        userBNickname: userB?.nickname,
        otherUserId: otherUser.id,
        otherNickname: otherUser.nickname,
        otherUserType: otherUser.userType,
        topPlaces,
      };
    }));

    return res.json(results.filter(Boolean));
  } catch (error) {
    console.error("Get route affinity matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/route-affinity-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getRouteAffinityMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.userAId !== userId && match.userBId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateRouteAffinityMatch(matchId, { status: "accepted" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept route affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/route-affinity-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getRouteAffinityMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.userAId !== userId && match.userBId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateRouteAffinityMatch(matchId, { status: "rejected" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject route affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/route-affinity-matches/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const ok = await storage.deleteRouteAffinityMatchByUser(matchId, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return res.json({ ok });
  } catch (error) {
    console.error("Delete route affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
