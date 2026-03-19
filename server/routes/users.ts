import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { isProtectedUser } from "../constants";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "photos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato. Usa JPEG, PNG o WebP."));
    }
  },
});

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const blockedIds = await storage.getBlockedUserIds(requesterId);
    const blockedSet = new Set(blockedIds);
    const allUsers = await storage.getAllUsers();
    const results = allUsers
      .filter((u) => !blockedSet.has(u.id) && u.id !== requesterId)
      .map((u) => ({
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        userType: u.userType,
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

    const allowedUserFields = ["nickname", "phone", "sex", "coupleSexConfig", "birthYear", "region", "country", "avatarUrl"];
    const userUpdate: Record<string, unknown> = {};
    for (const field of allowedUserFields) {
      if (req.body[field] !== undefined) {
        userUpdate[field] = req.body[field];
      }
    }

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
    }

    const allowedProfileFields = ["bio", "maxPickupDistance", "latitude", "longitude"];
    const profileUpdate: Record<string, unknown> = {};
    for (const field of allowedProfileFields) {
      if (req.body[field] !== undefined) {
        profileUpdate[field] = req.body[field];
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
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
    const { isAvailable, latitude, longitude, searchPreference } = req.body;
    const existingProfile = await storage.getUserProfile(userId);
    const updateData: Record<string, unknown> = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (searchPreference !== undefined) updateData.searchPreference = searchPreference;

    if (isAvailable === true) {
      await storage.updateUser(userId, { ghostMode: false } as any);
    }

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
      return res.json(profile);
    }
  } catch (error) {
    console.error("Update dynamic profile error:", error);
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
        await storage.updateUserProfile(userId, { isAvailable: false } as any);
      }
    }
    return res.json({ ghostMode: enabled });
  } catch (error) {
    console.error("Ghost mode toggle error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Latitudine e longitudine richieste" });
    }
    const existingProfile = await storage.getUserProfile(userId);
    if (existingProfile) {
      await storage.updateUserProfile(userId, { latitude, longitude } as any);
    } else {
      await storage.createUserProfile({ userId, latitude, longitude } as any);
    }
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

    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    if (existingProfile) {
      const profile = await storage.updateUserProfile(userId, updateData as any);
      return res.json(profile);
    } else {
      const profile = await storage.createUserProfile({ userId, ...updateData } as any);
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

    const isBlockedRelation = await storage.isBlocked(requesterId, userId);
    if (isBlockedRelation && requesterId !== userId) {
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
      isAvailable: (profile?.isAvailable || false) && !targetUser.ghostMode,
    });
  } catch (error) {
    console.error("Get public user profile error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/online-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const count = await storage.countOnlineUsers(fifteenMinutesAgo, countriesParam);
    return res.json({ count });
  } catch (error) {
    console.error("Online count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const count = await storage.countAvailableUsers(fifteenMinutesAgo);
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
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResults = await storage.getOnlineUsersList(fifteenMinutesAgo, lat, lng, countriesParam);
    let allResults = onlineResults.filter((r: any) => !blockedIds.has(r.user.id));
    const onlineIdSet = new Set(allResults.map((r: any) => r.user.id));
    if (includeOffline) {
      const { db } = await import("../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/schema");
      const { eq, and, lt, or, isNull, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      const offlineConds: any[] = [eq(usersTable.status, "active"), or(lt(usersTable.lastLoginAt, fifteenMinutesAgo), isNull(usersTable.lastLoginAt)), eq(usersTable.ghostMode, false)];
      if (countriesParam && countriesParam.length > 0) offlineConds.push(inArr(usersTable.country, countriesParam));
      const offlineResults = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(usersTable)
        .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
        .where(and(...offlineConds))
        .orderBy(sqlTag`distance`);
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
          distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
          isAvailable: item.profile?.isAvailable || false,
          isOnline: onlineIdSet.has(item.user.id),
        };
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
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const allItems = await storage.getAvailableUsersList(fifteenMinutesAgo, lat, lng);
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
          distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
          isAvailable: true,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Available list error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/biker-available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const count = await storage.countAvailableBikers(fifteenMinutesAgo, countriesParam);
    return res.json({ count });
  } catch (error) {
    console.error("Biker available count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/zavorrine-available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const count = await storage.countAvailableZavorrine(fifteenMinutesAgo, countriesParam);
    return res.json({ count });
  } catch (error) {
    console.error("Zavorrine available count error:", error);
    return res.json({ count: 0 });
  }
});

router.get("/biker-available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResultsRaw = await storage.getAvailableBikersList(fifteenMinutesAgo, lat, lng, countriesParam);
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
      const bikerConds: any[] = [eq(usersTable.status, "active"), or(eq(usersTable.userType, "biker"), eq(usersTable.userType, "coppia")), eq(usersTable.ghostMode, false)];
      if (countriesParam && countriesParam.length > 0) bikerConds.push(inArr(usersTable.country, countriesParam));
      const allBikers = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...bikerConds))
        .orderBy(sqlTag`distance`);
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
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: item.profile?.isAvailable || false,
        isOnline: onlineAvailableIds.has(item.user.id),
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
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const onlineResultsRaw = await storage.getAvailableZavorrinaList(fifteenMinutesAgo, lat, lng, countriesParam);
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
      const zavConds: any[] = [eq(usersTable.status, "active"), eq(usersTable.userType, "zavorrina"), eq(usersTable.ghostMode, false)];
      if (countriesParam && countriesParam.length > 0) zavConds.push(inArr(usersTable.country, countriesParam));
      const allZav = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...zavConds))
        .orderBy(sqlTag`distance`);
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
        distance: lat != null && lng != null ? Math.round(item.distance * 10) / 10 : null,
        isAvailable: item.profile?.isAvailable || false,
        isOnline: onlineAvailableIds.has(item.user.id),
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

    const results = nearbyUsers
      .filter((item) => !blockedIds.has(item.user.id))
      .map((item) => {
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          latitude: item.profile?.latitude,
          longitude: item.profile?.longitude,
          isAvailable: item.profile?.isAvailable || false,
          bio: item.profile?.bio || null,
          distance: Math.round(item.distance * 10) / 10,
        };
      })
      .filter((item) => item.latitude != null && item.longitude != null && !isNaN(item.latitude) && !isNaN(item.longitude));

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
    const safeResults = results
      .filter((item: any) => !blockedIds.has(item.user.id))
      .map((item: any) => {
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          latitude: item.profile?.latitude || null,
          longitude: item.profile?.longitude || null,
          isAvailable: item.profile?.isAvailable || false,
          bio: item.profile?.bio || null,
        };
      });
    return res.json(safeResults);
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/me/photos", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (user.userType === "zavorrina") {
      const count = await storage.getUserPhotoCount(userId);
      if (count >= 3) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: "Massimo 3 foto consentite per le zavorrine" });
      }
    }

    if (!req.file) {
      return res.status(400).json({ message: "Nessuna foto caricata" });
    }

    const photoUrl = `/uploads/photos/${req.file.filename}`;
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

    const filePath = path.join(process.cwd(), photo.photoUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
    return res.json({ message: "Utente bloccato con successo" });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
