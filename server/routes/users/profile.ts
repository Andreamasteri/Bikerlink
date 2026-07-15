import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { updateUserMeSchema, updateProfileDynamicSchema, ghostModeSchema, privacySettingsSchema, availabilitySchema } from "@shared/validators";
import { onlineTracker } from "../../online-tracker";
import { applyFakeZones, applyPositionFuzz, captureFirstAvailabilityLocation } from "../users";
import { revealOnFirstCoordinate } from "../../lib/map-visibility";
import { createRegionalClubInvite } from "../motoclubs/utils";
import { triggerProposalProfileMatchingForZavorrina } from "../../matching-engine";
import { enqueueBioEmbedding } from "../../embeddings/bio-queue";
import { deleteEmbedding } from "../../embeddings";
import type { InsertUser, InsertUserProfile } from "@shared/db";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";
import { logPrivacySettingFireAndForget, type PrivacySettingKey } from "../../lib/privacy-log";

const router = Router();

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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const parsed = updateUserMeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const b = parsed.data;
    const userUpdate: Partial<InsertUser> = {};
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
        if (reservedNicknames.includes(userUpdate.nickname.toLowerCase())) {
          return sendError(res, 400, "Nickname non disponibile");
        }
        const existing = await storage.getUserByNickname(userUpdate.nickname);
        if (existing && existing.id !== userId) {
          return sendError(res, 409, "Nickname già in uso");
        }
      }
      await storage.updateUser(userId, userUpdate);

      if (b.region !== undefined && typeof userUpdate.region === "string" && userUpdate.region.trim()) {
        createRegionalClubInvite(userId, userUpdate.region).catch((e) => console.error("[auto-join region error]", e));
      }
    }

    const profileUpdate: Partial<InsertUserProfile> = {};
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
        return sendError(res, 400, "Valore unitsPreference non valido");
      }
      profileUpdate.unitsPreference = up;
    }
    if (b.mapFilters !== undefined) {
      const mf = b.mapFilters;
      if (mf !== null && (typeof mf !== "object" || Array.isArray(mf))) {
        return sendError(res, 400, "Valore mapFilters non valido");
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
      if (profileUpdate.latitude != null && profileUpdate.longitude != null) {
        let fLat = profileUpdate.latitude as number;
        let fLng = profileUpdate.longitude as number;
        const fakeResult = applyFakeZones(fLat, fLng, existingProfileMe);
        if (fakeResult.applied) {
          fLat = fakeResult.lat;
          fLng = fakeResult.lng;
        } else if (existingProfileMe?.positionFuzz && existingProfileMe.positionFuzzKm > 0) {
          const fuzzed = applyPositionFuzz(fLat, fLng, existingProfileMe.positionFuzzKm);
          fLat = fuzzed.lat;
          fLng = fuzzed.lng;
        }
        profileUpdate.latitude = fLat;
        profileUpdate.longitude = fLng;
      }
      if (existingProfileMe) {
        await storage.updateUserProfile(userId, profileUpdate);
      } else {
        await storage.createUserProfile({ userId, ...profileUpdate } as InsertUserProfile);
      }

      // Task #2515 — sincronizza embedding bio con il valore corrente.
      //   • bio cambiata e non vuota → enqueue rigenerazione
      //   • bio svuotata (null/"") → cancella l'embedding esistente per
      //     evitare match "fantasma" su testo che l'utente ha rimosso
      //     (privacy / data minimization).
      if (b.bio !== undefined) {
        const newBio = (b.bio ?? "").trim();
        const oldBio = (existingProfileMe?.bio ?? "").trim();
        if (newBio && newBio !== oldBio) {
          enqueueBioEmbedding(userId, newBio);
        } else if (!newBio && oldBio) {
          deleteEmbedding("user", userId, "bio").catch((err) =>
            console.error(`[BioEmbed] delete failed for user ${userId}:`, err),
          );
        }
      }
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    return res.json({
      ...safeUser,
      ...(profile || {}),
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/profile/dynamic", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedDyn = updateProfileDynamicSchema.safeParse(req.body);
    if (!parsedDyn.success) return sendError(res, 400, parsedDyn.error.issues[0].message);
    const { isAvailable, latitude, longitude, searchPreference, preferredMapStyle, emailChatNotifications, notificationPreferences, pushNotificationsEnabled } = parsedDyn.data;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Partial<InsertUserProfile> = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    let fLat: number | null | undefined = latitude;
    let fLng: number | null | undefined = longitude;
    if (latitude !== undefined || longitude !== undefined) {
      fLat = latitude;
      fLng = longitude;
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
        return sendError(res, 400, "Stile mappa non valido");
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
      if (typeof (notificationPreferences as { system_alerts?: unknown }).system_alerts === "boolean") {
        (merged as { system_alerts?: boolean }).system_alerts = (notificationPreferences as { system_alerts: boolean }).system_alerts;
      }
      updateData.notificationPreferences = merged;
    }

    if (isAvailable === true) {
      await storage.updateUser(userId, { ghostMode: false });
      onlineTracker.setGhostMode(userId, false);
      await captureFirstAvailabilityLocation(userId, fLat ?? latitude, fLng ?? longitude, existingProfile?.latitude, existingProfile?.longitude);
    }

    if (existingProfile) {
      // Task #66 — reveal a never-positioned profile now that it has real coords.
      const finalUpdate = revealOnFirstCoordinate(updateData, existingProfile, fLat, fLng);
      const profile = await storage.updateUserProfile(userId, finalUpdate);
      if (typeof isAvailable === "boolean") onlineTracker.setAvailability(userId, isAvailable);

      const user = await storage.getUser(userId);
      if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
        triggerProposalProfileMatchingForZavorrina(userId);
      }

      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as InsertUserProfile);
      if (typeof isAvailable === "boolean") onlineTracker.setAvailability(userId, isAvailable);

      const user = await storage.getUser(userId);
      if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
        triggerProposalProfileMatchingForZavorrina(userId);
      }

      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me/ghost-mode", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedGm = ghostModeSchema.safeParse(req.body);
    if (!parsedGm.success) return sendError(res, 400, parsedGm.error.issues[0].message);
    const { enabled } = parsedGm.data;
    const ghostModeSetting = await storage.getAppSetting("ghost_mode_enabled");
    if (ghostModeSetting?.value !== "true") {
      return sendError(res, 403, "Ghost mode is currently disabled by administrator.");
    }
    await storage.updateUser(userId, { ghostMode: enabled });
    onlineTracker.setGhostMode(userId, enabled);
    logPrivacySettingFireAndForget(userId, "ghost_mode", enabled);
    return sendSuccess(res, { enabled });
  } catch (error) {
    console.error("Ghost mode update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me/privacy", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = privacySettingsSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { hideFromMap, hideOnlineStatus, hideLastSeen, hideDistance, positionFuzz, positionFuzzKm, gpsPrecision, fakeHomeEnabled, fakeHomeLatitude, fakeHomeLongitude, fakeHomeRadius, fakeWorkEnabled, fakeWorkLatitude, fakeWorkLongitude, fakeWorkRadius, fakeWhateverEnabled, fakeWhateverLatitude, fakeWhateverLongitude, fakeWhateverRadius, offlinePositionRandomize, fixedPositionEnabled, fixedPositionLat, fixedPositionLng } = parsed.data;

    const existing = await storage.getUserProfile(userId);
    const updateData: Partial<InsertUserProfile> = {};
    if (hideFromMap !== undefined) {
      updateData.hideFromMap = hideFromMap;
      // Task #103 — record that the rider made an explicit map-visibility choice.
      // A deliberate "hide me" (true) sets the marker so revealOnFirstCoordinate
      // won't silently un-hide them on their first GPS fix; choosing to be visible
      // (false) clears it, restoring the reveal-on-first-coordinate default.
      updateData.hideFromMapExplicit = hideFromMap === true;
    }
    if (hideOnlineStatus !== undefined) updateData.hideOnlineStatus = (hideOnlineStatus as boolean | null) ?? undefined;
    if (hideLastSeen !== undefined) updateData.hideLastSeen = (hideLastSeen as boolean | null) ?? undefined;
    if (hideDistance !== undefined) updateData.hideDistance = (hideDistance as boolean | null) ?? undefined;
    if (positionFuzz !== undefined) updateData.positionFuzz = positionFuzz;
    if (positionFuzzKm !== undefined) updateData.positionFuzzKm = positionFuzzKm;
    if (gpsPrecision !== undefined) updateData.gpsPrecision = gpsPrecision;
    if (offlinePositionRandomize !== undefined) updateData.offlinePositionRandomize = offlinePositionRandomize;

    if (fixedPositionEnabled !== undefined) updateData.fixedPositionEnabled = fixedPositionEnabled;
    if (fixedPositionLat !== undefined) updateData.fixedPositionLat = fixedPositionLat ?? undefined;
    if (fixedPositionLng !== undefined) updateData.fixedPositionLng = fixedPositionLng ?? undefined;
    if (fixedPositionEnabled === true && fixedPositionLat != null && fixedPositionLng != null) {
      updateData.latitude = fixedPositionLat;
      updateData.longitude = fixedPositionLng;
      updateData.coordinatesUpdatedAt = new Date();
    }

    if (fakeHomeEnabled !== undefined) updateData.fakeHomeEnabled = fakeHomeEnabled;
    if (fakeHomeLatitude !== undefined) updateData.homeLatitude = fakeHomeLatitude;
    if (fakeHomeLongitude !== undefined) updateData.homeLongitude = fakeHomeLongitude;
    if (fakeHomeRadius !== undefined) updateData.fakeHomeRadius = fakeHomeRadius ?? undefined;

    if (fakeWorkEnabled !== undefined) updateData.fakeWorkEnabled = fakeWorkEnabled;
    if (fakeWorkLatitude !== undefined) updateData.workLatitude = fakeWorkLatitude;
    if (fakeWorkLongitude !== undefined) updateData.workLongitude = fakeWorkLongitude;
    if (fakeWorkRadius !== undefined) updateData.fakeWorkRadius = fakeWorkRadius ?? undefined;

    if (fakeWhateverEnabled !== undefined) updateData.fakeWhateverEnabled = fakeWhateverEnabled;
    if (fakeWhateverLatitude !== undefined) updateData.whateverLatitude = fakeWhateverLatitude;
    if (fakeWhateverLongitude !== undefined) updateData.whateverLongitude = fakeWhateverLongitude;
    if (fakeWhateverRadius !== undefined) updateData.fakeWhateverRadius = fakeWhateverRadius ?? undefined;

    if (existing) {
      await storage.updateUserProfile(userId, updateData);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as InsertUserProfile);
    }

    const boolKeys: Array<[boolean | undefined, PrivacySettingKey]> = [
      [hideFromMap, "hide_from_map"],
      [positionFuzz, "position_fuzz"],
      [fakeHomeEnabled, "fake_home_enabled"],
      [fakeWorkEnabled, "fake_work_enabled"],
      [fakeWhateverEnabled, "fake_whatever_enabled"],
      [offlinePositionRandomize, "offline_position_randomize"],
      [fixedPositionEnabled, "fixed_position_enabled"],
    ];
    for (const [val, key] of boolKeys) {
      if (val !== undefined) logPrivacySettingFireAndForget(userId, key, val);
    }
    if (gpsPrecision !== undefined) {
      logPrivacySettingFireAndForget(userId, "continuous_gps", gpsPrecision === "continuous");
    }

    return sendSuccess(res);
  } catch (error) {
    console.error("Privacy settings update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/me/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { isAvailable, latitude, longitude } = parsed.data;
    const existing = await storage.getUserProfile(userId);
    const updateData: Partial<InsertUserProfile> = { isAvailable };
    let fLat: number | null | undefined = latitude;
    let fLng: number | null | undefined = longitude;
    if (latitude != null && longitude != null) {
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
      await storage.updateUser(userId, { ghostMode: false });
      onlineTracker.setGhostMode(userId, false);
      await captureFirstAvailabilityLocation(userId, fLat ?? latitude, fLng ?? longitude, existing?.latitude, existing?.longitude);
    }

    if (existing) {
      // Task #66 — reveal a never-positioned profile now that it has real coords.
      const finalUpdate = revealOnFirstCoordinate(updateData, existing, fLat, fLng);
      await storage.updateUserProfile(userId, finalUpdate);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as InsertUserProfile);
    }

    const user = await storage.getUser(userId);
    if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
      triggerProposalProfileMatchingForZavorrina(userId);
    }

    onlineTracker.setAvailability(userId, isAvailable);
    return sendSuccess(res, { isAvailable });
  } catch (error) {
    console.error("Availability update error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/me/request-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.requestUserDeletion(userId);
    req.session.destroy(() => {});
    return sendSuccess(res, undefined, "Richiesta di cancellazione inviata. Il tuo account sarà eliminato tra 30 giorni.");
  } catch (error) {
    console.error("Request deletion error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/me/cancel-deletion", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.cancelUserDeletion(userId);
    return sendSuccess(res, undefined, "Richiesta di cancellazione annullata.");
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
