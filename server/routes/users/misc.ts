import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { updateLocationSchema } from "@shared/validators";
import { applyFakeZones, applyPositionFuzz, fuzzedCoordsForViewer, isPositionFuzzed } from "../users";
import { triggerProposalProfileMatchingForZavorrina } from "../../matching-engine";

import { requireAuth } from "../../lib/auth-middleware";
import { sendSuccess, sendError } from "../../lib/api-response";

const router = Router();

router.put("/location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsedLoc = updateLocationSchema.safeParse(req.body);
    if (!parsedLoc.success) return sendError(res, 400, parsedLoc.error.issues[0].message);
    const { latitude, longitude } = parsedLoc.data;
    const existingProfile = await storage.getUserProfile(userId);
    if (existingProfile?.fixedPositionEnabled && existingProfile.fixedPositionLat != null && existingProfile.fixedPositionLng != null) {
      const updateData = { coordinatesUpdatedAt: new Date() };
      if (existingProfile) {
        await storage.updateUserProfile(userId, updateData);
      }
      const user = await storage.getUser(userId);
      if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
        triggerProposalProfileMatchingForZavorrina(userId);
      }
      return sendSuccess(res);
    }
    let fLat = latitude;
    let fLng = longitude;
    const fakeResult = applyFakeZones(latitude, longitude, existingProfile);
    if (fakeResult.applied) {
      fLat = fakeResult.lat;
      fLng = fakeResult.lng;
    } else if (existingProfile?.positionFuzz && existingProfile.positionFuzzKm > 0) {
      const fuzzed = applyPositionFuzz(latitude, longitude, existingProfile.positionFuzzKm);
      fLat = fuzzed.lat;
      fLng = fuzzed.lng;
    }
    const updateData = { latitude: fLat, longitude: fLng, coordinatesUpdatedAt: new Date() };
    if (existingProfile) {
      await storage.updateUserProfile(userId, updateData);
    } else {
      await storage.createUserProfile({ userId, ...updateData } as import("@shared/db").InsertUserProfile);
    }

    const user = await storage.getUser(userId);
    if (user && (user.userType === "zavorrina" || user.userType === "coppia")) {
      triggerProposalProfileMatchingForZavorrina(userId);
    }

    return sendSuccess(res);
  } catch (error) {
    console.error("Update location error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.post("/app-close", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.updateUser(userId, { lastAppCloseAt: new Date() });
    const profile = await storage.getUserProfile(userId);
    if (profile?.offlinePositionRandomize !== false && profile?.latitude != null && profile?.longitude != null) {
      const fuzzed = applyPositionFuzz(profile.latitude, profile.longitude, 20);
      await storage.updateUserProfile(userId, {
        lastOfflineLat: fuzzed.lat,
        lastOfflineLng: fuzzed.lng,
      });
    }
    return sendSuccess(res);
  } catch (error) {
    console.error("App close error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const userId = req.params.id as string;
    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    const blocked = await storage.hasBlockedUser(userId, requesterId);
    if (blocked) {
      return sendError(res, 403, "Non puoi visualizzare questo profilo");
    }
    const { password: _, ...safeUser } = user;
    const profile = await storage.getUserProfile(userId);
    const photos = (await storage.getUserPhotos(userId)).filter((p) => p.isApproved);
    const baseMotorcycles = await storage.getUserMotorcycles(userId);
    const motorcycles = await Promise.all(
      baseMotorcycles.map(async (m) => {
        const motoTags = await storage.getTagsForEntity("motorcycle", m.id);
        return {
          ...m,
          tags: motoTags.map((t) => ({
            id: t.id,
            slug: t.slug,
            label: t.label,
            categorySlug: t.categorySlug,
            categoryLabel: t.categoryLabel,
          })),
        };
      }),
    );

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isOnline = !user.ghostMode && user.lastLoginAt != null && new Date(user.lastLoginAt) >= fifteenMinutesAgo;
    const hideOnlineStatus = !!profile?.hideOnlineStatus;
    const hideLastSeen = !!profile?.hideLastSeen;
    const hideDistance = !!profile?.hideDistance;
    const hideLocation = !!profile?.hideFromMap;

    const coords = (!hideLocation)
      ? fuzzedCoordsForViewer(profile?.latitude, profile?.longitude, profile, false)
      : { latitude: null, longitude: null };

    return res.json({
      ...safeUser,
      userType: user.userType,
      profile: profile ? {
        bio: profile.bio,
        latitude: coords.latitude,
        longitude: coords.longitude,
        isAvailable: profile.isAvailable,
        isOnline: hideOnlineStatus ? null : isOnline,
        lastSeen: hideLastSeen ? null : user.lastLoginAt,
        hideDistance,
        hideLocation,
        isPositionFuzzed: isPositionFuzzed(profile, false),
      } : null,
      photos,
      motorcycles,
    });
  } catch (error) {
    console.error("Get public profile error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/time-profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const requesterId = req.session.userId!;
    const userId = req.params.id as string;
    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");
    const blocked = await storage.hasBlockedUser(userId, requesterId);
    if (blocked) return sendError(res, 403, "Non puoi visualizzare questo profilo");
    const { db } = await import("../../db");
    const { userTimeProfile } = await import("@shared/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(userTimeProfile)
      .where(sql`${userTimeProfile.userId} = ${userId}`)
      .limit(1);
    if (rows.length === 0) {
      return res.json({
        userId,
        histogram: null,
        totalRides: 0,
        label: null,
        coldStart: true,
        updatedAt: null,
      });
    }
    const row = rows[0];
    return res.json({
      userId,
      histogram: row.histogram,
      totalRides: row.totalRides,
      label: row.label,
      coldStart: false,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    console.error("Get time profile error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

/**
 * GET /api/users/me/tags
 * Restituisce i tag associati all'utente corrente (entityType="user"),
 * raggruppati per categoria. Usato dalla schermata profilo per pre-selezionare
 * i tag scelti in precedenza.
 */
router.get("/me/tags", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const tags = await storage.getTagsForEntity("user", userId);
    return res.json({ tags });
  } catch (error) {
    console.error("Get user tags error:", error);
    return sendError(res, 500, "Errore lettura tag utente");
  }
});

/**
 * PUT /api/users/me/tags
 * Body: { categorySlug: string, tagIds: string[] }
 * Sostituisce in modo atomico i tag dell'utente per la categoria indicata.
 * Tag di altre categorie restano invariati.
 */
router.put("/me/tags", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as { categorySlug?: unknown; tagIds?: unknown };
    const categorySlug = typeof body?.categorySlug === "string" ? body.categorySlug : "";
    const tagIds = Array.isArray(body?.tagIds)
      ? body.tagIds.filter((v): v is string => typeof v === "string")
      : null;
    if (!categorySlug) {
      return sendError(res, 400, "categorySlug mancante");
    }
    if (tagIds === null) {
      return sendError(res, 400, "tagIds deve essere un array di stringhe");
    }
    await storage.setTagsForEntity("user", userId, tagIds, { categorySlug });
    const tags = await storage.getTagsForEntity("user", userId);
    return res.json({ tags });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Tag inesistenti|non appartenenti|Categoria non trovata/i.test(msg)) {
      return sendError(res, 400, msg);
    }
    console.error("Set user tags error:", error);
    return sendError(res, 500, "Errore aggiornamento tag utente");
  }
});

/**
 * GET /api/users/:id/match-summary
 * Restituisce le ragioni di match tra l'utente corrente e :id.
 * Interroga in parallelo tutte le tabelle di match, estrae chip-reasons
 * da: tipo tabella (motivo principale) + score_breakdown + flag is_supermatch.
 */
router.get("/:id/match-summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const me = req.session.userId!;
    const other = req.params.id as string;
    if (me === other) return res.json({ reasons: [] });

    const { db } = await import("../../db");
    const {
      bikerBikerMatches, bikerZavarrinaMatches,
      routeAffinityMatches,
      proposalProfileMatches, proposalMatches,
    } = await import("@shared/db");
    const { eq, and, or, isNull, inArray, sql: dsql, desc } = await import("drizzle-orm");

    // Only statuses that represent an active/valid match — rejected rows must not produce chips.
    // proposal_matches also uses 'pending' while both sides haven't acted yet.
    const ACTIVE_STATUSES = ["new", "accepted"] as const;
    const PROPOSAL_ACTIVE_STATUSES = ["new", "accepted", "pending"] as const;

    // Deterministic ordering: accepted first (most meaningful), then newest.
    const statusOrder = (col: { name: string }) =>
      dsql`CASE WHEN ${dsql.identifier(col.name)} = 'accepted' THEN 0 ELSE 1 END`;

    const [bbRows, bzRows, propRows, ppRows, raRows] = await Promise.all([
      db.select().from(bikerBikerMatches).where(and(
        or(
          and(eq(bikerBikerMatches.biker1Id, me), eq(bikerBikerMatches.biker2Id, other)),
          and(eq(bikerBikerMatches.biker1Id, other), eq(bikerBikerMatches.biker2Id, me)),
        ),
        isNull(bikerBikerMatches.archivedAt),
        inArray(bikerBikerMatches.status, [...ACTIVE_STATUSES]),
      )).orderBy(statusOrder({ name: "status" }), desc(bikerBikerMatches.createdAt)).limit(1),
      db.select().from(bikerZavarrinaMatches).where(and(
        or(
          and(eq(bikerZavarrinaMatches.bikerId, me), eq(bikerZavarrinaMatches.zavarrinaId, other)),
          and(eq(bikerZavarrinaMatches.bikerId, other), eq(bikerZavarrinaMatches.zavarrinaId, me)),
        ),
        isNull(bikerZavarrinaMatches.archivedAt),
        inArray(bikerZavarrinaMatches.status, [...ACTIVE_STATUSES]),
      )).orderBy(statusOrder({ name: "status" }), desc(bikerZavarrinaMatches.createdAt)).limit(1),
      db.select().from(proposalMatches).where(and(
        or(
          and(eq(proposalMatches.userId1, me), eq(proposalMatches.userId2, other)),
          and(eq(proposalMatches.userId1, other), eq(proposalMatches.userId2, me)),
        ),
        isNull(proposalMatches.archivedAt),
        inArray(proposalMatches.status, [...PROPOSAL_ACTIVE_STATUSES]),
      )).orderBy(statusOrder({ name: "status" }), desc(proposalMatches.createdAt)).limit(1),
      db.select().from(proposalProfileMatches).where(and(
        or(
          and(eq(proposalProfileMatches.bikerId, me), eq(proposalProfileMatches.zavarrinaId, other)),
          and(eq(proposalProfileMatches.bikerId, other), eq(proposalProfileMatches.zavarrinaId, me)),
        ),
        isNull(proposalProfileMatches.archivedAt),
        inArray(proposalProfileMatches.status, [...ACTIVE_STATUSES]),
      )).orderBy(statusOrder({ name: "status" }), desc(proposalProfileMatches.createdAt)).limit(1),
      db.select().from(routeAffinityMatches).where(and(
        or(
          and(eq(routeAffinityMatches.userAId, me), eq(routeAffinityMatches.userBId, other)),
          and(eq(routeAffinityMatches.userAId, other), eq(routeAffinityMatches.userBId, me)),
        ),
        isNull(routeAffinityMatches.archivedAt),
        inArray(routeAffinityMatches.status, [...ACTIVE_STATUSES]),
      )).orderBy(statusOrder({ name: "status" }), desc(routeAffinityMatches.createdAt)).limit(1),
    ]);

    const hasAnyMatch = bbRows.length > 0 || bzRows.length > 0 || propRows.length > 0 ||
      ppRows.length > 0 || raRows.length > 0;

    if (!hasAnyMatch) return res.json({ reasons: [] });

    const reasons: Array<{ key: string; label: string }> = [];
    const addedKeys = new Set<string>();
    const add = (key: string, label: string) => {
      if (!addedKeys.has(key)) { addedKeys.add(key); reasons.push({ key, label }); }
    };

    const SCORE_THRESHOLD = 0.20;

    if (bbRows.length > 0) {
      const m = bbRows[0];
      const sb = (m.scoreBreakdown ?? {}) as Record<string, number>;
      if (m.motorcycleBrand === "base_intent") {
        add("base_intent", "Intento ruolo 🤝");
      } else {
        add("tipo_moto", "Stessa moto 🏍");
        if ((sb.musica ?? 0) >= SCORE_THRESHOLD) add("musica", "Musica 🎵");
        if ((sb.stile_guida ?? 0) >= SCORE_THRESHOLD) add("stile_guida", "Stile guida 🛣");
        if (m.isSupermatch) add("supermatch", "Supermatch ⚡");
      }
    }

    if (bzRows.length > 0) {
      const m = bzRows[0];
      const sb = (m.scoreBreakdown ?? {}) as Record<string, number>;
      add("garage", "Biker+Zavorrina ❤️");
      if ((sb.musica ?? 0) >= SCORE_THRESHOLD) add("musica", "Musica 🎵");
      if ((sb.stile_guida ?? 0) >= SCORE_THRESHOLD) add("stile_guida", "Stile guida 🛣");
      if ((sb.tipo_moto ?? 0) >= SCORE_THRESHOLD) add("tipo_moto", "Stessa moto 🏍");
      if (m.isSupermatch) add("supermatch", "Supermatch ⚡");
    }

    if (propRows.length > 0) add("proposal", "Giro proposto 🗺");
    if (ppRows.length > 0) add("propProfile", "Giro proposto 🗺");
    if (raRows.length > 0) add("routeAffinity", "Percorso affine 🌍");

    return res.json({ reasons });
  } catch (error) {
    console.error("Match summary error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
