import { eq, and, or, sql, desc, asc, inArray, notInArray, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import { PROTECTED_NICKNAMES } from "../constants";
import {
  zavarrinaWishlists, zavarrinaWishlistPhotos, zavarrinaWishlistMotos,
  bikerZavarrinaMatches, users, userMotorcycles,
  proposalProfileMatches,
  type ZavarrinaWishlist,
  type ZavarrinaWishlistPhoto, type InsertZavarrinaWishlistPhoto,
  type ZavarrinaWishlistMoto, type InsertZavarrinaWishlistMoto,
  type BikerZavarrinaMatch, type InsertBikerZavarrinaMatch,
  type ProposalProfileMatch, type InsertProposalProfileMatch,
} from "@shared/db";
import { ContestStorage } from "./contest";
import { dynamicScoreSql, FRESHNESS_DEFAULTS } from "../matching/scoring";

export class MatchingStorage extends ContestStorage {
  async getWishlist(userId: string): Promise<ZavarrinaWishlist | undefined> {
    const [wl] = await db.select().from(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, userId)).limit(1);
    return wl;
  }

  async createOrUpdateWishlist(userId: string, description: string): Promise<ZavarrinaWishlist> {
    const [existing] = await db.select().from(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, userId)).limit(1);
    if (existing) {
      const [wl] = await db.update(zavarrinaWishlists).set({ description, updatedAt: new Date() }).where(eq(zavarrinaWishlists.id, existing.id)).returning();
      return wl;
    }
    const [wl] = await db.insert(zavarrinaWishlists).values({ userId, description }).returning();
    return wl;
  }

  async getWishlistPhotos(wishlistId: string): Promise<ZavarrinaWishlistPhoto[]> {
    return db.select().from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId)).orderBy(asc(zavarrinaWishlistPhotos.sortOrder));
  }

  async getWishlistPhoto(id: string): Promise<ZavarrinaWishlistPhoto | undefined> {
    const [photo] = await db.select().from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.id, id)).limit(1);
    return photo;
  }

  async addWishlistPhoto(data: InsertZavarrinaWishlistPhoto): Promise<ZavarrinaWishlistPhoto> {
    const [photo] = await db.insert(zavarrinaWishlistPhotos).values(data).returning();
    return photo;
  }

  async deleteWishlistPhoto(id: string): Promise<void> {
    await db.delete(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.id, id));
  }

  async getWishlistPhotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavarrinaWishlistPhotos).where(eq(zavarrinaWishlistPhotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async getWishlistMoto(id: string): Promise<ZavarrinaWishlistMoto | undefined> {
    const [moto] = await db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id)).limit(1);
    return moto;
  }

  async getWishlistMotos(wishlistId: string): Promise<ZavarrinaWishlistMoto[]> {
    return db.select().from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
  }

  async addWishlistMoto(data: InsertZavarrinaWishlistMoto): Promise<ZavarrinaWishlistMoto> {
    const [moto] = await db.insert(zavarrinaWishlistMotos).values(data).returning();
    return moto;
  }

  async updateWishlistMoto(id: string, data: Partial<InsertZavarrinaWishlistMoto>): Promise<ZavarrinaWishlistMoto | undefined> {
    const [moto] = await db.update(zavarrinaWishlistMotos).set(data).where(eq(zavarrinaWishlistMotos.id, id)).returning();
    return moto;
  }

  async deleteWishlistMoto(id: string): Promise<void> {
    await db.delete(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.id, id));
  }

  async getWishlistMotoCount(wishlistId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(zavarrinaWishlistMotos).where(eq(zavarrinaWishlistMotos.wishlistId, wishlistId));
    return Number(result[0]?.count ?? 0);
  }

  async findMatchingWishlistMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<Array<ZavarrinaWishlistMoto & { userId: string }>> {
    const brandModelMatch = and(
      sql`${zavarrinaWishlistMotos.brand} IS NOT NULL AND ${zavarrinaWishlistMotos.brand} != ''`,
      sql`${zavarrinaWishlistMotos.model} IS NOT NULL AND ${zavarrinaWishlistMotos.model} != ''`,
      sql`LOWER(${zavarrinaWishlistMotos.brand}) = LOWER(${brand})`,
      sql`(LOWER(${zavarrinaWishlistMotos.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${zavarrinaWishlistMotos.model}) || '%')`,
      sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const typeMatch = and(
      sql`(${zavarrinaWishlistMotos.brand} IS NULL OR ${zavarrinaWishlistMotos.brand} = '')`,
      sql`(${zavarrinaWishlistMotos.model} IS NULL OR ${zavarrinaWishlistMotos.model} = '')`,
      sql`${zavarrinaWishlistMotos.motorcycleType} IS NOT NULL AND ${zavarrinaWishlistMotos.motorcycleType} != ''`,
      sql`LOWER(${zavarrinaWishlistMotos.motorcycleType}) = LOWER(${motorcycleType})`,
      sql`LOWER(${zavarrinaWishlistMotos.ridingStyle}) = LOWER(${ridingStyle})`,
    );
    const results = await db.select({
      id: zavarrinaWishlistMotos.id,
      wishlistId: zavarrinaWishlistMotos.wishlistId,
      brand: zavarrinaWishlistMotos.brand,
      model: zavarrinaWishlistMotos.model,
      motorcycleType: zavarrinaWishlistMotos.motorcycleType,
      ridingStyle: zavarrinaWishlistMotos.ridingStyle,
      createdAt: zavarrinaWishlistMotos.createdAt,
      userId: zavarrinaWishlists.userId,
    }).from(zavarrinaWishlistMotos)
      .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlistMotos.wishlistId, zavarrinaWishlists.id))
      .where(or(brandModelMatch, typeMatch));
    return results;
  }

  async getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: import("@shared/db").ZavarrinaWishlistMoto; userId: string }[]> {
    const baseCondition = and(eq(users.isFake, false), eq(users.status, "active"), ...systemAccountConditions(users))!;
    const condition = countries && countries.length > 0 ? and(baseCondition, inArray(users.country, countries)) : baseCondition;
    return db.select({ wishlistMoto: zavarrinaWishlistMotos, userId: zavarrinaWishlists.userId })
      .from(zavarrinaWishlistMotos)
      .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlists.id, zavarrinaWishlistMotos.wishlistId))
      .innerJoin(users, eq(users.id, zavarrinaWishlists.userId))
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
    wishlistMoto: import("@shared/db").ZavarrinaWishlistMoto;
    motorcycle: import("@shared/db").UserMotorcycle;
    zavarrinaId: string;
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
        wl.user_id AS zavarrina_id,
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
      zavarrinaId: r.zavarrina_id as string,
      bikerId: r.biker_id as string,
      wishlistMoto: {
        id: r.w_id, wishlistId: r.w_wishlist_id, brand: r.w_brand,
        model: r.w_model, motorcycleType: r.w_motorcycle_type,
        ridingStyle: r.w_riding_style, createdAt: r.w_created_at,
      } as unknown as import("@shared/db").ZavarrinaWishlistMoto,
      motorcycle: {
        id: r.m_id, userId: r.m_user_id, brand: r.m_brand, model: r.m_model,
        motorcycleType: r.m_motorcycle_type, ridingStyle: r.m_riding_style,
        year: r.m_year, displacement: r.m_displacement,
        isDefault: r.m_is_default, createdAt: r.m_created_at,
      } as unknown as import("@shared/db").UserMotorcycle,
    }));
  }

  async createMatch(data: InsertBikerZavarrinaMatch): Promise<BikerZavarrinaMatch | null> {
    const scoreBreakdownJson = JSON.stringify(data.scoreBreakdown ?? {});
    const result = await db.execute(sql`
      INSERT INTO biker_zavorrina_matches
        (id, biker_id, zavorrina_id, biker_motorcycle_id, wishlist_moto_id, status, is_supermatch, score_breakdown, notification_priority)
      VALUES
        (gen_random_uuid(), ${data.bikerId}, ${data.zavarrinaId}, ${data.bikerMotorcycleId}, ${data.wishlistMotoId},
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
      zavarrinaId: row.zavorrina_id as string,
      bikerMotorcycleId: row.biker_motorcycle_id as string,
      wishlistMotoId: row.wishlist_moto_id as string,
      status: row.status as string,
      isSupermatch: row.is_supermatch as boolean,
      scoreBreakdown: (row.score_breakdown ?? {}) as Record<string, unknown>,
      notificationPriority: row.notification_priority as string,
      notifiedAt: (row.notified_at as Date | null) ?? null,
      archivedAt: (row.archived_at as Date | null) ?? null,
      createdAt: row.created_at as Date,
    } as BikerZavarrinaMatch;
  }

  async getMatchesForUser(userId: string, options?: { includeArchived?: boolean; halfLifeDays?: number }): Promise<BikerZavarrinaMatch[]> {
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeGenericDays;
    const archivedCond = options?.includeArchived
      ? isNotNull(bikerZavarrinaMatches.archivedAt)
      : isNull(bikerZavarrinaMatches.archivedAt);
    return db.select().from(bikerZavarrinaMatches).where(
      and(
        or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
        archivedCond,
      )
    ).orderBy(
      sql`CASE WHEN ${bikerZavarrinaMatches.status} = 'accepted' THEN 0 WHEN ${bikerZavarrinaMatches.status} = 'new' THEN 1 ELSE 2 END`,
      desc(dynamicScoreSql(
        sql`${bikerZavarrinaMatches.createdAt}`,
        halfLife,
        sql`CASE WHEN ${bikerZavarrinaMatches.isSupermatch} THEN 2.0 ELSE 1.0 END`,
      )),
    ).limit(200);
  }

  async archiveStaleBikerZavarrinaMatches(afterDays: number = FRESHNESS_DEFAULTS.archiveAfterDays): Promise<number> {
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
    const result = await db.update(bikerZavarrinaMatches)
      .set({ archivedAt: new Date() })
      .where(and(
        eq(bikerZavarrinaMatches.status, "new"),
        isNull(bikerZavarrinaMatches.archivedAt),
        lt(bikerZavarrinaMatches.createdAt, cutoff),
      ))
      .returning({ id: bikerZavarrinaMatches.id });
    return result.length;
  }

  async reactivateGarageMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    if (!match.archivedAt) return false;
    await db.update(bikerZavarrinaMatches)
      .set({ status: "new", archivedAt: null, createdAt: new Date() })
      .where(and(eq(bikerZavarrinaMatches.id, id), isNotNull(bikerZavarrinaMatches.archivedAt)));
    return true;
  }

  async getGarageMatch(id: string): Promise<BikerZavarrinaMatch | undefined> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    return match;
  }

  async updateGarageMatch(id: string, data: Partial<InsertBikerZavarrinaMatch>): Promise<BikerZavarrinaMatch | undefined> {
    const [updated] = await db.update(bikerZavarrinaMatches).set(data).where(eq(bikerZavarrinaMatches.id, id)).returning();
    return updated;
  }

  async deleteGarageMatch(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    await db.delete(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    return true;
  }

  async resetGarageMatchToNew(id: string, userId: string): Promise<boolean> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.id, id));
    if (!match) return false;
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    await db.update(bikerZavarrinaMatches).set({ status: "new" }).where(eq(bikerZavarrinaMatches.id, id));
    return true;
  }

  async deleteRejectedGarageMatches(userId: string): Promise<number> {
    const rejected = await db.select().from(bikerZavarrinaMatches).where(
      and(or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)), eq(bikerZavarrinaMatches.status, "rejected"))
    );
    if (rejected.length === 0) return 0;
    await db.delete(bikerZavarrinaMatches).where(
      and(or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)), eq(bikerZavarrinaMatches.status, "rejected"))
    );
    return rejected.length;
  }

  async deleteNewGarageMatches(userId: string): Promise<number> {
    const newMatches = await db.select().from(bikerZavarrinaMatches).where(
      and(or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)), eq(bikerZavarrinaMatches.status, "new"))
    );
    if (newMatches.length === 0) return 0;
    await db.delete(bikerZavarrinaMatches).where(
      and(or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)), eq(bikerZavarrinaMatches.status, "new"))
    );
    return newMatches.length;
  }

  async findExistingBikerZavarrinaMatch(bikerId: string, zavarrinaId: string, bikerMotorcycleId: string, wishlistMotoId: string): Promise<BikerZavarrinaMatch | undefined> {
    const [match] = await db.select().from(bikerZavarrinaMatches).where(
      and(
        eq(bikerZavarrinaMatches.bikerId, bikerId), eq(bikerZavarrinaMatches.zavarrinaId, zavarrinaId),
        eq(bikerZavarrinaMatches.bikerMotorcycleId, bikerMotorcycleId), eq(bikerZavarrinaMatches.wishlistMotoId, wishlistMotoId),
        isNull(bikerZavarrinaMatches.archivedAt),
      )
    ).limit(1);
    return match;
  }

  async getAllExistingBikerZavarrinaMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      bikerId: bikerZavarrinaMatches.bikerId, zavarrinaId: bikerZavarrinaMatches.zavarrinaId,
      bikerMotorcycleId: bikerZavarrinaMatches.bikerMotorcycleId, wishlistMotoId: bikerZavarrinaMatches.wishlistMotoId,
    }).from(bikerZavarrinaMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.bikerId}:${r.zavarrinaId}:${r.bikerMotorcycleId}:${r.wishlistMotoId}`);
    }
    return keys;
  }

  async getAllExistingProposalProfileMatchKeys(): Promise<Set<string>> {
    const rows = await db.select({
      proposalId: proposalProfileMatches.proposalId,
      zavarrinaId: proposalProfileMatches.zavarrinaId,
    }).from(proposalProfileMatches);
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`${r.proposalId}:${r.zavarrinaId}`);
    }
    return keys;
  }

  async getActedUponBikerZavarrinaPairs(): Promise<Set<string>> {
    const rows = await db.select({
      bikerId: bikerZavarrinaMatches.bikerId,
      zavarrinaId: bikerZavarrinaMatches.zavarrinaId,
    }).from(bikerZavarrinaMatches).where(
      notInArray(bikerZavarrinaMatches.status, ["new"])
    );
    const pairs = new Set<string>();
    for (const r of rows) {
      pairs.add(`${r.bikerId}:${r.zavarrinaId}`);
    }
    return pairs;
  }

  async createProposalProfileMatch(data: InsertProposalProfileMatch): Promise<ProposalProfileMatch | null> {
    try {
      const result = await db.execute(sql`
        INSERT INTO proposal_profile_matches
          (id, proposal_id, biker_id, zavorrina_id, distance_km, status, notification_priority)
        VALUES
          (gen_random_uuid(), ${data.proposalId}, ${data.bikerId}, ${data.zavarrinaId},
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
        zavarrinaId: row.zavorrina_id as string,
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
          eq(proposalProfileMatches.zavarrinaId, userId),
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
    if (match.bikerId !== userId && match.zavarrinaId !== userId) return false;
    if (!match.archivedAt) return false;
    await db.update(proposalProfileMatches)
      .set({ status: "new", archivedAt: null, createdAt: new Date() })
      .where(and(eq(proposalProfileMatches.id, id), isNotNull(proposalProfileMatches.archivedAt)));
    return true;
  }

  /**
   * Match con freshness > soglia (per badge "Nuovo!") — generic kind.
   */
  async getFreshMatchesForUser(userId: string, options?: { threshold?: number; halfLifeDays?: number; limit?: number }): Promise<Array<BikerZavarrinaMatch & { freshness: number }>> {
    const threshold = options?.threshold ?? FRESHNESS_DEFAULTS.freshThreshold;
    const halfLife = options?.halfLifeDays ?? FRESHNESS_DEFAULTS.halfLifeGenericDays;
    const limit = options?.limit ?? 50;
    const freshExpr = dynamicScoreSql(sql`${bikerZavarrinaMatches.createdAt}`, halfLife);
    const rows = await db.select({
      match: bikerZavarrinaMatches,
      freshness: sql<number>`${freshExpr}`.as("freshness"),
    }).from(bikerZavarrinaMatches).where(and(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId)),
      isNull(bikerZavarrinaMatches.archivedAt),
      eq(bikerZavarrinaMatches.status, "new"),
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
      or(eq(proposalProfileMatches.bikerId, userId), eq(proposalProfileMatches.zavarrinaId, userId)),
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
