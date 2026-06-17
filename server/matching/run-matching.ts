import { storage } from "../storage";
import it from "../../lib/i18n/it";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { 
  loadMatchPreferencesMap, 
  bothPrefsEnabled, 
  getActiveClubMembershipKeys,
  clubScopeAllows,
  loadMatchingDisabledSet,
  neitherMatchingDisabled,
} from "./filters";
import {
  areCompatible,
  baseModelName,
  tagOverlap,
  loadMatchThresholds,
  getThresholdSync,
  getSupermatchMinCategories,
  isSupermatchByBreakdown,
  type ScoreBreakdown,
} from "./scoring";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { entityTags, tags as tagsTable, tagCategories, zavorrinaWishlistMotos } from "@shared/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { haversineDistance } from "../geo";
import { createUserLoader } from "../lib/user-loader";
import { matchingLogger } from "../lib/logger";
import { addMatchLog } from "./match-log-buffer";
import type { MatchTable } from "./notifications/dispatcher-types";
import {
  resetNotificationCycleStats,
  recordNotifSent,
  recordNotifFailed,
  recordNotifRetried,
  getNotificationCycleStats,
} from "./notification-stats";
import { retryPendingNotifications } from "./retry-pending-notifications";

export type MatchingRunStats = {
  candidatesPre: number;
  candidatesPost: number;
  pairsConsidered: number;
  pairsAfterBbox: number;
  matchesCreated: number;
};

export type CapStatus = {
  cap: number;
  capReached: boolean;
  usersProcessed: number;
  usersSkipped: number;
  skipReasons: {
    capReached: number;
    noCandidate: number;
  };
};

/** Fallback identico al vecchio hardcoded — wishlist era 500. */
const DEFAULT_WISHLIST_CAP = 500;

let lastWishlistCapStatus: CapStatus = {
  cap: DEFAULT_WISHLIST_CAP,
  capReached: false,
  usersProcessed: 0,
  usersSkipped: 0,
  skipReasons: { capReached: 0, noCandidate: 0 },
};

export function getLastWishlistCapStatus(): CapStatus { return lastWishlistCapStatus; }

let lastProposalStats: MatchingRunStats = {
  candidatesPre: 0, candidatesPost: 0, pairsConsidered: 0, pairsAfterBbox: 0, matchesCreated: 0,
};
export function getLastProposalMatchingStats(): MatchingRunStats { return lastProposalStats; }

let lastWishlistStats: MatchingRunStats = {
  candidatesPre: 0, candidatesPost: 0, pairsConsidered: 0, pairsAfterBbox: 0, matchesCreated: 0,
};
export function getLastWishlistMatchingStats(): MatchingRunStats { return lastWishlistStats; }

export { getNotificationCycleStats } from "./notification-stats";

const BBOX_RADIUS_KM = 500;


