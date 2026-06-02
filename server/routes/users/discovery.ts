import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { isPositionFuzzed, fuzzedCoordsForViewer, systemAccountConditions } from "../users";

import { requireAuth } from "../../lib/auth-middleware";
import availableRouter from "./discovery-available";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const latRaw = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lngRaw = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const lat = Number.isFinite(latRaw) ? latRaw : undefined;
    const lng = Number.isFinite(lngRaw) ? lngRaw : undefined;
    const blockedIds = await storage.getBlockedUserIds(requesterId);
    const blockedSet = new Set(blockedIds);

    const mapFilterSetting = await storage.getAppSetting("map_visibility_filter");
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";

    const onlineIdSet = mapVisibilityFilter !== "all" ? new Set(onlineTracker.getOnlineUserIds()) : null;
    const availableIdSet = mapVisibilityFilter === "available_only"
      ? new Set([...onlineTracker.getAvailableBikerIds(), ...onlineTracker.getAvailableZavorrinaIds()])
      : null;

    function passesVisibilityFilter(userId: string): boolean {
      if (mapVisibilityFilter === "online_only") return onlineIdSet!.has(userId);
      if (mapVisibilityFilter === "available_only") return availableIdSet!.has(userId);
      return true;
    }

    if (lat != null && lng != null) {
      const { db } = await import("../../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/db");
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
      return res.json((rows as UserDistanceRow[])
        .filter((r) => passesVisibilityFilter(r.user.id))
        .map((r) => ({
          id: r.user.id,
          nickname: r.user.nickname,
          avatarUrl: r.user.avatarUrl,
          userType: r.user.userType,
          // Privacy: do not leak derived distance for users who opted out of map visibility
          distance: r.hideFromMap ? null : (typeof r.distance === "number" && Number.isFinite(r.distance) ? Math.round(r.distance * 10) / 10 : null),
        })));
    }

    const allUsers = await storage.getAllUsers();
    const { isSystemAccount } = await import("../../lib/system-account-filter");
    const results = allUsers
      .filter((u) => !blockedSet.has(u.id) && u.id !== requesterId && !isSystemAccount(u) && passesVisibilityFilter(u.id))
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
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/online-count", requireAuth, (req: Request, res: Response) => {
  const countriesParam = req.query.countries
    ? (req.query.countries as string).split(",").filter(Boolean)
    : undefined;
  return res.json({ count: onlineTracker.countOnlineUsers(countriesParam) });
});

