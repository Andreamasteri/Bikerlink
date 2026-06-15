// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { haversineKm } from "../../../geo";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { allLimited, matchEnrichmentSemaphore, SemaphoreQueueFullError } from "../../../lib/concurrency";
import { trackAbEvent } from "../../../matching/ab";
import {
  recordMatchFeedbackFireAndForget,
  featureKeyForBikerBucket,
  getUserMatchProfile,
  scoreMatchForUser,
} from "../../../matching/feedback";

import { requireAuth } from "../../../lib/auth-middleware";

const router = Router();

async function getCoordinatesMaxAgeSec(): Promise<number> {
  const setting = await storage.getAppSetting("coordinates_max_age_seconds");
  const val = setting?.value ? parseInt(setting.value, 10) : NaN;
  return isNaN(val) ? 300 : val;
}

async function getHalfLifeDays(kind: "generic" | "proposal"): Promise<number | undefined> {
  const key = kind === "proposal"
    ? "match_freshness_halflife_proposal_days"
    : "match_freshness_halflife_generic_days";
  const setting = await storage.getAppSetting(key);
  if (!setting?.value) return undefined;
  const n = Number(setting.value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isCoordOld(updatedAt: Date | null | undefined, maxAgeSec: number): boolean {
  if (!updatedAt) return true;
  return (Date.now() - new Date(updatedAt).getTime()) > maxAgeSec * 1000;
}

router.get("/biker-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    await matchEnrichmentSemaphore.run(async () => {
      try {
        const userId = req.session.userId as string;
        const blockedIds = new Set(await storage.getBlockedUserIds(userId));
        const halfLifeDays = await getHalfLifeDays("generic");
        const bikerMatchesList = await storage.getBikerBikerMatchesForUser(userId, { halfLifeDays });

        const countrySetting = await storage.getAppSetting("matching_countries");
        let allowedCountries: string[] = [];
        try { allowedCountries = countrySetting?.value ? JSON.parse(countrySetting.value) : []; } catch { allowedCountries = []; }

        const myProfile = await storage.getUserProfile(userId);
        const myLat = myProfile?.latitude ?? null;
        const myLng = myProfile?.longitude ?? null;
        const myCoordUpdatedAt = myProfile?.coordinatesUpdatedAt ?? null;
        const maxAgeSec = await getCoordinatesMaxAgeSec();
        const offlineRandomSetting = await storage.getAppSetting("offline_position_randomize_default");
        const globalOfflineRandomize = offlineRandomSetting?.value !== "false";

        const filteredMatches = bikerMatchesList.filter((match) => {
          const otherId = match.biker1Id === userId ? match.biker2Id : match.biker1Id;
          return !blockedIds.has(otherId);
        });

        const allBikerIds = [...new Set(filteredMatches.flatMap(m => [m.biker1Id, m.biker2Id]))];
        const otherBikerIds = [...new Set(filteredMatches.map(m => m.biker1Id === userId ? m.biker2Id : m.biker1Id))];

        const [bulkBikers, bulkBikerProfiles] = await Promise.all([
          storage.getUsersByIds(allBikerIds),
          storage.getUserProfilesByIds(otherBikerIds),
        ]);

        const bikerMap = new Map(bulkBikers.map(u => [u.id, u]));
        const bikerProfileMap = new Map(bulkBikerProfiles.map(p => [p.userId, p]));

        const results = await allLimited(
          filteredMatches.map((match) => async () => {
            const biker1 = bikerMap.get(match.biker1Id);
            const biker2 = bikerMap.get(match.biker2Id);

            const isBiker1 = match.biker1Id === userId;
            const otherBiker = isBiker1 ? biker2 : biker1;

            if (isSystemAccount(otherBiker ?? {})) return null;

            if (allowedCountries.length > 0 && (!otherBiker?.country || !allowedCountries.includes(otherBiker.country))) {
              return null;
            }

            const otherProfile = otherBiker?.id ? bikerProfileMap.get(otherBiker.id) : undefined;
            const otherHidden = !!otherProfile?.hideFromMap;
            const otherCoordUpdatedAt: Date | null = otherProfile?.coordinatesUpdatedAt ?? null;
            const myOld = isCoordOld(myCoordUpdatedAt, maxAgeSec);
            const otherOld = isCoordOld(otherCoordUpdatedAt, maxAgeSec);

            let otherLat: number | null = null;
            let otherLng: number | null = null;
            if (!otherHidden) {
              if (otherOld) {
                const useOffline = globalOfflineRandomize && otherProfile?.offlinePositionRandomize !== false;
                const hasFuzzed = otherProfile?.lastOfflineLat != null && otherProfile?.lastOfflineLng != null;
                if (useOffline && hasFuzzed) {
                  otherLat = otherProfile!.lastOfflineLat!;
                  otherLng = otherProfile!.lastOfflineLng!;
                }
              } else {
                otherLat = otherProfile?.latitude ?? null;
                otherLng = otherProfile?.longitude ?? null;
              }
            }

            let distanceKm: number | null = null;
            let distanceFlag: "ok" | "old_psn" | "no_psn" = "no_psn";
            if (myLat != null && myLng != null && otherProfile?.latitude != null && otherProfile?.longitude != null) {
              if (myOld || otherOld) {
                distanceFlag = "old_psn";
                distanceKm = null;
              } else {
                distanceKm = Math.round(haversineKm(myLat, myLng, otherProfile.latitude, otherProfile.longitude) * 10) / 10;
                distanceFlag = "ok";
              }
            }

            return {
              ...match,
              biker1Nickname: biker1?.nickname,
              biker2Nickname: biker2?.nickname,
              biker1Type: biker1?.userType,
              biker2Type: biker2?.userType,
              otherLat,
              otherLng,
              distanceKm,
              distanceFlag,
              myLat,
              myLng,
            };
          })
        );

        const filtered = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];

        // Personalized re-ranking: apply per-user feature weights (cold start
        // <10 feedback → neutral 1.0). Falls back silently on any error.
        try {
          const profile = await getUserMatchProfile(userId);
          const weights = (profile?.featureWeights as Record<string, number> | null) ?? null;
          const feedbackCount = profile?.feedbackCount ?? 0;
          const scored = filtered.map((m) => ({
            m,
            score: scoreMatchForUser({
              weights,
              feedbackCount,
              featureKey: featureKeyForBikerBucket(m.motorcycleBrand),
              isSupermatch: !!m.isSupermatch,
              recencyBoost: m.createdAt
                ? Math.max(0, 1 - (Date.now() - new Date(m.createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
                : 0,
            }),
          }));
          scored.sort((a, b) => b.score - a.score);
          return res.json(scored.map((s) => ({ ...s.m, _personalScore: Math.round(s.score * 1000) / 1000 })));
        } catch (rerankErr) {
          console.warn("[biker-matches] personal rerank skipped:", rerankErr);
          return res.json(filtered);
        }
      } catch (error) {
        console.error("Get biker matches error:", error);
        return sendError(res, 500, "Errore interno del server");
      }
    });
  } catch (err) {
    if (err instanceof SemaphoreQueueFullError) {
      res.setHeader("Retry-After", "3");
      return sendError(res, 503, "Server occupato, riprova più tardi");
    }
    console.error("Get biker matches outer error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/biker-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.biker1Id !== userId && match.biker2Id !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "accepted" });
    if (match.motorcycleBrand === "musica") {
      void trackAbEvent(userId, "bio_affinity_weight_v1", "match_accepted", { matchId });
    }
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.biker1Id === userId ? match.biker2Id : match.biker1Id,
      matchKind: "biker",
      featureKey: featureKeyForBikerBucket(match.motorcycleBrand),
      action: "accept",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Accept biker match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/biker-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    const match = await storage.getBikerBikerMatch(matchId);
    if (!match) return sendError(res, 404, "Match non trovato");
    if (match.biker1Id !== userId && match.biker2Id !== userId) return sendError(res, 403, "Non autorizzato");
    if (match.status !== "new") return sendError(res, 400, "Match già gestito");
    const updated = await storage.updateBikerBikerMatch(matchId, { status: "rejected" });
    if (match.motorcycleBrand === "musica") {
      void trackAbEvent(userId, "bio_affinity_weight_v1", "match_rejected", { matchId });
    }
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.biker1Id === userId ? match.biker2Id : match.biker1Id,
      matchKind: "biker",
      featureKey: featureKeyForBikerBucket(match.motorcycleBrand),
      action: "reject",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Reject biker match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/biker-matches/archived", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matches = await storage.getBikerBikerMatchesForUser(userId, { includeArchived: true });
    const enriched = await allLimited(
      matches.map((match) => async () => {
        const other = await storage.getUser(
          match.biker1Id === userId ? match.biker2Id : match.biker1Id,
        );
        if (!other || isSystemAccount(other)) return null;
        return {
          ...match,
          otherUserId: other.id,
          otherNickname: other.nickname,
          otherType: other.userType,
        };
      }),
    );
    return res.json(enriched.filter(Boolean));
  } catch (error) {
    console.error("Get archived biker matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/biker-matches/:id/reactivate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const ok = await storage.reactivateBikerBikerMatch(id, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { reactivated: true });
  } catch (error) {
    console.error("Reactivate biker match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
