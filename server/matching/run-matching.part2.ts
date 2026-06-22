import { storage } from "../storage";
import { db } from "../db";
import { zavorrinaWishlistMotos } from "@shared/db";
import { count, sql } from "drizzle-orm";
import { matchingLogger } from "../lib/logger";
import {
  baseModelName,
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  type ScoreBreakdown,
} from "./scoring";
import {
  loadMatchPreferencesMap,
  bothPrefsEnabled,
  loadMatchingDisabledSet,
  neitherMatchingDisabled,
} from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { recordNotifSent, recordNotifFailed, getNotificationCycleStats } from "./notification-stats";
import { addMatchLog } from "./match-log-buffer";

const DEFAULT_WISHLIST_CAP = 500;

let lastWishlistCapStatus = {
  cap: DEFAULT_WISHLIST_CAP,
  capReached: false,
  usersProcessed: 0,
  usersSkipped: 0,
  skipReasons: { capReached: 0, noCandidate: 0 },
};

export function getLastWishlistCapStatus() { return lastWishlistCapStatus; }

let lastWishlistStats = {
  candidatesPre: 0, candidatesPost: 0, pairsConsidered: 0, pairsAfterBbox: 0, matchesCreated: 0,
};
export function getLastWishlistMatchingStats() { return lastWishlistStats; }

