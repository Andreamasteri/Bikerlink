import { storage } from "../storage";
import it from "../../lib/i18n/it";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import { 
  loadMatchPreferencesMap, 
  bothPrefsEnabled, 
  getActiveClubMembershipKeys,
  clubScopeAllows 
} from "./filters";
import { areCompatible, baseModelName } from "./scoring";

export async function runMatching(): Promise<number> {
  try {
    const activeProposals = await storage.getActiveProposalsWithLocation();
    console.log(`[ProposalMatching] proposte attive: ${activeProposals.length} (admin esclusi)`);
    if (activeProposals.length < 2) return 0;

    const existingKeys = await storage.getAllExistingProposalMatchKeys();
    const clubProposals = activeProposals.filter((p) => !!p.clubId);
    const clubUserIds = [...new Set(clubProposals.map((p) => p.userId))];
    const clubIds = [...new Set(clubProposals.map((p) => p.clubId as string))];
    const membershipKeys = await getActiveClubMembershipKeys(clubUserIds, clubIds);
    const proposalPrefsMap = await loadMatchPreferencesMap();
    let matchCount = 0;

    const BB_SEARCH_TYPES = new Set(["find_a_friend", "hitcher", "hitchhiker"]);

    for (let i = 0; i < activeProposals.length; i++) {
      for (let j = i + 1; j < activeProposals.length; j++) {
        const p1 = activeProposals[i];
        const p2 = activeProposals[j];

        if (!areCompatible(p1, p2)) continue;

        const isBikerBikerProposal = BB_SEARCH_TYPES.has(p1.searchType ?? "") && BB_SEARCH_TYPES.has(p2.searchType ?? "");
        if (isBikerBikerProposal) {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerBikerDistance")) continue;
        } else {
          if (!bothPrefsEnabled(proposalPrefsMap, p1.userId, p2.userId, "bikerZavarrinaDistance")) continue;
        }

        if (!clubScopeAllows(p1, p2, membershipKeys)) continue;

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
          console.error("[ProposalMatching] Error sending match notifications:", notifErr);
        }
        await dispatchMatchNotification({
          table: "proposal_matches",
          matchId: newMatch.id,
          userIds: [p1.userId, p2.userId],
          priority: classifyMatch({ isFreshProposal: true }),
        });
      }
    }

    return matchCount;
  } catch (error) {
    console.error("Matching engine error:", error);
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

    const wishlistMotos = await storage.getAllWishlistMotosWithUsers(matchingCountries);
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    const shuffledBikers = [...bikerMotorcycles].sort(() => Math.random() - 0.5);

    console.log(`[WishlistMatching] wishlist entries: ${wishlistMotos.length}, biker motorcycles: ${bikerMotorcycles.length} (admin esclusi da entrambi i pool)`);

    if (wishlistMotos.length === 0 || bikerMotorcycles.length === 0) {
      if (wishlistMotos.length === 0) console.warn("[WishlistMatching] WARN: nessuna wishlist trovata");
      if (bikerMotorcycles.length === 0) console.warn("[WishlistMatching] WARN: nessuna moto biker trovata — eseguire /api/admin/reconcile-fake-moto");
      return 0;
    }

    const prefsMap = await loadMatchPreferencesMap();
    const existingKeys = await storage.getAllExistingBikerZavarrinaMatchKeys();
    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_RUN = 500;

    outer:
    for (const wm of wishlistMotos) {
      const zavarrinaId = wm.userId;
      const wish = wm.wishlistMoto;

      for (const bm of shuffledBikers) {
        if (matchCount >= MAX_MATCHES_PER_RUN) break outer;

        const bikerId = bm.userId;
        const moto = bm.motorcycle;

        if (bikerId === zavarrinaId) continue;

        let compatible = false;

        if (wish.brand && moto.brand && wish.brand.toLowerCase() === moto.brand.toLowerCase()) {
          compatible = true;
        } else if (wish.motorcycleType && moto.motorcycleType &&
                   wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase()) {
          compatible = true;
        }

        if (!compatible) continue;

        if (!bothPrefsEnabled(prefsMap, bikerId, zavarrinaId, "bikerZavorrinaBrand")) { skipCount++; continue; }

        const key = `${bikerId}:${zavarrinaId}:${moto.id}:${wish.id}`;
        if (existingKeys.has(key)) { skipCount++; continue; }

        const isSupermatch = !!(
          wish.brand &&
          moto.brand &&
          wish.brand.toLowerCase() === moto.brand.toLowerCase() &&
          wish.model &&
          moto.model &&
          baseModelName(wish.model) === baseModelName(moto.model) &&
          wish.motorcycleType &&
          moto.motorcycleType &&
          wish.motorcycleType.toLowerCase() === moto.motorcycleType.toLowerCase() &&
          wish.ridingStyle &&
          moto.ridingStyle &&
          wish.ridingStyle.toLowerCase() === moto.ridingStyle.toLowerCase()
        );

        const inserted = await storage.createMatch({
          bikerId,
          zavarrinaId,
          bikerMotorcycleId: moto.id,
          wishlistMotoId: wish.id,
          status: "new",
          isSupermatch,
        });

        existingKeys.add(key);
        matchCount++;
        if (inserted) {
          await dispatchMatchNotification({
            table: "biker_zavorrina_matches",
            matchId: inserted.id,
            userIds: [bikerId, zavarrinaId],
            priority: classifyMatch({ isSupermatch }),
            isSupermatch,
          });
        }
      }
    }

    console.log(`[WishlistMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    if (matchCount >= MAX_MATCHES_PER_RUN) {
      console.log(`[WishlistMatching] Cap raggiunto (${MAX_MATCHES_PER_RUN} match/ciclo). Riprenderà al prossimo run.`);
    }

    return matchCount;
  } catch (error) {
    console.error("Wishlist matching error:", error);
    return 0;
  }
}
