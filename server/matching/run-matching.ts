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
import { entityTags, tags as tagsTable, tagCategories, zavarrinaWishlistMotos } from "@shared/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { bboxAround } from "../lib/geo-bbox";
import { createUserLoader } from "../lib/user-loader";
import { matchingLogger } from "../lib/logger";
import { addMatchLog } from "./match-log-buffer";

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

const BBOX_RADIUS_KM = 500;

export async function runMatching(): Promise<number> {
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
        } catch (notifErr) {
          matchingLogger.error({ err: notifErr }, "ProposalMatching: error sending match notifications");
        }
        await dispatchMatchNotification({
          table: "proposal_matches",
          matchId: newMatch.id,
          userIds: [p1.userId, p2.userId],
          priority: classifyMatch({ isFreshProposal: true }),
        });
      }
    }

    lastProposalStats = {
      candidatesPre,
      candidatesPost: activeProposals.length,
      pairsConsidered,
      pairsAfterBbox,
      matchesCreated: matchCount,
    };
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
            await dispatchMatchNotification({
              table: "biker_zavorrina_matches",
              matchId: inserted.id,
              userIds: [bikerId, zavarrinaId],
              priority: classifyMatch({ isSupermatch }),
              isSupermatch,
              matchName,
            });
          }
        } catch (pairErr) {
          matchingLogger.warn({ err: pairErr, bikerId, zavarrinaId }, "WishlistMatching: coppia fallita (non-blocking)");
          addMatchLog("WARN", "wishlist_matching", `Coppia fallita (${bikerId}↔${zavarrinaId}): ${pairErr instanceof Error ? pairErr.message : String(pairErr)}`);
        }
      }
    }

    matchingLogger.info({ matchCount, skipCount }, "WishlistMatching: ciclo completato");

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
