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
import { entityTags, tags as tagsTable, tagCategories, zavarrinaWishlistMotos } from "@shared/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { bboxAround } from "../lib/geo-bbox";
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
  canRetryMatch,
  incrementRetryAttempt,
  pruneRetryAttempts,
  markPermanentFailure,
} from "./notification-stats";

export type MatchingRunStats = {
  candidatesPre: number;
  candidatesPost: number;
  pairsConsidered: number;
  pairsAfterBbox: number;
  matchesCreated: number;
};

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

/**
 * Table descriptor used by the pending-notification retry loop.
 * user1Col / user2Col are the column names for the two participants.
 */
interface RetryTableSpec {
  table: MatchTable;
  user1Col: string;
  user2Col: string;
}

const RETRY_TABLE_SPECS: RetryTableSpec[] = [
  { table: "biker_zavorrina_matches",  user1Col: "biker_id",   user2Col: "zavorrina_id" },
  { table: "biker_biker_matches",       user1Col: "biker1_id",  user2Col: "biker2_id"    },
  { table: "bio_affinity_matches",      user1Col: "user_a_id",  user2Col: "user_b_id"    },
  { table: "route_affinity_matches",    user1Col: "user_a_id",  user2Col: "user_b_id"    },
  { table: "music_affinity_matches",    user1Col: "user_a_id",  user2Col: "user_b_id"    },
];

/**
 * Retry pending notifications for all match tables.
 *
 * Finds matches created in the last 24 h whose `notified_at` is still NULL
 * and that represent a true delivery failure:
 *
 *  • proposal_matches — always use createNotification (immediate push regardless
 *    of priority), so notified_at IS NULL always means the push was never sent.
 *  • All other tables — only rows with notification_priority = 'urgent' are
 *    retried.  Non-urgent rows (high/normal/low) are intentionally queued for
 *    the digest job (12:00 / 19:00); their notified_at IS NULL simply means
 *    "not yet delivered by cron", not "failed".  Forcing urgent on those rows
 *    would violate the product's deliberate pacing contract.
 *
 * Each match is retried at most MAX_RETRIES_PER_MATCH times across the
 * lifetime of the current server process (tracked in-memory via notification-stats).
 *
 * For `proposal_matches` the retry calls `createNotification` directly (same
 * mechanism as the original send). For all other tables `dispatchMatchNotification`
 * is used with "urgent" priority so the notification is sent immediately
 * (non-urgent priorities return early from the dispatcher without sending).
 * The underlying delivery table has a unique-index guard preventing duplicates.
 *
 * Implementation note: pruneRetryAttempts() is time-based (25 h TTL) so
 * attempt counters for matches NOT included in a limited LIMIT-N result are
 * preserved across cycles until the match ages out of the 24-hour window.
 * This prevents the max-3 cap from being inadvertently reset for un-fetched
 * entries.  ORDER BY created_at DESC, id makes the fetch deterministic so the
 * same matches are consistently retried rather than depending on storage order.
 */
