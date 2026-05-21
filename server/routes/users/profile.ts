import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../../storage";
import { updateUserMeSchema, updateProfileDynamicSchema, pushTokenSchema, ghostModeSchema, privacySettingsSchema, availabilitySchema } from "@shared/schema";
import { onlineTracker } from "../../online-tracker";
import { applyFakeZones, applyPositionFuzz, captureFirstAvailabilityLocation } from "../users";
import { createRegionalClubInvite } from "../motoclubs/utils";
import { triggerProposalProfileMatchingForZavorrina } from "../../matching-engine";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/position", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const profile = await storage.getUserProfile(userId);
    if (!profile || profile.latitude == null || profile.longitude == null) {
      return res.json({ latitude: null, longitude: null, source: null });
    }
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isLive = profile.coordinatesUpdatedAt != null && new Date(profile.coordinatesUpdatedAt) > fiveMinAgo;
    return res.json({
      latitude: profile.latitude,
      longitude: profile.longitude,
      source: isLive ? "live" : "last_known",
      updatedAt: profile.coordinatesUpdatedAt,
    });
  } catch (error) {
    console.error("Get user position error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);

    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const parsed = updateUserMeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    const b = parsed.data;
    const userUpdate: Record<string, unknown> = {};
    if (b.nickname !== undefined) userUpdate.nickname = b.nickname;
    if (b.phone !== undefined) userUpdate.phone = b.phone;
    if (b.sex !== undefined) userUpdate.sex = b.sex;
    if (b.coupleSexConfig !== undefined) userUpdate.coupleSexConfig = b.coupleSexConfig;
    if (b.birthYear !== undefined) userUpdate.birthYear = b.birthYear;
    if (b.region !== undefined) userUpdate.region = b.region;
    if (b.country !== undefined) userUpdate.country = b.country;
    if (b.avatarUrl !== undefined) userUpdate.avatarUrl = b.avatarUrl;
    if (b.floatingWidgetEnabled !== undefined) userUpdate.floatingWidgetEnabled = !!b.floatingWidgetEnabled;

    if (Object.keys(userUpdate).length > 0) {
      if (userUpdate.nickname) {
        const reservedNicknames = ["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"];
        if (reservedNicknames.includes((userUpdate.nickname as string).toLowerCase())) {
          return res.status(400).json({ message: "Nickname non disponibile" });
        }
        const existing = await storage.getUserByNickname(userUpdate.nickname as string);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Nickname già in uso" });
        }
      }
      await storage.updateUser(userId, userUpdate as any);

      if (b.region !== undefined && typeof userUpdate.region === "string" && userUpdate.region.trim()) {
        createRegionalClubInvite(userId, userUpdate.region).catch((e) => console.error("[auto-join region error]", e));
      }
    }

    const profileUpdate: Record<string, unknown> = {};
    if (b.bio !== undefined) profileUpdate.bio = b.bio;
    if (b.maxPickupDistance !== undefined) profileUpdate.maxPickupDistance = b.maxPickupDistance;
    if (b.latitude !== undefined) profileUpdate.latitude = b.latitude;
    if (b.longitude !== undefined) profileUpdate.longitude = b.longitude;
    if (b.unitsPreference !== undefined) {
      const up = b.unitsPreference;
      const VALID_TIME_FORMATS = ["12h", "24h"];
      const VALID_SPEED_UNITS = ["kmh", "mph", "knots"];
      const VALID_DISTANCE_UNITS = ["km_m", "mi_ft", "mi_yd", "nmi_ftm"];
      if (
        up !== null &&
        (typeof up !== "object" ||
          !VALID_TIME_FORMATS.includes(up.timeFormat) ||
          !VALID_SPEED_UNITS.includes(up.speedUnit) ||
          !VALID_DISTANCE_UNITS.includes(up.distanceUnit))
      ) {
        return res.status(400).json({ message: "Valore unitsPreference non valido" });
      }
      profileUpdate.unitsPreference = up;
    }
    if (b.mapFilters !== undefined) {
      const mf = b.mapFilters;
      if (mf !== null && (typeof mf !== "object" || Array.isArray(mf))) {
        return res.status(400).json({ message: "Valore mapFilters non valido" });
      }
      if (mf === null) {
        profileUpdate.mapFilters = null;
      } else {
        const sanitized: Record<string, boolean> = {
          ...(typeof mf.biker === "boolean" && { biker: mf.biker }),
          ...(typeof mf.zavorrina === "boolean" && { zavorrina: mf.zavorrina }),
          ...(typeof mf.clubs === "boolean" && { clubs: mf.clubs }),
          ...(typeof mf.events === "boolean" && { events: mf.events }),
        };
        profileUpdate.mapFilters = sanitized;
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      const existingProfileMe = await storage.getUserProfile(userId);
      if (existingProfileMe?.positionFuzz && existingProfileMe.positionFuzzKm > 0 && profileUpdate.latitude != null && profileUpdate.longitude != null) {
        const fuzzed = applyPositionFuzz(profileUpdate.latitude as number, profileUpdate.longitude as number, existingProfileMe.positionFuzzKm);
        profileUpdate.latitude = fuzzed.lat;
        profileUpdate.longitude = fuzzed.lng;
      }
      if (existingProfileMe) {
        await storage.updateUserProfile(userId, profileUpdate as any);
      } else {
        await storage.createUserProfile({ userId, ...profileUpdate } as any);
      }
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = await storage.getUserPhotos(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);

    return res.json({
      ...safeUser,
      profile,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    return res.json({
      ...safeUser,
      ...(profile || {}),
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/profile/dynamic", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedDyn = updateProfileDynamicSchema.safeParse(req.body);
    if (!parsedDyn.success) return res.status(400).json({ message: parsedDyn.error.issues[0].message });
    const { isAvailable, latitude, longitude, searchPreference, preferredMapStyle, emailChatNotifications, notificationPreferences, pushNotificationsEnabled } = parsedDyn.data;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Record<string, unknown> = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (latitude !== undefined || longitude !== undefined) {
      let fLat = latitude;
      let fLng = longitude;
      if (latitude != null && longitude != null) {
        const fakeResult = applyFakeZones(latitude, longitude, existingProfile);
        if (fakeResult.applied) {
          fLat = fakeResult.lat;
          fLng = fakeResult.lng;
        } else if (existingProfile?.positionFuzz && existingProfile.positionFuzzKm > 0) {
          const fuzzed = applyPositionFuzz(latitude, longitude, existingProfile.positionFuzzKm);
          fLat = fuzzed.lat;
          fLng = fuzzed.lng;
        }
      }
      if (latitude !== undefined) updateData.latitude = fLat;
      if (longitude !== undefined) updateData.longitude = fLng;
      if (latitude != null && longitude != null) updateData.coordinatesUpdatedAt = new Date();
    }
    if (searchPreference !== undefined) updateData.searchPreference = searchPreference;
    const validMapStyles = ["carto_light", "carto_dark", "esri_gray"];
    if (preferredMapStyle !== undefined) {
      if (preferredMapStyle !== null && !validMapStyles.includes(preferredMapStyle)) {
        return res.status(400).json({ message: "Stile mappa non valido" });
      }
      updateData.preferredMapStyle = preferredMapStyle;
    }
    if (typeof emailChatNotifications === "boolean") updateData.emailChatNotifications = emailChatNotifications;
    if (typeof pushNotificationsEnabled === "boolean") updateData.pushNotificationsEnabled = pushNotificationsEnabled;
    if (notificationPreferences && typeof notificationPreferences === "object") {
      const current = (existingProfile?.notificationPreferences ?? { matches: true, zoneProposals: true, chat: true, motoclub: true, eventi: true }) as { matches: boolean; zoneProposals: boolean; chat: boolean; motoclub: boolean; eventi: boolean };
      const merged = { ...current };
      if (typeof notificationPreferences.matches === "boolean") merged.matches = notificationPreferences.matches;
      if (typeof notificationPreferences.zoneProposals === "boolean") merged.zoneProposals = notificationPreferences.zoneProposals;
      if (typeof notificationPreferences.chat === "boolean") merged.chat = notificationPreferences.chat;
      if (typeof notificationPreferences.motoclub === "boolean") merged.motoclub = notificationPreferences.motoclub;
      if (typeof notificationPreferences.eventi === "boolean") merged.eventi = notificationPreferences.eventi;
      updateData.notificationPreferences = merged;
    }

    if (isAvailable === true) {
      await storage.updateUser(userId, { ghostMode: false } as any);
      onlineTracker.setGhostMode(userId, false);
      await captureFirstAvailabilityLocation(userId, latitude, longitude, existingProfile?.latitude, existingProfile?.longitude);
    }

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      if (typeof isAvailable === "boolean") onlineTracker.setAvailability(userId, isAvailable);

      const user = await storage.getUser(userId);
      if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
        triggerProposalProfileMatchingForZavorrina(userId).catch(e => console.error("[triggerMatchingForZavorrina error]", e));
      }

      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      if (typeof isAvailable === "boolean") onlineTracker.setAvailability(userId, isAvailable);

      const user = await storage.getUser(userId);
      if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
        triggerProposalProfileMatchingForZavorrina(userId).catch(e => console.error("[triggerMatchingForZavorrina error]", e));
      }

      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/match-seen", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.updateUser(userId, { lastSeenMatchAt: new Date() } as any);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Match seen update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/push-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedPt = pushTokenSchema.safeParse(req.body ?? {});
    if (!parsedPt.success) return res.status(400).json({ message: parsedPt.error.issues[0].message });
    const { token } = parsedPt.data;
    if (token === null || token === undefined || token === "") {
      await storage.updateUser(userId, { expoPushToken: null });
      return res.json({ ok: true, cleared: true });
    }
    const isValidToken = typeof token === "string" &&
      (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
    if (!isValidToken) {
      return res.status(400).json({ message: "Token Expo push non valido" });
    }
    await storage.updateUser(userId, { expoPushToken: token });
    return res.json({ ok: true });
  } catch (error) {
    console.error("Push token update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/ghost-mode", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedGm = ghostModeSchema.safeParse(req.body);
    if (!parsedGm.success) return res.status(400).json({ message: parsedGm.error.issues[0].message });
    const { enabled } = parsedGm.data;
    const ghostModeSetting = await storage.getAppSetting("ghost_mode_enabled");
    if (ghostModeSetting?.value !== "true") {
      return res.status(403).json({ message: "Ghost mode is currently disabled by administrator." });
    }
    await storage.updateUser(userId, { ghostMode: enabled } as any);
    onlineTracker.setGhostMode(userId, enabled);
    return res.json({ ok: true, enabled });
  } catch (error) {
    console.error("Ghost mode update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/privacy", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = privacySettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { hideFromMap, hideOnlineStatus, hideLastSeen, hideDistance, positionFuzz, positionFuzzKm, fakeHomeEnabled, fakeHomeLatitude, fakeHomeLongitude, fakeHomeRadius, fakeWorkEnabled, fakeWorkLatitude, fakeWorkLongitude, fakeWorkRadius, fakeWhateverEnabled, fakeWhateverLatitude, fakeWhateverLongitude, fakeWhateverRadius, offlinePositionRandomize } = parsed.data;

    const existing = await storage.getUserProfile(userId);
    const updateData: Record<string, any> = {};
    if (hideFromMap !== undefined) updateData.hideFromMap = hideFromMap;
    if (hideOnlineStatus !== undefined) updateData.hideOnlineStatus = hideOnlineStatus;
    if (hideLastSeen !== undefined) updateData.hideLastSeen = hideLastSeen;
    if (hideDistance !== undefined) updateData.hideDistance = hideDistance;
    if (positionFuzz !== undefined) updateData.positionFuzz = positionFuzz;
    if (positionFuzzKm !== undefined) updateData.positionFuzzKm = positionFuzzKm;
    if (offlinePositionRandomize !== undefined) updateData.offlinePositionRandomize = offlinePositionRandomize;

    if (fakeHomeEnabled !== undefined) updateData.fakeHomeEnabled = fakeHomeEnabled;
    if (fakeHomeLatitude !== undefined) updateData.homeLatitude = fakeHomeLatitude;
    if (fakeHomeLongitude !== undefined) updateData.homeLongitude = fakeHomeLongitude;
    if (fakeHomeRadius !== undefined) updateData.fakeHomeRadius = fakeHomeRadius;

    if (fakeWorkEnabled !== undefined) updateData.fakeWorkEnabled = fakeWorkEnabled;
    if (fakeWorkLatitude !== undefined) updateData.workLatitude = fakeWorkLatitude;
    if (fakeWorkLongitude !== undefined) updateData.workLongitude = fakeWorkLongitude;
    if (fakeWorkRadius !== undefined) updateData.fakeWorkRadius = fakeWorkRadius;

    if (fakeWhateverEnabled !== undefined) updateData.fakeWhateverEnabled = fakeWhateverEnabled;
    if (fakeWhateverLatitude !== undefined) updateData.whateverLatitude = fakeWhateverLatitude;
    if (fakeWhateverLongitude !== undefined) updateData.whateverLongitude = fakeWhateverLongitude;
    if (fakeWhateverRadius !== undefined) updateData.fakeWhateverRadius = fakeWhateverRadius;

    if (existing) {
      await storage.updateUserProfile(userId, updateData);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as any);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Privacy settings update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { isAvailable, latitude, longitude } = parsed.data;
    const existing = await storage.getUserProfile(userId);
    const updateData: Record<string, any> = { isAvailable };
    if (latitude != null && longitude != null) {
      let fLat = latitude;
      let fLng = longitude;
      const fakeResult = applyFakeZones(latitude, longitude, existing);
      if (fakeResult.applied) {
        fLat = fakeResult.lat;
        fLng = fakeResult.lng;
      } else if (existing?.positionFuzz && existing.positionFuzzKm > 0) {
        const fuzzed = applyPositionFuzz(latitude, longitude, existing.positionFuzzKm);
        fLat = fuzzed.lat;
        fLng = fuzzed.lng;
      }
      updateData.latitude = fLat;
      updateData.longitude = fLng;
      updateData.coordinatesUpdatedAt = new Date();
    }

    if (isAvailable === true) {
      await storage.updateUser(userId, { ghostMode: false } as any);
      onlineTracker.setGhostMode(userId, false);
      await captureFirstAvailabilityLocation(userId, latitude, longitude, existing?.latitude, existing?.longitude);
    }

    if (existing) {
      await storage.updateUserProfile(userId, updateData);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as any);
    }

    const user = await storage.getUser(userId);
    if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
      triggerProposalProfileMatchingForZavorrina(userId).catch(e => console.error("[triggerMatchingForZavorrina error]", e));
    }

    onlineTracker.setAvailability(userId, isAvailable);
    return res.json({ ok: true, isAvailable });
  } catch (error) {
    console.error("Availability update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/request-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.requestUserDeletion(userId);
    req.session.destroy(() => {});
    return res.json({ message: "Richiesta di cancellazione inviata. Il tuo account sarà eliminato tra 30 giorni." });
  } catch (error) {
    console.error("Request deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/cancel-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.cancelUserDeletion(userId);
    return res.json({ message: "Richiesta di cancellazione annullata." });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
