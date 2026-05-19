import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { isProtectedUser } from "../constants";
import { isSystemAccount, systemAccountConditions } from "../lib/system-account-filter";
import { createRegionalClubInvite } from "./motoclubs";
import type { InsertReport } from "@shared/schema";
import { userLastfmSessions, userMusicTracks, motoClubMembers, motoClubs, userPhotos } from "@shared/schema";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { uploadBuffer, downloadBuffer, deleteObject } from "../objectStorage";
import { onlineTracker } from "../online-tracker";
import { reportRateLimiter, getTrustedClientIp } from "../lib/abuse-rate-limit";

const router = Router();

async function captureFirstAvailabilityLocation(
  userId: string,
  requestLat?: number | null,
  requestLng?: number | null,
  profileLat?: number | null,
  profileLng?: number | null
): Promise<void> {
  try {
    const currentUser = await storage.getUser(userId);
    if (!currentUser || (currentUser.firstLoginLat !== null && currentUser.firstLoginLng !== null)) return;
    const resolvedLat = requestLat ?? profileLat;
    const resolvedLng = requestLng ?? profileLng;
    if (typeof resolvedLat !== "number" || typeof resolvedLng !== "number") return;
    await storage.updateUser(userId, {
      firstLoginLat: resolvedLat,
      firstLoginLng: resolvedLng,
    } as any);
  } catch (err) {
    console.warn("[captureFirstAvailabilityLocation] fallita:", err);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/avif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato. Usa JPEG, PNG, WebP, HEIC/HEIF o AVIF."));
    }
  },
});

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

function applyPositionFuzz(lat: number, lng: number, radiusKm: number): { lat: number; lng: number } {
  const R = 6371;
  const r = radiusKm * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dlat = (r / R) * (180 / Math.PI);
  const dlng = dlat / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + dlat * Math.sin(theta), lng: lng + dlng * Math.cos(theta) };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyFakeHome(
  lat: number,
  lng: number,
  profile: any
): { lat: number; lng: number; applied: boolean } {
  if (!profile?.fakeHomeEnabled) return { lat, lng, applied: false };
  if (profile.homeLatitude == null || profile.homeLongitude == null) return { lat, lng, applied: false };
  if (profile.fakeHomeLatitude == null || profile.fakeHomeLongitude == null) return { lat, lng, applied: false };
  const radius = profile.fakeHomeRadius ?? 2;
  const dist = haversineKm(lat, lng, profile.homeLatitude, profile.homeLongitude);
  if (dist <= radius) {
    return { lat: profile.fakeHomeLatitude, lng: profile.fakeHomeLongitude, applied: true };
  }
  return { lat, lng, applied: false };
}

