import { eq, and, or, sql, desc, asc, inArray, notInArray, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import { PROTECTED_NICKNAMES } from "../constants";
import {
  zavorrinaWishlists, zavorrinaWishlistPhotos, zavorrinaWishlistMotos,
  bikerZavorrinaMatches, users, userMotorcycles,
  proposalProfileMatches,
  type ZavorrinaWishlist,
  type ZavorrinaWishlistPhoto, type InsertZavorrinaWishlistPhoto,
  type ZavorrinaWishlistMoto, type InsertZavorrinaWishlistMoto,
  type BikerZavorrinaMatch, type InsertBikerZavorrinaMatch,
  type ProposalProfileMatch, type InsertProposalProfileMatch,
} from "@shared/db";
import { ContestStorage } from "./contest";
import { dynamicScoreSql, FRESHNESS_DEFAULTS } from "../matching/scoring";

export class MatchingStorage extends ContestStorage {
  async getWishlist(userId: string): Promise<ZavorrinaWishlist | undefined> {
    const [wl] = await db.select().from(zavorrinaWishlists).where(eq(zavorrinaWishlists.userId, userId)).limit(1);
    return wl;
  }

  async createOrUpdateWishlist(userId: string, description: string): Promise<ZavorrinaWishlist> {
    const [existing] = await db.select().from(zavorrinaWishlists).where(eq(zavorrinaWishlists.userId, userId)).limit(1);
    if (existing) {
      const [wl] = await db.update(zavorrinaWishlists).set({ description, updatedAt: new Date() }).where(eq(zavorrinaWishlists.id, existing.id)).returning();
      return wl;
    }
    const [wl] = await db.insert(zavorrinaWishlists).values({ userId, description }).returning();
    return wl;
  }

  async getWishlistPhotos(wishlistId: string): Promise<ZavorrinaWishlistPhoto[]> {
    return db.select().from(zavorrinaWishlistPhotos).where(eq(zavorrinaWishlistPhotos.wishlistId, wishlistId)).orderBy(asc(zavorrinaWishlistPhotos.sortOrder));
  }

  async getWishlistPhoto(id: string): Promise<ZavorrinaWishlistPhoto | undefined> {
    const [photo] = await db.select().from(zavorrinaWishlistPhotos).where(eq(zavorrinaWishlistPhotos.id, id)).limit(1);
    return photo;
  }

  async addWishlistPhoto(data: InsertZavorrinaWishlistPhoto): Promise<ZavorrinaWishlistPhoto> {
    const [photo] = await db.insert(zavorrinaWishlistPhotos).values(data).returning();
    return photo;
  }

  async deleteWishlistPhoto(id: string): Promise<void> {
    await db.delete(zavorrinaWishlistPhotos).where(eq(zavorrinaWishlistPhotos.id, id));
  }

  async getWishlistPhotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavorrinaWishlistPhotos).where(eq(zavorrinaWishlistPhotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async getWishlistMoto(id: string): Promise<ZavorrinaWishlistMoto | undefined> {
    const [moto] = await db.select().from(zavorrinaWishlistMotos).where(eq(zavorrinaWishlistMotos.id, id)).limit(1);
    return moto;
  }

  async getWishlistMotos(wishlistId: string): Promise<ZavorrinaWishlistMoto[]> {
    return db.select().from(zavorrinaWishlistMotos).where(eq(zavorrinaWishlistMotos.wishlistId, wishlistId));
  }

  async addWishlistMoto(data: InsertZavorrinaWishlistMoto): Promise<ZavorrinaWishlistMoto> {
    const [moto] = await db.insert(zavorrinaWishlistMotos).values(data).returning();
    return moto;
  }

  async updateWishlistMoto(id: string, data: Partial<InsertZavorrinaWishlistMoto>): Promise<ZavorrinaWishlistMoto | undefined> {
    const [moto] = await db.update(zavorrinaWishlistMotos).set(data).where(eq(zavorrinaWishlistMotos.id, id)).returning();
    return moto;
  }

  async deleteWishlistMoto(id: string): Promise<void> {
    await db.delete(zavorrinaWishlistMotos).where(eq(zavorrinaWishlistMotos.id, id));
  }

  async getWishlistMotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavorrinaWishlistMotos).where(eq(zavorrinaWishlistMotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async findMatchingWishlistMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<Array<ZavorrinaWishlistMoto & { userId: string }>> {
    const brandModelMatch = and(
      sql`${zavorrinaWishlistMotos.brand} IS NOT NULL AND ${zavorrinaWishlistMotos.brand} != ''`,
      sql`${zavorrinaWishlistMotos.model} IS NOT NULL AND ${zavorrinaWishlistMotos.model} != ''`,
      sql`LOWER(${zavorrinaWishlistMotos.brand}) = LOWER(${brand})`,
      sql`(LOWER(${zavorrinaWishlistMotos.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${zavorrinaWishlistMotos.model}) || '%')`,
      sql`LOWER(${zavorrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const typeMatch = and(
      sql`(${zavorrinaWishlistMotos.brand} IS NULL OR ${zavorrinaWishlistMotos.brand} = '')`,
      sql`(${zavorrinaWishlistMotos.model} IS NULL OR ${zavorrinaWishlistMotos.model} = '')`,
      sql`${zavorrinaWishlistMotos.motorcycleType} IS NOT NULL AND ${zavorrinaWishlistMotos.motorcycleType} != ''`,
      sql`LOWER(${zavorrinaWishlistMotos.motorcycleType}) = LOWER(${motorcycleType})`,
      sql`LOWER(${zavorrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const results = await db.select({
      id: zavorrinaWishlistMotos.id,
      wishlistId: zavorrinaWishlistMotos.wishlistId,
      brand: zavorrinaWishlistMotos.brand,
      model: zavorrinaWishlistMotos.model,
      motorcycleType: zavorrinaWishlistMotos.motorcycleType,
      ridingStyle: zavorrinaWishlistMotos.ridingStyle,
      createdAt: zavorrinaWishlistMotos.createdAt,
      userId: zavorrinaWishlists.userId,
    }).from(zavorrinaWishlistMotos)
      .innerJoin(zavorrinaWishlists, eq(zavorrinaWishlistMotos.wishlistId, zavorrinaWishlists.id))
      .where(or(brandModelMatch, typeMatch));
    return results;
  }

  async getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: import("@shared/db").ZavorrinaWishlistMoto; userId: string }[]> {
    const baseCondition = and(eq(users.isFake, false), eq(users.status, "active"), ...systemAccountConditions(users))!;
    const condition = countries && countries.length > 0 ? and(baseCondition, inArray(users.country, countries)) : baseCondition;
    return db.select({ wishlistMoto: zavorrinaWishlistMotos, userId: zavorrinaWishlists.userId })
      .from(zavorrinaWishlistMotos)
      .innerJoin(zavorrinaWishlists, eq(zavorrinaWishlists.id, zavorrinaWishlistMotos.wishlistId))
      .innerJoin(users, eq(users.id, zavorrinaWishlists.userId))
      .where(condition);
  }

  async getAllBikerMotorcyclesWithUsers(countries?: string[]): Promise<{ motorcycle: import("@shared/db").UserMotorcycle; userId: string }[]> {
    const baseCondition = and(eq(users.isFake, false), eq(users.status, "active"), or(eq(users.userType, "biker"), eq(users.userType, "coppia"))!, ...systemAccountConditions(users))!;
    const condition = countries && countries.length > 0 ? and(baseCondition, inArray(users.country, countries)) : baseCondition;
    const results = await db.select({ motorcycle: userMotorcycles, userId: userMotorcycles.userId })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(condition);
    return results;
  }

  /**
   * SQL JOIN that returns only compatible wishlist↔garage pairs (brand match
   * OR motorcycleType match, case-insensitive). All user-side filters
   * (isFake/status/role/userType) and optional country filter are applied in
   * SQL so the JS engine only iterates plausible candidates.
   */
  async getCompatibleWishlistGaragePairs(countries?: string[]): Promise<Array<{
    wishlistMoto: import("@shared/db").ZavorrinaWishlistMoto;
    motorcycle: import("@shared/db").UserMotorcycle;
    zavorrinaId: string;
    bikerId: string;
  }>> {
    const countryFilter = countries && countries.length > 0
      ? sql`AND wu.country = ANY(${countries}::text[]) AND mu.country = ANY(${countries}::text[])`
      : sql``;

    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT
        w.id AS w_id, w.wishlist_id AS w_wishlist_id, w.brand AS w_brand,
        w.model AS w_model, w.motorcycle_type AS w_motorcycle_type,
        w.riding_style AS w_riding_style, w.created_at AS w_created_at,
        m.id AS m_id, m.user_id AS m_user_id, m.brand AS m_brand,
        m.model AS m_model, m.motorcycle_type AS m_motorcycle_type,
        m.riding_style AS m_riding_style, m.year AS m_year,
        m.displacement AS m_displacement, m.is_default AS m_is_default,
        m.created_at AS m_created_at,
        wl.user_id AS zavorrina_id,
        m.user_id AS biker_id
      FROM zavorrina_wishlist_motos w
      INNER JOIN zavorrina_wishlists wl ON wl.id = w.wishlist_id
      INNER JOIN users wu ON wu.id = wl.user_id
      INNER JOIN user_motorcycles m ON (
        (w.brand IS NOT NULL AND w.brand <> '' AND m.brand IS NOT NULL AND m.brand <> ''
          AND LOWER(w.brand) = LOWER(m.brand))
        OR
        (w.motorcycle_type IS NOT NULL AND w.motorcycle_type <> ''
          AND m.motorcycle_type IS NOT NULL AND m.motorcycle_type <> ''
          AND LOWER(w.motorcycle_type) = LOWER(m.motorcycle_type))
      )
      INNER JOIN users mu ON mu.id = m.user_id
      WHERE wu.status = 'active' AND wu.is_fake = false AND wu.role <> 'admin'
        AND wu.ghost_mode = false
        AND wu.nickname <> ALL(${sql.raw(`ARRAY['${PROTECTED_NICKNAMES.join("','")}']`)})
        AND mu.status = 'active' AND mu.is_fake = false AND mu.role <> 'admin'
        AND mu.ghost_mode = false
        AND mu.nickname <> ALL(${sql.raw(`ARRAY['${PROTECTED_NICKNAMES.join("','")}']`)})
        AND (mu.user_type = 'biker' OR mu.user_type = 'coppia')
        AND wl.user_id <> m.user_id
        ${countryFilter}
    `);

    return (rows.rows as Record<string, unknown>[]).map((r) => ({
      zavorrinaId: r.zavorrina_id as string,
      bikerId: r.biker_id as string,
      wishlistMoto: {
        id: r.w_id, wishlistId: r.w_wishlist_id, brand: r.w_brand,
        model: r.w_model, motorcycleType: r.w_motorcycle_type,
        ridingStyle: r.w_riding_style, createdAt: r.w_created_at,
      } as unknown as import("@shared/db").ZavorrinaWishlistMoto,
      motorcycle: {
        id: r.m_id, userId: r.m_user_id, brand: r.m_brand, model: r.m_model,
        motorcycleType: r.m_motorcycle_type, ridingStyle: r.m_riding_style,
        year: r.m_year, displacement: r.m_displacement,
        isDefault: r.m_is_default, createdAt: r.m_created_at,
      } as unknown as import("@shared/db").UserMotorcycle,
    }));
  }

  async createMatch(data: InsertBikerZavorrinaMatch): Promise<BikerZavorrinaMatch | null> {
    const scoreBreakdownJson = JSON.stringify(data.scoreBreakdown ?? {});
    const result = await db.execute(sql`
      INSERT INTO biker_zavorrina_matches
        (id, biker_id, zavorrina_id, biker_motorcycle_id, wishlist_moto_id, status, is_supermatch, score_breakdown, notification_priority)
      VALUES
        (gen_random_uuid(), ${data.bikerId}, ${data.zavorrinaId}, ${data.bikerMotorcycleId}, ${data.wishlistMotoId},
         ${data.status ?? 'new'}, ${data.isSupermatch ?? false}, ${scoreBreakdownJson}::jsonb, ${data.notificationPriority ?? 'normal'})
      ON CONFLICT (biker_id, zavorrina_id, biker_motorcycle_id, wishlist_moto_id)
      DO UPDATE SET
        status               = 'new',
        archived_at          = NULL,
        notified_at          = NULL,
        is_supermatch        = EXCLUDED.is_supermatch,
        score_breakdown      = EXCLUDED.score_breakdown,
        notification_priority = EXCLUDED.notification_priority
      WHERE biker_zavorrina_matches.status = 'accepted'
         OR biker_zavorrina_matches.archived_at IS NOT NULL
      RETURNING *`);
    if (!result.rows || result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      bikerId: row.biker_id as string,
      zavorrinaId: row.zavorrina_id as string,
      bikerMotorcycleId: row.biker_motorcycle_id as string,
      wishlistMotoId: row.wishlist_moto_id as string,
      status: row.status as string,
      isSupermatch: row.is_supermatch as boolean,
      scoreBreakdown: (row.score_breakdown ?? {}) as Record<string, unknown>,
      notificationPriority: row.notification_priority as string,
      notifiedAt: (row.notified_at as Date | null) ?? null,
      archivedAt: (row.archived_at as Date | null) ?? null,
      createdAt: row.created_at as Date,
    } as BikerZavorrinaMatch;
  }

  async getMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<BikerZavorrinaMatch[]> {
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeGenericDays;
    const archivedCond = options?.includeArchived
      ? isNotNull(bikerZavorrinaMatches.archivedAt)
      : isNull(bikerZavorrinaMatches.archivedAt);
    return db.select().from(bikerZavorrinaMatches).where(
      and(
        or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)),
        archivedCond,
      )
    ).orderBy(
      sql`CASE WHEN ${bikerZavorrinaMatches.status} = 'accepted' THEN 0 WHEN ${bikerZavorrinaMatches.status} = 'new' THEN 1 ELSE 2 END`,
      desc(dynamicScoreSql(
        sql`${bikerZavorrinaMatches.createdAt}`,
        halfLife,
        sql`CASE WHEN ${bikerZavorrinaMatches.isSupermatch} THEN 2.0 ELSE 1.0 END`,
      )),
    ).limit(200);
  }

  async archiveStaleBikerZavorrinaMatches(afterDays: number = FRESHNESS_DEFAULTS.archiveAfterDays): Promise<number> {
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
    const result = await db.update(bikerZavorrinaMatches)
      .set({ archivedAt: new Date() })
      .where(and(
        eq(bikerZavorrinaMatches.status, "new"),
        isNull(bikerZavorrinaMatches.archivedAt),
        lt(bikerZavorrinaMatches.createdAt, cutoff),
      ))
      .returning({ id: bikerZavorrinaMatches.id });
    return result.length;
  }

  async reactivateGarageMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavorrinaMatches).where(eq(bikerZavorrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return false;
    if (!match.archivedAt) return false;
    await db.update(bikerZavorrinaMatches)
      .set({ status: "new", archivedAt: null, createdAt: new Date() })
      .where(and(eq(bikerZavorrinaMatches.id, id), isNotNull(bikerZavorrinaMatches.archivedAt)));
    return true;
  }

  async getGarageMatch(id: string): Promise<BikerZavorrinaMatch | undefined> {
    const [match] = await db.select().from(bikerZavorrinaMatches).where(eq(bikerZavorrinaMatches.id, id));
    return match;
  }

  async updateGarageMatch(id: string, data: Partial<InsertBikerZavorrinaMatch>): Promise<BikerZavorrinaMatch | undefined> {
    const [updated] = await db.update(bikerZavorrinaMatches).set(data).where(eq(bikerZavorrinaMatches.id, id)).returning();
    return updated;
  }

  async deleteGarageMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavorrinaMatches).where(eq(bikerZavorrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return false;
    await db.delete(bikerZavorrinaMatches).where(eq(bikerZavorrinaMatches.id, id));
    return true;
  }

  async resetGarageMatchToNew(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavorrinaMatches).where(eq(bikerZavorrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return false;
    await db.update(bikerZavorrinaMatches).set({ status: "new" }).where(eq(bikerZavorrinaMatches.id, id));
    return true;
  }

  async deleteRejectedGarageMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(bikerZavorrinaMatches).where(
      and(or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)), eq(bikerZavorrinaMatches.status, "rejected"))
    );
    if (rejected.length === 0) return 0;
    await db.delete(bikerZavorrinaMatches).where(
      and(or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)), eq(bikerZavorrinaMatches.status, "rejected"))
    );
    return rejected.length;
  }

  async deleteNewGarageMatches(userId: string): Promise<number> {
    const newMatches = await db.select().from(bikerZavorrinaMatches).where(
      and(or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)), eq(bikerZavorrinaMatches.status, "new"))
    );
    if (newMatches.length === 0) return 0;
    await db.delete(bikerZavorrinaMatches).where(
      and(or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)), eq(bikerZavorrinaMatches.status, "new"))
    );
    return newMatches.length;
  }

  async findExistingBikerZavorrinaMatch(bikerId: string, zavorrinaId: string, bikerMotorcycleId: string, wishlistMotoId: string): Promise<BikerZavorrinaMatch | undefined> {
    const [match] = await db.select().from(bikerZavorrinaMatches).where(
      and(
        eq(bikerZavorrinaMatches.bikerId, bikerId), eq(bikerZavorrinaMatches.zavorrinaId, zavorrinaId),
        eq(bikerZavorrinaMatches.bikerMotorcycleId, bikerMotorcycleId), eq(bikerZavorrinaMatches.wishlistMotoId, wishlistMotoId),
        isNull(bikerZavorrinaMatches.archivedAt),
      )
    ).limit(1);
    return match;
  }

  async getAllExistingBikerZavorrinaMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      bikerId: bikerZavorrinaMatches.bikerId, zavorrinaId: bikerZavorrinaMatches.zavorrinaId,
      bikerMotorcycleId: bikerZavorrinaMatches.bikerMotorcycleId, wishlistMotoId: bikerZavorrinaMatches.wishlistMotoId,
    }).from(bikerZavorrinaMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.bikerId}:${r.zavorrinaId}:${r.bikerMotorcycleId}:${r.wishlistMotoId}`);
    }
    return keys;
  }

  async getAllExistingProposalProfileMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      proposalId: proposalProfileMatches.proposalId,
      zavorrinaId: proposalProfileMatches.zavorrinaId,
    }).from(proposalProfileMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.proposalId}:${r.zavorrinaId}`);
    }
    return keys;
  }

  async getActedUponBikerZavorrinaPairs(): Promise<Set<string>> {
    const rows = await db.select({
      bikerId: bikerZavorrinaMatches.bikerId,
      zavorrinaId: bikerZavorrinaMatches.zavorrinaId,
    }).from(bikerZavorrinaMatches).where(
      notInArray(bikerZavorrinaMatches.status, ["new"])
    );
    const pairs = new Set<string>();
    for (const r of rows) {
      pairs.add(`${r.bikerId}:${r.zavorrinaId}`);
    }
    return pairs;
  }

  async createProposalProfileMatch(data: InsertProposalProfileMatch): Promise<ProposalProfileMatch | null> {
    try {
      const result = await db.execute(sql`
        INSERT INTO proposal_profile_matches
          (id, proposal_id, biker_id, zavorrina_id, distance_km, status, notification_priority)
        VALUES
          (gen_random_uuid(), ${data.proposalId}, ${data.bikerId}, ${data.zavorrinaId},
           ${data.distanceKm ?? null}, ${data.status ?? 'new'}, ${data.notificationPriority ?? 'normal'})
        ON CONFLICT (proposal_id, zavorrina_id)
        DO UPDATE SET
          status                = 'new',
          archived_at           = NULL,
          notified_at           = NULL,
          distance_km           = EXCLUDED.distance_km,
          notification_priority = EXCLUDED.notification_priority,
          reset_count           = proposal_profile_matches.reset_count + 1
        WHERE proposal_profile_matches.status = 'accepted'
           OR proposal_profile_matches.archived_at IS NOT NULL
        RETURNING *`);
      if (!result.rows || result.rows.length === 0) return null;
      const row = result.rows[0] as Record<string, unknown>;
      return {
        id: row.id as string,
        proposalId: row.proposal_id as string,
        bikerId: row.biker_id as string,
        zavorrinaId: row.zavorrina_id as string,
        distanceKm: row.distance_km as number | null,
        status: row.status as string,
        notificationPriority: row.notification_priority as string,
        notifiedAt: row.notified_at as Date | null,
        archivedAt: row.archived_at as Date | null,
        resetCount: (row.reset_count as number | null) ?? 0,
        createdAt: row.created_at as Date,
      };
    } catch (err: unknown) {
      // The partial unique index ppm_biker_zavorrina_active_idx on (biker_id, zavorrina_id)
      // WHERE status='new' is not covered by the ON CONFLICT clause above (which targets
      // only proposal_id+zavorrina_id). If that partial index fires, Postgres raises a
      // unique_violation (23505). This means a 'new' match for this biker/zavorrina pair
      // already exists from a different proposal — skip gracefully, same as the old
      // onConflictDoNothing() behavior.
      if (
        typeof err === 'object' && err !== null &&
        (err as Record<string, unknown>).code === '23505'
      ) {
        return null;
      }
      throw err;
    }
  }

  async getProposalProfileMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<ProposalProfileMatch[]> {
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeProposalDays;
    const archivedCond = options?.includeArchived
      ? isNotNull(proposalProfileMatches.archivedAt)
      : isNull(proposalProfileMatches.archivedAt);
    return db.select().from(proposalProfileMatches).where(
      and(
        or(
          eq(proposalProfileMatches.bikerId, userId),
          eq(proposalProfileMatches.zavorrinaId, userId),
        ),
        archivedCond,
      )
    ).orderBy(
      sql`CASE WHEN ${proposalProfileMatches.status} = 'accepted' THEN 0 WHEN ${proposalProfileMatches.status} = 'new' THEN 1 ELSE 2 END`,
      desc(dynamicScoreSql(sql`${proposalProfileMatches.createdAt}`, halfLife)),
    ).limit(200);
  }

  async archiveStaleProposalProfileMatches(afterDays: number = FRESHNESS_DEFAULTS.archiveAfterDays): Promise<number> {
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
    const result = await db.update(proposalProfileMatches)
      .set({ archivedAt: new Date() })
      .where(and(
        eq(proposalProfileMatches.status, "new"),
        isNull(proposalProfileMatches.archivedAt),
        lt(proposalProfileMatches.createdAt, cutoff),
      ))
      .returning({ id: proposalProfileMatches.id });
    return result.length;
  }

  async reactivateProposalProfileMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(proposalProfileMatches).where(eq(proposalProfileMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavorrinaId !== userId) return false;
    if (!match.archivedAt) return false;
    await db.update(proposalProfileMatches)
      .set({ status: "new", archivedAt: null, createdAt: new Date() })
      .where(and(eq(proposalProfileMatches.id, id), isNotNull(proposalProfileMatches.archivedAt)));
    return true;
  }

  /**
   * Match con freshness > soglia (per badge "Nuovo!") — generic kind.
   */
  async getFreshMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<BikerZavorrinaMatch & { freshness: number }>> {
    const threshold = options?.threshold ?? FRESHNESS_DEFAULTS.freshThreshold;
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeGenericDays;
    const limit = options?.limit ?? 50;
    const freshExpr = dynamicScoreSql(sql`${bikerZavorrinaMatches.createdAt}`, halfLife);
    const rows = await db.select({
      match: bikerZavorrinaMatches,
      freshness: sql<number>`${freshExpr}`.as("freshness"),
    }).from(bikerZavorrinaMatches).where(and(
      or(eq(bikerZavorrinaMatches.bikerId, userId), eq(bikerZavorrinaMatches.zavorrinaId, userId)),
      isNull(bikerZavorrinaMatches.archivedAt),
      eq(bikerZavorrinaMatches.status, "new"),
      sql`${freshExpr} > ${threshold}`,
    )).orderBy(desc(sql`${freshExpr}`)).limit(limit);
    return rows.map((r) => ({ ...r.match, freshness: Number(r.freshness) }));
  }

  async getFreshProposalProfileMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<ProposalProfileMatch & { freshness: number }>> {
    const threshold = options?.threshold ?? FRESHNESS_DEFAULTS.freshThreshold;
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeProposalDays;
    const limit = options?.limit ?? 50;
    const freshExpr = dynamicScoreSql(sql`${proposalProfileMatches.createdAt}`, halfLife);
    const rows = await db.select({
      match: proposalProfileMatches,
      freshness: sql<number>`${freshExpr}`.as("freshness"),
    }).from(proposalProfileMatches).where(and(
      or(eq(proposalProfileMatches.bikerId, userId), eq(proposalProfileMatches.zavorrinaId, userId)),
      isNull(proposalProfileMatches.archivedAt),
      eq(proposalProfileMatches.status, "new"),
      sql`${freshExpr} > ${threshold}`,
    )).orderBy(desc(sql`${freshExpr}`)).limit(limit);
    return rows.map((r) => ({ ...r.match, freshness: Number(r.freshness) }));
  }

  async getProposalProfileMatch(id: string): Promise<ProposalProfileMatch | undefined> {
    const [match] = await db.select().from(proposalProfileMatches).where(eq(proposalProfileMatches.id, id)).limit(1);
    return match;
  }

  async updateProposalProfileMatch(id: string, data: Partial<InsertProposalProfileMatch>): Promise<ProposalProfileMatch | undefined> {
    const [updated] = await db.update(proposalProfileMatches).set(data).where(eq(proposalProfileMatches.id, id)).returning();
    return updated;
  }
}
