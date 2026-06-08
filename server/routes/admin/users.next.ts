/**
 * users.next.ts — file successore di users.ts
 *
 * Contenuto:
 *   - POST / — Creazione manuale utente reale da parte dell'admin (Task #2836)
 *   - GET /audit — Audit real/fake users e sessioni anomale
 *   - POST /fix-isfake — Correzione bulk isFake per utenti reali
 *   - GET /stats/devices — Statistiche dispositivi
 *   - GET /match-summary — Riepilogo match paginato
 *   - GET /:id/stats — Statistiche complete di un singolo utente
 *   - GET /:id/profile-gaps — Campi profilo mancanti per il matching engine
 *   - GET /:id/geo-insights — Geo-insights utente
 *   - GET /:userId/sessions — Lista sessioni attive utente
 *   - DELETE /:userId/sessions/:sid — Revoca singola sessione
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { proposals, conversationParticipants, messages, reports, moderatorLogs, adClicks, adCampaigns, userDevices, userMotorcycles, entityTags, tags, tagCategories, zavarrinaWishlists, zavarrinaWishlistMotos } from "@shared/db";
import { eq, sql, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendSuccess, sendError } from "../../lib/api-response";
import { onlineTracker } from "../../online-tracker";

const router = Router();

const adminCreateUserSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio").max(30, "Nickname troppo lungo").transform((s) => s.trim()),
  email: z.string().email("Email non valida").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  userType: z.enum(["biker", "zavorrina", "coppia"], {
    error: "Tipo utente non valido (biker / zavorrina / coppia)",
  }),
  sex: z.enum(["M", "F"]).optional().nullable(),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear()).optional().nullable(),
  region: z.string().optional().nullable().transform((s) => s?.trim() || null),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { nickname, email, password, userType, sex, birthYear, region } = parsed.data;

    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }

    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return sendError(res, 409, "Email già registrata");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      birthYear: birthYear ?? null,
      region: region || null,
      country: "IT",
      isFake: false,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
    });

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_user_manual",
      targetType: "user",
      targetId: newUser.id,
      details: `Utente creato manualmente dall'admin: ${nickname} (${email})`,
    });

    const { password: _pw, ...safeUser } = newUser;
    return res.status(201).json(safeUser);
  } catch (err) {
    console.error("[admin] create user error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/audit", async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const realUsersMarkedFake = await db.execute(sql`
      SELECT id, nickname, email, email_verified, last_login_at, created_at, status, role, invitation_code
      FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE '%@fakeuser.bikerlink.it'
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
        AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 200
    `);

    const anomalousStatus = await db.execute(sql`
      SELECT id, nickname, email, status, role, last_login_at, created_at, is_fake
      FROM users
      WHERE status != 'active'
        AND role NOT IN ('admin', 'moderator')
        AND is_fake = false
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 200
    `);

    const realFakeCount = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_fake = false AND role NOT IN ('admin', 'moderator')) AS real_users,
        COUNT(*) FILTER (WHERE is_fake = true AND role NOT IN ('admin', 'moderator')) AS fake_users,
        COUNT(*) FILTER (
          WHERE is_fake = true
            AND email NOT LIKE '%@fakeuser.bikerlink.it'
            AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
            AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
            AND role NOT IN ('admin', 'moderator')
        ) AS real_marked_fake,
        COUNT(*) FILTER (WHERE status != 'active' AND is_fake = false AND role NOT IN ('admin', 'moderator')) AS real_but_inactive
      FROM users
    `);

    const activeSessionsButFakeResult = await db.execute(sql`
      SELECT u.id, u.nickname, u.email, u.is_fake, u.status, u.role, u.last_login_at,
             s.expire AS session_expires
      FROM session s
      JOIN users u ON u.id = (s.sess->>'userId')
      WHERE s.expire > NOW()
        AND u.is_fake = true
        AND u.role NOT IN ('admin', 'moderator')
      ORDER BY s.expire DESC
      LIMIT 100
    `).catch(() => ({ rows: [] as unknown[] }));

    const trackerOnlineIds = new Set(onlineTracker.getOnlineUserIds());
    const trackerSize = onlineTracker.size();

    const activeRealSessionsResult = await db.execute(sql`
      SELECT DISTINCT (s.sess->>'userId') AS user_id
      FROM session s
      JOIN users u ON u.id = (s.sess->>'userId')
      WHERE s.expire > NOW()
        AND u.is_fake = false
        AND u.role NOT IN ('admin', 'moderator')
    `).catch(() => ({ rows: [] as unknown[] }));

    type UserIdRow = { user_id: string };
    const activeRealSessionUserIds = new Set(
      (activeRealSessionsResult.rows as UserIdRow[]).map(r => r.user_id).filter(Boolean)
    );
    const sessionNotInTracker = [...activeRealSessionUserIds].filter(uid => !trackerOnlineIds.has(uid));

    type CountsRow = {
      real_users: string;
      fake_users: string;
      real_marked_fake: string;
      real_but_inactive: string;
    };
    const counts = realFakeCount.rows[0] as CountsRow;

    return res.json({
      summary: {
        realUsers: parseInt(counts.real_users ?? "0", 10),
        fakeUsers: parseInt(counts.fake_users ?? "0", 10),
        realUsersIncorrectlyMarkedFake: parseInt(counts.real_marked_fake ?? "0", 10),
        realButInactive: parseInt(counts.real_but_inactive ?? "0", 10),
        onlineTrackerSize: trackerSize,
        activeRealSessions: activeRealSessionUserIds.size,
        sessionNotInTrackerCount: sessionNotInTracker.length,
        activeSessionsMarkedFake: activeSessionsButFakeResult.rows.length,
      },
      realUsersMarkedFake: realUsersMarkedFake.rows,
      anomalousStatus: anomalousStatus.rows,
      activeSessionsMarkedFake: activeSessionsButFakeResult.rows,
      sessionNotInTracker: sessionNotInTracker.slice(0, 50),
      onlineTrackerUserIds: [...trackerOnlineIds].slice(0, 50),
    });
  } catch (err) {
    console.error("[admin] users audit error:", err);
    return sendError(res, 500, "Errore audit utenti");
  }
});

router.post("/fix-isfake", async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dry === "true";

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidatesResult = await db.execute(sql`
      SELECT id, nickname, email, email_verified, last_login_at, created_at, invitation_code
      FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE '%@fakeuser.bikerlink.it'
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
        AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
      ORDER BY last_login_at DESC NULLS LAST
    `);

    type CandidateRow = { id: string; nickname: string; email: string; email_verified: boolean; last_login_at: string | null; created_at: string };
    const candidates = candidatesResult.rows as CandidateRow[];

    if (dryRun || candidates.length === 0) {
      return res.json({
        dryRun: true,
        candidateCount: candidates.length,
        candidates: candidates.map(c => ({ id: c.id, nickname: c.nickname, email: c.email })),
      });
    }

    const ids = candidates.map(c => c.id);
    const updateResult = await db.execute(sql`
      UPDATE users SET is_fake = false, updated_at = NOW()
      WHERE id = ANY(${ids}::varchar[])
    `);

    const affected = (updateResult.rowCount as number | null) ?? 0;

    return res.json({
      dryRun: false,
      affected,
      fixedUsers: candidates.map(c => ({ id: c.id, nickname: c.nickname })),
    });
  } catch (err) {
    console.error("[admin] fix-isfake error:", err);
    return sendError(res, 500, "Errore fix isFake");
  }
});

router.get("/stats/devices", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 0;

    const dateFilter = days > 0
      ? sql`AND last_login_at >= NOW() - INTERVAL '1 day' * ${days}`
      : sql``;

    const platformResult = await db.execute(sql`
      SELECT
        COALESCE(last_platform, 'unknown') AS platform,
        COUNT(*)::int AS count
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        ${dateFilter}
      GROUP BY last_platform
      ORDER BY count DESC
    `);

    const modelsResult = await db.execute(sql`
      SELECT
        COALESCE(last_device_model, 'Sconosciuto') AS model,
        COALESCE(last_platform, 'unknown') AS platform,
        COUNT(*)::int AS count
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        AND last_device_model IS NOT NULL
        ${dateFilter}
      GROUP BY last_device_model, last_platform
      ORDER BY count DESC
      LIMIT 30
    `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        ${dateFilter}
    `);

    type PlatformRow = { platform: string; count: number };
    type ModelRow = { model: string; platform: string; count: number };
    type TotalRow = { total: number };

    const total = (totalResult.rows[0] as TotalRow)?.total ?? 0;
    const platforms = platformResult.rows as PlatformRow[];
    const models = modelsResult.rows as ModelRow[];

    return res.json({ total, platforms, models });
  } catch (err) {
    console.error("[admin] device stats error:", err);
    return sendError(res, 500, "Errore statistiche dispositivi");
  }
});

router.get("/match-summary", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const zeroOnly = req.query.zeroOnly === "true";
    const searchRaw = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const searchTerm = searchRaw ? `%${searchRaw}%` : null;

    type CountRow = { cnt?: string };

    const [countResult, zeroMatchResult] = await Promise.all([
      zeroOnly
        ? db.execute(sql`
            SELECT COUNT(*) as cnt FROM users u
            LEFT JOIN LATERAL (
              SELECT COUNT(*) as cnt FROM biker_biker_matches m
              WHERE m.biker1_id = u.id OR m.biker2_id = u.id
            ) bb ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
              WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
            ) bz ON true
            WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
              AND (COALESCE(bb.cnt, 0) + COALESCE(bz.cnt, 0)) = 0
              ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
          `)
        : db.execute(sql`
            SELECT COUNT(*) as cnt FROM users u
            WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
              ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
          `),
      db.execute(sql`
        SELECT COUNT(*) as cnt FROM users u
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as cnt FROM biker_biker_matches m
          WHERE m.biker1_id = u.id OR m.biker2_id = u.id
        ) bb ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
          WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
        ) bz ON true
        WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
          AND (COALESCE(bb.cnt, 0) + COALESCE(bz.cnt, 0)) = 0
      `),
    ]);

    const total = parseInt(((countResult.rows[0] as CountRow)?.cnt) ?? "0", 10);
    const zeroMatchCount = parseInt(((zeroMatchResult.rows[0] as CountRow)?.cnt) ?? "0", 10);

    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.nickname, u.avatar_url, u.user_type, u.role, u.status,
        COALESCE(bb.cnt, 0)::text as bb_count,
        COALESCE(bz.cnt, 0)::text as bz_count,
        null as bb_counts
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_biker_matches m
        WHERE m.biker1_id = u.id OR m.biker2_id = u.id
      ) bb ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
        WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
      ) bz ON true
      WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
        ${zeroOnly ? sql`AND (COALESCE(bb.cnt, 0) + COALESCE(bz.cnt, 0)) = 0` : sql``}
        ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
      ORDER BY u.nickname
      LIMIT ${limit} OFFSET ${offset}
    `);


    type UserRow = { id: string; nickname: string; avatar_url: string | null; user_type: string | null; role: string; status: string; bb_count: string; bz_count: string; bb_counts: null };
    const mappedUsers = (usersResult.rows as UserRow[]).map((row) => {
      const bbMatches = parseInt(row.bb_count || "0", 10);
      const bzMatches = parseInt(row.bz_count || "0", 10);
      return {
        id: row.id,
        nickname: row.nickname,
        avatarUrl: row.avatar_url,
        userType: row.user_type,
        role: row.role,
        status: row.status,
        bbMatches,
        bzMatches,
        totalMatches: bbMatches + bzMatches,
        matchCounts: {} as Record<string, number>,
      };
    });

    return res.json({ users: mappedUsers, total, page, zeroMatchCount });

  } catch (_error) {
    console.error("Admin match-summary error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});


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
      {
        field: "location",
        label: "Posizione GPS",
        description: "Coordinate geografiche (lat/lng) per il matching per distanza",
        filled: hasLocation,
        importance: "critical",
      },
      {
        field: "avatar_url",
        label: "Foto profilo",
        description: "Avatar visibile agli altri utenti; filtro 'requires_photo'",
        filled: hasAvatar,
        importance: "medium",
      },
      {
        field: "birth_year",
        label: "Anno di nascita",
        description: "Necessario per il filtro età (age_range)",
        filled: hasBirthYear,
        importance: "high",
      },
      {
        field: "region",
        label: "Regione",
        description: "Usata nel filtro 'exclude_region'",
        filled: hasRegion,
        importance: "low",
      },
      {
        field: "is_available",
        label: "Disponibile",
        description: "Flag 'Disponibile' nel profilo; utenti non disponibili sono esclusi",
        filled: isAvailable,
        importance: "critical",
      },
      {
        field: "bio",
        label: "Bio / descrizione",
        description: "Testo libero usato per bio affinity matching",
        filled: hasBio,
        importance: "low",
      },
      {
        field: "tag_tipo_moto",
        label: "Tag tipo moto",
        description: "Tag categoria 'tipo_moto' (es. naked, enduro, touring…)",
        filled: (tagCounts["tipo_moto"] ?? 0) > 0,
        importance: "high",
      },
      {
        field: "tag_stile_guida",
        label: "Tag stile di guida",
        description: "Tag categoria 'stile_guida' (es. touring, sportivo, off-road…)",
        filled: (tagCounts["stile_guida"] ?? 0) > 0,
        importance: "high",
      },
      {
        field: "tag_musica",
        label: "Tag musica",
        description: "Tag categoria 'musica' per music affinity matching",
        filled: (tagCounts["musica"] ?? 0) > 0,
        importance: "medium",
      },
    ];

    if (userType === "biker" || userType === "coppia") {
      gaps.push(
        {
          field: "moto_brand",
          label: "Moto — Marca",
          description: "Almeno una moto con marca impostata (bucket brand matching)",
          filled: hasMotoWithBrand,
          importance: "critical",
        },
        {
          field: "moto_type",
          label: "Moto — Tipo",
          description: "Tipo moto della moto (naked, enduro, touring…)",
          filled: hasMotoWithType,
          importance: "high",
        },
        {
          field: "moto_riding_style",
          label: "Moto — Stile di guida",
          description: "Stile di guida sulla moto (touring, sportivo…)",
          filled: hasMotoWithStyle,
          importance: "high",
        },
      );
    }

    if (userType === "zavorrina") {
      gaps.push({
        field: "wishlist",
        label: "Wishlist moto",
        description: "Almeno una moto nella wishlist per il matching B-Z",
        filled: hasWishlist,
        importance: "critical",
      });
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
      SELECT
        sid,
        sess->>'sessionType' as session_type,
        expire
      FROM session
      WHERE sess->>'userId' = ${userId}
      ORDER BY expire DESC
    `);

    type SessionRow = { sid: string; session_type: string | null; expire: string | null };
    const rows = result.rows as SessionRow[];

    const sessionItems = rows.map((r) => ({
      sid: r.sid,
      displaySid: `…${r.sid.slice(-8)}`,
      sessionType: r.session_type ?? "web",
      expiry: r.expire ?? null,
    }));

    const webCount = sessionItems.filter((s) => s.sessionType === "web").length;
    const mobileCount = sessionItems.filter((s) => s.sessionType !== "web").length;

    return res.json({
      sessions: sessionItems,
      webCount,
      mobileCount,
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
