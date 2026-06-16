// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { matchPreferences } from "@shared/db";
import { sendError } from "../../../lib/api-response";

const router = Router();

router.get("/matching/debug", async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;
    if (!userId) return sendError(res, 400, "userId richiesto come query param");

    const { users: usersTable, userMotorcycles, zavorrinaWishlists, zavorrinaWishlistMotos } = await import("@shared/db");
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const { systemAccountConditions } = await import("../../../lib/system-account-filter");

    const targetUser = await db.select({
      id: usersTable.id,
      nickname: usersTable.nickname,
      userType: usersTable.userType,
      isFake: usersTable.isFake,
      status: usersTable.status,
      ghostMode: usersTable.ghostMode,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (targetUser.length === 0) return sendError(res, 404, "Utente non trovato");
    const user = targetUser[0];

    const filters: Record<string, { passed: number; rejected: number; reason?: string }> = {};

    const myMotorcycles = await db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));
    const myWishlistRows = await db.select().from(zavorrinaWishlists).where(eq(zavorrinaWishlists.userId, userId)).limit(1);
    const myWishlistMotos = myWishlistRows[0]
      ? await db.select().from(zavorrinaWishlistMotos).where(eq(zavorrinaWishlistMotos.wishlistId, myWishlistRows[0].id))
      : [];

    const allCandidatesRaw = await db.select({
      id: usersTable.id,
      nickname: usersTable.nickname,
      userType: usersTable.userType,
      isFake: usersTable.isFake,
      status: usersTable.status,
      ghostMode: usersTable.ghostMode,
      role: usersTable.role,
    }).from(usersTable)
      .where(and(
        isNotNull(usersTable.id),
      ));

    const totalCandidates = allCandidatesRaw.length;
    filters["total"] = { passed: totalCandidates, rejected: 0 };

    const afterSelfFilter = allCandidatesRaw.filter(c => c.id !== userId);
    filters["self_excluded"] = { passed: afterSelfFilter.length, rejected: totalCandidates - afterSelfFilter.length, reason: "same user" };

    const afterFakeFilter = afterSelfFilter.filter(c => !c.isFake);
    filters["is_fake=false"] = { passed: afterFakeFilter.length, rejected: afterSelfFilter.length - afterFakeFilter.length, reason: "isFake=true" };

    const afterStatusFilter = afterFakeFilter.filter(c => c.status === "active");
    filters["status=active"] = { passed: afterStatusFilter.length, rejected: afterFakeFilter.length - afterStatusFilter.length, reason: "status != active" };

    const afterGhostFilter = afterStatusFilter.filter(c => !c.ghostMode);
    filters["ghostMode=false"] = { passed: afterGhostFilter.length, rejected: afterStatusFilter.length - afterGhostFilter.length, reason: "ghostMode=true" };

    const afterSystemFilter = afterGhostFilter.filter(c => !["admin", "moderator"].includes(c.role ?? ""));
    filters["system_excluded"] = { passed: afterSystemFilter.length, rejected: afterGhostFilter.length - afterSystemFilter.length, reason: "admin/system account" };

    const bikerCandidates = afterSystemFilter.filter(c => c.userType === "biker" || c.userType === "coppia");
    const zavCandidates = afterSystemFilter.filter(c => c.userType === "zavorrina");

    const myMoto = myMotorcycles[0];
    const myWish = myWishlistMotos[0];

    const [myPrefsRow] = await db.select().from(matchPreferences).where(eq(matchPreferences.userId, userId)).limit(1).catch(() => [undefined]);
    const { DEFAULT_PREFS } = await import("../../match-preferences");
    const myPrefs = myPrefsRow ?? DEFAULT_PREFS;
    const disabledPrefs = Object.entries(myPrefs)
      .filter(([k, v]) => k !== "id" && k !== "userId" && k !== "createdAt" && k !== "updatedAt" && v === false)
      .map(([k]) => k);

    const candidateMotorcycles = myMoto
      ? await db.select({ motorcycle: userMotorcycles, userId: userMotorcycles.userId })
          .from(userMotorcycles)
          .innerJoin(usersTable, eq(usersTable.id, userMotorcycles.userId))
          .where(and(
            eq(usersTable.isFake, false),
            eq(usersTable.status, "active"),
            ...systemAccountConditions(usersTable),
          ))
      : [];

    const candidateMotosFiltered = candidateMotorcycles.filter(cm =>
      afterSystemFilter.some(c => c.id === cm.userId)
    );

    const brandMatches: string[] = [];
    const typeMatches: string[] = [];

    for (const cm of candidateMotosFiltered) {
      if (cm.userId === userId) continue;
      if (myMoto?.brand && cm.motorcycle.brand && myMoto.brand.toLowerCase() === cm.motorcycle.brand.toLowerCase()) {
        brandMatches.push(cm.userId);
      } else if (myMoto?.motorcycleType && cm.motorcycle.motorcycleType && myMoto.motorcycleType.toLowerCase() === cm.motorcycle.motorcycleType.toLowerCase()) {
        typeMatches.push(cm.userId);
      }
    }

    const top5BrandMatches = brandMatches.slice(0, 5).map(uid => {
      const c = afterSystemFilter.find(x => x.id === uid);
      return { userId: uid, nickname: c?.nickname ?? uid, matchType: "brand", matchValue: myMoto?.brand };
    });
    const top5TypeMatches = typeMatches.slice(0, 5).map(uid => {
      const c = afterSystemFilter.find(x => x.id === uid);
      return { userId: uid, nickname: c?.nickname ?? uid, matchType: "motorcycleType", matchValue: myMoto?.motorcycleType };
    });
    const top5 = [...top5BrandMatches, ...top5TypeMatches].slice(0, 5);

    const afterBrandPref = myPrefs.bikerBikerBrand || myPrefs.bikerZavorrinaBrand ? brandMatches.length : 0;
    const afterTypePref = myPrefs.bikerBikerTypeStyle || myPrefs.bikerZavorrinaTypeStyle ? typeMatches.length : 0;

    filters["pref_brand_match"] = {
      passed: myPrefs.bikerBikerBrand || myPrefs.bikerZavorrinaBrand ? brandMatches.length : 0,
      rejected: (!myPrefs.bikerBikerBrand && !myPrefs.bikerZavorrinaBrand) ? brandMatches.length : 0,
      reason: (!myPrefs.bikerBikerBrand && !myPrefs.bikerZavorrinaBrand) ? "bikerBikerBrand + bikerZavorrinaBrand disabled" : undefined,
    };
    filters["pref_type_style_match"] = {
      passed: myPrefs.bikerBikerTypeStyle || myPrefs.bikerZavorrinaTypeStyle ? typeMatches.length : 0,
      rejected: (!myPrefs.bikerBikerTypeStyle && !myPrefs.bikerZavorrinaTypeStyle) ? typeMatches.length : 0,
      reason: (!myPrefs.bikerBikerTypeStyle && !myPrefs.bikerZavorrinaTypeStyle) ? "bikerBikerTypeStyle + bikerZavorrinaTypeStyle disabled" : undefined,
    };

    return res.json({
      user: { id: user.id, nickname: user.nickname, userType: user.userType, isFake: user.isFake, status: user.status, ghostMode: user.ghostMode },
      myMotorcycle: myMoto ?? null,
      myWishlistMoto: myWish ?? null,
      filters,
      candidateCounts: {
        total: totalCandidates,
        afterFilters: afterSystemFilter.length,
        bikers: bikerCandidates.length,
        zavorrine: zavCandidates.length,
        withMatchingBrand: brandMatches.length,
        withMatchingType: typeMatches.length,
        effectiveBrandMatches: afterBrandPref,
        effectiveTypeMatches: afterTypePref,
      },
      matchPreferences: {
        hasCustomRow: !!myPrefsRow,
        disabledPrefTypes: disabledPrefs,
        allPrefs: myPrefs,
      },
      top5Matches: top5,
    });
  } catch (_error) {
    console.error("[admin] matching debug error:", _error);
    return sendError(res, 500, "Errore debug matching");
  }
});

export default router;
