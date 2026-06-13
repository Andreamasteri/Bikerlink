/**
 * users.next.ts — file successore di users.ts
 *
 * Contenuto:
 *   - POST / — Creazione manuale utente reale da parte dell'admin (Task #2836)
 *   - GET /audit — Audit real/fake users e sessioni anomale
 *   - POST /fix-isfake — Correzione bulk isFake per utenti reali
 *   - GET /stats/devices — Statistiche dispositivi
 *   - GET /match-summary — Riepilogo match paginato
 *
 * Route di dettaglio utente (/:id/stats, /:id/profile-gaps, ecc.)
 * → users.next-detail.ts
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
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
              -- Explicitly split base_intent rows (motorcycle_brand='base_intent'),
              -- which are conceptually B-Z matches stored in biker_biker_matches.
              -- Both sub-counts must be zero for a user to qualify as "zero matches".
              SELECT
                COUNT(*) FILTER (WHERE motorcycle_brand != 'base_intent') AS cnt,
                COUNT(*) FILTER (WHERE motorcycle_brand = 'base_intent')  AS base_intent_cnt
              FROM biker_biker_matches m
              WHERE m.biker1_id = u.id OR m.biker2_id = u.id
            ) bb ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
              WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
            ) bz ON true
            WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
              AND (COALESCE(bb.cnt, 0) + COALESCE(bb.base_intent_cnt, 0) + COALESCE(bz.cnt, 0)) = 0
              ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
          `)
        : db.execute(sql`
            SELECT COUNT(*) as cnt FROM users u
            WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
              ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
          `),
      db.execute(sql`
        -- zeroMatchCount stat: count users with no matches of any kind.
        -- base_intent rows (motorcycle_brand='base_intent') live in biker_biker_matches
        -- but are conceptually B-Z matches; they are split out explicitly so this count
        -- stays correct even if the main bb.cnt subquery is later refactored.
        SELECT COUNT(*) as cnt FROM users u
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE motorcycle_brand != 'base_intent') AS cnt,
            COUNT(*) FILTER (WHERE motorcycle_brand = 'base_intent')  AS base_intent_cnt
          FROM biker_biker_matches m
          WHERE m.biker1_id = u.id OR m.biker2_id = u.id
        ) bb ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
          WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
        ) bz ON true
        WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
          AND (COALESCE(bb.cnt, 0) + COALESCE(bb.base_intent_cnt, 0) + COALESCE(bz.cnt, 0)) = 0
      `),
    ]);

    const total = parseInt(((countResult.rows[0] as CountRow)?.cnt) ?? "0", 10);
    const zeroMatchCount = parseInt(((zeroMatchResult.rows[0] as CountRow)?.cnt) ?? "0", 10);

    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.nickname, u.avatar_url, u.user_type, u.role, u.status,
        COALESCE(bb.cnt + bb.base_intent_cnt, 0)::text as bb_count,
        COALESCE(bz.cnt, 0)::text as bz_count,
        null as bb_counts
      FROM users u
      LEFT JOIN LATERAL (
        -- Explicitly split base_intent rows (motorcycle_brand='base_intent') from
        -- regular B-B matches. base_intent are conceptually B-Z matches stored here.
        -- bb_count display column uses (cnt + base_intent_cnt) = all rows so that
        -- the JS mapping (lines ~518-522) can subtract base_intent_cnt correctly.
        -- zeroOnly filter sums all three parts explicitly (mirrors count queries above).
        SELECT
          COUNT(*) FILTER (WHERE motorcycle_brand != 'base_intent') AS cnt,
          COUNT(*) FILTER (WHERE motorcycle_brand = 'base_intent')  AS base_intent_cnt
        FROM biker_biker_matches m
        WHERE m.biker1_id = u.id OR m.biker2_id = u.id
      ) bb ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
        WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
      ) bz ON true
      WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
        ${zeroOnly ? sql`AND (COALESCE(bb.cnt, 0) + COALESCE(bb.base_intent_cnt, 0) + COALESCE(bz.cnt, 0)) = 0` : sql``}
        ${searchTerm ? sql`AND u.nickname ILIKE ${searchTerm}` : sql``}
      ORDER BY u.nickname
      LIMIT ${limit} OFFSET ${offset}
    `);


    type UserRow = { id: string; nickname: string; avatar_url: string | null; user_type: string | null; role: string; status: string; bb_count: string; bz_count: string; bb_counts: null };
    const rawUsers = usersResult.rows as UserRow[];
    const userIds = rawUsers.map((r) => r.id);

    // Bulk-fetch data needed to compute critical profile gaps
    const [profilesResult, motorcyclesResult, tagCountsResult, wishlistResult] = await Promise.all([
      userIds.length > 0
        ? db.execute(sql`
            SELECT user_id, latitude, longitude, is_available
            FROM user_profiles
            WHERE user_id = ANY(${userIds}::varchar[])
          `)
        : Promise.resolve({ rows: [] }),
      userIds.length > 0
        ? db.execute(sql`
            SELECT user_id, brand
            FROM user_motorcycles
            WHERE user_id = ANY(${userIds}::varchar[])
              AND brand IS NOT NULL AND brand != ''
          `)
        : Promise.resolve({ rows: [] }),
      userIds.length > 0
        ? db.execute(sql`
            SELECT et.entity_id AS user_id, tc.slug
            FROM entity_tags et
            JOIN tags t ON et.tag_id = t.id
            JOIN tag_categories tc ON t.category_id = tc.id
            WHERE et.entity_type = 'user'
              AND et.entity_id = ANY(${userIds}::varchar[])
          `)
        : Promise.resolve({ rows: [] }),
      userIds.length > 0
        ? db.execute(sql`
            SELECT DISTINCT zw.user_id
            FROM zavorrina_wishlist_motos zwm
            JOIN zavorrina_wishlists zw ON zwm.wishlist_id = zw.id
            WHERE zw.user_id = ANY(${userIds}::varchar[])
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    type ProfileRow = { user_id: string; latitude: number | null; longitude: number | null; is_available: boolean | null };
    type MotoRow = { user_id: string; brand: string };
    type TagRow = { user_id: string; slug: string };
    type WishlistRow = { user_id: string };

    const profileMap = new Map<string, ProfileRow>();
    for (const r of profilesResult.rows as ProfileRow[]) profileMap.set(r.user_id, r);

    const motoSet = new Set<string>();
    for (const r of motorcyclesResult.rows as MotoRow[]) motoSet.add(r.user_id);

    const tagMap = new Map<string, Set<string>>();
    for (const r of tagCountsResult.rows as TagRow[]) {
      if (!tagMap.has(r.user_id)) tagMap.set(r.user_id, new Set());
      tagMap.get(r.user_id)!.add(r.slug);
    }

    const wishlistSet = new Set<string>();
    for (const r of wishlistResult.rows as WishlistRow[]) wishlistSet.add(r.user_id);

    function computeCriticalGaps(row: UserRow): number {
      const profile = profileMap.get(row.id);
      const userType = row.user_type ?? "biker";

      const hasLocation = !!(profile?.latitude && profile?.longitude);
      const isAvailable = !!profile?.is_available;
      const hasMotoWithBrand = motoSet.has(row.id);
      const hasWishlist = wishlistSet.has(row.id);

      let critical = 0;
      if (!hasLocation) critical++;
      if (!isAvailable) critical++;
      if ((userType === "biker" || userType === "coppia") && !hasMotoWithBrand) critical++;
      if (userType === "zavorrina" && !hasWishlist) critical++;
      return critical;
    }

    const [bbBreakdownResult, bzBreakdownResult] = await Promise.all([
      userIds.length > 0
        ? db.execute(sql`
            SELECT
              u_id,
              SUM(CASE WHEN
                motorcycle_brand NOT LIKE '%:%'
                AND motorcycle_brand NOT IN ('musica','musica_zav','distanza','distanza_zav','eventi','base_intent')
                AND motorcycle_brand NOT LIKE 'gps_%'
                AND motorcycle_brand NOT LIKE 'zona_%'
                AND motorcycle_brand NOT LIKE 'percorso%'
              THEN 1 ELSE 0 END)::int AS "bikerBikerBrand",
              SUM(CASE WHEN motorcycle_brand = 'base_intent' THEN 1 ELSE 0 END)::int AS "bikerZavarrinaBase",
              SUM(CASE WHEN motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%' THEN 1 ELSE 0 END)::int AS "bikerClubBrand",
              SUM(CASE WHEN motorcycle_brand LIKE 'club_zav:%' THEN 1 ELSE 0 END)::int AS "zavarrinaClubBrand",
              SUM(CASE WHEN motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%' THEN 1 ELSE 0 END)::int AS "bikerBikerTypeStyle",
              SUM(CASE WHEN motorcycle_brand LIKE 'tipo_zav:%' THEN 1 ELSE 0 END)::int AS "bikerZavarrinaTypeStyle",
              SUM(CASE WHEN motorcycle_brand = 'distanza' THEN 1 ELSE 0 END)::int AS "bikerBikerDistance",
              SUM(CASE WHEN motorcycle_brand = 'distanza_zav' THEN 1 ELSE 0 END)::int AS "bikerZavarrinaDistance",
              SUM(CASE WHEN motorcycle_brand = 'musica' THEN 1 ELSE 0 END)::int AS "bikerBikerMusic",
              SUM(CASE WHEN motorcycle_brand = 'musica_zav' THEN 1 ELSE 0 END)::int AS "bikerZavarrinaMusic",
              SUM(CASE WHEN motorcycle_brand IN ('gps_tilt', 'gps_full') THEN 1 ELSE 0 END)::int AS "bikerBikerLeanAngle",
              SUM(CASE WHEN motorcycle_brand LIKE 'zona_bb:%' OR motorcycle_brand LIKE 'percorso:%' THEN 1 ELSE 0 END)::int AS "bikerBikerRouteTypeZone",
              SUM(CASE WHEN motorcycle_brand LIKE 'zona_zav:%' OR motorcycle_brand LIKE 'percorso_zav:%' THEN 1 ELSE 0 END)::int AS "bikerZavarrinaRouteTypeZone",
              SUM(CASE WHEN motorcycle_brand IN ('gps_speed', 'gps_full') THEN 1 ELSE 0 END)::int AS "bikerBikerAvgSpeed",
              SUM(CASE WHEN motorcycle_brand IN ('gps_speed', 'gps_full') THEN 1 ELSE 0 END)::int AS "bikerBikerAvgDuration",
              SUM(CASE WHEN motorcycle_brand IN ('gps_day', 'gps_full') THEN 1 ELSE 0 END)::int AS "bikerBikerDayTime",
              SUM(CASE WHEN motorcycle_brand = 'eventi' THEN 1 ELSE 0 END)::int AS "bikerBikerEvents"
            FROM (
              SELECT biker1_id AS u_id, motorcycle_brand
              FROM biker_biker_matches
              WHERE biker1_id = ANY(${userIds}::varchar[])
              UNION ALL
              SELECT biker2_id AS u_id, motorcycle_brand
              FROM biker_biker_matches
              WHERE biker2_id = ANY(${userIds}::varchar[])
            ) sub
            GROUP BY u_id
          `)
        : Promise.resolve({ rows: [] }),
      userIds.length > 0
        ? db.execute(sql`
            SELECT u_id, COUNT(*)::int AS "bikerZavorrinaBrand"
            FROM (
              SELECT biker_id AS u_id FROM biker_zavorrina_matches WHERE biker_id = ANY(${userIds}::varchar[])
              UNION ALL
              SELECT zavorrina_id AS u_id FROM biker_zavorrina_matches WHERE zavorrina_id = ANY(${userIds}::varchar[])
            ) sub
            GROUP BY u_id
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    type BbBreakdownRow = {
      u_id: string;
      bikerBikerBrand: number; bikerZavarrinaBase: number; bikerClubBrand: number; zavarrinaClubBrand: number;
      bikerBikerTypeStyle: number; bikerZavarrinaTypeStyle: number;
      bikerBikerDistance: number; bikerZavarrinaDistance: number;
      bikerBikerMusic: number; bikerZavarrinaMusic: number;
      bikerBikerLeanAngle: number; bikerBikerRouteTypeZone: number; bikerZavarrinaRouteTypeZone: number;
      bikerBikerAvgSpeed: number; bikerBikerAvgDuration: number; bikerBikerDayTime: number; bikerBikerEvents: number;
    };
    type BzBreakdownRow = { u_id: string; bikerZavorrinaBrand: number };

    const bbBreakdownMap = new Map<string, BbBreakdownRow>();
    for (const r of bbBreakdownResult.rows as BbBreakdownRow[]) bbBreakdownMap.set(r.u_id, r);

    const bzBreakdownMap = new Map<string, BzBreakdownRow>();
    for (const r of bzBreakdownResult.rows as BzBreakdownRow[]) bzBreakdownMap.set(r.u_id, r);

    const mappedUsers = rawUsers.map((row) => {
      const bb = bbBreakdownMap.get(row.id);
      const bz = bzBreakdownMap.get(row.id);

      // base_intent records sit in biker_biker_matches but are conceptually B-Z matches.
      // bb_count (raw) includes them; subtract to keep bbMatches as pure B-B and add to bzMatches.
      const baseIntentCount = bb?.bikerZavarrinaBase ?? 0;
      const bbMatches = parseInt(row.bb_count || "0", 10) - baseIntentCount;
      const bzMatches = parseInt(row.bz_count || "0", 10) + baseIntentCount;

      const matchCounts: Record<string, number> = {
        bikerBikerBrand:           bb?.bikerBikerBrand           ?? 0,
        bikerZavorrinaBrand:       bz?.bikerZavorrinaBrand       ?? 0,
        bikerZavarrinaBase:        bb?.bikerZavarrinaBase        ?? 0,
        bikerClubBrand:            bb?.bikerClubBrand            ?? 0,
        zavarrinaClubBrand:        bb?.zavarrinaClubBrand        ?? 0,
        bikerBikerTypeStyle:       bb?.bikerBikerTypeStyle       ?? 0,
        bikerZavarrinaTypeStyle:   bb?.bikerZavarrinaTypeStyle   ?? 0,
        bikerBikerDistance:        bb?.bikerBikerDistance        ?? 0,
        bikerZavarrinaDistance:    bb?.bikerZavarrinaDistance    ?? 0,
        bikerBikerMusic:           bb?.bikerBikerMusic           ?? 0,
        bikerZavarrinaMusic:       bb?.bikerZavarrinaMusic       ?? 0,
        bikerBikerLeanAngle:       bb?.bikerBikerLeanAngle       ?? 0,
        bikerBikerRouteTypeZone:   bb?.bikerBikerRouteTypeZone   ?? 0,
        bikerZavarrinaRouteTypeZone: bb?.bikerZavarrinaRouteTypeZone ?? 0,
        bikerBikerAvgSpeed:        bb?.bikerBikerAvgSpeed        ?? 0,
        bikerBikerAvgDuration:     bb?.bikerBikerAvgDuration     ?? 0,
        bikerBikerDayTime:         bb?.bikerBikerDayTime         ?? 0,
        bikerBikerEvents:          bb?.bikerBikerEvents          ?? 0,
      };

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
        matchCounts,
        criticalGaps: computeCriticalGaps(row),
      };
    });

    return res.json({ users: mappedUsers, total, page, zeroMatchCount });

  } catch (_error) {
    console.error("Admin match-summary error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});


router.get("/zero-match-snapshots", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT snapshot_date, total_users, zero_match_count, created_at
      FROM match_zero_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 30
    `);

    type SnapshotRow = {
      snapshot_date: string;
      total_users: number | string;
      zero_match_count: number | string;
      created_at: string;
    };

    const snapshots = (result.rows as SnapshotRow[]).map((r) => ({
      snapshotDate: r.snapshot_date,
      totalUsers: parseInt(String(r.total_users), 10),
      zeroMatchCount: parseInt(String(r.zero_match_count), 10),
      createdAt: r.created_at,
    }));

    return res.json({ snapshots });
  } catch (err) {
    console.error("[admin] zero-match-snapshots error:", err);
    return sendError(res, 500, "Errore caricamento snapshot");
  }
});

export default router;
