/**
 * users.next-detail.ts — route di dettaglio per singolo utente admin
 *
 * Contenuto:
 *   - GET /:id/stats          — Statistiche complete di un singolo utente
 *   - GET /:id/profile-gaps   — Campi profilo mancanti per il matching engine
 *   - GET /:id/geo-insights   — Geo-insights utente
 *   - GET /:userId/sessions   — Lista sessioni attive utente
 *   - DELETE /:userId/sessions/:sid — Revoca singola sessione
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { proposals, conversationParticipants, messages, reports, moderatorLogs, adClicks, adCampaigns, userDevices, userMotorcycles, zavarrinaWishlists, zavarrinaWishlistMotos } from "@shared/db";
import { eq, sql, count } from "drizzle-orm";
import { sendError, sendSuccess } from "../../lib/api-response";

const router = Router();

router.get("/:id/stats", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [user, profile] = await Promise.all([
      storage.getUser(id),
      storage.getUserProfile(id),
    ]);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const [
      proposalsCreatedRows,
      conversationsRows,
      messagesSentRows,
      reportsFiledRows,
      reportsReceivedRows,
      motorcycles,
      moderatorLogsRows,
      adClicksRows,
    ] = await Promise.all([
      db.select({ cnt: count() }).from(proposals).where(eq(proposals.userId, id)),
      db.select({ cnt: count() }).from(conversationParticipants).where(eq(conversationParticipants.userId, id)),
      db.select({ cnt: count() }).from(messages).where(eq(messages.senderId, id)),
      db.select({ cnt: count() }).from(reports).where(eq(reports.reporterId, id)),
      db.select({ cnt: count() }).from(reports).where(eq(reports.reportedUserId, id)),
      storage.getUserMotorcycles(id),
      db.select({
        action: moderatorLogs.action,
        createdAt: moderatorLogs.createdAt,
        moderatorId: moderatorLogs.moderatorId,
      }).from(moderatorLogs).where(eq(moderatorLogs.targetId, id)).orderBy(moderatorLogs.createdAt),
      db.select({
        id: adClicks.id,
        clickedAt: adClicks.createdAt,
        adTitle: adCampaigns.name,
      }).from(adClicks)
        .leftJoin(adCampaigns, eq(adClicks.campaignId, adCampaigns.id))
        .where(eq(adClicks.userId, id))
        .orderBy(adClicks.createdAt),
    ]);

    const devicesRows = await db.select({
      model: userDevices.model,
      platform: userDevices.platform,
      osVersion: userDevices.osVersion,
      firstSeenAt: userDevices.firstSeenAt,
      lastSeenAt: userDevices.lastSeenAt,
    }).from(userDevices)
      .where(eq(userDevices.userId, id))
      .orderBy(sql`${userDevices.lastSeenAt} DESC`);

    const moderatorNicknameMap: Record<string, string> = {};
    const moderatorIds = [...new Set(moderatorLogsRows.map((l) => l.moderatorId).filter(Boolean))] as string[];
    if (moderatorIds.length > 0) {
      const mods = await storage.getUsersByIds(moderatorIds);
      for (const mod of mods) {
        moderatorNicknameMap[mod.id] = mod.nickname;
      }
    }

    const { password: _pw, ...safeUser } = user;

    return res.json({
      user: {
        id: safeUser.id,
        nickname: safeUser.nickname,
        email: safeUser.email,
        userType: safeUser.userType,
        role: safeUser.role,
        status: safeUser.status,
        createdAt: safeUser.createdAt,
        lastLoginAt: safeUser.lastLoginAt ?? null,
        lastLogoutAt: safeUser.lastLogoutAt ?? null,
        lastAppCloseAt: safeUser.lastAppCloseAt ?? null,
        ghostMode: safeUser.ghostMode ?? false,
        isOnline: false,
        isFake: safeUser.isFake ?? false,
        isPrimal: safeUser.isPrimal ?? false,
        totalKm: profile?.totalKm ?? null,
        totalRides: profile?.totalRides ?? null,
        isAvailable: profile?.isAvailable ?? false,
        bio: profile?.bio ?? null,
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
      },
      stats: {
        proposalsCreated: proposalsCreatedRows[0]?.cnt ?? 0,
        conversationsCount: conversationsRows[0]?.cnt ?? 0,
        messagesSent: messagesSentRows[0]?.cnt ?? 0,
        reportsFiled: reportsFiledRows[0]?.cnt ?? 0,
        reportsReceived: reportsReceivedRows[0]?.cnt ?? 0,
      },
      adClicks: adClicksRows.map((c) => ({
        id: c.id,
        adTitle: c.adTitle ?? "Sconosciuto",
        clickedAt: c.clickedAt,
      })),
      motorcycles: motorcycles.map((m) => ({
        brand: m.brand,
        model: m.model,
        year: m.year,
        displacement: m.displacement ?? 0,
        motorcycleType: m.motorcycleType ?? "",
        ridingStyle: m.ridingStyle ?? "",
      })),
      moderatorLogs: moderatorLogsRows.map((l) => ({
        action: l.action,
        createdAt: l.createdAt,
        moderatorNickname: l.moderatorId ? (moderatorNicknameMap[l.moderatorId] ?? l.moderatorId) : "Sistema",
      })),
      devices: devicesRows.map((d) => ({
        model: d.model,
        platform: d.platform,
        osVersion: d.osVersion,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  } catch (_error) {
    console.error("Admin get user stats error:", _error);
    return sendError(res, 500, "Errore lettura statistiche");
  }
});

router.get("/:id/profile-gaps", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [user, profile] = await Promise.all([
      storage.getUser(id),
      storage.getUserProfile(id),
    ]);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const userType = user.userType ?? "biker";

    const [motorcyclesRows, tagCountsResult, wishlistMotosResult] = await Promise.all([
      db.select({
        brand: userMotorcycles.brand,
        motorcycleType: userMotorcycles.motorcycleType,
        ridingStyle: userMotorcycles.ridingStyle,
      }).from(userMotorcycles).where(eq(userMotorcycles.userId, id)),

      db.execute(sql`
        SELECT tc.slug, COUNT(et.id)::int AS cnt
        FROM entity_tags et
        JOIN tags t ON et.tag_id = t.id
        JOIN tag_categories tc ON t.category_id = tc.id
        WHERE et.entity_type = 'user' AND et.entity_id = ${id}
        GROUP BY tc.slug
      `),

      userType === "zavorrina"
        ? db.select({ id: zavarrinaWishlistMotos.id })
            .from(zavarrinaWishlistMotos)
            .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id))
            .where(eq(zavarrinaWishlists.userId, id))
            .limit(1)
        : Promise.resolve([]),
    ]);

    type TagCountRow = { slug: string; cnt: number };
    const tagCounts: Record<string, number> = {};
    for (const row of tagCountsResult.rows as TagCountRow[]) {
      tagCounts[row.slug] = row.cnt;
    }

    const hasLocation = !!(profile?.latitude && profile?.longitude);
    const hasAvatar = !!user.avatarUrl;
    const hasBirthYear = !!user.birthYear;
    const hasRegion = !!user.region;
    const isAvailable = !!profile?.isAvailable;
    const hasBio = !!(profile?.bio && profile.bio.trim().length > 0);
    const hasMotoWithBrand = motorcyclesRows.some((m) => !!m.brand);
    const hasMotoWithType = motorcyclesRows.some((m) => !!m.motorcycleType);
    const hasMotoWithStyle = motorcyclesRows.some((m) => !!m.ridingStyle);
    const hasWishlist = wishlistMotosResult.length > 0;

    interface GapField {
      field: string;
      label: string;
      description: string;
      filled: boolean;
      importance: "critical" | "high" | "medium" | "low";
    }

    const gaps: GapField[] = [
      { field: "location", label: "Posizione GPS", description: "Coordinate geografiche (lat/lng) per il matching per distanza", filled: hasLocation, importance: "critical" },
      { field: "avatar_url", label: "Foto profilo", description: "Avatar visibile agli altri utenti; filtro 'requires_photo'", filled: hasAvatar, importance: "medium" },
      { field: "birth_year", label: "Anno di nascita", description: "Necessario per il filtro età (age_range)", filled: hasBirthYear, importance: "high" },
      { field: "region", label: "Regione", description: "Usata nel filtro 'exclude_region'", filled: hasRegion, importance: "low" },
      { field: "is_available", label: "Disponibile", description: "Flag 'Disponibile' nel profilo; utenti non disponibili sono esclusi", filled: isAvailable, importance: "critical" },
      { field: "bio", label: "Bio / descrizione", description: "Testo libero usato per bio affinity matching", filled: hasBio, importance: "low" },
      { field: "tag_tipo_moto", label: "Tag tipo moto", description: "Tag categoria 'tipo_moto' (es. naked, enduro, touring…)", filled: (tagCounts["tipo_moto"] ?? 0) > 0, importance: "high" },
      { field: "tag_stile_guida", label: "Tag stile di guida", description: "Tag categoria 'stile_guida' (es. touring, sportivo, off-road…)", filled: (tagCounts["stile_guida"] ?? 0) > 0, importance: "high" },
      { field: "tag_musica", label: "Tag musica", description: "Tag categoria 'musica' per music affinity matching", filled: (tagCounts["musica"] ?? 0) > 0, importance: "medium" },
    ];

    if (userType === "biker" || userType === "coppia") {
      gaps.push(
        { field: "moto_brand", label: "Moto — Marca", description: "Almeno una moto con marca impostata (bucket brand matching)", filled: hasMotoWithBrand, importance: "critical" },
        { field: "moto_type", label: "Moto — Tipo", description: "Tipo moto della moto (naked, enduro, touring…)", filled: hasMotoWithType, importance: "high" },
        { field: "moto_riding_style", label: "Moto — Stile di guida", description: "Stile di guida sulla moto (touring, sportivo…)", filled: hasMotoWithStyle, importance: "high" },
      );
    }

    if (userType === "zavorrina") {
      gaps.push({ field: "wishlist", label: "Wishlist moto", description: "Almeno una moto nella wishlist per il matching B-Z", filled: hasWishlist, importance: "critical" });
    }

    const importanceOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    gaps.sort((a, b) => {
      const filledDiff = Number(a.filled) - Number(b.filled);
      if (filledDiff !== 0) return filledDiff;
      return (importanceOrder[a.importance] ?? 9) - (importanceOrder[b.importance] ?? 9);
    });

    const missingCount = gaps.filter((g) => !g.filled).length;
    const criticalMissing = gaps.filter((g) => !g.filled && g.importance === "critical").length;

    return res.json({ gaps, missingCount, criticalMissing, userType });
  } catch (err) {
    console.error("[admin] profile-gaps error:", err);
    return sendError(res, 500, "Errore lettura profilo gaps");
  }
});

router.get("/:id/geo-insights", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    return res.json({ userId: id, insights: [] });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura geo-insights");
  }
});

router.get("/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const result = await db.execute(sql`
      SELECT sid, sess->>'sessionType' as session_type, expire
      FROM session
      WHERE sess->>'userId' = ${userId}
      ORDER BY expire DESC
    `);

    type SessionRow = { sid: string; session_type: string | null; expire: string | null };
    const sessionItems = (result.rows as SessionRow[]).map((r) => ({
      sid: r.sid,
      displaySid: `…${r.sid.slice(-8)}`,
      sessionType: r.session_type ?? "web",
      expiry: r.expire ?? null,
    }));

    return res.json({
      sessions: sessionItems,
      webCount: sessionItems.filter((s) => s.sessionType === "web").length,
      mobileCount: sessionItems.filter((s) => s.sessionType !== "web").length,
      total: sessionItems.length,
    });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura sessioni");
  }
});

router.delete("/:userId/sessions/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid;
    await db.execute(sql`DELETE FROM session WHERE sid = ${sid}`);
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore eliminazione sessione");
  }
});

export default router;
