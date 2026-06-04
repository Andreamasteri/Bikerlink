import { eq, and, or, sql, gte, inArray, type SQL } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import { maskHiddenLocationRows } from "./users";
import {
  users, userProfiles, userMotorcycles, entityTags,
  type User, type UserProfile,
} from "@shared/db";
import { PlannedRoutesStorage } from "./planned-routes";
import { cachedCandidatesForZone } from "../cache/zone-cache";

export class MapStorage extends PlannedRoutesStorage {
  async getNearbyUsers(lat: number, lng: number, radiusKm: number, countries?: string[], motoTagIds?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    // Task #2517 — wrap with zone cache (60s TTL, 0.05° grid).
    // Task #2697 — radiusKm <= 0 means "world" (no Haversine radius filter):
    // ritorna tutti gli utenti dell'area (eventualmente filtrata per country),
    // ordinati per distanza dal viewer per coerenza UI.
    // Task #2721 — filtro opzionale per tag della moto: include solo utenti
    // con almeno una moto a cui è associato uno dei tagId richiesti (OR).
    const isWorld = !(radiusKm > 0);
    const countriesPart = countries && countries.length > 0 ? `c:${[...countries].sort().join(",")}` : "all";
    const tagsPart = motoTagIds && motoTagIds.length > 0 ? `mt:${[...motoTagIds].sort().join(",")}` : "noMt";
    const variant = `${countriesPart}|r:${isWorld ? "world" : Math.round(radiusKm)}|${tagsPart}`;
    return await cachedCandidatesForZone<{ user: User; profile: UserProfile; distance: number }>(
      lat,
      lng,
      isWorld ? 0 : radiusKm,
      async () => {
        const conditions: SQL<unknown>[] = [
          eq(users.status, "active"),
          eq(users.isFake, false),
          ...systemAccountConditions(users),
          sql`${userProfiles.latitude} IS NOT NULL`,
          sql`${userProfiles.longitude} IS NOT NULL`,
        ];
        if (countries && countries.length > 0) {
          conditions.push(or(inArray(users.country, countries), sql`${users.country} IS NULL`)!);
        }
        if (motoTagIds && motoTagIds.length > 0) {
          // EXISTS: utente ha almeno una moto i cui tag (entityType='motorcycle')
          // coincidono con uno qualunque dei tagId richiesti.
          conditions.push(sql`EXISTS (
            SELECT 1 FROM ${userMotorcycles} m
            INNER JOIN ${entityTags} et
              ON et.entity_type = 'motorcycle'
              AND et.entity_id = m.id
            WHERE m.user_id = ${users.id}
              AND et.tag_id IN (${sql.join(motoTagIds.map((id) => sql`${id}`), sql`, `)})
          )`);
        }
        const viewerGeog = sql`ST_MakePoint(${lng}, ${lat})::geography`;
        const distanceExpr = sql<number>`ST_Distance(${userProfiles.geom}, ${viewerGeog}) / 1000.0`.as("distance");
        conditions.push(sql`${userProfiles.geom} IS NOT NULL`);
        if (!isWorld) {
          conditions.push(sql`ST_DWithin(${userProfiles.geom}, ${viewerGeog}, ${radiusKm * 1000})`);
        }
        const results = await db
          .select({
            user: users,
            profile: userProfiles,
            distance: distanceExpr,
          })
          .from(userProfiles)
          .innerJoin(users, eq(users.id, userProfiles.userId))
          .where(and(...conditions))
          .orderBy(sql`distance`);
        return results;
      },
      { variant },
    );
  }

  async countActiveUsers(since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, "active"), eq(users.isFake, false), gte(users.lastLoginAt, since)));
    return result[0]?.count ?? 0;
  }

  async countOnlineUsers(since: Date, countries?: string[]): Promise<number> {
    const conditions: SQL<unknown>[] = [eq(users.status, "active"), eq(users.isFake, false), gte(users.lastLoginAt, since), eq(users.ghostMode, false), ...systemAccountConditions(users)];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async countAvailableUsers(): Promise<number> {
    const conditions = [eq(users.status, "active"), eq(users.isFake, false), eq(userProfiles.isAvailable, true), eq(users.ghostMode, false), ...systemAccountConditions(users)];
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async getOnlineUsersList(since?: Date, lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: User; profile: UserProfile | null; distance: number }>> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: SQL<unknown>[] = [
      eq(users.status, "active"), eq(users.isFake, false), eq(users.ghostMode, false),
      ...systemAccountConditions(users),
      sql`${userProfiles.latitude} IS NOT NULL`,
      sql`${userProfiles.longitude} IS NOT NULL`,
    ];
    if (onlineIds && onlineIds.length > 0) {
      conditions.push(inArray(users.id, onlineIds));
    }
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(sql`distance`);
    return maskHiddenLocationRows(results);
  }

  async getAvailableUsersList(lat?: number, lng?: number): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const results = await db
      .select({ user: users, profile: userProfiles, distance: distanceExpr })
      .from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .where(and(eq(users.status, "active"), eq(users.isFake, false), eq(userProfiles.isAvailable, true), eq(users.ghostMode, false), ...systemAccountConditions(users)))
      .orderBy(sql`distance`);
    return maskHiddenLocationRows(results);
  }

  async countAvailableBikers(countries?: string[]): Promise<number> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const conditions: SQL<unknown>[] = [
      eq(users.status, "active"), eq(userProfiles.isAvailable, true),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia"))!,
      eq(users.ghostMode, false), ...systemAccountConditions(users),
      gte(users.lastLoginAt, fifteenMinutesAgo),
    ];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async countAvailableZavorrine(countries?: string[]): Promise<number> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const conditions: SQL<unknown>[] = [
      eq(users.status, "active"), eq(userProfiles.isAvailable, true),
      eq(users.userType, "zavorrina"), eq(users.ghostMode, false),
      ...systemAccountConditions(users), gte(users.lastLoginAt, fifteenMinutesAgo),
    ];
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async getAvailableBikersList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: SQL<unknown>[] = [
      eq(users.status, "active"), eq(users.isFake, false), eq(userProfiles.isAvailable, true),
      or(eq(users.userType, "biker"), eq(users.userType, "coppia"))!, eq(users.ghostMode, false), ...systemAccountConditions(users),
    ];
    if (onlineIds && onlineIds.length > 0) conditions.push(inArray(users.id, onlineIds));
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const rows = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions)).orderBy(sql`distance`);
    return maskHiddenLocationRows(rows);
  }

  async getAvailableZavorrinaList(lat?: number, lng?: number, countries?: string[], onlineIds?: string[]): Promise<Array<{ user: User; profile: UserProfile; distance: number }>> {
    const distanceExpr = lat != null && lng != null
      ? sql<number>`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude}))))`.as("distance")
      : sql<number>`0`.as("distance");
    const conditions: SQL<unknown>[] = [
      eq(users.status, "active"), eq(users.isFake, false), eq(userProfiles.isAvailable, true),
      eq(users.userType, "zavorrina"), eq(users.ghostMode, false), ...systemAccountConditions(users),
    ];
    if (onlineIds && onlineIds.length > 0) conditions.push(inArray(users.id, onlineIds));
    if (countries && countries.length > 0) conditions.push(inArray(users.country, countries));
    const rows = await db.select({ user: users, profile: userProfiles, distance: distanceExpr }).from(userProfiles).innerJoin(users, eq(users.id, userProfiles.userId)).where(and(...conditions)).orderBy(sql`distance`);
    return maskHiddenLocationRows(rows);
  }
}
