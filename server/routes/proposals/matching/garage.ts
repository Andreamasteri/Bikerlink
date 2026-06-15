// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { haversineKm } from "../../../geo";
import { isSystemAccount } from "../../../lib/system-account-filter";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { allLimited, matchEnrichmentSemaphore, SemaphoreQueueFullError } from "../../../lib/concurrency";
import {
  recordMatchFeedbackFireAndForget,
  featureKeyForKind,
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

router.get("/garage-matches", requireAuth, async (req: Request, res: Response) => {
  try {
    await matchEnrichmentSemaphore.run(async () => {
      try {
        const userId = req.session.userId as string;
        const blockedIds = new Set(await storage.getBlockedUserIds(userId));
        const halfLifeDays = await getHalfLifeDays("generic");
        const garageMatches = await storage.getMatchesForUser(userId, { halfLifeDays });

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

        const filteredMatches = garageMatches.filter((match) => {
          const otherId = match.bikerId === userId ? match.zavarrinaId : match.bikerId;
          return !blockedIds.has(otherId);
        });

        const allUserIds = [...new Set(filteredMatches.flatMap(m => [m.bikerId, m.zavarrinaId]))];
        const otherUserIds = [...new Set(filteredMatches.map(m => m.bikerId === userId ? m.zavarrinaId : m.bikerId))];

        const [bulkUsers, bulkProfiles] = await Promise.all([
          storage.getUsersByIds(allUserIds),
          storage.getUserProfilesByIds(otherUserIds),
        ]);

        const userMap = new Map(bulkUsers.map(u => [u.id, u]));
        const profileMap = new Map(bulkProfiles.map(p => [p.userId, p]));

        const results = await allLimited(
          filteredMatches.map((match) => async () => {
            const biker = userMap.get(match.bikerId);
            const zavorrina = userMap.get(match.zavarrinaId);
            const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
            const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);

            const isBiker = match.bikerId === userId;
            const otherUser = isBiker ? zavorrina : biker;

            if (isSystemAccount(otherUser ?? {})) return null;

            if (allowedCountries.length > 0 && (!otherUser?.country || !allowedCountries.includes(otherUser.country))) {
              return null;
            }

            const otherProfile = otherUser?.id ? profileMap.get(otherUser.id) : undefined;
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
              isSupermatch: match.isSupermatch ?? false,
              bikerNickname: biker?.nickname,
              bikerType: biker?.userType,
              zavarrinaNickname: zavorrina?.nickname,
              zavarrinaType: zavorrina?.userType,
              bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model, motorcycleType: bikerMoto.motorcycleType } : null,
              wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model, motorcycleType: wishlistMoto.motorcycleType } : null,
              otherLat,
              otherLng,
              distanceKm,
              distanceFlag,
              myLat,
              myLng,
            };
          })
        );

        const enriched = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];

        const bestByUser = new Map<string, typeof enriched[number]>();
        for (const m of enriched) {
          const isBiker = m.bikerId === userId;
          const otherUserId = isBiker ? m.zavarrinaId : m.bikerId;
          const existing = bestByUser.get(otherUserId);
          if (!existing) {
            bestByUser.set(otherUserId, m);
          } else {
            const mIsSuper = m.isSupermatch;
            const exIsSuper = existing.isSupermatch;
            if (mIsSuper && !exIsSuper) {
              bestByUser.set(otherUserId, m);
            } else if (mIsSuper === exIsSuper) {
              const mTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
              const exTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
              if (mTime > exTime) bestByUser.set(otherUserId, m);
            }
          }
        }

        const bestList = [...bestByUser.values()];

        // Personalized re-ranking for garage matches.
        try {
          const profile = await getUserMatchProfile(userId);
          const weights = (profile?.featureWeights as Record<string, number> | null) ?? null;
          const feedbackCount = profile?.feedbackCount ?? 0;
          const scored = bestList.map((m) => ({
            m,
            score: scoreMatchForUser({
              weights,
              feedbackCount,
              featureKey: featureKeyForKind("garage"),
              isSupermatch: !!m.isSupermatch,
              recencyBoost: m.createdAt
                ? Math.max(0, 1 - (Date.now() - new Date(m.createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
                : 0,
            }),
          }));
          scored.sort((a, b) => b.score - a.score);
          return res.json(scored.map((s) => ({ ...s.m, _personalScore: Math.round(s.score * 1000) / 1000 })));
        } catch (rerankErr) {
          console.warn("[garage-matches] personal rerank skipped:", rerankErr);
          return res.json(bestList);
        }
      } catch (error) {
        console.error("Get garage matches error:", error);
        return sendError(res, 500, "Errore interno del server");
      }
    });
  } catch (err) {
    if (err instanceof SemaphoreQueueFullError) {
      res.setHeader("Retry-After", "3");
      return sendError(res, 503, "Server occupato, riprova più tardi");
    }
    console.error("Get garage matches outer error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/garage-matches/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    if (!matchId) return sendError(res, 400, "ID match mancante");
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return sendError(res, 404, "Match non trovato");
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    if (match.status !== "new") {
      return sendError(res, 400, "Match già gestito");
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "accepted" });
    if (!updated) return sendError(res, 500, "Aggiornamento match fallito");
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.bikerId === userId ? match.zavarrinaId : match.bikerId,
      matchKind: "garage",
      featureKey: featureKeyForKind("garage"),
      action: "accept",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Accept garage match error:", error instanceof Error ? error.message : error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/garage-matches/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matchId = req.params.id as string;
    if (!matchId) return sendError(res, 400, "ID match mancante");
    const match = await storage.getGarageMatch(matchId);
    if (!match) {
      return sendError(res, 404, "Match non trovato");
    }
    if (match.bikerId !== userId && match.zavarrinaId !== userId) {
      return sendError(res, 403, "Non autorizzato");
    }
    if (match.status !== "new") {
      return sendError(res, 400, "Match già gestito");
    }
    const updated = await storage.updateGarageMatch(matchId, { status: "rejected" });
    if (!updated) return sendError(res, 500, "Aggiornamento match fallito");
    recordMatchFeedbackFireAndForget({
      userId,
      otherUserId: match.bikerId === userId ? match.zavarrinaId : match.bikerId,
      matchKind: "garage",
      featureKey: featureKeyForKind("garage"),
      action: "reject",
      matchRefId: matchId,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Reject garage match error:", error instanceof Error ? error.message : error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/garage-matches/archived", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const matches = await storage.getMatchesForUser(userId, { includeArchived: true });
    const enriched = await allLimited(
      matches.map((match) => async () => {
        const other = await storage.getUser(
          match.bikerId === userId ? match.zavarrinaId : match.bikerId,
        );
        if (!other || isSystemAccount(other)) return null;
        const bikerMoto = await storage.getUserMotorcycle(match.bikerMotorcycleId);
        const wishlistMoto = await storage.getWishlistMoto(match.wishlistMotoId);
        return {
          ...match,
          otherUserId: other.id,
          otherNickname: other.nickname,
          otherType: other.userType,
          bikerMoto: bikerMoto ? { brand: bikerMoto.brand, model: bikerMoto.model } : null,
          wishlistMoto: wishlistMoto ? { brand: wishlistMoto.brand, model: wishlistMoto.model } : null,
        };
      }),
    );
    return res.json(enriched.filter(Boolean));
  } catch (error) {
    console.error("Get archived garage matches error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/garage-matches/:id/reactivate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const id = req.params.id as string;
    const ok = await storage.reactivateGarageMatch(id, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { reactivated: true });
  } catch (error) {
    console.error("Reactivate garage match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/garage-matches/:matchId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const ok = await storage.resetGarageMatchToNew(req.params.matchId as string, userId);
    if (!ok) return sendError(res, 404, "Match non trovato o non autorizzato");
    return sendSuccess(res, { deleted: true });
  } catch (error) {
    console.error("Reset garage match error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
