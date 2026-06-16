/**
 * users.next-detail.ts — route di dettaglio per singolo utente admin
 *
 * Contenuto:
 *   - GET /:id/stats                — Statistiche complete di un singolo utente
 *   - GET /:id/profile-gaps         — Campi profilo mancanti per il matching engine
 *   - GET /:id/zero-match-diagnosis — Possibili cause dei 0 match (admin)
 *   - GET /:id/geo-insights         — Geo-insights utente
 *   - GET /:userId/sessions         — Lista sessioni attive utente
 *   - DELETE /:userId/sessions/:sid — Revoca singola sessione
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { proposals, conversationParticipants, messages, reports, moderatorLogs, adClicks, adCampaigns, userDevices, userMotorcycles, zavorrinaWishlists, zavorrinaWishlistMotos, userSessions } from "@shared/db";
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

    const [devicesRows, sessionStatsRows, sessionPlatformRows] = await Promise.all([
      db.select({
        model: userDevices.model,
        platform: userDevices.platform,
        osVersion: userDevices.osVersion,
        firstSeenAt: userDevices.firstSeenAt,
        lastSeenAt: userDevices.lastSeenAt,
      }).from(userDevices)
        .where(eq(userDevices.userId, id))
        .orderBy(sql`${userDevices.lastSeenAt} DESC`),

      db.select({
        avgDuration: sql<number>`COALESCE(AVG(${userSessions.durationSeconds}) FILTER (WHERE ${userSessions.durationSeconds} IS NOT NULL), 0)::int`,
        totalSessions: sql<number>`COUNT(*)::int`,
        backgroundCount: sql<number>`COUNT(*) FILTER (WHERE ${userSessions.exitType} = 'background')::int`,
        logoutCount: sql<number>`COUNT(*) FILTER (WHERE ${userSessions.exitType} = 'logout')::int`,
        crashCount: sql<number>`COUNT(*) FILTER (WHERE ${userSessions.exitType} = 'crash')::int`,
        nullCount: sql<number>`COUNT(*) FILTER (WHERE ${userSessions.exitType} IS NULL)::int`,
      }).from(userSessions).where(eq(userSessions.userId, id)),

      db.select({
        platform: userSessions.platform,
        sessions: sql<number>`COUNT(*)::int`,
        avgDuration: sql<number>`COALESCE(AVG(${userSessions.durationSeconds}) FILTER (WHERE ${userSessions.durationSeconds} IS NOT NULL), 0)::int`,
      }).from(userSessions)
        .where(eq(userSessions.userId, id))
        .groupBy(userSessions.platform),
    ]);

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
      sessionStats: (() => {
        const row = sessionStatsRows[0];
        const total = row?.totalSessions ?? 0;
        const bg = row?.backgroundCount ?? 0;
        const lo = row?.logoutCount ?? 0;
        const cr = row?.crashCount ?? 0;
        const platformBreakdown: Record<string, { sessions: number; avgDuration: number }> = {};
        for (const p of sessionPlatformRows) {
          const key = (p.platform ?? "unknown").toLowerCase();
          platformBreakdown[key] = { sessions: p.sessions, avgDuration: p.avgDuration };
        }
        return {
          avgDurationSeconds: row?.avgDuration ?? 0,
          totalSessions: total,
          exitBreakdown: { background: bg, logout: lo, crash: cr, unknown: row?.nullCount ?? 0 },
          platformBreakdown,
        };
      })(),
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
        ? db.select({ id: zavorrinaWishlistMotos.id })
            .from(zavorrinaWishlistMotos)
            .innerJoin(zavorrinaWishlists, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id))
            .where(eq(zavorrinaWishlists.userId, id))
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

router.get("/:id/zero-match-diagnosis", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [user, profile] = await Promise.all([
      storage.getUser(id),
      storage.getUserProfile(id),
    ]);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const userType = user.userType ?? "biker";
    const hasLocation = !!(profile?.latitude && profile?.longitude);
    const isAvailable = !!profile?.isAvailable;

    let hasMoto = true;
    if (userType === "biker" || userType === "coppia") {
      const motos = await db.select({ id: userMotorcycles.id })
        .from(userMotorcycles)
        .where(eq(userMotorcycles.userId, id))
        .limit(1);
      hasMoto = motos.length > 0;
    }

    let hasWishlist = true;
    if (userType === "zavorrina") {
      const wl = await db.select({ id: zavorrinaWishlistMotos.id })
        .from(zavorrinaWishlistMotos)
        .innerJoin(zavorrinaWishlists, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id))
        .where(eq(zavorrinaWishlists.userId, id))
        .limit(1);
      hasWishlist = wl.length > 0;
    }

    const autoMatchSetting = await storage.getAppSetting("auto_matching_enabled");
    const engineGateOn = !autoMatchSetting || autoMatchSetting.value !== "false";

    let compatibleNearby = 0;
    if (hasLocation) {
      const lat = Number(profile!.latitude);
      const lng = Number(profile!.longitude);
      const compatibleTypes = userType === "zavorrina" ? ["biker"] : ["biker", "zavorrina"];
      const typeList = compatibleTypes.join("','");
      const nearbyResult = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM users u
        JOIN user_profiles up ON up.user_id = u.id
        WHERE u.is_fake = false
          AND u.status = 'active'
          AND u.id <> ${id}
          AND u.user_type IN (${sql.raw(`'${typeList}'`)})
          AND up.latitude IS NOT NULL
          AND up.longitude IS NOT NULL
          AND up.is_available = true
          AND (
            6371 * acos(
              LEAST(1.0, cos(radians(${lat})) * cos(radians(up.latitude::float)) *
              cos(radians(up.longitude::float) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(up.latitude::float)))
            )
          ) <= 500
      `);
      compatibleNearby = Number((nearbyResult.rows[0] as { cnt: unknown })?.cnt ?? 0);
    }

    interface DiagnosisCause {
      id: string;
      severity: "critical" | "warn" | "info";
      title: string;
      description: string;
      action: string;
    }

    const causes: DiagnosisCause[] = [];

    if (!engineGateOn) {
      causes.push({
        id: "engine_gate_off",
        severity: "critical",
        title: "Engine di matching disabilitato",
        description: "Il flag 'auto_matching_enabled' è disattivato globalmente: nessun match viene calcolato per nessun utente.",
        action: "Vai su Match Control → Azioni Engine e riattiva il matching.",
      });
    }

    if (!hasLocation) {
      causes.push({
        id: "no_location",
        severity: "critical",
        title: "Nessuna posizione GPS",
        description: "L'utente non ha coordinate GPS nel profilo. Il matching per distanza è impossibile e la maggior parte dei tipi di match richiedono la posizione.",
        action: "L'utente deve aprire l'app e condividere la posizione, oppure imposta le coordinate manualmente dal pannello profilo.",
      });
    }

    if (!isAvailable) {
      causes.push({
        id: "not_available",
        severity: "critical",
        title: "Utente non disponibile",
        description: "Il flag 'Disponibile' del profilo è disattivato. Gli utenti non disponibili vengono esclusi da tutti i tipi di match.",
        action: "L'utente deve attivare 'Disponibile' nell'app, oppure modificalo dal pannello di amministrazione.",
      });
    }

    if ((userType === "biker" || userType === "coppia") && !hasMoto) {
      causes.push({
        id: "no_moto",
        severity: "critical",
        title: "Nessuna moto in garage",
        description: "I biker senza moto non partecipano ai match per brand, tipo, stile di guida e configurazione moto (i tipi più comuni).",
        action: "L'utente deve aggiungere almeno una moto dal proprio profilo.",
      });
    }

    if (userType === "zavorrina" && !hasWishlist) {
      causes.push({
        id: "no_wishlist",
        severity: "critical",
        title: "Nessuna moto nella wishlist",
        description: "Le zavorrine senza wishlist non possono essere abbinate ai biker nei match di tipo B-Z.",
        action: "L'utente deve aggiungere almeno una moto alla propria wishlist dal profilo.",
      });
    }

    if (hasLocation && compatibleNearby === 0) {
      causes.push({
        id: "no_counterpart",
        severity: "warn",
        title: "Nessun utente compatibile nei dintorni",
        description: "Non esistono utenti di tipo compatibile (attivi, disponibili, con GPS) entro 500 km da questa posizione.",
        action: "Il database potrebbe avere pochi utenti reali in questa zona. Considera l'aggiunta di profili fake localizzati per i test.",
      });
    } else if (hasLocation && compatibleNearby < 5) {
      causes.push({
        id: "few_counterparts",
        severity: "info",
        title: `Pochissimi utenti compatibili vicini (${compatibleNearby})`,
        description: `Solo ${compatibleNearby} utente/i compatibile/i attivo/i con GPS entro 500 km. È difficile trovare match con così pochi candidati.`,
        action: "Verifica la distribuzione geografica degli utenti nel sistema e valuta l'aggiunta di più profili nella zona.",
      });
    }

    if (causes.length === 0) {
      causes.push({
        id: "unknown",
        severity: "info",
        title: "Profilo completo ma zero match",
        description: "Il profilo sembra completo e l'engine è attivo. I match potrebbero non essere stati ancora calcolati o potrebbe esserci un bug specifico del tipo di match.",
        action: "Usa il pulsante 'Ricalcola ora' per forzare un ricalcolo dei match per questo utente.",
      });
    }

    return res.json({ causes, engineGateOn, hasLocation, isAvailable, compatibleNearby });
  } catch (err) {
    console.error("[admin] zero-match-diagnosis error:", err);
    return sendError(res, 500, "Errore diagnosi zero match");
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
