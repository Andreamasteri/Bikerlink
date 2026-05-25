/**
 * Quota store — tile provider request counts
 *
 * In-memory cache for fast reads; every write is immediately flushed to the
 * maps_quota table so counts survive server restarts.
 *
 * Key format: `${providerId}_${yearMonth}` (e.g. "carto-light_2026-05")
 */

import { db } from "../../db";
import { mapsQuota } from "@shared/db/system";
import { eq, and, sql as drizzleSql } from "drizzle-orm";

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const cache = new Map<string, number>();

function cacheKey(providerId: string, yearMonth: string): string {
  return `${providerId}_${yearMonth}`;
}

/**
 * Returns the tile request count for the given provider in the current month.
 * Reads from in-memory cache; falls back to DB on first access.
 */
export async function getQuota(providerId: string): Promise<number> {
  const ym = currentYearMonth();
  const key = cacheKey(providerId, ym);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const [row] = await db
      .select({ count: mapsQuota.count })
      .from(mapsQuota)
      .where(
        and(
          eq(mapsQuota.providerId, providerId),
          eq(mapsQuota.yearMonth, ym),
        ),
      )
      .limit(1);

    const count = row?.count ?? 0;
    cache.set(key, count);
    return count;
  } catch (err) {
    console.error("[quota-store] getQuota error:", err);
    return 0;
  }
}

/**
 * Increments the tile request count by 1 for the current month and flushes to DB.
 * Cache is always synced to the DB-returned value so cold-start counts are accurate.
 */
export async function incrementQuota(providerId: string): Promise<void> {
  const ym = currentYearMonth();
  const key = cacheKey(providerId, ym);

  try {
    const [row] = await db
      .insert(mapsQuota)
      .values({ providerId, yearMonth: ym, count: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [mapsQuota.providerId, mapsQuota.yearMonth],
        set: {
          count: drizzleSql`${mapsQuota.count} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ count: mapsQuota.count });

    if (row !== undefined) {
      cache.set(key, row.count);
    }
  } catch (err) {
    console.error("[quota-store] incrementQuota error:", err);
    const current = cache.get(key) ?? 0;
    cache.set(key, current + 1);
  }
}

/**
 * Resets the tile request count for the given provider (current month) to zero.
 */
export async function resetQuota(providerId: string): Promise<void> {
  const ym = currentYearMonth();
  const key = cacheKey(providerId, ym);
  cache.set(key, 0);

  try {
    await db
      .insert(mapsQuota)
      .values({ providerId, yearMonth: ym, count: 0, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [mapsQuota.providerId, mapsQuota.yearMonth],
        set: { count: 0, updatedAt: new Date() },
      });
    console.log(`[quota-store] Quota resettata per provider: ${providerId} (${ym})`);
  } catch (err) {
    console.error("[quota-store] resetQuota error:", err);
  }
}
