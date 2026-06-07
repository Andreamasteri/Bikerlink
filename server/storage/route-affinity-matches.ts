import { eq, and, or, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  routeAffinityMatches,
  type RouteAffinityMatch,
  type InsertRouteAffinityMatch,
} from "@shared/db";
import { BikerMatchesStorage } from "./biker-matches";

export class RouteAffinityMatchesStorage extends BikerMatchesStorage {
  async getRouteAffinityMatchesForUser(userId: string): Promise<RouteAffinityMatch[]> {
    return db
      .select()
      .from(routeAffinityMatches)
      .where(
        or(
          eq(routeAffinityMatches.userAId, userId),
          eq(routeAffinityMatches.userBId, userId),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${routeAffinityMatches.status} = 'accepted' THEN 0 WHEN ${routeAffinityMatches.status} = 'new' THEN 1 ELSE 2 END`,
        desc(routeAffinityMatches.score),
      )
      .limit(500);
  }

  async getRouteAffinityMatch(id: string): Promise<RouteAffinityMatch | undefined> {
    const [m] = await db
      .select()
      .from(routeAffinityMatches)
      .where(eq(routeAffinityMatches.id, id));
    return m;
  }

  async updateRouteAffinityMatch(
    id: string,
    data: Partial<InsertRouteAffinityMatch>,
  ): Promise<RouteAffinityMatch | undefined> {
    const [updated] = await db
      .update(routeAffinityMatches)
      .set(data)
      .where(eq(routeAffinityMatches.id, id))
      .returning();
    return updated;
  }

  async deleteRouteAffinityMatch(id: string): Promise<boolean> {
    const res = await db
      .delete(routeAffinityMatches)
      .where(eq(routeAffinityMatches.id, id))
      .returning();
    return res.length > 0;
  }

  async deleteRouteAffinityMatchByUser(id: string, userId: string): Promise<boolean> {
    const res = await db
      .delete(routeAffinityMatches)
      .where(
        and(
          eq(routeAffinityMatches.id, id),
          or(
            eq(routeAffinityMatches.userAId, userId),
            eq(routeAffinityMatches.userBId, userId),
          ),
        ),
      )
      .returning();
    return res.length > 0;
  }

  async deleteRouteAffinityMatchesBetween(userId1: string, userId2: string): Promise<number> {
    const res = await db
      .delete(routeAffinityMatches)
      .where(
        or(
          and(eq(routeAffinityMatches.userAId, userId1), eq(routeAffinityMatches.userBId, userId2)),
          and(eq(routeAffinityMatches.userAId, userId2), eq(routeAffinityMatches.userBId, userId1)),
        ),
      )
      .returning();
    return res.length;
  }
}