export async function runMatching(): Promise<number> {
  resetNotificationCycleStats();

  // Retry notifications for matches that were never notified in the last 24 h
  await retryPendingNotifications();

  try {
    const { proposals: activeProposals, candidatesPre } = await storage.getActiveProposalsWithLocationStats();
    matchingLogger.info({ scope: "proposal", candidatesPost: activeProposals.length, candidatesPre }, "active proposals (admin/fake/ghost esclusi via SQL)");
    lastProposalStats = {
      candidatesPre,
      candidatesPost: activeProposals.length,
      pairsConsidered: 0,
      pairsAfterBbox: 0,
      matchesCreated: 0,
    };
    if (activeProposals.length < 2) return 0;

    // DataLoader: batch-load author user records once per cycle for any
    // downstream code that needs them (avoids N+1 in scoring extensions).
    const userLoader = createUserLoader();
    const userIds = Array.from(new Set(activeProposals.map((p) => p.userId)));
    await userLoader.loadMany(userIds);

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    const clubProposals = activeProposals.filter((p) => !!p.clubId);
    const clubUserIds = [...new Set(clubProposals.map((p) => p.userId))];
    const clubIds = [...new Set(clubProposals.map((p) => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    const proposalPrefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSet = await loadMatchingDisabledSet();
    let matchCount = 0;

    const BB_SEARCH_TYPES = new Set(["find_a_friend", "hitcher", "hitchhiker"]);

    // SQL-side candidate pair generation: pairs already pre-filtered by
    // status/isFake/ghostMode/role/scheduledAt + bbox at BBOX_RADIUS_KM.
    // JS only consumes the geographically plausible pairs.
    const candidatePairs = await storage.getActiveProposalCandidatePairs(BBOX_RADIUS_KM);
    const proposalsById = new Map(activeProposals.map((p) => [p.id, p] as const));
    const pairsConsidered = activeProposals.length * (activeProposals.length - 1) / 2;
    const pairsAfterBbox = candidatePairs.length;

    for (const { id1, id2 } of candidatePairs) {
      const p1 = proposalsById.get(id1);
      const p2 = proposalsById.get(id2);
      if (!p1 || !p2) continue;
      {
        if (!areCompatible(p1, p2)) continue;

        const isBikerBikerProposal = BB_SEARCH_TYPES.has(p1.searchType ?? "") && BB_SEARCH_TYPES.has(p2.searchType ?? "");
        if (isBikerBikerProposal) {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerBikerDistance")) continue;
        } else {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavorrinaDistance")) continue;
        }

        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;

        if (!neitherMatchingDisabled(matchingDisabledSet, p1.userId, p2.userId)) continue;

        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

        const distanceKm = (
          p1.departureLatitude != null && p1.departureLongitude != null &&
          p2.departureLatitude != null && p2.departureLongitude != null
        ) ? haversineDistance(
          p1.departureLatitude as number, p1.departureLongitude as number,
          p2.departureLatitude as number, p2.departureLongitude as number,
        ) : null;

        const newMatch = await storage.createProposalMatch({
          proposalId1: p1.id,
          proposalId2: p2.id,
          userId1: p1.userId,
          userId2: p2.userId,
          status: "pending",
          acceptedByUser1: false,
          acceptedByUser2: false,
        });

        existingKeys.add(`${p1.id}:${p2.id}`);
        existingKeys.add(`${p2.id}:${p1.id}`);
        matchCount++;

        let notifSentOk = false;
        try {
          const proposalMatchTitle = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
          const proposalMatchBody = it["push.proposalMatch.body"] ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";
          await storage.createNotification({
            userId: p1.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          await storage.createNotification({
            userId: p2.userId,
            title: proposalMatchTitle,
            body: proposalMatchBody,
            notificationType: "proposal_match",
            referenceType: "proposal_match",
            referenceId: newMatch.id,
          });
          notifSentOk = true;
          recordNotifSent();
        } catch (notifErr) {
          recordNotifFailed();
          matchingLogger.warn(
            { err: notifErr, match_id: newMatch.id, user_id: p1.userId },
            "ProposalMatching: errore invio notifica match",
          );
          addMatchLog("WARN", "proposal_matching",
            `Notifica fallita match ${newMatch.id}: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`);
        }

        if (notifSentOk) {
          try {
            await db.execute(sql`
              UPDATE proposal_matches SET notified_at = NOW()
              WHERE id = ${newMatch.id} AND notified_at IS NULL
            `);
          } catch (tsErr) {
            matchingLogger.warn({ err: tsErr, match_id: newMatch.id }, "ProposalMatching: errore aggiornamento notified_at");
          }
        }

        try {
          await dispatchMatchNotification({
            table: "proposal_matches",
            matchId: newMatch.id,
            userIds: [p1.userId, p2.userId],
            priority: classifyMatch({ isFreshProposal: true, distanceKm }),
            distanceKm,
          });
        } catch (dispatchErr) {
          // dispatch is a secondary/priority channel; direct createNotification
          // above already delivered the notification — do NOT count as failed.
          matchingLogger.warn(
            { err: dispatchErr, match_id: newMatch.id },
            "ProposalMatching: errore dispatch notifica push (secondario)",
          );
        }
      }
    }

    const notifStats = getNotificationCycleStats();
    lastProposalStats = {
      candidatesPre,
      candidatesPost: activeProposals.length,
      pairsConsidered,
      pairsAfterBbox,
      matchesCreated: matchCount,
    };
    matchingLogger.info(
      { matchCount, notifications_sent: notifStats.sent, notifications_failed: notifStats.failed, notifications_retried: notifStats.retried },
      "ProposalMatching: ciclo completato",
    );
    return matchCount;
  } catch (error) {
    matchingLogger.error({ err: error }, "Matching engine error");
    return 0;
  }
}

export async function runWishlistMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch { /* no-op: fallback to default if JSON is invalid */ }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    // Fast-path: skip the heavy JOIN entirely when the wishlist table is empty.
    // This avoids a crash caused by a SQL/schema issue in the complex query
    // when there is no data to match on (which is the expected state until
    // real zavarrine populate their wishlists).
    const [{ wishlistRowCount }] = await db.select({ wishlistRowCount: count() }).from(zavorrinaWishlistMotos);
    if (wishlistRowCount === 0) {
      matchingLogger.info({ scope: "wishlist" }, "WishlistMatching: wishlist vuota, nessuna coppia possibile");
      return 0;
    }

    // Cap dinamico via AppSetting; se assente/non valido ricade sul vecchio hardcoded (500).
    const capSetting = await storage.getAppSetting("matching_max_per_run");
    const MAX_MATCHES_PER_RUN = (() => {
      const v = parseInt(String(capSetting?.value ?? ""), 10);
      return Number.isFinite(v) && v > 0 ? v : DEFAULT_WISHLIST_CAP;
    })();

    // SQL JOIN — only compatible wishlist↔garage pairs are returned, with
    // isFake/status/role/userType + optional country filter applied in SQL.
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

    // Priorità notified_at: chi non riceve match da più tempo viene processato prima.
    // Carichiamo il MAX(notified_at) per utente dalla tabella dei match esistenti.
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

    // Ordina le coppie per notified_at crescente (NULLS FIRST = chi non è mai stato notificato ha priorità).
    const pairPriority = (p: { bikerId: string; zavorrinaId: string }): number => {
      const bTs = lastNotifiedByUser.get(p.bikerId)?.getTime() ?? 0;
      const zTs = lastNotifiedByUser.get(p.zavorrinaId)?.getTime() ?? 0;
      // 0 = mai notificato (priorità massima); altrimenti il più recente dei due (chi ha aspettato meno)
      return Math.max(bTs, zTs);
    };
    const sortedPairs = [...compatiblePairs].sort((a, b) => pairPriority(a) - pairPriority(b));

    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSetWL = await loadMatchingDisabledSet();
    const existingKeys = await storage.getAllExistingBikerZavorrinaMatchKeys();

    // Task #2513: precarica i tag delle moto biker coinvolte per
    // calcolare il breakdown jaccard senza N+1 query.
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
    // Per le wishlist (in attesa di tagging dedicato) deriviamo i tag dai
    // campi motorcycleType / ridingStyle come singolo slug normalizzato.
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

        // Task #2513: il vecchio supermatch richiedeva match esatto su
        // brand + base-model + motorcycleType + ridingStyle. Ora richiediamo
        // brand + base-model identici (gating naturale) PIÙ ≥N categorie
        // sopra soglia jaccard nel breakdown tag (tipo_moto + stile_guida).
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
        // suppress "unused" warning until thresholds in supermatch fully wired
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
              // Only count as "sent" for urgent: non-urgent dispatcher returns
              // early and queues for the digest job (12:00 / 19:00), so it is
              // not an immediate delivery — avoid inflating sent counter.
              if (notifPriority === "urgent") {
                recordNotifSent();
              }
            } catch (dispatchErr) {
              // Only count as failed for urgent; non-urgent failures are not
              // delivery failures since the digest job will retry from the DB.
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
    // Coppie non raggiunte perché il cap è stato raggiunto prima (= cap hit).
    const usersSkippedByCap = sortedPairs.length - usersProcessed;
    // Coppie raggiunte ma filtrate internamente (prefs/disabled/già esistente).
    const usersSkippedNoCandidate = skipCount;

    const notifStats = getNotificationCycleStats();
    matchingLogger.info(
      {
        matchCount,
        candidatesPre: compatiblePairs.length,
        candidatesPost: candidatesPassedFilters,
        usersProcessed,
        usersSkippedByCap,
        usersSkippedNoCandidate,
        capReached,
        cap: MAX_MATCHES_PER_RUN,
        notifications_sent: notifStats.sent,
        notifications_failed: notifStats.failed,
        notifications_retried: notifStats.retried,
      },
      "WishlistMatching: ciclo completato",
    );

    if (capReached) {
      addMatchLog("WARN", "wishlist_matching",
        `WishlistMatching: cap raggiunto (${MAX_MATCHES_PER_RUN}) — ${usersSkippedByCap} coppie saltate per cap, ${usersSkippedNoCandidate} filtrate per assenza candidati (imposta matching_max_per_run per aumentare il cap)`);
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
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as Record<string, unknown>)?.code as string | undefined;
    const detail = errCode ? `${errMsg} [code=${errCode}]` : errMsg;
    matchingLogger.error({ err: error, errCode }, `Wishlist matching error: ${detail}`);
    addMatchLog("ERROR", "wishlist_matching", `Wishlist matching error: ${detail}`);
    return 0;
  }
}