function applyFakeZones(
  lat: number,
  lng: number,
  profile: any
): { lat: number; lng: number; applied: boolean } {
  if (profile?.fakeHomeEnabled &&
      profile.homeLatitude != null && profile.homeLongitude != null &&
      profile.fakeHomeLatitude != null && profile.fakeHomeLongitude != null) {
    const dist = haversineKm(lat, lng, profile.homeLatitude, profile.homeLongitude);
    if (dist <= (profile.fakeHomeRadius ?? 2)) {
      return { lat: profile.fakeHomeLatitude, lng: profile.fakeHomeLongitude, applied: true };
    }
  }
  if (profile?.fakeWorkEnabled &&
      profile.workLatitude != null && profile.workLongitude != null &&
      profile.fakeWorkLatitude != null && profile.fakeWorkLongitude != null) {
    const dist = haversineKm(lat, lng, profile.workLatitude, profile.workLongitude);
    if (dist <= (profile.fakeWorkRadius ?? 2)) {
      return { lat: profile.fakeWorkLatitude, lng: profile.fakeWorkLongitude, applied: true };
    }
  }
  if (profile?.fakeWhateverEnabled &&
      profile.whateverLatitude != null && profile.whateverLongitude != null &&
      profile.fakeWhateverLatitude != null && profile.fakeWhateverLongitude != null) {
    const dist = haversineKm(lat, lng, profile.whateverLatitude, profile.whateverLongitude);
    if (dist <= (profile.fakeWhateverRadius ?? 2)) {
      return { lat: profile.fakeWhateverLatitude, lng: profile.fakeWhateverLongitude, applied: true };
    }
  }
  return { lat, lng, applied: false };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const latRaw = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lngRaw = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const lat = Number.isFinite(latRaw) ? latRaw : undefined;
    const lng = Number.isFinite(lngRaw) ? lngRaw : undefined;
    const blockedIds = await storage.getBlockedUserIds(requesterId);
    const blockedSet = new Set(blockedIds);

    if (lat != null && lng != null) {
      const { db } = await import("../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/schema");
      const { eq, and, notInArray: notInArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance");
      const rows = await db
        .select({ user: usersTable, distance: distanceExpr, hideFromMap: profilesTable.hideFromMap })
        .from(usersTable)
        .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
        .where(and(
          notInArr(usersTable.id, [requesterId, ...Array.from(blockedSet)]),
          ...systemAccountConditions(usersTable),
        ))
        .orderBy(sqlTag`distance`);
      type UserDistanceRow = { user: { id: string; nickname: string; avatarUrl: string | null; userType: string }; distance: number | null; hideFromMap: boolean | null };
      return res.json((rows as UserDistanceRow[]).map((r) => ({
        id: r.user.id,
        nickname: r.user.nickname,
        avatarUrl: r.user.avatarUrl,
        userType: r.user.userType,
        // Privacy: do not leak derived distance for users who opted out of map visibility
        distance: r.hideFromMap ? null : (typeof r.distance === "number" && Number.isFinite(r.distance) ? Math.round(r.distance * 10) / 10 : null),
      })));
    }

    const allUsers = await storage.getAllUsers();
    const results = allUsers
      .filter((u) => !blockedSet.has(u.id) && u.id !== requesterId && !isSystemAccount(u))
      .map((u) => ({
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        userType: u.userType,
        distance: null as number | null,
      }));
    return res.json(results);
  } catch (error) {
    console.error("Get users error:", error);
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

    const b = req.body;
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

      if (req.body.region !== undefined && typeof userUpdate.region === "string" && userUpdate.region.trim()) {
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
        const sanitized: Record<string, boolean> = {};
        for (const key of ["biker", "zavorrina", "clubs", "events"] as const) {
          if (typeof mf[key] === "boolean") sanitized[key] = mf[key];
        }
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
    const { isAvailable, latitude, longitude, searchPreference, preferredMapStyle, emailChatNotifications, notificationPreferences } = req.body;
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
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      if (typeof isAvailable === "boolean") onlineTracker.setAvailability(userId, isAvailable);
      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
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
    return res.json({ ok: true });
  } catch (error) {
    console.error("App close error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/push-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { token } = (req.body ?? {}) as { token?: string | null };
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
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    const ghostModeSetting = await storage.getAppSetting("ghost_mode_enabled");
    if (ghostModeSetting?.value !== "true") {
      return res.status(403).json({ message: "Ghost Mode non attivo su questa piattaforma" });
    }
    await storage.updateUser(userId, { ghostMode: enabled } as any);
    if (enabled) {
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        const profileUpdate: Record<string, unknown> = { isAvailable: false };
        if (existingProfile.offlinePositionRandomize !== false && existingProfile.latitude != null && existingProfile.longitude != null) {
          const fuzzed = applyPositionFuzz(existingProfile.latitude, existingProfile.longitude, 20);
          profileUpdate.lastOfflineLat = fuzzed.lat;
          profileUpdate.lastOfflineLng = fuzzed.lng;
        }
        await storage.updateUserProfile(userId, profileUpdate as any);
      }
    }
    onlineTracker.setGhostMode(userId, enabled);
    return res.json({ ghostMode: enabled });
  } catch (error) {
    console.error("Ghost mode toggle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/me/privacy", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const {
      hideFromMap, positionFuzz, positionFuzzKm,
      fakeHomeEnabled, homeLatitude, homeLongitude, fakeHomeLatitude, fakeHomeLongitude, fakeHomeRadius,
      gpsPrecision, offlinePositionRandomize,
      fakeWorkEnabled, workLatitude, workLongitude, fakeWorkLatitude, fakeWorkLongitude, fakeWorkRadius,
      fakeWhateverEnabled, whateverLatitude, whateverLongitude, fakeWhateverLatitude, fakeWhateverLongitude, fakeWhateverRadius,
    } = req.body;
    const updateData: Record<string, unknown> = {};
    if (typeof hideFromMap === "boolean") updateData.hideFromMap = hideFromMap;
    if (typeof positionFuzz === "boolean") updateData.positionFuzz = positionFuzz;
    if (positionFuzzKm !== undefined) {
      const km = Number(positionFuzzKm);
      if (!Number.isInteger(km) || km < 1 || km > 50) {
        return res.status(400).json({ message: "positionFuzzKm deve essere un intero tra 1 e 50" });
      }
      updateData.positionFuzzKm = km;
    }
    if (typeof fakeHomeEnabled === "boolean") updateData.fakeHomeEnabled = fakeHomeEnabled;
    if (homeLatitude !== undefined) {
      if (homeLatitude !== null) {
        const lat = Number(homeLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "homeLatitude non valida (range -90/+90)" });
        updateData.homeLatitude = lat;
      } else { updateData.homeLatitude = null; }
    }
    if (homeLongitude !== undefined) {
      if (homeLongitude !== null) {
        const lng = Number(homeLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "homeLongitude non valida (range -180/+180)" });
        updateData.homeLongitude = lng;
      } else { updateData.homeLongitude = null; }
    }
    if (fakeHomeLatitude !== undefined) {
      if (fakeHomeLatitude !== null) {
        const lat = Number(fakeHomeLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "fakeHomeLatitude non valida (range -90/+90)" });
        updateData.fakeHomeLatitude = lat;
      } else { updateData.fakeHomeLatitude = null; }
    }
    if (fakeHomeLongitude !== undefined) {
      if (fakeHomeLongitude !== null) {
        const lng = Number(fakeHomeLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "fakeHomeLongitude non valida (range -180/+180)" });
        updateData.fakeHomeLongitude = lng;
      } else { updateData.fakeHomeLongitude = null; }
    }
    if (fakeHomeRadius !== undefined) {
      const r = Number(fakeHomeRadius);
      if (!Number.isInteger(r) || r < 1 || r > 100) {
        return res.status(400).json({ message: "fakeHomeRadius deve essere un intero tra 1 e 100" });
      }
      updateData.fakeHomeRadius = r;
    }
    if (gpsPrecision !== undefined) {
      const validPrecisions = ["lowest", "balanced", "high", "highest", "bestForNavigation"];
      if (!validPrecisions.includes(gpsPrecision)) {
        return res.status(400).json({ message: "gpsPrecision non valida" });
      }
      updateData.gpsPrecision = gpsPrecision;
    }
    if (typeof offlinePositionRandomize === "boolean") updateData.offlinePositionRandomize = offlinePositionRandomize;
    if (typeof fakeWorkEnabled === "boolean") updateData.fakeWorkEnabled = fakeWorkEnabled;
    if (workLatitude !== undefined) {
      if (workLatitude !== null) {
        const lat = Number(workLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "workLatitude non valida" });
        updateData.workLatitude = lat;
      } else { updateData.workLatitude = null; }
    }
    if (workLongitude !== undefined) {
      if (workLongitude !== null) {
        const lng = Number(workLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "workLongitude non valida" });
        updateData.workLongitude = lng;
      } else { updateData.workLongitude = null; }
    }
    if (fakeWorkLatitude !== undefined) {
      if (fakeWorkLatitude !== null) {
        const lat = Number(fakeWorkLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "fakeWorkLatitude non valida" });
        updateData.fakeWorkLatitude = lat;
      } else { updateData.fakeWorkLatitude = null; }
    }
    if (fakeWorkLongitude !== undefined) {
      if (fakeWorkLongitude !== null) {
        const lng = Number(fakeWorkLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "fakeWorkLongitude non valida" });
        updateData.fakeWorkLongitude = lng;
      } else { updateData.fakeWorkLongitude = null; }
    }
    if (fakeWorkRadius !== undefined) {
      const r = Number(fakeWorkRadius);
      if (!Number.isInteger(r) || r < 1 || r > 100) return res.status(400).json({ message: "fakeWorkRadius deve essere un intero tra 1 e 100" });
      updateData.fakeWorkRadius = r;
    }
    if (typeof fakeWhateverEnabled === "boolean") updateData.fakeWhateverEnabled = fakeWhateverEnabled;
    if (whateverLatitude !== undefined) {
      if (whateverLatitude !== null) {
        const lat = Number(whateverLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "whateverLatitude non valida" });
        updateData.whateverLatitude = lat;
      } else { updateData.whateverLatitude = null; }
    }
    if (whateverLongitude !== undefined) {
      if (whateverLongitude !== null) {
        const lng = Number(whateverLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "whateverLongitude non valida" });
        updateData.whateverLongitude = lng;
      } else { updateData.whateverLongitude = null; }
    }
    if (fakeWhateverLatitude !== undefined) {
      if (fakeWhateverLatitude !== null) {
        const lat = Number(fakeWhateverLatitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ message: "fakeWhateverLatitude non valida" });
        updateData.fakeWhateverLatitude = lat;
      } else { updateData.fakeWhateverLatitude = null; }
    }
    if (fakeWhateverLongitude !== undefined) {
      if (fakeWhateverLongitude !== null) {
        const lng = Number(fakeWhateverLongitude);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: "fakeWhateverLongitude non valida" });
        updateData.fakeWhateverLongitude = lng;
      } else { updateData.fakeWhateverLongitude = null; }
    }
    if (fakeWhateverRadius !== undefined) {
      const r = Number(fakeWhateverRadius);
      if (!Number.isInteger(r) || r < 1 || r > 100) return res.status(400).json({ message: "fakeWhateverRadius deve essere un intero tra 1 e 100" });
      updateData.fakeWhateverRadius = r;
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Nessun campo da aggiornare" });
    }
    const existingProfile = await storage.getUserProfile(userId);
    if (existingProfile) {
      await storage.updateUserProfile(userId, updateData as any);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as any);
    }
    return res.json({ message: "Impostazioni privacy aggiornate", ...updateData });
  } catch (error) {
    console.error("Privacy update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    let { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Latitudine e longitudine richieste" });
    }
    const existingProfile = await storage.getUserProfile(userId);
    const fakeResult = applyFakeZones(latitude, longitude, existingProfile);
    if (fakeResult.applied) {
      latitude = fakeResult.lat;
      longitude = fakeResult.lng;
    } else if (existingProfile?.positionFuzz && existingProfile.positionFuzzKm > 0) {
      const fuzzed = applyPositionFuzz(latitude, longitude, existingProfile.positionFuzzKm);
      latitude = fuzzed.lat;
      longitude = fuzzed.lng;
    }
    if (existingProfile) {
      await storage.updateUserProfile(userId, { latitude, longitude, coordinatesUpdatedAt: new Date() } as any);
    } else {
      await storage.createUserProfile({ userId, latitude, longitude, coordinatesUpdatedAt: new Date() } as any);
    }
    storage.saveCoordinateHistory(userId, latitude, longitude).catch(() => {});
    return res.json({ message: "Posizione aggiornata" });
  } catch (error) {
    console.error("Update location error:", error);
    return res.status(500).json({ message: "Errore aggiornamento posizione" });
  }
});

