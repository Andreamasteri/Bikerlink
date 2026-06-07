// Task #3393 — feed + azioni per i match telemetry-affinity (stile di guida).
// Mirror di matching/routeAffinity.ts.
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendError } from "../../../lib/api-response";
import { requireAuth } from "../../../lib/auth-middleware";
import { styleLabelsFromProfile, MIN_SESSIONS_FOR_EMBED } from "../../../ai/telemetry-style-embedder";

const router = Router();

// Task #3396 — il rider vede il PROPRIO stile di guida calcolato.
// Read-only: espone label + bucket + statistiche chiave da `user_telemetry_profile`.
// Stato "dati insufficienti" quando il profilo non raggiunge la soglia embedding.
router.get("/my-telemetry-style", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const profile = await storage.getUserTelemetryProfile(userId);

    if (!profile) {
      return res.json({
        hasEnoughData: false,
        dataQuality: 0,
        minSessions: MIN_SESSIONS_FOR_EMBED,
        totalSessions: 0,
        labels: [],
        profile: null,
      });
    }

    const hasEnoughData = (profile.dataQuality ?? 0) >= MIN_SESSIONS_FOR_EMBED;
    const labels = hasEnoughData ? styleLabelsFromProfile(profile) : [];

    return res.json({
      hasEnoughData,
      dataQuality: profile.dataQuality ?? 0,
      minSessions: MIN_SESSIONS_FOR_EMBED,
      totalSessions: profile.totalSessions ?? 0,
      labels,
      profile: {
        speedBucket: profile.speedBucket,
        leanBucket: profile.leanBucket,
        durationBucket: profile.durationBucket,
        avgSpeedKmh: profile.avgSpeedKmh,
        p75SpeedKmh: profile.p75SpeedKmh,
        avgLeanAngle: profile.avgLeanAngle,
        maxLeanAvg: profile.maxLeanAvg,
        avgDurationMin: profile.avgDurationMin,
        fractionMorning: profile.fractionMorning,
        fractionEvening: profile.fractionEvening,
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get my telemetry style error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

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
    const ok = await storage.deleteTelemetryAffinityMatchByUser(matchId, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return res.json({ ok });
  } catch (error) {
    console.error("Delete telemetry affinity match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
