import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { isPositionFuzzed, fuzzedCoordsForViewer, systemAccountConditions } from "../users";
import { isSystemAccount } from "../../lib/system-account-filter";
import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/biker-available-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const includeOffline = req.query.includeOffline === "true";
    const countriesParam = req.query.countries ? (req.query.countries as string).split(",").filter(Boolean) : undefined;
    const blockedIds = new Set(await storage.getBlockedUserIds(requesterId));

    const [offlineRandomSetting, mapFilterSetting] = await Promise.all([
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const globalOfflineRandomize = offlineRandomSetting?.value !== "false";
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";

    const trackerBikerIds = onlineTracker.getAvailableBikerIds(countriesParam);
    const onlineResultsRaw = trackerBikerIds.length > 0
      ? await storage.getAvailableBikersList(lat, lng, countriesParam, trackerBikerIds)
      : [];
    const onlineResults = onlineResultsRaw.filter((r) => !isSystemAccount(r.user) && !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline && mapVisibilityFilter !== "online_only" && mapVisibilityFilter !== "available_only") {
      const { db } = await import("../../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/db");
      const { eq, and, or, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      const bikerConds: import("drizzle-orm").SQL<unknown>[] = [eq(usersTable.status, "active"), eq(usersTable.isFake, false), or(eq(usersTable.userType, "biker"), eq(usersTable.userType, "coppia")), eq(usersTable.ghostMode, false), ...systemAccountConditions(usersTable)];
      if (countriesParam && countriesParam.length > 0) bikerConds.push(inArr(usersTable.country, countriesParam));
      const allBikersRaw = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...bikerConds))
        .orderBy(sqlTag`distance`);
      const allBikers = allBikersRaw.map((r) => {
        if (r.profile?.hideFromMap) return { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null };
        const useOfflineCoords = globalOfflineRandomize && r.profile?.offlinePositionRandomize !== false;
        const hasFuzzedCoords = r.profile?.lastOfflineLat != null && r.profile?.lastOfflineLng != null;
        if (useOfflineCoords && hasFuzzedCoords) {
          return { ...r, profile: { ...r.profile, latitude: r.profile.lastOfflineLat, longitude: r.profile.lastOfflineLng }, distance: null };
        }
        return r;
      });
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allBikers.filter((r) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly] as typeof onlineResults;
    }
    const motorcyclesMap: Record<string, import("@shared/db").UserMotorcycle[]> = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r) => r.user.id));
    const mapped = allResults
      .filter((item) => {
        if (mapVisibilityFilter === "online_only") return onlineAvailableIds.has(item.user.id);
        if (mapVisibilityFilter === "available_only") return (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id);
        return true;
      })
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
          distance: (item.profile?.hideFromMap || isPositionFuzzed(item.profile, item.user.id === requesterId)) ? null : (lat != null && lng != null && typeof item.distance === "number" && Number.isFinite(item.distance) ? Math.round(item.distance * 10) / 10 : null),
          ...(() => {
            if (item.profile?.hideFromMap) return { latitude: null, longitude: null };
            const fc = fuzzedCoordsForViewer(item.profile?.latitude, item.profile?.longitude, item.profile, item.user.id === requesterId);
            return { latitude: fc.latitude, longitude: fc.longitude };
          })(),
          isAvailable: (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id),
          isOnline: onlineAvailableIds.has(item.user.id),
          lastLoginAt: item.user.lastLoginAt ?? null,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Biker available list error:", error);
    return sendError(res, 500, "Errore interno");
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

    const [offlineRandomSetting, mapFilterSetting] = await Promise.all([
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    const globalOfflineRandomize = offlineRandomSetting?.value !== "false";
    const mapVisibilityFilter = (mapFilterSetting?.value as "all" | "online_only" | "available_only") || "all";

    const trackerZavIds = onlineTracker.getAvailableZavorrinaIds(countriesParam);
    const onlineResultsRaw = trackerZavIds.length > 0
      ? await storage.getAvailableZavorrinaList(lat, lng, countriesParam, trackerZavIds)
      : [];
    const onlineResults = onlineResultsRaw.filter((r) => !isSystemAccount(r.user) && !blockedIds.has(r.user.id));
    let allResults = onlineResults;
    if (includeOffline && mapVisibilityFilter !== "online_only" && mapVisibilityFilter !== "available_only") {
      const { db } = await import("../../db");
      const { users: usersTable, userProfiles: profilesTable } = await import("@shared/db");
      const { eq, and, inArray: inArr } = await import("drizzle-orm");
      const { sql: sqlTag } = await import("drizzle-orm");
      const distanceExpr = lat != null && lng != null
        ? sqlTag<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${profilesTable.latitude})) * cos(radians(${profilesTable.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${profilesTable.latitude}))))`.as("distance")
        : sqlTag<number>`0`.as("distance");
      const zavConds: import("drizzle-orm").SQL<unknown>[] = [eq(usersTable.status, "active"), eq(usersTable.isFake, false), eq(usersTable.userType, "zavorrina"), eq(usersTable.ghostMode, false), ...systemAccountConditions(usersTable)];
      if (countriesParam && countriesParam.length > 0) zavConds.push(inArr(usersTable.country, countriesParam));
      const allZavRaw = await db
        .select({ user: usersTable, profile: profilesTable, distance: distanceExpr })
        .from(profilesTable)
        .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
        .where(and(...zavConds))
        .orderBy(sqlTag`distance`);
      const allZav = allZavRaw.map((r) => {
        if (r.profile?.hideFromMap) return { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: null };
        const useOfflineCoords = globalOfflineRandomize && r.profile?.offlinePositionRandomize !== false;
        const hasFuzzedCoords = r.profile?.lastOfflineLat != null && r.profile?.lastOfflineLng != null;
        if (useOfflineCoords && hasFuzzedCoords) {
          return { ...r, profile: { ...r.profile, latitude: r.profile.lastOfflineLat, longitude: r.profile.lastOfflineLng }, distance: null };
        }
        return r;
      });
      const onlineIds = new Set(onlineResults.map((r) => r.user.id));
      const offlineOnly = allZav.filter((r) => !onlineIds.has(r.user.id) && !blockedIds.has(r.user.id));
      allResults = [...onlineResults, ...offlineOnly] as typeof onlineResults;
    }
    const motorcyclesMap: Record<string, import("@shared/db").UserMotorcycle[]> = {};
    for (const item of allResults) {
      if (!motorcyclesMap[item.user.id]) {
        motorcyclesMap[item.user.id] = await storage.getUserMotorcycles(item.user.id);
      }
    }
    const onlineAvailableIds = new Set(onlineResults.map((r) => r.user.id));
    const mapped = allResults
      .filter((item) => {
        if (mapVisibilityFilter === "online_only") return onlineAvailableIds.has(item.user.id);
        if (mapVisibilityFilter === "available_only") return (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id);
        return true;
      })
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
          distance: (item.profile?.hideFromMap || isPositionFuzzed(item.profile, item.user.id === requesterId)) ? null : (lat != null && lng != null && typeof item.distance === "number" && Number.isFinite(item.distance) ? Math.round(item.distance * 10) / 10 : null),
          ...(() => {
            if (item.profile?.hideFromMap) return { latitude: null, longitude: null };
            const fc = fuzzedCoordsForViewer(item.profile?.latitude, item.profile?.longitude, item.profile, item.user.id === requesterId);
            return { latitude: fc.latitude, longitude: fc.longitude };
          })(),
          isAvailable: (item.profile?.isAvailable || false) && onlineAvailableIds.has(item.user.id),
          isOnline: onlineAvailableIds.has(item.user.id),
          lastLoginAt: item.user.lastLoginAt ?? null,
        };
      });
    return res.json(mapped);
  } catch (error) {
    console.error("Zavorrine available list error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
