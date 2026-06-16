// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { runMatchingForUser, runProposalMatchingForUser } from "../../../matching-engine";
import { sendSuccess, sendError } from "../../../lib/api-response";
import {
  featureKeyForBikerBucket,
  featureKeyForKind,
  explainMatchForUser,
} from "../../../matching/feedback";

import { requireAuth } from "../../../lib/auth-middleware";

const router = Router();

async function getHalfLifeDays(kind: "generic" | "proposal"): Promise<number | undefined> {
  const key = kind === "proposal"
    ? "match_freshness_halflife_proposal_days"
    : "match_freshness_halflife_generic_days";
  const setting = await storage.getAppSetting(key);
  if (!setting?.value) return undefined;
  const n = Number(setting.value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

router.get("/matches/:id/explain", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const kind = String(req.query.kind ?? "biker") as "biker" | "garage" | "proposal" | "propProfile";

    let featureKey: string | null = null;
    let isSupermatch = false;
    let otherUserId: string | null = null;

    if (kind === "biker") {
      const m = await storage.getBikerBikerMatch(matchId);
      if (!m) return sendError(res, 404, "Match non trovato");
      if (m.biker1Id !== userId && m.biker2Id !== userId) return sendError(res, 403, "Non autorizzato");
      featureKey = featureKeyForBikerBucket(m.motorcycleBrand);
      isSupermatch = !!m.isSupermatch;
      otherUserId = m.biker1Id === userId ? m.biker2Id : m.biker1Id;
    } else if (kind === "garage") {
      const m = await storage.getGarageMatch(matchId);
      if (!m) return sendError(res, 404, "Match non trovato");
      if (m.bikerId !== userId && m.zavorrinaId !== userId) return sendError(res, 403, "Non autorizzato");
      featureKey = featureKeyForKind("garage");
      otherUserId = m.bikerId === userId ? m.zavorrinaId : m.bikerId;
    } else if (kind === "proposal") {
      const m = await storage.getProposalMatch(matchId);
      if (!m) return sendError(res, 404, "Match non trovato");
      if (m.userId1 !== userId && m.userId2 !== userId) return sendError(res, 403, "Non autorizzato");
      featureKey = featureKeyForKind("proposal");
      otherUserId = m.userId1 === userId ? m.userId2 : m.userId1;
    } else if (kind === "propProfile") {
      const m = await storage.getProposalProfileMatch(matchId);
      if (!m) return sendError(res, 404, "Match non trovato");
      if (m.bikerId !== userId && m.zavorrinaId !== userId) return sendError(res, 403, "Non autorizzato");
      featureKey = featureKeyForKind("propProfile");
      otherUserId = m.bikerId === userId ? m.zavorrinaId : m.bikerId;
    }

    if (!featureKey) return sendError(res, 400, "Tipo match non valido");

    const explanation = await explainMatchForUser({ userId, featureKey, isSupermatch });
    return res.json({ ...explanation, otherUserId, kind });
  } catch (error) {
    console.error("Explain match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/trigger-matching", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    runMatchingForUser(userId).catch(err => console.error("Matching error:", err));
    runProposalMatchingForUser(userId).catch(err => console.error("Proposal matching error:", err));
    return sendSuccess(res, undefined, "Matching triggered");
  } catch (error) {
    console.error("Trigger matching error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

/**
 * GET /api/proposals/matches/fresh
 * Restituisce i match (biker-zavorrina) con freshness > 0.6 — usato per
 * badge "Nuovo!" sulle card.
 */
router.get("/matches/fresh", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const halfLifeGeneric = await getHalfLifeDays("generic");
    const halfLifeProposal = await getHalfLifeDays("proposal");
    const [bz, bb, pp, pm] = await Promise.all([
      storage.getFreshMatchesForUser(userId, { halfLifeDays: halfLifeGeneric }),
      storage.getFreshBikerBikerMatchesForUser(userId, { halfLifeDays: halfLifeGeneric }),
      storage.getFreshProposalProfileMatchesForUser(userId, { halfLifeDays: halfLifeProposal }),
      storage.getFreshProposalMatchesForUser(userId, { halfLifeDays: halfLifeProposal }),
    ]);
    const all = [
      ...bz.map((m) => ({ id: m.id, kind: "garage" as const, freshness: m.freshness, createdAt: m.createdAt })),
      ...bb.map((m) => ({ id: m.id, kind: "biker" as const, freshness: m.freshness, createdAt: m.createdAt })),
      ...pp.map((m) => ({ id: m.id, kind: "proposalProfile" as const, freshness: m.freshness, createdAt: m.createdAt })),
      ...pm.map((m) => ({ id: m.id, kind: "proposal" as const, freshness: m.freshness, createdAt: m.createdAt })),
    ];
    return res.json(all);
  } catch (error) {
    console.error("Get fresh matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