router.put("/me/availability", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { isAvailable, latitude, longitude } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable deve essere un booleano" });
    }

    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Record<string, unknown> = { isAvailable };

    let fuzzedLat = latitude;
    let fuzzedLng = longitude;
    if (latitude != null && longitude != null) {
      const fakeResult = applyFakeZones(latitude, longitude, existingProfile);
      if (fakeResult.applied) {
        fuzzedLat = fakeResult.lat;
        fuzzedLng = fakeResult.lng;
      } else if (existingProfile?.positionFuzz && existingProfile.positionFuzzKm > 0) {
        const fuzzed = applyPositionFuzz(latitude, longitude, existingProfile.positionFuzzKm);
        fuzzedLat = fuzzed.lat;
        fuzzedLng = fuzzed.lng;
      }
    }
    if (latitude !== undefined) updateData.latitude = fuzzedLat;
    if (longitude !== undefined) updateData.longitude = fuzzedLng;
    if (latitude != null && longitude != null) updateData.coordinatesUpdatedAt = new Date();

    if (isAvailable === true) {
      await captureFirstAvailabilityLocation(userId, latitude, longitude, existingProfile?.latitude, existingProfile?.longitude);
    }

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      onlineTracker.setAvailability(userId, isAvailable);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      onlineTracker.setAvailability(userId, isAvailable);
      return res.json(profile);
    }
  } catch (error) {
    console.error("Toggle availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const requesterId = req.session.userId!;

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (isSystemAccount(targetUser)) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const isBlockedByTarget = await storage.hasBlockedUser(userId, requesterId);
    if (isBlockedByTarget && requesterId !== userId) {
      return res.status(403).json({ message: "Non puoi visualizzare questo profilo" });
    }

    if (targetUser.isFake && requesterId !== userId) {
      storage.recordFakeUserInteraction(userId, requesterId, "profile_view").catch(() => {});
    }
    const profile = await storage.getUserProfile(userId);
    const motorcycles = await storage.getUserMotorcycles(userId);
    const photos = await storage.getUserPhotos(userId);
    const approvedPhotos = photos.filter((p) => p.isApproved);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isOnline = !targetUser.ghostMode && targetUser.lastLoginAt != null && new Date(targetUser.lastLoginAt) >= fifteenMinutesAgo;
    const isBlockedByMe = await storage.hasBlockedUser(requesterId, userId);

    const [lastfmSession] = await db
      .select({ lastfmUsername: userLastfmSessions.lastfmUsername })
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    const [topTrack] = await db
      .select({ trackName: userMusicTracks.trackName, artistName: userMusicTracks.artistName })
      .from(userMusicTracks)
      .where(eq(userMusicTracks.userId, userId))
      .orderBy(desc(userMusicTracks.addedAt))
      .limit(1);

    const [primaryMembership] = await db
      .select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .orderBy(motoClubMembers.joinedAt)
      .limit(1);

    let primaryClubName: string | null = null;
    let primaryClubId: string | null = null;
    if (primaryMembership) {
      const [club] = await db
        .select({ id: motoClubs.id, name: motoClubs.name })
        .from(motoClubs)
        .where(eq(motoClubs.id, primaryMembership.clubId))
        .limit(1);
      if (club) {
        primaryClubName = club.name;
        primaryClubId = club.id;
      }
    }

    return res.json({
      id: targetUser.id,
      nickname: targetUser.nickname,
      userType: targetUser.userType,
      sex: targetUser.sex,
      coupleSexConfig: targetUser.coupleSexConfig,
      birthYear: targetUser.birthYear,
      region: targetUser.region,
      country: targetUser.country,
      avatarUrl: targetUser.avatarUrl,
      bio: profile?.bio || null,
      motorcycles,
      photos: approvedPhotos,
      isOnline,
      isAvailable: (profile?.isAvailable || false) && !targetUser.ghostMode && isOnline,
      isBlockedByMe,
      lastLoginAt: targetUser.lastLoginAt ?? null,
      lastfmUsername: lastfmSession?.lastfmUsername ?? null,
      topTrackName: topTrack?.trackName ?? null,
      topArtistName: topTrack?.artistName ?? null,
      primaryClubName,
      primaryClubId,
      latitude: (!profile?.hideFromMap && !targetUser.ghostMode) ? (profile?.latitude ?? null) : null,
      longitude: (!profile?.hideFromMap && !targetUser.ghostMode) ? (profile?.longitude ?? null) : null,
      coordinatesUpdatedAt: (!profile?.hideFromMap && !targetUser.ghostMode) ? (profile?.coordinatesUpdatedAt ?? null) : null,
    });
  } catch (error) {
    console.error("Get public user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Task #1212: onlineTracker.countOnlineUsers / getOnlineUserIds already exclude
// role="admin" users at the tracker level (setOnline rejects admins on entry).
// The storage-layer queries (getOnlineUsersList, countAvailableUsers,
// getAvailableUsersList, getNearbyUsers) also include notInArray(role, ["admin"]).
// Admins therefore cannot appear in the map count badge or heartbeat list.
router.get("/online-count", requireAuth, (req: Request, res: Response) => {
  const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
  return res.json({ count: onlineTracker.countOnlineUsers(countriesParam) });
});

router.get("/available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await storage.countAvailableUsers();
    return res.json({ count });
  } catch (error) {
    console.error("Available count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/online-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const [distanceCounterSetting, offlineRandomSetting, mapFilterSetting] = await Promise.all([
      storage.getAppSetting("show_distance_in_online_counter"),
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const showDistanceInCounter = distanceCounterSetting?.value !== "false";
    const globalOfflineRandomize = offlineRandomSetting?.value !== "false";
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = (req.query.includeOffline === "true" || mapVisibilityFilter === "available_only") && mapVisibilityFilter !== "online_only";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const trackerOnlineIds = onlineTracker.getOnlineUserIds(countriesParam);
    const onlineResults = trackerOnlineIds.length > 0
      ? await storage.getOnlineUsersList(fifteenMinutesAgo, lat, lng, countriesParam, trackerOnlineIds)
      : [];
    let allResults = onlineResults.filter((r: any) => !blockedIds.has(r.user.id));
    const onlineIdSet = new Set(trackerOnlineIds);
    if (includeOffline) {
      const { db } = await import("../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/schema");
      const { eq, and, lt, or, isNull, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      // Ghost users: always treated as offline regardless of lastLoginAt, but should appear in the
      // offline set so they show with a randomized position (not hidden) when offlinePositionRandomize is enabled.
      const offlineConds: any[] = [eq(usersTable.status, "active"), or(lt(usersTable.lastLoginAt, fifteenMinutesAgo), isNull(usersTable.lastLoginAt), eq(usersTable.ghostMode, true)), ...systemAccountConditions(usersTable)];
      if (countriesParam && countriesParam.length > 0) offlineConds.push(inArr(usersTable.country, countriesParam));
      const offlineResultsRaw = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(usersTable)
        .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
        .where(and(...offlineConds))
        .orderBy(sqlTag`distance`);
      // Defense-in-depth: strip stored coordinates and derived distance for users with hideFromMap=true.
      // For offline users with offlinePositionRandomize enabled, serve lastOfflineLat/Lng (fuzzed)
      // instead of the real latitude/longitude.
      const offlineResults = offlineResultsRaw.map((r: any) => {
        if (r.profile?.hideFromMap) return { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null };
        const useOfflineCoords = globalOfflineRandomize && r.profile?.offlinePositionRandomize !== false;
        const hasFuzzedCoords = r.profile?.lastOfflineLat != null && r.profile?.lastOfflineLng != null;
        const offLat = (useOfflineCoords && hasFuzzedCoords) ? r.profile.lastOfflineLat : r.profile?.latitude;
        const offLng = (useOfflineCoords && hasFuzzedCoords) ? r.profile.lastOfflineLng : r.profile?.longitude;
        // Null distance when serving fuzzed coords — SQL distance was computed from real position
        const offDist = (useOfflineCoords && hasFuzzedCoords) ? null : r.distance;
        return { ...r, profile: { ...r.profile, latitude: offLat, longitude: offLng }, distance: offDist };
      });
      const offlineOnly = offlineResults.filter((r: any) => !onlineIdSet.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...allResults, ...offlineOnly];
    }
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = allResults
      .map((item: any) => {
        const motos = motorcyclesMap[item.user.id] || [];
        const firstMoto = motos[0];
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          region: item.user.region,
          country: item.user.country,
          birthYear: item.user.birthYear,
          bio: item.profile?.bio || null,
          moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
          ridingStyle: firstMoto?.ridingStyle || null,
          distance: (!showDistanceInCounter || item.profile?.hideFromMap) ? null : (lat != null && lng != null && typeof item.distance === "number" && Number.isFinite(item.distance)) ? Math.round(item.distance * 10) / 10 : null,
          latitude: item.profile?.hideFromMap ? null : (item.profile?.latitude ?? null),
          longitude: item.profile?.hideFromMap ? null : (item.profile?.longitude ?? null),
          isAvailable: mapVisibilityFilter === "available_only"
            ? (item.profile?.isAvailable || false)
            : (item.profile?.isAvailable || false) && onlineIdSet.has(item.user.id),
          isOnline: onlineIdSet.has(item.user.id),
          lastLoginAt: item.user.lastLoginAt ?? null,
        };
      })
      .filter((u: any) => {
        if (mapVisibilityFilter === "online_only") return u.isOnline;
        if (mapVisibilityFilter === "available_only") return u.isAvailable;
        return true;
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Online list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const allItems = await storage.getAvailableUsersList(lat, lng);
    const results = allItems.filter((r: any) => !blockedIds.has(r.user.id));
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of results) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const mapped = results
      .map((item: any) => {
        const motos = motorcyclesMap[item.user.id] || [];
        const firstMoto = motos[0];
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          region: item.user.region,
          country: item.user.country,
          birthYear: item.user.birthYear,
          bio: item.profile?.bio || null,
          moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
          ridingStyle: firstMoto?.ridingStyle || null,
          // Privacy: null out distance for users who opted out of map visibility (maskHiddenLocationRows
          // already sets item.distance=null for those rows, but guard here prevents null→0 coercion)
          distance: (lat != null && lng != null && !item.profile?.hideFromMap && typeof item.distance === "number" && Number.isFinite(item.distance))
            ? Math.round(item.distance * 10) / 10
            : null,
          isAvailable: true,
          lastLoginAt: item.user.lastLoginAt ?? null,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/biker-available-count", requireAuth, (req: Request, res: Response) => {
  const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
  return res.json({ count: onlineTracker.countAvailableBikers(countriesParam) });
});

router.get("/zavorrine-available-count", requireAuth, (req: Request, res: Response) => {
  const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
  return res.json({ count: onlineTracker.countAvailableZavorrine(countriesParam) });
});

router.get("/biker-available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const trackerBikerIds = onlineTracker.getAvailableBikerIds(countriesParam);
    const onlineResultsRaw = trackerBikerIds.length > 0
      ? await storage.getAvailableBikersList(lat, lng, countriesParam, trackerBikerIds)
      : [];
    const onlineResults = onlineResultsRaw.filter((r: any) => !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline) {
      const { db } = await import("../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/schema");
      const { eq, and, or, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      const bikerConds: any[] = [eq(usersTable.status, "active"), or(eq(usersTable.userType, "biker"), eq(usersTable.userType, "coppia")), eq(usersTable.ghostMode, false), ...systemAccountConditions(usersTable)];
      if (countriesParam && countriesParam.length > 0) bikerConds.push(inArr(usersTable.country, countriesParam));
      const allBikersRaw = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...bikerConds))
        .orderBy(sqlTag`distance`);
      // Defense-in-depth: strip stored coordinates and derived distance for users with hideFromMap=true.
      const allBikers = allBikersRaw.map((r: any) => r.profile?.hideFromMap
        ? { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null }
        : r);
      const onlineIds = new Set(onlineResults.map((r: any) => r.user.id));
      const offlineOnly = allBikers.filter((r: any) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly];
    }
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r: any) => r.user.id));
    const mapped = allResults.map((item: any) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        country: item.user.country,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: item.profile?.hideFromMap ? null : (lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null),
        latitude: item.profile?.hideFromMap ? null : (item.profile?.latitude ?? null),
        longitude: item.profile?.hideFromMap ? null : (item.profile?.longitude ?? null),
        isAvailable: (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id),
        isOnline: onlineAvailableIds.has(item.user.id),
        lastLoginAt: item.user.lastLoginAt ?? null,
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Biker available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/zavorrine-available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const trackerZavIds = onlineTracker.getAvailableZavorrinaIds(countriesParam);
    const onlineResultsRaw = trackerZavIds.length > 0
      ? await storage.getAvailableZavorrinaList(lat, lng, countriesParam, trackerZavIds)
      : [];
    const onlineResults = onlineResultsRaw.filter((r: any) => !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline) {
      const { db } = await import("../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/schema");
      const { eq, and, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      const zavConds: any[] = [eq(usersTable.status, "active"), eq(usersTable.userType, "zavorrina"), eq(usersTable.ghostMode, false), ...systemAccountConditions(usersTable)];
      if (countriesParam && countriesParam.length > 0) zavConds.push(inArr(usersTable.country, countriesParam));
      const allZavRaw = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...zavConds))
        .orderBy(sqlTag`distance`);
      // Defense-in-depth: strip stored coordinates and derived distance for users with hideFromMap=true.
      const allZav = allZavRaw.map((r: any) => r.profile?.hideFromMap
        ? { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null }
        : r);
      const onlineIds = new Set(onlineResults.map((r: any) => r.user.id));
      const offlineOnly = allZav.filter((r: any) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly];
    }
    const motorcyclesMap: Record<string, any[]> = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r: any) => r.user.id));
    const mapped = allResults.map((item: any) => {
      const motos = motorcyclesMap[item.user.id] || [];
      const firstMoto = motos[0];
      return {
        id: item.user.id,
        nickname: item.user.nickname,
        userType: item.user.userType,
        sex: item.user.sex,
        region: item.user.region,
        country: item.user.country,
        birthYear: item.user.birthYear,
        bio: item.profile?.bio || null,
        moto: firstMoto ? `${firstMoto.brand} ${firstMoto.model}` : null,
        ridingStyle: firstMoto?.ridingStyle || null,
        distance: item.profile?.hideFromMap ? null : (lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null),
        latitude: item.profile?.hideFromMap ? null : (item.profile?.latitude ?? null),
        longitude: item.profile?.hideFromMap ? null : (item.profile?.longitude ?? null),
        isAvailable: (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id),
        isOnline: onlineAvailableIds.has(item.user.id),
        lastLoginAt: item.user.lastLoginAt ?? null,
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error("Zavorrine available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/nearby", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string) || 50;
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Parametri lat e lng richiesti" });
    }

    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const nearbyUsers = await storage.getNearbyUsers(lat, lng, radius, countriesParam);

    const fifteenMinutesAgoNearby = new Date(Date.now() - 15 * 60 * 1000);
    const results = nearbyUsers
      .filter((item) => !blockedIds.has(item.user.id))
      .filter((item) => !item.profile?.hideFromMap)
      .map((item) => {
        const isOnlineNearby = !item.user.ghostMode && item.user.lastLoginAt != null && new Date(item.user.lastLoginAt) >= fifteenMinutesAgoNearby;
        // Offline users with randomize enabled: serve fuzzed coords to protect real position
        const useOfflineCoords = !isOnlineNearby && item.profile?.offlinePositionRandomize !== false;
        const hasFuzzedCoords = item.profile?.lastOfflineLat != null && item.profile?.lastOfflineLng != null;
        const servedLat = (useOfflineCoords && hasFuzzedCoords) ? item.profile!.lastOfflineLat : item.profile?.latitude;
        const servedLng = (useOfflineCoords && hasFuzzedCoords) ? item.profile!.lastOfflineLng : item.profile?.longitude;
        // Distance was computed from real stored coords in SQL; null it for fuzzed users to avoid leaking position signal
        const servedDistance = (useOfflineCoords && hasFuzzedCoords) ? null : (typeof item.distance === "number" && Number.isFinite(item.distance) ? Math.round(item.distance * 10) / 10 : null);
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          latitude: servedLat,
          longitude: servedLng,
          isAvailable: (item.profile?.isAvailable || false) && isOnlineNearby,
          bio: item.profile?.bio || null,
          distance: servedDistance,
        };
      })
      .filter((item) => item.latitude != null && item.longitude != null && !isNaN(item.latitude as number) && !isNaN(item.longitude as number));

    return res.json(results);
  } catch (error) {
    console.error("Nearby users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) {
      return res.json([]);
    }
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const results = await storage.searchUsers(q);
    const fifteenMinutesAgoSearch = new Date(Date.now() - 15 * 60 * 1000);
    const safeResults = results
      .filter((item: any) => !blockedIds.has(item.user.id))
      .map((item: any) => {
        const isOnlineSearch = !item.user.ghostMode && item.user.lastLoginAt != null && new Date(item.user.lastLoginAt) >= fifteenMinutesAgoSearch;
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          latitude: (item.profile?.hideFromMap || item.user.ghostMode) ? null : (item.profile?.latitude || null),
          longitude: (item.profile?.hideFromMap || item.user.ghostMode) ? null : (item.profile?.longitude || null),
          isAvailable: (item.profile?.isAvailable || false) && isOnlineSearch,
          bio: item.profile?.bio || null,
        };
      });
    return res.json(safeResults);
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Foto utente — memorizzate su Replit Object Storage (cloud), path: public/photos/<filename>
// Persistono tra APK update, OTA update e cache del dispositivo.
// Vengono eliminate solo con deleteObject() oppure se l'account viene cancellato (cascade).
router.post("/me/photos", requireAuth, async (req: Request, res: Response) => {
  const multerError = await new Promise<MulterError | Error | null>((resolve) => {
    upload.single("photo")(req, res, ((err?: unknown) => {
      if (err instanceof MulterError || err instanceof Error) resolve(err);
      else resolve(null);
    }) as NextFunction);
  });

  if (multerError) {
    if (multerError instanceof MulterError && multerError.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Foto troppo grande. Dimensione massima consentita: 5 MB." });
    }
    return res.status(400).json({ message: multerError.message || "Formato file non supportato." });
  }

  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const count = await storage.getUserPhotoCount(userId);
    if (count >= 3) {
      return res.status(400).json({ message: "Massimo 3 foto consentite" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Nessuna foto caricata" });
    }

    const { compressToWebP } = await import("../utils/image-processing");
    const webpBuffer = await compressToWebP(req.file.buffer);
    const filename = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9) + ".webp";
    const objectPath = `public/photos/${filename}`;

    await uploadBuffer(objectPath, webpBuffer, "image/webp");

    const photoUrl = `/api/users/photos/${filename}`;
    const sortOrder = await storage.getUserPhotoCount(userId);

    const photo = await storage.createUserPhoto({
      userId,
      photoUrl,
      sortOrder,
      isApproved: true,
    });

    return res.status(201).json(photo);
  } catch (error) {
    console.error("Upload photo error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/photos/:filename", async (req: Request, res: Response) => {
  try {
    // SECURITY (Task #1080): l'endpoint serviva qualsiasi file in
    // public/photos/* a chiunque (anche logged-out) con
    // Cache-Control public/immutable. Cosi' un URL appreso da un profilo
    // visibile poteva essere riaperto da terzi non autenticati, condiviso
    // fuori app, o riusato dopo che la vittima aveva bloccato l'attaccante,
    // bypassando il gate di /api/users/:id/public.
    // Ora: 1) richiede sessione valida; 2) verifica che il chiamante non
    // sia bloccato dal proprietario; 3) richiede che la foto sia approvata
    // (oppure che il chiamante sia il proprietario stesso); 4) caching
    // privato cosi' nessun proxy condiviso conserva una copia.
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const requesterId = req.session.userId;
    const filename = req.params.filename;
    const photoUrl = `/api/users/photos/${filename}`;

    const [photoRow] = await db
      .select({ userId: userPhotos.userId, isApproved: userPhotos.isApproved })
      .from(userPhotos)
      .where(eq(userPhotos.photoUrl, photoUrl))
      .limit(1);

    if (!photoRow) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    const isOwner = photoRow.userId === requesterId;
    if (!isOwner) {
      if (!photoRow.isApproved) {
        return res.status(404).json({ message: "Foto non trovata" });
      }
      const blocked = await storage.hasBlockedUser(photoRow.userId, requesterId);
      if (blocked) {
        return res.status(403).json({ message: "Non puoi visualizzare questa foto" });
      }
    }

    const objectPath = `public/photos/${filename}`;
    const buffer = await downloadBuffer(objectPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(buffer);
  } catch {
    return res.status(404).json({ message: "Foto non trovata" });
  }
});

router.delete("/me/photos/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const photoId = req.params.id as string;

    const photo = await storage.getUserPhoto(photoId);
    if (!photo) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    if (photo.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const photoUrl = photo.photoUrl;
    if (photoUrl.startsWith("/api/users/photos/")) {
      const filename = photoUrl.replace("/api/users/photos/", "");
      try { await deleteObject(`public/photos/${filename}`); } catch {}
    } else if (photoUrl.startsWith("/uploads/photos/")) {
      try {
        const filePath = path.join(process.cwd(), photoUrl);
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
      } catch {}
    }

    await storage.deleteUserPhoto(photoId);

    return res.json({ message: "Foto eliminata" });
  } catch (error) {
    console.error("Delete photo error:", error);
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

router.get("/blocked", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedIds = await storage.getBlockedUsersByBlocker(blockerId);
    return res.json(blockedIds);
  } catch (error) {
    console.error("Get blocked users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/report", requireAuth, async (req: Request, res: Response) => {
  try {
    const reporterId = req.session.userId!;
    const reportedUserId = req.params.id as string;
    const { reason, description } = req.body;

    // Task #1125: throttle the legacy profile-report endpoint with the
    // SAME shared limiter as POST /api/reports. Without this, a script
    // could bypass the new endpoint's per-user/per-IP cap by hitting the
    // legacy URL the production app actually wires the report button to
    // (app/profile/[id].tsx). Sharing state via abuse-rate-limit means
    // 10 reports total across both routes triggers the 429.
    // Task #1126: derive the rate-limit IP via the centralized helper so all
    // public telemetry endpoints share the same trust-proxy contract.
    const ip = getTrustedClientIp(req) ?? "";
    if (reportRateLimiter.isOverLimit(reporterId, ip)) {
      return res.status(429).json({ message: "Hai inviato troppe segnalazioni. Riprova tra un'ora." });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({ message: "Non puoi segnalare te stesso" });
    }

    const validReasons = [
      "Spam",
      "Comportamento inappropriato",
      "Profilo falso/bot",
      "Molestia",
      "Contenuto offensivo",
      "Altro",
    ];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ message: "Motivo non valido" });
    }

    if (description && typeof description === "string" && description.length > 500) {
      return res.status(400).json({ message: "La descrizione non può superare 500 caratteri" });
    }

    const targetUser = await storage.getUser(reportedUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const reportData: InsertReport = {
      reporterId,
      reportedUserId,
      reason,
      description: (description && typeof description === "string") ? description : null,
      status: "pending",
    };
    await storage.createReport(reportData);

    return res.json({ message: "Segnalazione inviata con successo" });
  } catch (error) {
    console.error("Report user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi bloccare te stesso" });
    }

    const targetUser = await storage.getUser(blockedId);
    if (!targetUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }

    const alreadyBlocked = await storage.isBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      return res.status(409).json({ message: "Utente già bloccato" });
    }

    await storage.blockUser(blockerId, blockedId);
    await storage.deleteBikerBikerMatchesBetween(blockerId, blockedId);
    return res.json({ message: "Utente bloccato con successo" });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id/block", requireAuth, async (req: Request, res: Response) => {
  try {
    const blockerId = req.session.userId!;
    const blockedId = req.params.id as string;

    if (blockerId === blockedId) {
      return res.status(400).json({ message: "Non puoi sbloccare te stesso" });
    }

    const success = await storage.unblockUser(blockerId, blockedId);
    if (!success) {
      return res.status(404).json({ message: "Blocco non trovato" });
    }

    return res.json({ message: "Utente sbloccato con successo" });
  } catch (error) {
    console.error("Unblock user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