async function retryPendingNotifications(): Promise<void> {
  type OtherRow = { id: string; user1: string; user2: string };

  // ── 1. Prune stale retry counters (time-based, independent of fetch results) ─
  pruneRetryAttempts();

  // ── 2. Fetch all pending rows (one query per table, errors non-blocking) ─────
  let proposalPending: Array<{ id: string; user_id_1: string; user_id_2: string }> = [];
  try {
    const res = await db.execute<{ id: string; user_id_1: string; user_id_2: string }>(sql`
      SELECT id, user_id_1, user_id_2
      FROM proposal_matches
      WHERE notified_at IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC, id
      LIMIT 100
    `);
    proposalPending = res.rows;
  } catch (err) {
    matchingLogger.warn({ err }, "retryPendingNotifications: errore query proposal_matches");
  }

  const otherPending = new Map<RetryTableSpec, OtherRow[]>();
  for (const spec of RETRY_TABLE_SPECS) {
    try {
      const res = await db.execute<OtherRow>(sql`
        SELECT id,
               ${sql.raw(spec.user1Col)} AS user1,
               ${sql.raw(spec.user2Col)} AS user2
        FROM   ${sql.raw(spec.table)}
        WHERE  notified_at IS NULL
          AND  notification_priority = 'urgent'
          AND  created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC, id
        LIMIT  50
      `);
      otherPending.set(spec, res.rows);
    } catch (err) {
      matchingLogger.warn({ err, table: spec.table }, "retryPendingNotifications: errore query tabella");
    }
  }

  // ── 3. Retry proposal_matches via createNotification ─────────────────────────
  const title = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
  const body  = it["push.proposalMatch.body"]  ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";

  for (const row of proposalPending) {
    const key = `proposal_matches:${row.id}`;
    if (!canRetryMatch(key)) {
      if (markPermanentFailure(key)) {
        recordNotifFailed();
        matchingLogger.warn(
          { match_id: row.id, user_id: row.user_id_1, event: "notification_failed", permanent: true },
          "ProposalMatching: notifica permanentemente fallita (cap retry raggiunto)",
        );
        addMatchLog("WARN", "proposal_matching",
          `Notifica permanentemente fallita match ${row.id} (max tentativi raggiunti)`);
      }
      continue;
    }

    incrementRetryAttempt(key);
    try {
      await storage.createNotification({
        userId: row.user_id_1, title, body,
        notificationType: "proposal_match",
        referenceType: "proposal_match",
        referenceId: row.id,
      });
      await storage.createNotification({
        userId: row.user_id_2, title, body,
        notificationType: "proposal_match",
        referenceType: "proposal_match",
        referenceId: row.id,
      });
      await db.execute(sql`
        UPDATE proposal_matches SET notified_at = NOW()
        WHERE id = ${row.id} AND notified_at IS NULL
      `);
      recordNotifRetried();
      matchingLogger.info(
        { match_id: row.id, user_id: row.user_id_1 },
        "ProposalMatching: notifica ri-inviata (retry)",
      );
    } catch (retryErr) {
      recordNotifFailed();
      matchingLogger.warn(
        { err: retryErr, match_id: row.id, user_id: row.user_id_1 },
        "ProposalMatching: retry notifica fallita",
      );
      addMatchLog("WARN", "proposal_matching",
        `Retry notifica fallita match ${row.id}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
    }
  }

  // ── 4. Retry other tables via dispatchMatchNotification (urgent = sends now) ──
  for (const [spec, rows] of otherPending) {
    for (const row of rows) {
      const key = `${spec.table}:${row.id}`;
      if (!canRetryMatch(key)) {
        if (markPermanentFailure(key)) {
          recordNotifFailed();
          matchingLogger.warn(
            { match_id: row.id, user_id: row.user1, table: spec.table, event: "notification_failed", permanent: true },
            "Matching: notifica permanentemente fallita (cap retry raggiunto)",
          );
          addMatchLog("WARN", spec.table,
            `Notifica permanentemente fallita match ${row.id} (max tentativi raggiunti)`);
        }
        continue;
      }

      incrementRetryAttempt(key);
      try {
        // "urgent" forces an immediate push rather than returning early for
        // normal/high/low priorities; the delivery-dedup guard prevents re-sends.
        await dispatchMatchNotification({
          table: spec.table,
          matchId: row.id,
          userIds: [row.user1, row.user2],
          priority: "urgent",
        });
        recordNotifRetried();
        matchingLogger.info(
          { match_id: row.id, table: spec.table },
          "Matching: notifica ri-inviata (retry)",
        );
      } catch (retryErr) {
        recordNotifFailed();
        matchingLogger.warn(
          { err: retryErr, match_id: row.id, user_id: row.user1, table: spec.table },
          "Matching: retry notifica fallita",
        );
      }
    }
  }
}

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

    // Bbox pre-compute (each proposal's reachable bbox at BBOX_RADIUS_KM) so we
    // can cheaply skip pairs that cannot possibly overlap geographically
    // before invoking areCompatible / Haversine in scoring.
    const bboxes = activeProposals.map((p) => {
      const lat = p.departureLatitude as number | null;
      const lon = p.departureLongitude as number | null;
      return lat != null && lon != null ? bboxAround(lat, lon, BBOX_RADIUS_KM) : null;
    });

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
    // Suppress unused warning while keeping bboxes ready for future hybrid use.
    void bboxes;

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
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavarrinaDistance")) continue;
        }

        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;

        if (!neitherMatchingDisabled(matchingDisabledSet, p1.userId, p2.userId)) continue;

        if (existingKeys.has(`${p1.id}:${p2.id}`)) continue;

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
            priority: classifyMatch({ isFreshProposal: true }),
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
    const [{ wishlistRowCount }] = await db.select({ wishlistRowCount: count() }).from(zavarrinaWishlistMotos);
    if (wishlistRowCount === 0) {
      matchingLogger.info({ scope: "wishlist" }, "WishlistMatching: wishlist vuota, nessuna coppia possibile");
      return 0;
    }

    // SQL JOIN — only compatible wishlist↔garage pairs are returned, with
    // isFake/status/role/userType + optional country filter applied in SQL.
    const compatiblePairs = await storage.getCompatibleWishlistGaragePairs(matchingCountries);
    const shuffled = [...compatiblePairs].sort(() => Math.random() - 0.5);

    lastWishlistStats = {
      candidatesPre: compatiblePairs.length,
      candidatesPost: compatiblePairs.length,
      pairsConsidered: compatiblePairs.length,
      pairsAfterBbox: compatiblePairs.length,
      matchesCreated: 0,
    };

    matchingLogger.info({ scope: "wishlist", pairs: compatiblePairs.length }, "WishlistMatching: compatible pairs (SQL)");

    if (compatiblePairs.length === 0) {
      matchingLogger.warn("WishlistMatching: nessuna coppia compatibile trovata");
      return 0;
    }

    const prefsMap = await loadMatchPreferencesMap();
    const matchingDisabledSetWL = await loadMatchingDisabledSet();
    const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();

    // Task #2513: precarica i tag delle moto biker coinvolte per
    // calcolare il breakdown jaccard senza N+1 query.
    const motoIds = [...new Set(shuffled.map(p => p.motorcycle.id))];
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
    const MAX_MATCHES_PER_RUN = 500;

    outer:
    for (const pair of shuffled) {
      if (matchCount >= MAX_MATCHES_PER_RUN) break outer;

      const { zavarrinaId, bikerId } = pair;
      const wish = pair.wishlistMoto;
      const moto = pair.motorcycle;

      {
        if (!bothPrefsEnabled(prefsMap, bikerId, zavarrinaId, "bikerZavorrinaBrand")) { skipCount++; continue; }
        if (!neitherMatchingDisabled(matchingDisabledSetWL, bikerId, zavarrinaId)) { skipCount++; continue; }

        const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
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

        try {
          const inserted = await storage.createMatch({
            bikerId,
            zavarrinaId,
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
                userIds: [bikerId, zavarrinaId],
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
          matchingLogger.warn({ err: pairErr, bikerId, zavarrinaId }, "WishlistMatching: coppia fallita (non-blocking)");
          addMatchLog("WARN", "wishlist_matching", `Coppia fallita (${bikerId}↔${zavarrinaId}): ${pairErr instanceof Error ? pairErr.message : String(pairErr)}`);
        }
      }
    }

    const notifStats = getNotificationCycleStats();
    matchingLogger.info(
      { matchCount, skipCount, notifications_sent: notifStats.sent, notifications_failed: notifStats.failed, notifications_retried: notifStats.retried },
      "WishlistMatching: ciclo completato",
    );

    if (matchCount >= MAX_MATCHES_PER_RUN) {
      matchingLogger.info({ cap: MAX_MATCHES_PER_RUN }, "WishlistMatching: cap raggiunto");
    }

    lastWishlistStats = {
      candidatesPre: compatiblePairs.length,
      candidatesPost: compatiblePairs.length,
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
