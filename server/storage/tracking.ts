import { eq, and, or, sql, desc, asc } from "drizzle-orm";
import { db } from "../db";
import {
  routes, routePoints, customRoutes, customRouteWaypoints, gpsErrors, bikerBikerMatches,
  type Route, type InsertRoute,
  type RoutePoint, type InsertRoutePoint,
  type GpsError, type InsertGpsError,
  type CustomRoute, type InsertCustomRoute,
  type CustomRouteWaypoint, type InsertCustomRouteWaypoint,
} from "@shared/db";
import { ProposalsStorage } from "./proposals";

export class TrackingStorage extends ProposalsStorage {
  async getRoutes(userId: string): Promise<Route[]> {
    return db.select().from(routes).where(eq(routes.userId, userId)).orderBy(desc(routes.createdAt));
  }

  async getAllRoutes(): Promise<Route[]> {
    return db.select().from(routes).orderBy(desc(routes.createdAt));
  }

  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id)).limit(1);
    return route;
  }

  async createRoute(data: InsertRoute): Promise<Route> {
    const [route] = await db.insert(routes).values(data).returning();
    return route;
  }

  async updateRoute(id: string, data: Partial<InsertRoute>): Promise<Route | undefined> {
    const [route] = await db.update(routes).set(data).where(eq(routes.id, id)).returning();
    return route;
  }

  async getRoutePoints(routeId: string): Promise<RoutePoint[]> {
    return db.select().from(routePoints).where(eq(routePoints.routeId, routeId)).orderBy(asc(routePoints.timestamp));
  }

  async createRoutePoints(data: InsertRoutePoint[]): Promise<RoutePoint[]> {
    if (data.length === 0) return [];
    return db.insert(routePoints).values(data).returning();
  }

  async deleteRoute(id: string): Promise<void> {
    await db.delete(routePoints).where(eq(routePoints.routeId, id));
    await db.delete(routes).where(eq(routes.id, id));
  }

  async createGpsError(data: InsertGpsError): Promise<GpsError> {
    const [row] = await db.insert(gpsErrors).values(data).returning();
    return row;
  }

  async getGpsErrors(limit: number, offset: number): Promise<GpsError[]> {
    return db.select().from(gpsErrors).orderBy(desc(gpsErrors.createdAt)).limit(limit).offset(offset);
  }

  async countGpsErrors(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(gpsErrors);
    return row?.count ?? 0;
  }

  async getCustomRoutes(userId: string): Promise<CustomRoute[]> {
    return db.select().from(customRoutes).where(eq(customRoutes.userId, userId)).orderBy(desc(customRoutes.createdAt));
  }

  async getPublicCustomRoutes(): Promise<CustomRoute[]> {
    return db.select().from(customRoutes).where(eq(customRoutes.visibility, "public")).orderBy(desc(customRoutes.createdAt));
  }

  async getFriendsCustomRoutes(_userId: string): Promise<CustomRoute[]> {
    return db.select().from(customRoutes).where(eq(customRoutes.visibility, "friends")).orderBy(desc(customRoutes.createdAt));
  }

  async isUserFriendOf(userId: string, ownerId: string): Promise<boolean> {
    const [match] = await db.select({ id: bikerBikerMatches.id }).from(bikerBikerMatches).where(
      and(eq(bikerBikerMatches.status, "accepted"), or(
        and(eq(bikerBikerMatches.biker1Id, userId), eq(bikerBikerMatches.biker2Id, ownerId)),
        and(eq(bikerBikerMatches.biker1Id, ownerId), eq(bikerBikerMatches.biker2Id, userId))
      ))
    ).limit(1);
    return !!match;
  }

  async getCustomRoute(id: string): Promise<CustomRoute | undefined> {
    const [route] = await db.select().from(customRoutes).where(eq(customRoutes.id, id)).limit(1);
    return route;
  }

  async createCustomRoute(data: InsertCustomRoute): Promise<CustomRoute> {
    const [route] = await db.insert(customRoutes).values(data).returning();
    return route;
  }

  async updateCustomRoute(id: string, data: Partial<InsertCustomRoute>): Promise<CustomRoute | undefined> {
    const [route] = await db.update(customRoutes).set({ ...data, updatedAt: new Date() }).where(eq(customRoutes.id, id)).returning();
    return route;
  }

  async deleteCustomRoute(id: string): Promise<void> {
    await db.delete(customRoutes).where(eq(customRoutes.id, id));
  }

  async getCustomRouteWaypoints(routeId: string): Promise<CustomRouteWaypoint[]> {
    return db.select().from(customRouteWaypoints).where(eq(customRouteWaypoints.routeId, routeId)).orderBy(asc(customRouteWaypoints.orderIndex));
  }

  async createCustomRouteWaypoint(data: InsertCustomRouteWaypoint): Promise<CustomRouteWaypoint> {
    const [wp] = await db.insert(customRouteWaypoints).values(data).returning();
    return wp;
  }

  async updateCustomRouteWaypoint(id: string, data: Partial<InsertCustomRouteWaypoint>): Promise<CustomRouteWaypoint | undefined> {
    const [wp] = await db.update(customRouteWaypoints).set(data).where(eq(customRouteWaypoints.id, id)).returning();
    return wp;
  }

  async deleteCustomRouteWaypoint(id: string): Promise<void> {
    await db.delete(customRouteWaypoints).where(eq(customRouteWaypoints.id, id));
  }

  async deleteAllCustomRouteWaypoints(routeId: string): Promise<void> {
    await db.delete(customRouteWaypoints).where(eq(customRouteWaypoints.routeId, routeId));
  }
}
