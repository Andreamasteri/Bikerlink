import { storage } from "../storage";
import { db } from "../db";
import { entityTags, tags, tagCategories } from "@shared/db";
import { and, eq, inArray } from "drizzle-orm";
import { loadMatchPreferencesMap, bothPrefsEnabled, loadMatchingDisabledSet, neitherMatchingDisabled } from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { getMultiplierForPair } from "./time-profile";
import {
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  type ScoreBreakdown,
  type ThresholdsMap,
} from "./scoring";

/**
 * Carica Map<motorcycleId, Set<tagSlug>> per una categoria.
 */
async function loadMotoTagsByCategory(motoIds: string[], categorySlug: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (motoIds.length === 0) return out;
  const rows = await db
    .select({ entityId: entityTags.entityId, slug: tags.slug })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .innerJoin(tagCategories, and(eq(tagCategories.id, tags.categoryId), eq(tagCategories.slug, categorySlug)))
    .where(and(eq(entityTags.entityType, "motorcycle"), inArray(entityTags.entityId, motoIds)));
  for (const r of rows) {
    let s = out.get(r.entityId);
    if (!s) { s = new Set(); out.set(r.entityId, s); }
    s.add(r.slug);
  }
  return out;
}

/**
 * Calcola breakdown stile_guida + tipo_moto per una coppia di moto.
 * Task #2513 — usato sia in brand-matching (per decidere supermatch) sia in
 * type-style matching (come gate primario).
 */
function computeStyleTypeBreakdown(
  motoA: string,
  motoB: string,
  tipoMap: Map<string, Set<string>>,
  stileMap: Map<string, Set<string>>,
): ScoreBreakdown {
  const tipoA = tipoMap.get(motoA) ?? new Set<string>();
  const tipoB = tipoMap.get(motoB) ?? new Set<string>();
  const stileA = stileMap.get(motoA) ?? new Set<string>();
  const stileB = stileMap.get(motoB) ?? new Set<string>();
  const tipoOv = tagOverlap(tipoA, tipoB);
  const stileOv = tagOverlap(stileA, stileB);
  return {
    bikeTypeScore: Number(tipoOv.jaccard.toFixed(4)),
    bikeTypeCommon: tipoOv.common,
    styleScore: Number(stileOv.jaccard.toFixed(4)),
    styleCommon: stileOv.common,
  };
}

