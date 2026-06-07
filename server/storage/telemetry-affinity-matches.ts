import { eq, and, or, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  telemetryAffinityMatches,
  userTelemetryProfile,
  type TelemetryAffinityMatch,
  type InsertTelemetryAffinityMatch,
  type UserTelemetryProfile,
} from "@shared/db";
import { RouteAffinityMatchesStorage } from "./route-affinity-matches";

/**
 * Task #3393 — storage per i match telemetry-affinity (stile di guida).
 * Mirror di RouteAffinityMatchesStorage: stesso ordinamento (accepted → new →
 * altro, poi score decrescente) e stesse operazioni CRUD.
 */
export class TelemetryAffinityMatchesStorage extends RouteAffinityMatchesStorage {
  // Task #3396 — profilo telemetria aggregato dell'utente (per il pannello "il tuo stile").
  async getUserTelemetryProfile(userId: string): Promise<UserTelemetryProfile | undefined> {
    const [row] = await db
      .select()
      .from(userTelemetryProfile)
      .where(eq(userTelemetryProfile.userId, userId));
    return row;
  }

  async getTelemetryAffinityMatchesForUser(userId: string): Promise<TelemetryAffinityMatch[]> {
    return db
      .select()
      .from(telemetryAffinityMatches)
      .where(
        or(
          eq(telemetryAffinityMatches.userAId, userId),
          eq(telemetryAffinityMatches.userBId, userId),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${telemetryAffinityMatches.status} = 'accepted' THEN 0 WHEN ${telemetryAffinityMatches.status} = 'new' THEN 1 ELSE 2 END`,
        desc(telemetryAffinityMatches.combinedScore),
      )
      .limit(500);
  }

  async getTelemetryAffinityMatch(id: string): Promise<TelemetryAffinityMatch | undefined> {
    const [m] = await db
      .select()
      .from(telemetryAffinityMatches)
      .where(eq(telemetryAffinityMatches.id, id));
    return m;
  }

  async updateTelemetryAffinityMatch(
    id: string,
    data: Partial<InsertTelemetryAffinityMatch>,
  ): Promise<TelemetryAffinityMatch | undefined> {
    const [updated] = await db
      .update(telemetryAffinityMatches)
      .set(data)
      .where(eq(telemetryAffinityMatches.id, id))
      .returning();
    return updated;
  }

  async deleteTelemetryAffinityMatch(id: string): Promise<boolean> {
    const res = await db
      .delete(telemetryAffinityMatches)
      .where(eq(telemetryAffinityMatches.id, id))
      .returning();
    return res.length > 0;
  }

  async deleteTelemetryAffinityMatchesBetween(userId1: string, userId2: string): Promise<number> {
    const res = await db
      .delete(telemetryAffinityMatches)
      .where(
        or(
          and(eq(telemetryAffinityMatches.userAId, userId1), eq(telemetryAffinityMatches.userBId, userId2)),
          and(eq(telemetryAffinityMatches.userAId, userId2), eq(telemetryAffinityMatches.userBId, userId1)),
        ),
      )
      .returning();
    return res.length;
  }
}
