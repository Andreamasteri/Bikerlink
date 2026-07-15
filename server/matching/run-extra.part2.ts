import { db } from "../db";
import { storage } from "../storage";
import {
  zavorrinaWishlists,
  zavorrinaWishlistMotos,
} from "@shared/db";
import { eq } from "drizzle-orm";
import { loadMatchPreferencesMap, prefEnabled, loadMatchingDisabledSet } from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import {
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  type ScoreBreakdown,
} from "./scoring";
import { loadTagSetsByCategory } from "./run-extra";

export async function runBikerZavorrinaTypeStyleMatching(): Promise<number> {
  try {
    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length === 0) return 0;

    const zavWishRows = await db
      .select({
        wishId: zavorrinaWishlistMotos.id,
        userId: zavorrinaWishlists.userId,
      })
      .from(zavorrinaWishlists)
      .innerJoin(zavorrinaWishlistMotos, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id));

    if (zavWishRows.length === 0) return 0;

    const thresholds = await loadMatchThresholds();
    const tipoThreshold = getThresholdSync("tipo_moto", thresholds);
    const stileThreshold = getThresholdSync("stile_guida", thresholds);
    const minCategories = await getSupermatchMinCategories();

    const motoIds = bikerMotorcycles.map(b => b.motorcycle.id);
    const [motoTipoTags, motoStileTags] = await Promise.all([
      loadTagSetsByCategory("motorcycle", motoIds, "tipo_moto"),
      loadTagSetsByCategory("motorcycle", motoIds, "stile_guida"),
    ]);

    const zavTipoByUser = new Map<string, Set<string>>();
    const zavStileByUser = new Map<string, Set<string>>();
    const wishRowsFull = await db
      .select({
        userId: zavorrinaWishlists.userId,
        motorcycleType: zavorrinaWishlistMotos.motorcycleType,
        ridingStyle: zavorrinaWishlistMotos.ridingStyle,
      })
      .from(zavorrinaWishlists)
      .innerJoin(zavorrinaWishlistMotos, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id));
    for (const r of wishRowsFull) {
      if (r.motorcycleType) {
        const s = zavTipoByUser.get(r.userId) ?? new Set<string>();
        s.add(r.motorcycleType.toLowerCase());
        zavTipoByUser.set(r.userId, s);
      }
      if (r.ridingStyle) {
        const s = zavStileByUser.get(r.userId) ?? new Set<string>();
        s.add(r.ridingStyle.toLowerCase());
        zavStileByUser.set(r.userId, s);
      }
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 200;
    const zavIds = [...new Set(zavWishRows.map(r => r.userId))];

    const matchingDisabledSet = await loadMatchingDisabledSet();

    for (const bm of bikerMotorcycles) {
      if (matchCount >= MAX) break;
      if (matchingDisabledSet.has(bm.userId)) continue;
      if (!prefEnabled(prefsMap, bm.userId, "bikerZavorrinaTypeStyle")) continue;
      const motoTipo = motoTipoTags.get(bm.motorcycle.id) ?? new Set<string>();
      const motoStile = motoStileTags.get(bm.motorcycle.id) ?? new Set<string>();
      if (motoTipo.size === 0 && motoStile.size === 0) continue;
      const primaryTipo = bm.motorcycle.motorcycleType?.toLowerCase() ?? "x";

      for (const zavId of zavIds) {
        if (matchCount >= MAX) break;
        if (zavId === bm.userId) continue;
        if (blockedSet.has(`${bm.userId}:${zavId}`)) { skipCount++; continue; }
        if (matchingDisabledSet.has(zavId)) { skipCount++; continue; }
        if (!prefEnabled(prefsMap, zavId, "bikerZavorrinaTypeStyle")) { skipCount++; continue; }

        const zavTipo = zavTipoByUser.get(zavId) ?? new Set<string>();
        const zavStile = zavStileByUser.get(zavId) ?? new Set<string>();
        const tipoOv = tagOverlap(motoTipo, zavTipo);
        const stileOv = tagOverlap(motoStile, zavStile);

        const tipoOk = tipoOv.common >= tipoThreshold.minCommonTags && tipoOv.jaccard >= tipoThreshold.jaccardThreshold;
        const stileOk = stileOv.common >= stileThreshold.minCommonTags && stileOv.jaccard >= stileThreshold.jaccardThreshold;
        if (!tipoOk && !stileOk) { skipCount++; continue; }

        const breakdown: ScoreBreakdown = {
          bikeTypeScore: Number(tipoOv.jaccard.toFixed(4)),
          bikeTypeCommon: tipoOv.common,
          styleScore: Number(stileOv.jaccard.toFixed(4)),
          styleCommon: stileOv.common,
        };
        const isSupermatch = isSupermatchByBreakdown(breakdown, thresholds, minCategories);

        const idA = bm.userId < zavId ? bm.userId : zavId;
        const idB = bm.userId < zavId ? zavId : bm.userId;
        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: `tipo_zav:${primaryTipo}`,
          status: "new",
          isSupermatch,
          pairType: "bz",
          scoreBreakdown: breakdown,
        });
        if (inserted) {
          matchCount++;
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({}),
          });
        } else skipCount++;
      }
    }

    console.log(`[ZavTypeStyleMatching] ${matchCount} biker-zavorrina type+style matches, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[ZavTypeStyleMatching] error:", error);
    return 0;
  }
}