export async function runBikerBikerMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch { /* no-op: fallback to default if JSON is invalid */ }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    console.log(`[BikerBikerMatching] moto biker trovate: ${bikerMotorcycles.length} (admin esclusi dal pool)`);
    if (bikerMotorcycles.length < 2) {
      console.warn("[BikerBikerMatching] WARN: meno di 2 moto biker trovate, matching impossibile");
      return 0;
    }

    const buckets = new Map<string, Array<{ userId: string; motoId: string; brand: string; model: string }>>();
    for (const bm of bikerMotorcycles) {
      if (!bm.motorcycle.brand) continue;
      const key = bm.motorcycle.brand.toLowerCase();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({
        userId: bm.userId,
        motoId: bm.motorcycle.id,
        brand: bm.motorcycle.brand,
        model: bm.motorcycle.model || "",
      });
    }

    const bucketsWithMultiple = [...buckets.values()].filter(m => m.length > 1);
    console.log(`[BikerBikerMatching] bucket creati: ${buckets.size}, con più di 1 membro: ${bucketsWithMultiple.length}`);

    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );
    const isPairBlocked = (id1: string, id2: string) => blockedSet.has(`${id1}:${id2}`);
    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();

    // Task #2513: precarica i tag tipo_moto + stile_guida per tutte le moto
    // così possiamo calcolare il breakdown senza N+1 query.
    const allMotoIds = bikerMotorcycles.map(b => b.motorcycle.id);
    const [tipoMap, stileMap] = await Promise.all([
      loadMotoTagsByCategory(allMotoIds, "tipo_moto"),
      loadMotoTagsByCategory(allMotoIds, "stile_guida"),
    ]);
    const thresholds: ThresholdsMap = await loadMatchThresholds();
    const minCategories = await getSupermatchMinCategories();

    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_BUCKET = 100;

    const shuffledBuckets = [...buckets.values()].sort(() => Math.random() - 0.5);

    for (const members of shuffledBuckets) {
      if (members.length < 2) continue;
      const uniqueMembers = members
        .filter((m, idx) => members.findIndex(x => x.userId === m.userId) === idx)
        .sort(() => Math.random() - 0.5);
      if (uniqueMembers.length < 2) continue;

      let bucketCount = 0;
      const maxPairs = (uniqueMembers.length * (uniqueMembers.length - 1)) / 2;
      const bucketCap = Math.min(MAX_MATCHES_PER_BUCKET, maxPairs);

      outer:
      for (let i = 0; i < uniqueMembers.length; i++) {
        for (let j = i + 1; j < uniqueMembers.length; j++) {
          if (bucketCount >= bucketCap) break outer;
          const m1 = uniqueMembers[i];
          const m2 = uniqueMembers[j];
          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          if (isPairBlocked(m1.userId, m2.userId)) { skipCount++; continue; }
          if (!neitherMatchingDisabled(matchingDisabledSet, m1.userId, m2.userId)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, m1.userId, m2.userId, "bikerBikerBrand")) { skipCount++; continue; }

          // Task #2521 — time-profile multiplier come gate probabilistico.
          const timeMult = await getMultiplierForPair(m1.userId, m2.userId);
          if (timeMult < 1.0 && Math.random() > timeMult) { skipCount++; continue; }

          // Task #2513: il breakdown contribuisce alla decisione supermatch
          // (stesso brand + ≥N categorie sopra soglia). Lo stesso modello
          // tra le due moto resta condizione necessaria per il "vero" supermatch.
          const breakdown = computeStyleTypeBreakdown(m1.motoId, m2.motoId, tipoMap, stileMap);
          const sameModel = !!(m1.model && m2.model && m1.model.toLowerCase() === m2.model.toLowerCase());
          const isSupermatch = sameModel && isSupermatchByBreakdown(breakdown, thresholds, minCategories);

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: m1.brand,
            status: "new",
            isSupermatch,
            scoreBreakdown: breakdown,
          });
          if (inserted) {
            matchCount++; bucketCount++;
            await dispatchMatchNotification({
              table: "biker_biker_matches",
              matchId: inserted.id,
              userIds: [idA, idB],
              priority: classifyMatch({ isSupermatch }),
              isSupermatch,
            });
          } else skipCount++;
        }
      }
    }

    console.log(`[BikerBikerMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    return matchCount;
  } catch (error) {
    console.error("Biker-biker matching error:", error);
    return 0;
  }
}

export async function runBikerBikerTypeStyleMatching(): Promise<number> {
  try {
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length < 2) return 0;

    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    // Task #2513: matcher type-style ora basato su tag-overlap (stile_guida
    // + tipo_moto), non più su match esatto di stringhe. Una coppia entra
    // come match se almeno una delle due categorie supera la soglia.
    const motoIds = bikerMotorcycles.map(b => b.motorcycle.id);
    const [tipoMap, stileMap] = await Promise.all([
      loadMotoTagsByCategory(motoIds, "tipo_moto"),
      loadMotoTagsByCategory(motoIds, "stile_guida"),
    ]);
    const thresholds = await loadMatchThresholds();
    const tipoThr = getThresholdSync("tipo_moto", thresholds);
    const stileThr = getThresholdSync("stile_guida", thresholds);
    const minCategories = await getSupermatchMinCategories();

    const candidates = bikerMotorcycles.filter(bm => {
      const t = tipoMap.get(bm.motorcycle.id)?.size ?? 0;
      const s = stileMap.get(bm.motorcycle.id)?.size ?? 0;
      return t > 0 || s > 0;
    });

    let matchCount = 0;
    let skipCount = 0;
    const MAX = 2000;

    outer:
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (matchCount >= MAX) break outer;
        const a = candidates[i];
        const b = candidates[j];
        if (a.userId === b.userId) continue;
        if (blockedSet.has(`${a.userId}:${b.userId}`)) { skipCount++; continue; }
        if (!neitherMatchingDisabled(matchingDisabledSet, a.userId, b.userId)) { skipCount++; continue; }
        if (!bothPrefsEnabled(prefsMap, a.userId, b.userId, "bikerBikerTypeStyle")) { skipCount++; continue; }

        const breakdown = computeStyleTypeBreakdown(a.motorcycle.id, b.motorcycle.id, tipoMap, stileMap);
        const tipoOk = (breakdown.bikeTypeScore ?? 0) >= tipoThr.jaccardThreshold && (breakdown.bikeTypeCommon ?? 0) >= tipoThr.minCommonTags;
        const stileOk = (breakdown.styleScore ?? 0) >= stileThr.jaccardThreshold && (breakdown.styleCommon ?? 0) >= stileThr.minCommonTags;
        if (!tipoOk && !stileOk) { skipCount++; continue; }

        const isSupermatch = isSupermatchByBreakdown(breakdown, thresholds, minCategories);
        const idA = a.userId < b.userId ? a.userId : b.userId;
        const idB = a.userId < b.userId ? b.userId : a.userId;
        const primaryTipo = a.motorcycle.motorcycleType?.toLowerCase() ?? "x";

        const inserted = await storage.createBikerBikerMatch({
          biker1Id: idA,
          biker2Id: idB,
          motorcycleBrand: "tipo:" + primaryTipo,
          status: "new",
          isSupermatch,
          scoreBreakdown: breakdown,
        });
        if (inserted) {
          matchCount++;
          await dispatchMatchNotification({
            table: "biker_biker_matches",
            matchId: inserted.id,
            userIds: [idA, idB],
            priority: classifyMatch({ isSupermatch }),
            isSupermatch,
          });
        } else skipCount++;
      }
    }

    console.log(`[TypeStyleMatching] nuovi match: ${matchCount}, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[TypeStyleMatching] error:", error);
    return 0;
  }
}
