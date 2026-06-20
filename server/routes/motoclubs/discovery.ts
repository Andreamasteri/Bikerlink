import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { motoClubs, motoClubMembers, users, routes } from "@shared/db";
import { eq, and, desc, sql, or, ilike } from "drizzle-orm";
import { systemAccountConditions } from "../../lib/system-account-filter";
import { allLimited } from "../../lib/concurrency";
import { getRegionCenter } from "../../../constants/regionCenters";
import { storage } from "../../storage";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, search, country, region, language } = req.query as Record<string, string>;

    const currentUserId = req.session.userId!;
    const currentUser = await storage.getUser(currentUserId);
    const isZavorrina = currentUser?.userType === "zavorrina";

    const _query = db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    }).from(motoClubs).where(eq(motoClubs.isApproved, true));

    const conditions: import("drizzle-orm").SQL<unknown>[] = [eq(motoClubs.isApproved, true)];
    if (isZavorrina) conditions.push(eq(motoClubs.allowZavorrine, true));

    if (type) conditions.push(eq(motoClubs.clubType, type));
    if (search) {
      const searchCondition = or(ilike(motoClubs.name, `%${search}%`), ilike(motoClubs.brandName, `%${search}%`), ilike(motoClubs.modelName, `%${search}%`));
      if (searchCondition) conditions.push(searchCondition);
    }

    const clubs = await withDbRetry(() => db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    })
      .from(motoClubs)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${motoClubs.clubType} WHEN 'brand' THEN 1 WHEN 'model' THEN 2 WHEN 'custom' THEN 3 WHEN 'region' THEN 4 ELSE 5 END`,
        desc(motoClubs.activityScore),
        motoClubs.name
      ));

    let result = clubs.map(r => ({ ...r.club, memberCount: r.memberCount }));

    if (country || region || language) {
      const memberCountsByClub: Record<string, number> = {};

      const filteredClubIds = await allLimited(
        result.map((club) => async () => {
          const memberQuery = db.select({ u: users })
            .from(motoClubMembers)
            .innerJoin(users, eq(users.id, motoClubMembers.userId))
            .where(and(eq(motoClubMembers.clubId, club.id as string), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)));

          const members = await withDbRetry(() => memberQuery);
          const filtered = members.filter(({ u }) => {
            if (country && u.country?.toUpperCase() !== country.toUpperCase()) return false;
            if (region && !u.region?.toLowerCase().includes(region.toLowerCase())) return false;
            if (language) {
              const langs = (u.spokenLanguages as string[] | null) ?? [];
              if (!langs.includes(language)) return false;
            }
            return true;
          });

          if (filtered.length === 0 && (country || region || language)) return null;
          memberCountsByClub[club.id] = filtered.length;
          return club.id;
        })
      );

      const validIds = new Set(filteredClubIds.filter(Boolean));
      result = result.filter(c => validIds.has(c.id));
    }

    return res.json(result);
  } catch (_e) {
    console.error("[GET /motoclubs]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/featured", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [club] = await withDbRetry(() => db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true))
      .orderBy(desc(motoClubs.activityScore))
      .limit(1));

    return res.json(club ? { ...club.club, memberCount: club.memberCount } : null);
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/map", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const clubs = await withDbRetry(() => db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      logoUrl: motoClubs.logoUrl,
      region: motoClubs.region,
      country: motoClubs.country,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
      currentUserIsMember: sql<boolean>`exists(select 1 from moto_club_members m2 where m2.club_id = moto_clubs.id and m2.user_id = ${currentUserId} and m2.status = 'active')`,
    })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true)));

    const result: Array<{
      id: string;
      name: string;
      clubType: string;
      logoUrl: string | null;
      region: string | null;
      country: string | null;
      latitude: number;
      longitude: number;
      isFictitious: boolean;
      memberCount: number;
      currentUserIsMember: boolean;
    }> = [];

    for (const c of clubs) {
      if (c.latitude != null && c.longitude != null) {
        result.push({
          id: c.id,
          name: c.name,
          clubType: c.clubType,
          logoUrl: c.logoUrl,
          region: c.region,
          country: c.country,
          latitude: c.latitude,
          longitude: c.longitude,
          isFictitious: false,
          memberCount: Number(c.memberCount),
          currentUserIsMember: Boolean(c.currentUserIsMember),
        });
      } else if (c.clubType === "region") {
        const center = getRegionCenter(c.region ?? "");
        if (center) {
          result.push({
            id: c.id,
            name: c.name,
            clubType: c.clubType,
            logoUrl: c.logoUrl,
            region: c.region,
            country: c.country,
            latitude: center.latitude,
            longitude: center.longitude,
            isFictitious: true,
            memberCount: Number(c.memberCount),
            currentUserIsMember: Boolean(c.currentUserIsMember),
          });
        }
      }
    }

    return res.json(result);
  } catch (_e) {
    console.error("[GET /motoclubs/map]", _e);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/:id/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id as string;
    const members = await withDbRetry(() => db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active"))));

    if (members.length === 0) return res.json({ totalKm: 0, totalRides: 0, memberCount: 0 });

    const memberIds = members.map(m => m.userId);

    const stats = await withDbRetry(() => db.select({
      totalKm: sql<number>`coalesce(sum(total_distance_km), 0)::float`,
      totalRides: sql<number>`count(*)::int`,
    })
      .from(routes)
      .where(sql`user_id = ANY(${memberIds}) AND status = 'completed'`));

    return res.json({
      totalKm: Math.round((stats[0]?.totalKm ?? 0) * 10) / 10,
      totalRides: stats[0]?.totalRides ?? 0,
      memberCount: members.length,
    });
  } catch (_e) {
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const [club] = await withDbRetry(() => db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      logoUrl: motoClubs.logoUrl,
      isApproved: motoClubs.isApproved,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      createdAt: motoClubs.createdAt,
    }).from(motoClubs).where(and(eq(motoClubs.id, clubId as string), eq(motoClubs.isApproved, true))).limit(1));
    if (!club) return sendError(res, 404, "Club non trovato");
    return res.json(club);
  } catch (_e) {
    console.error("Public club error:", _e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