export async function runWishlistMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch { /* noop */ }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const [{ wishlistRowCount }] = await db.select({ wishlistRowCount: count() }).from(zavorrinaWishlistMotos);
    if (wishlistRowCount === 0) {
      matchingLogger.info({ scope: "wishlist" }, "WishlistMatching: wishlist vuota, nessuna coppia possibile");
      return 0;
    }

    const capSetting = await storage.getAppSetting("matching_max_per_run");
    const MAX_MATCHES_PER_RUN = (() => {
      const v = parseInt(String(capSetting?.value ?? ""), 10);
      return Number.isFinite(v) && v > 0 ? v : DEFAULT_WISHLIST_CAP;
    })();

    const compatiblePairs = await storage.getCompatibleWishlistGaragePairs(matchingCountries);

    lastWishlistStats = {
      candidatesPre: compatiblePairs.length,
      candidatesPost: 0,
      pairsConsidered: compatiblePairs.length,
      pairsAfterBbox: compatiblePairs.length,
      matchesCreated: 0,
    };

    matchingLogger.info({ scope: "wishlist", pairs: compatiblePairs.length, cap: MAX_MATCHES_PER_RUN }, "WishlistMatching: compatible pairs (SQL)");

    if (compatiblePairs.length === 0) {
      matchingLogger.warn("WishlistMatching: nessuna coppia compatibile trovata");
      return 0;
    }

    const userIdSet = new Set<string>();
    for (const p of compatiblePairs) { userIdSet.add(p.bikerId); userIdSet.add(p.zavorrinaId); }
    const allUserIds = [...userIdSet];
    let lastNotifiedByUser = new Map<string, Date>();
    if (allUserIds.length > 0) {
      try {
        const rows = await db.execute<{ uid: string; last_notified: Date | null }>(sql`
          SELECT uid, MAX(notified_at) AS last_notified
          FROM (
            SELECT biker_id AS uid, notified_at FROM biker_zavorrina_matches
              WHERE biker_id = ANY(${allUserIds}::text[]) AND notified_at IS NOT NULL
            UNION ALL
            SELECT zavorrina_id AS uid, notified_at FROM biker_zavorrina_matches
              WHERE zavorrina_id = ANY(${allUserIds}::text[]) AND notified_at IS NOT NULL
          ) t
          GROUP BY uid
        `);
        for (const r of (rows.rows ?? rows) as Array<{ uid: string; last_notified: Date | null }>) {
          if (r.last_notified) lastNotifiedByUser.set(r.uid, r.last_notified);
        }
      } catch (err) {
        matchingLogger.warn({ err }, "WishlistMatching: errore lettura notified_at utenti (ordine casuale)");
        lastNotifiedByUser = new Map();
      }
    }

    const pairPriority = (p: { bikerId: string; zavorrinaId: string }): number => {
      const bTs = lastNotifiedByUser.get(p.bikerId)?.getTime() ?? 0;
      const zTs = lastNotifiedByUser.get(p.zavorrinaId)?.getTime() ?? 0;
      return Math.max(bTs, zTs);
    };
    const sortedPairs = [...compatiblePairs].sort((a, b) => pairPriority(a) - pairPriority(b));

    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSetWL = await loadMatchingDisabledSet();
    const existingKeys = await storage.getAllExistingBikerZavorrinaMatchKeys();

    const { entityTags, tagCategories, tags: tagsTable } = await import("@shared/db");
    const { inArray, eq } = await import("drizzle-orm");

    const motoIds = [...new Set(sortedPairs.map(p => p.motorcycle.id))];
    const tagsByMoto = await (async () => {
      const out = new Map<string, { tipo: Set<string>; stile: Set<string> }>();
      if (motoIds.length === 0) return out;
      const rows = await db
        .select({ entityId: entityTags.entityId, slug: tagsTable.slug, catSlug: tagCategories.slug })
        .from(entityTags)
        .innerJoin(tagsTable, eq(tagsTable.id, entityTags.tagId))
        .innerJoin(tagCategories, eq(tagCategories.id, tagsTable.categoryId))
        .where(and(
          eq(entityTags.entityType, "motorcycle"),
          inArray(entityTags.entityId, motoIds),
          inArray(tagCategories.slug, ["tipo_moto", "stile_guida"]),
        ));
      for (const r of rows) {
        let m = out.get(r.entityId);
        if (!m) { m = { tipo: new Set(), stile: new Set() }; out.set(r.entityId, m); }
        if (r.catSlug === "tipo_moto") m.tipo.add(r.slug);
        else if (r.catSlug === "stile_guida") m.stile.add(r.slug);
      }
      return out;
    })();
    const thresholds = await loadMatchThresholds();
    const minCategories = await getSupermatchMinCategories();
    let matchCount = 0;
    let skipCount = 0;
    let usersProcessed = 0;
    let candidatesPassedFilters = 0;

    outer:
    for (const pair of sortedPairs) {
      if (matchCount >= MAX_MATCHES_PER_RUN) break outer;
      usersProcessed++;

      const { zavorrinaId, bikerId } = pair;
      const wish = pair.wishlistMoto;
      const moto = pair.motorcycle;

      {
        if (!bothPrefsEnabled(prefsMap, bikerId, zavorrinaId, "bikerZavorrinaBrand")) { skipCount++; continue; }
        if (!neitherMatchingDisabled(matchingDisabledSetWL, bikerId, zavorrinaId)) { skipCount++; continue; }

        const key = `${bikerId}:${zavorrinaId}:${moto.id}:${wish.id}`;
        if (existingKeys.has(key)) { skipCount++; continue; }

        const motoTags = tagsByMoto.get(moto.id) ?? { tipo: new Set<string>(), stile: new Set<string>() };
        const wishTipo = wish.motorcycleType ? new Set([wish.motorcycleType.toLowerCase()]) : new Set<string>();
        const wishStile = wish.ridingStyle ? new Set([wish.ridingStyle.toLowerCase()]) : new Set<string>();
        const tipoOv = tagOverlap(motoTags.tipo, wishTipo);
        const stileOv = tagOverlap(motoTags.stile, wishStile);
        const breakdown: ScoreBreakdown = {
          bikeTypeScore: Number(tipoOv.jaccard.toFixed(4)),
          bikeTypeCommon: tipoOv.common,
          styleScore: Number(stileOv.jaccard.toFixed(4)),
          styleCommon: stileOv.common,
        };
        const brandModelMatch = !!(
          wish.brand && moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase() &&
          wish.model && moto.model && baseModelName(wish.model) === baseModelName(moto.model)
        );
        const isSupermatch = brandModelMatch && isSupermatchByBreakdown(breakdown, thresholds, minCategories);
        void getThresholdSync;

        candidatesPassedFilters++;
        try {
          const inserted = await storage.createMatch({
            bikerId,
            zavorrinaId,
            bikerMotorcycleId: moto.id,
            wishlistMotoId: wish.id,
            status: "new",
            isSupermatch,
            scoreBreakdown: breakdown,
          });

          existingKeys.add(key);
          matchCount++;
          if (inserted) {
            const motoParts = [moto.brand, moto.model].filter(Boolean);
            const matchName = motoParts.length > 0 ? motoParts.join(" ") : undefined;
            const notifPriority = classifyMatch({ isSupermatch });
            try {
              await dispatchMatchNotification({
                table: "biker_zavorrina_matches",
                matchId: inserted.id,
                userIds: [bikerId, zavorrinaId],
                priority: notifPriority,
                isSupermatch,
                matchName,
              });
              if (notifPriority === "urgent") {
                recordNotifSent();
              }
            } catch (dispatchErr) {
              if (notifPriority === "urgent") {
                recordNotifFailed();
              }
              matchingLogger.warn(
                { err: dispatchErr, match_id: inserted.id, user_id: bikerId },
                "WishlistMatching: errore dispatch notifica",
              );
            }
          }
        } catch (pairErr) {
          matchingLogger.warn({ err: pairErr, bikerId, zavorrinaId }, "WishlistMatching: coppia fallita (non-blocking)");
          addMatchLog("WARN", "wishlist_matching", `Coppia fallita (${bikerId}↔${zavorrinaId}): ${pairErr instanceof Error ? pairErr.message : String(pairErr)}`);
        }
      }
    }

    const capReached = matchCount >= MAX_MATCHES_PER_RUN;
    const usersSkippedByCap = sortedPairs.length - usersProcessed;
    const usersSkippedNoCandidate = skipCount;

    const notifStats = getNotificationCycleStats();
    matchingLogger.info(
      { matchCount, capReached, cap: MAX_MATCHES_PER_RUN, notifications_sent: notifStats.sent },
      "WishlistMatching: ciclo completato",
    );

    if (capReached) {
      addMatchLog("WARN", "wishlist_matching",
        `WishlistMatching: cap raggiunto (${MAX_MATCHES_PER_RUN})`);
    }

    lastWishlistCapStatus = {
      cap: MAX_MATCHES_PER_RUN,
      capReached,
      usersProcessed,
      usersSkipped: usersSkippedByCap + usersSkippedNoCandidate,
      skipReasons: { capReached: usersSkippedByCap, noCandidate: usersSkippedNoCandidate },
    };

    lastWishlistStats = {
      candidatesPre: compatiblePairs.length,
      candidatesPost: candidatesPassedFilters,
      pairsConsidered: compatiblePairs.length,
      pairsAfterBbox: compatiblePairs.length,
      matchesCreated: matchCount,
    };

    return matchCount;
  } catch (error) {
    matchingLogger.error({ err: error }, "Wishlist matching error");
    return 0;
  }
}
