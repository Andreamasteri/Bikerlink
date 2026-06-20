import { eq, sql, desc } from "drizzle-orm";
import { db, withDbRetry } from "../db";
import { dedupWarn } from "../lib/dedup-logger";
import {
  coordinateHistory, plannedRoutes, routeWeatherCache,
  type CoordinateHistory,
  type PlannedRoute, type InsertPlannedRoute,
  type RouteWeatherCache, type InsertRouteWeatherCache,
} from "@shared/db";
import { SystemStorage } from "./system";
import { PROTECTED_NICKNAMES } from "../constants";

export class PlannedRoutesStorage extends SystemStorage {
  async saveCoordinateHistory(userId: string, latitude: number, longitude: number): Promise<CoordinateHistory | null> {
    try {
      const enabledSetting = await this.getAppSetting("coordinate_history_enabled");
      if (enabledSetting?.value !== "true") return null;
      const modeSetting = await this.getAppSetting("coordinate_history_mode");
      const mode = modeSetting?.value || "all";
      if (mode === "selected") {
        const usersSetting = await this.getAppSetting("coordinate_history_users");
        const selectedUsers: string[] = usersSetting?.value ? JSON.parse(usersSetting.value) : [];
        if (!selectedUsers.includes(userId)) return null;
      }
      const intervalSetting = await this.getAppSetting("coordinate_history_interval");
      const intervalSec = intervalSetting?.value ? parseInt(intervalSetting.value, 10) : 30;
      const minInterval = isNaN(intervalSec) || intervalSec < 5 ? 30 : intervalSec;
      const lastRecord = await db.select().from(coordinateHistory).where(eq(coordinateHistory.userId, userId)).orderBy(desc(coordinateHistory.createdAt)).limit(1);
      if (lastRecord.length > 0) {
        const elapsed = (Date.now() - new Date(lastRecord[0].createdAt).getTime()) / 1000;
        if (elapsed < minInterval) return null;
      }
      const [record] = await db.insert(coordinateHistory).values({ userId, latitude, longitude }).returning();
      return record;
    } catch (err) {
      console.error("[CoordinateHistory] save error:", err);
      return null;
    }
  }

  async getLatestCoordinateHistory(userId: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const [record] = await db
        .select()
        .from(coordinateHistory)
        .where(eq(coordinateHistory.userId, userId))
        .orderBy(desc(coordinateHistory.createdAt))
        .limit(1);
      if (!record) return null;
      return { latitude: record.latitude, longitude: record.longitude };
    } catch {
      return null;
    }
  }

  async getCoordinateHistoryStats(): Promise<{ totalRecords: number; trackedUsers: number; oldestRecord: string | null; newestRecord: string | null }> {
    const result = await db.execute(sql`SELECT COUNT(*)::int as total_records, COUNT(DISTINCT user_id)::int as tracked_users, MIN(created_at)::text as oldest_record, MAX(created_at)::text as newest_record FROM coordinate_history`);
    const row = result.rows[0] as { total_records: number; tracked_users: number; oldest_record: string | null; newest_record: string | null };
    return { totalRecords: row.total_records || 0, trackedUsers: row.tracked_users || 0, oldestRecord: row.oldest_record || null, newestRecord: row.newest_record || null };
  }

  async getCoordinateHistoryUsers(): Promise<Array<{ userId: string; nickname: string; recordCount: number; lastRecord: string }>> {
    const result = await db.execute(sql`SELECT ch.user_id, u.nickname, COUNT(*)::int as record_count, MAX(ch.created_at)::text as last_record FROM coordinate_history ch JOIN users u ON u.id = ch.user_id WHERE u.nickname <> ALL(${sql.raw(`ARRAY['${PROTECTED_NICKNAMES.join("','")}']`)}) GROUP BY ch.user_id, u.nickname ORDER BY last_record DESC`);
    return result.rows.map((r) => {
      const row = r as { user_id: string; nickname: string; record_count: number; last_record: string };
      return { userId: row.user_id, nickname: row.nickname, recordCount: row.record_count, lastRecord: row.last_record };
    });
  }

  async cleanupOldCoordinateHistory(): Promise<number> {
    try {
      const maxRecordsSetting = await withDbRetry(() => this.getAppSetting("coordinate_history_max_records"));
      const maxRecords = maxRecordsSetting?.value ? parseInt(maxRecordsSetting.value, 10) : 60;
      const limit = isNaN(maxRecords) || maxRecords < 1 ? 60 : maxRecords;
      const result = await withDbRetry(() => db.execute(sql`DELETE FROM coordinate_history WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn FROM coordinate_history) ranked WHERE rn > ${limit}) RETURNING id`));
      return result.rows.length;
    } catch (err) {
      dedupWarn("CoordinateHistory", "cleanup error", err);
      return 0;
    }
  }

  async createPlannedRoute(data: InsertPlannedRoute): Promise<PlannedRoute> {
    const [route] = await db.insert(plannedRoutes).values(data).returning();
    return route;
  }

  async getPlannedRoute(id: string): Promise<PlannedRoute | undefined> {
    const [route] = await db.select().from(plannedRoutes).where(eq(plannedRoutes.id, id)).limit(1);
    return route;
  }

  async getPlannedRoutes(userId: string): Promise<PlannedRoute[]> {
    return db.select().from(plannedRoutes).where(eq(plannedRoutes.userId, userId)).orderBy(desc(plannedRoutes.createdAt));
  }

  async getPublicPlannedRoutes(limit = 50): Promise<PlannedRoute[]> {
    return db.select().from(plannedRoutes).where(eq(plannedRoutes.visibility, "public")).orderBy(desc(plannedRoutes.createdAt)).limit(limit);
  }

  async updatePlannedRoute(id: string, data: Partial<InsertPlannedRoute>): Promise<PlannedRoute | undefined> {
    const [route] = await db.update(plannedRoutes).set({ ...data, updatedAt: new Date() }).where(eq(plannedRoutes.id, id)).returning();
    return route;
  }

  async deletePlannedRoute(id: string): Promise<void> {
    await db.delete(plannedRoutes).where(eq(plannedRoutes.id, id));
  }

  async upsertRouteWeatherCache(data: InsertRouteWeatherCache): Promise<RouteWeatherCache> {
    const [existing] = await db.select().from(routeWeatherCache).where(eq(routeWeatherCache.routeId, data.routeId)).limit(1);
    if (existing) {
      const [updated] = await db.update(routeWeatherCache)
        .set({ weatherData: data.weatherData, departureTime: data.departureTime })
        .where(eq(routeWeatherCache.routeId, data.routeId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(routeWeatherCache).values(data).returning();
    return created;
  }

  async getRouteWeatherCache(routeId: string): Promise<RouteWeatherCache | undefined> {
    const [cache] = await db.select().from(routeWeatherCache).where(eq(routeWeatherCache.routeId, routeId)).limit(1);
    return cache;
  }
}
