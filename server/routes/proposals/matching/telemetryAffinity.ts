// Task #3393 — feed + azioni per i match telemetry-affinity (stile di guida).
// Mirror di matching/routeAffinity.ts.
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendError } from "../../../lib/api-response";
import { requireAuth } from "../../../lib/auth-middleware";

const router = Router();

router.get("/telemetry-affinity-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const blockedIds = new Set(await storage.getBlockedUserIds(userId));
    const list = await storage.getTelemetryAffinityMatchesForUser(userId);

    const filtered = list.filter((m) => {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      return !blockedIds.has(otherId);
    });

    const allIds = [...new Set(filtered.flatMap((m) => [m.userAId, m.userBId]))];
    const bulkUsers = await storage.getUsersByIds(allIds);
    const userMap = new Map(bulkUsers.map((u) => [u.id, u]));

    const results = filtered.map((m) => {
      const userA = userMap.get(m.userAId);
      const userB = userMap.get(m.userBId);
      const otherUser = m.userAId === userId ? userB : userA;
      if (!otherUser || isSystemAccount(otherUser)) return null;
      return {
        ...m,
        userANickname: userA?.nickname,
        userBNickname: userB?.nickname,
        otherUserId: otherUser.id,
        otherNickname: otherUser.nickname,
        otherUserType: otherUser.userType,
      };
    });

    return res.json(results.filter(Boolean));
  } catch (error) {
    console.error("Get telemetry affinity matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/telemetry-affinity-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getTelemetryAffinityMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.userAId !== userId && match.userBId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateTelemetryAffinityMatch(matchId, { status: "accepted" });
    return res.json(updated);
  } catch (error) {
    console.error("Accept telemetry affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/telemetry-affinity-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getTelemetryAffinityMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.userAId !== userId && match.userBId !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateTelemetryAffinityMatch(matchId, { status: "rejected" });
    return res.json(updated);
  } catch (error) {
    console.error("Reject telemetry affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/telemetry-affinity-matches/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getTelemetryAffinityMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.userAId !== userId && match.userBId !== userId) return sendError(res, 403, "Non autorizzato");
    const ok = await storage.deleteTelemetryAffinityMatch(matchId);
    return res.json({ ok });
  } catch (error) {
    console.error("Delete telemetry affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