router.get("/available-count", requireAuth, async (req: Request, res: Response) => {
  try {
    const bikerCount = onlineTracker.countAvailableBikers();
    const zavorrinaCount = onlineTracker.countAvailableZavorrine();
    return res.json({
      bikers: bikerCount,
      zavorrine: zavorrinaCount,
      total: bikerCount + zavorrinaCount,
    });
  } catch (error) {
    console.error("Available count error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/online-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const countriesParam = req.query.countries
      ? (req.query.countries as string).split(",").filter(Boolean)
      : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));

    const [offlineRandomSetting, showDistanceSetting, mapFilterSetting] = await Promise.all([
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("show_distance_in_nearby_counter"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const globalOfflineRandomize = offlineRandomSetting?.value !== "false";
    const showDistanceInCounter = showDistanceSetting?.value === "true";
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";

    const onlineIdSet = new Set(onlineTracker.getOnlineUserIds(countriesParam));
    const trackerAvailableIds = mapVisibilityFilter === "available_only"
      ? [...onlineTracker.getAvailableBikerIds(countriesParam), ...onlineTracker.getAvailableZavorrinaIds(countriesParam)]
      : onlineTracker.getOnlineUserIds(countriesParam);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const onlineResultsRaw = trackerAvailableIds.length > 0
      ? await storage.getOnlineUsersList(since, lat, lng, countriesParam, trackerAvailableIds as string[])
      : [];
    const onlineResults = onlineResultsRaw.filter((r) => !blockedIds.has(r.user.id));
    type OnlineRow = typeof onlineResults[number];
    let allResults: OnlineRow[] = onlineResults;

    if (mapVisibilityFilter !== "online_only" && mapVisibilityFilter !== "available_only") {
      try {
        const { db } = await import("../../db");
        const { users: usersTable, userProfiles: profilesTable } = await import("@shared/db");
        const { eq, and, notInArray: notInArr, inArray: inArr } = await import("drizzle-orm");
        const { sql: sqlTag } = await import("drizzle-orm");
        const distanceExpr = lat != null && lng != null
          ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
          : sqlTag<number>`0`.as("distance");
        const offlineConditions: import("drizzle-orm").SQL<unknown>[] = [
          notInArr(usersTable.id, [requesterId, ...Array.from(blockedIds)]),
          ...systemAccountConditions(usersTable),
        ];
        if (countriesParam && countriesParam.length > 0) {
          offlineConditions.push(inArr(usersTable.country, countriesParam));
        }
        const offlineResultsRaw = await db
          .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
          .from(profilesTable)
          .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
          .where(and(...offlineConditions))
          .orderBy(sqlTag`distance`)
          .limit(50);
        const offlineResults = offlineResultsRaw.map((r) => {
          if (r.profile?.hideFromMap) return { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null };
          const useOfflineCoords = globalOfflineRandomize && r.profile?.offlinePositionRandomize !== false;
          const hasFuzzedCoords = r.profile?.lastOfflineLat != null && r.profile?.lastOfflineLng != null;
          const offLat = (useOfflineCoords && hasFuzzedCoords) ? r.profile.lastOfflineLat : r.profile?.latitude;
          const offLng = (useOfflineCoords && hasFuzzedCoords) ? r.profile.lastOfflineLng : r.profile?.longitude;
          const offDist = (useOfflineCoords && hasFuzzedCoords) ? null : r.distance;
          return { ...r, profile: { ...r.profile, latitude: offLat, longitude: offLng }, distance: offDist };
        });
        const offlineOnly = offlineResults.filter((r) => !onlineIdSet.has(r.user.id) && !blockedIds.has(r.user.id));
        allResults = [...allResults, ...(offlineOnly as OnlineRow[])];
      } catch (offlineErr) {
        console.warn("[online-list] offline users query skipped:", (offlineErr as Error)?.message);
      }
    }
    const allUserIds = [...new Set(allResults.map(item => item.user.id))];
    const allMotoBatch = await storage.getUserMotorcyclesBatch(allUserIds);
    const motorcyclesMap: Record<string, import("@shared/db").UserMotorcycle[]> = {};
    for (const moto of allMotoBatch) {
      if (!motorcyclesMap[moto.userId]) motorcyclesMap[moto.userId] = [];
      motorcyclesMap[moto.userId].push(moto);
    }
    const mapped = allResults
      .map((item) => {
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
          distance: (!showDistanceInCounter || item.profile?.hideFromMap || isPositionFuzzed(item.profile, item.user.id === requesterId)) ? null : (lat != null && lng != null && typeof item.distance === "number" && Number.isFinite(item.distance)) ? Math.round(item.distance * 10) / 10 : null,
          ...(() => {
            if (item.profile?.hideFromMap) return { latitude: null, longitude: null };
            const fc = fuzzedCoordsForViewer(item.profile?.latitude, item.profile?.longitude, item.profile, item.user.id === requesterId);
            return { latitude: fc.latitude, longitude: fc.longitude };
          })(),
          isAvailable: mapVisibilityFilter === "available_only"
            ? (item.profile?.isAvailable || false)
            : (item.profile?.isAvailable || false) && onlineIdSet.has(item.user.id),
          isOnline: onlineIdSet.has(item.user.id),
          lastLoginAt: item.user.lastLoginAt ?? null,
        };
      })
      .filter((u) => {
        if (mapVisibilityFilter === "online_only") return u.isOnline;
        if (mapVisibilityFilter === "available_only") return u.isAvailable;
        return true;
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Online list error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));

    const mapFilterSetting = await storage.getAppSetting("map_visibility_filter");
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";
    const onlineIdSet = mapVisibilityFilter === "online_only" ? new Set(onlineTracker.getOnlineUserIds()) : null;

    const allItems = await storage.getAvailableUsersList(lat, lng);
    const results = allItems.filter((r) => {
      if (blockedIds.has(r.user.id)) return false;
      if (mapVisibilityFilter === "online_only") return onlineIdSet!.has(r.user.id);
      return true;
    });
    const availableUserIds = [...new Set(results.map(item => item.user.id))];
    const availableMotoBatch = await storage.getUserMotorcyclesBatch(availableUserIds);
    const motorcyclesMap: Record<string, import("@shared/db").UserMotorcycle[]> = {};
    for (const moto of availableMotoBatch) {
      if (!motorcyclesMap[moto.userId]) motorcyclesMap[moto.userId] = [];
      motorcyclesMap[moto.userId].push(moto);
    }
    const mapped = results
      .map((item) => {
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
    return sendError(res, 500, "Errore interno");
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

router.get("/nearby", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    // Task #2697: radius assente/"world"/"all"/0 → world (nessun filtro distanza);
    // numerico > 0 → raggio km; non parsabile → default 50km (retro-compatibilità).
    const rawRadius = req.query.radius;
    let radius: number;
    if (rawRadius === undefined || rawRadius === null || rawRadius === "") {
      radius = 0;
    } else if (typeof rawRadius === "string" && (rawRadius === "world" || rawRadius === "all")) {
      radius = 0;
    } else {
      const parsed = parseFloat(rawRadius as string);
      radius = Number.isFinite(parsed) ? parsed : 50;
    }
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    // Task #2721 — filtro opzionale per tag della moto sulla mappa.
    // Accetta `motoTags=<id1>,<id2>` (id dei tag, qualunque categoria,
    // tipicamente `tipo_moto`/`stile_guida`). Semantica OR: include utenti
    // con almeno una moto associata a uno dei tag richiesti.
    const motoTagsParam = req.query.motoTags
      ? (req.query.motoTags as string).split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (isNaN(lat) || isNaN(lng)) {
      return sendError(res, 400, "Parametri lat e lng richiesti");
    }
    const [offlineRandomSetting, mapFilterSetting] = await Promise.all([
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const globalOfflineRandomize = offlineRandomSetting?.value !== "false";
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));
    const nearbyUsers = await storage.getNearbyUsers(lat, lng, radius, countriesParam, motoTagsParam);
    const fifteenMinutesAgoNearby = new Date(Date.now() - 15 * 60 * 1000);
    const results = nearbyUsers
      .filter((item) => !blockedIds.has(item.user.id))
      .filter((item) => !item.profile?.hideFromMap)
      .map((item) => {
        const isOnlineNearby = !item.user.ghostMode && item.user.lastLoginAt != null && new Date(item.user.lastLoginAt) >= fifteenMinutesAgoNearby;
        const useOfflineCoords = !isOnlineNearby && globalOfflineRandomize && item.profile?.offlinePositionRandomize !== false;
        const hasFuzzedCoords = item.profile?.lastOfflineLat != null && item.profile?.lastOfflineLng != null;
        const servedLat = (useOfflineCoords && hasFuzzedCoords) ? item.profile!.lastOfflineLat : item.profile?.latitude;
        const servedLng = (useOfflineCoords && hasFuzzedCoords) ? item.profile!.lastOfflineLng : item.profile?.longitude;
        const servedDistance = ((useOfflineCoords && hasFuzzedCoords) || isPositionFuzzed(item.profile, item.user.id === requesterId)) ? null : (typeof item.distance === "number" && Number.isFinite(item.distance) ? Math.round(item.distance * 10) / 10 : null);
        return {
          id: item.user.id,
          nickname: item.user.nickname,
          userType: item.user.userType,
          sex: item.user.sex,
          birthYear: item.user.birthYear,
          region: item.user.region,
          country: item.user.country,
          avatarUrl: item.user.avatarUrl,
          ...(() => {
            const fc = fuzzedCoordsForViewer(servedLat, servedLng, item.profile, item.user.id === requesterId);
            return { latitude: fc.latitude, longitude: fc.longitude };
          })(),
          isAvailable: (item.profile?.isAvailable || false) && isOnlineNearby,
          isOnline: isOnlineNearby,
          bio: item.profile?.bio || null,
          distance: servedDistance,
        };
      })
      .filter((item) => item.latitude != null && item.longitude != null && !isNaN(item.latitude as number) && !isNaN(item.longitude as number))
      .filter((item) => {
        if (mapVisibilityFilter === "online_only") return item.isOnline;
        if (mapVisibilityFilter === "available_only") return item.isAvailable;
        return true;
      });

    return res.json(results);
  } catch (error) {
    console.error("Nearby users error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.use(availableRouter);

export default router;
