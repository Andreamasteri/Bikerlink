import { eq, and, or, sql, desc, asc, inArray } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import {
  zavarrinaWishlists, zavarrinaWishlistPhotos, zavarrinaWishlistMotos,
  bikerZavarrinaMatches, users, userMotorcycles,
  type ZavarrinaWishlist, type InsertZavarrinaWishlist,
  type ZavarrinaWishlistPhoto, type InsertZavarrinaWishlistPhoto,
  type ZavarrinaWishlistMoto, type InsertZavarrinaWishlistMoto,
  type BikerZavarrinaMatch, type InsertBikerZavarrinaMatch,
} from "@shared/schema";
import { ContestStorage } from "./contest";

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

  async getAllWishlistMotosWithUsers(countries?: string[]): Promise<{ wishlistMoto: any; userId: string }[]> {
    const baseCondition = and(...systemAccountConditions(users))!;
    const condition = countries && countries.length > 0 ? and(baseCondition, inArray(users.country, countries)) : baseCondition;
    return db.select({ wishlistMoto: zavarrinaWishlistMotos, userId: zavarrinaWishlists.userId })
      .from(zavarrinaWishlistMotos)
      .innerJoin(zavarrinaWishlists, eq(zavarrinaWishlists.id, zavarrinaWishlistMotos.wishlistId))
      .innerJoin(users, eq(users.id, zavarrinaWishlists.userId))
      .where(condition);
  }

  async getAllBikerMotorcyclesWithUsers(countries?: string[]): Promise<{ motorcycle: any; userId: string }[]> {
    const baseCondition = and(or(eq(users.userType, "biker"), eq(users.userType, "coppia"))!, ...systemAccountConditions(users))!;
    const condition = countries && countries.length > 0 ? and(baseCondition, inArray(users.country, countries)) : baseCondition;
    const results = await db.select({ motorcycle: userMotorcycles, userId: userMotorcycles.userId })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(condition);
    return results;
  }

  async createMatch(data: InsertBikerZavarrinaMatch): Promise<BikerZavarrinaMatch | null> {
    const [match] = await db.insert(bikerZavarrinaMatches).values(data).onConflictDoNothing().returning();
    return match ?? null;
  }

  async getMatchesForUser(userId: string): Promise<BikerZavarrinaMatch[]> {
    return db.select().from(bikerZavarrinaMatches).where(
      or(eq(bikerZavarrinaMatches.bikerId, userId), eq(bikerZavarrinaMatches.zavarrinaId, userId))
    ).orderBy(
      sql`CASE WHEN ${bikerZavarrinaMatches.status} = 'accepted' THEN 0 WHEN ${bikerZavarrinaMatches.status} = 'new' THEN 1 ELSE 2 END`,
      desc(bikerZavarrinaMatches.createdAt)
    ).limit(200);
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
        eq(bikerZavarrinaMatches.bikerMotorcycleId, bikerMotorcycleId), eq(bikerZavarrinaMatches.wishlistMotoId, wishlistMotoId)
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
}
