import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { updateLocationSchema } from "@shared/validators";
import { applyFakeZones, applyPositionFuzz, fuzzedCoordsForViewer, isPositionFuzzed } from "../users";
import { triggerProposalProfileMatchingForZavorrina } from "../../matching-engine";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.put("/location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedLoc = updateLocationSchema.safeParse(req.body);
    if (!parsedLoc.success) return sendError(res, 400, parsedLoc.error.issues[0].message);
    const { latitude, longitude } = parsedLoc.data;
    const existingProfile = await storage.getUserProfile(userId);
    let fLat = latitude;
    let fLng = longitude;
    const fakeResult = applyFakeZones(latitude, longitude, existingProfile);
    if (fakeResult.applied) {
      fLat = fakeResult.lat;
      fLng = fakeResult.lng;
    } else if (existingProfile?.positionFuzz && existingProfile.positionFuzzKm > 0) {
      const fuzzed = applyPositionFuzz(latitude, longitude, existingProfile.positionFuzzKm);
      fLat = fuzzed.lat;
      fLng = fuzzed.lng;
    }
    const updateData = { latitude: fLat, longitude: fLng, coordinatesUpdatedAt: new Date() };
    if (existingProfile) {
      await storage.updateUserProfile(userId, updateData as any);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as any);
    }

    const user = await storage.getUser(userId);
    if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
      triggerProposalProfileMatchingForZavorrina(userId);
    }

    return sendSuccess(res);
  } catch (error) {
    console.error("Update location error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/app-close", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.updateUser(userId, { lastAppCloseAt: new Date() } as any);
    const profile = await storage.getUserProfile(userId);
    if (profile?.offlinePositionRandomize !== false && profile?.latitude != null && profile?.longitude != null) {
      const fuzzed = applyPositionFuzz(profile.latitude, profile.longitude, 20);
      await storage.updateUserProfile(userId, {
        lastOfflineLat: fuzzed.lat,
        lastOfflineLng: fuzzed.lng,
      } as any);
    }
    return sendSuccess(res);
  } catch (error) {
    console.error("App close error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const userId = req.params.id as string;
    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    const blocked = await storage.hasBlockedUser(userId, requesterId);
    if (blocked) {
      return sendError(res, 403, "Non puoi visualizzare questo profilo");
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = (await storage.getUserPhotos(userId)).filter((p) => p.isApproved);
    const motorcycles = await storage.getUserMotorcycles(userId);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isOnline = !user.ghostMode && user.lastLoginAt != null && new Date(user.lastLoginAt) >= fifteenMinutesAgo;
    const hideOnlineStatus = !!profile?.hideOnlineStatus;
    const hideLastSeen = !!profile?.hideLastSeen;
    const hideDistance = !!profile?.hideDistance;
    const hideLocation = !!profile?.hideFromMap;

    const coords = (!hideLocation)
      ? fuzzedCoordsForViewer(profile?.latitude, profile?.longitude, profile, false)
      : { latitude: null, longitude: null };

    return res.json({
      ...safeUser,
      userType: user.userType,
      profile: profile ? {
        bio: profile.bio,
        latitude: coords.latitude,
        longitude: coords.longitude,
        isAvailable: profile.isAvailable,
        isOnline: hideOnlineStatus ? null : isOnline,
        lastSeen: hideLastSeen ? null : user.lastLoginAt,
        hideDistance,
        hideLocation,
        isPositionFuzzed: isPositionFuzzed(profile, false),
      } : null,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Get public profile error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
