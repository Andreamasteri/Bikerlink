/**
 * users.next-match-summary.ts
 *
 * Route:
 *   - GET /match-summary  — Riepilogo match paginato per inspector admin
 *   - GET /zero-match-snapshots — Storico snapshot utenti a zero match
 *
 * Estratto da users.next.ts per rispettare il ratchet 600 righe.
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const router = Router();

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
              SUM(CASE WHEN motorcycle_brand = 'base_intent' THEN 1 ELSE 0 END)::int AS "bikerZavorrinaBase",
              SUM(CASE WHEN motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%' THEN 1 ELSE 0 END)::int AS "bikerClubBrand",
              SUM(CASE WHEN motorcycle_brand LIKE 'club_zav:%' THEN 1 ELSE 0 END)::int AS "zavorrinaClubBrand",
              SUM(CASE WHEN motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%' THEN 1 ELSE 0 END)::int AS "bikerBikerTypeStyle",
              SUM(CASE WHEN motorcycle_brand LIKE 'tipo_zav:%' THEN 1 ELSE 0 END)::int AS "bikerZavorrinaTypeStyle",
              SUM(CASE WHEN motorcycle_brand = 'distanza' THEN 1 ELSE 0 END)::int AS "bikerBikerDistance",
              SUM(CASE WHEN motorcycle_brand = 'distanza_zav' THEN 1 ELSE 0 END)::int AS "bikerZavorrinaDistance",
              SUM(CASE WHEN motorcycle_brand = 'musica' THEN 1 ELSE 0 END)::int AS "bikerBikerMusic",
              SUM(CASE WHEN motorcycle_brand = 'musica_zav' THEN 1 ELSE 0 END)::int AS "bikerZavorrinaMusic",
              SUM(CASE WHEN motorcycle_brand IN ('gps_tilt', 'gps_full') THEN 1 ELSE 0 END)::int AS "bikerBikerLeanAngle",
              SUM(CASE WHEN motorcycle_brand LIKE 'zona_bb:%' OR motorcycle_brand LIKE 'percorso:%' THEN 1 ELSE 0 END)::int AS "bikerBikerRouteTypeZone",
              SUM(CASE WHEN motorcycle_brand LIKE 'zona_zav:%' OR motorcycle_brand LIKE 'percorso_zav:%' THEN 1 ELSE 0 END)::int AS "bikerZavorrinaRouteTypeZone",
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
      bikerBikerBrand: number; bikerZavorrinaBase: number; bikerClubBrand: number; zavorrinaClubBrand: number;
      bikerBikerTypeStyle: number; bikerZavorrinaTypeStyle: number;
      bikerBikerDistance: number; bikerZavorrinaDistance: number;
      bikerBikerMusic: number; bikerZavorrinaMusic: number;
      bikerBikerLeanAngle: number; bikerBikerRouteTypeZone: number; bikerZavorrinaRouteTypeZone: number;
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

      const baseIntentCount = bb?.bikerZavorrinaBase ?? 0;
      const bbMatches = parseInt(row.bb_count || "0", 10) - baseIntentCount;
      const bzMatches = parseInt(row.bz_count || "0", 10) + baseIntentCount;

      const matchCounts: Record<string, number> = {
        bikerBikerBrand:             bb?.bikerBikerBrand             ?? 0,
        bikerZavorrinaBrand:         bz?.bikerZavorrinaBrand         ?? 0,
        bikerZavorrinaBase:          bb?.bikerZavorrinaBase          ?? 0,
        bikerClubBrand:              bb?.bikerClubBrand              ?? 0,
        zavorrinaClubBrand:          bb?.zavorrinaClubBrand          ?? 0,
        bikerBikerTypeStyle:         bb?.bikerBikerTypeStyle         ?? 0,
        bikerZavorrinaTypeStyle:     bb?.bikerZavorrinaTypeStyle     ?? 0,
        bikerBikerDistance:          bb?.bikerBikerDistance          ?? 0,
        bikerZavorrinaDistance:      bb?.bikerZavorrinaDistance      ?? 0,
        bikerBikerMusic:             bb?.bikerBikerMusic             ?? 0,
        bikerZavorrinaMusic:         bb?.bikerZavorrinaMusic         ?? 0,
        bikerBikerLeanAngle:         bb?.bikerBikerLeanAngle         ?? 0,
        bikerBikerRouteTypeZone:     bb?.bikerBikerRouteTypeZone     ?? 0,
        bikerZavorrinaRouteTypeZone: bb?.bikerZavorrinaRouteTypeZone ?? 0,
        bikerBikerAvgSpeed:          bb?.bikerBikerAvgSpeed          ?? 0,
        bikerBikerAvgDuration:       bb?.bikerBikerAvgDuration       ?? 0,
        bikerBikerDayTime:           bb?.bikerBikerDayTime           ?? 0,
        bikerBikerEvents:            bb?.bikerBikerEvents            ?? 0,
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
