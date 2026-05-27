import { sql } from "drizzle-orm";
import { db } from "../../db";
import { dailyPushCounts } from "@shared/db";
import { eq, and } from "drizzle-orm";

export const DEFAULT_DAILY_INDIVIDUAL_BUDGET = 3;

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getIndividualPushCount(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ c: dailyPushCounts.individualCount })
      .from(dailyPushCounts)
      .where(and(eq(dailyPushCounts.userId, userId), eq(dailyPushCounts.day, todayKey())))
      .limit(1);
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

export async function incrementIndividualPushCount(userId: string, by: number = 1): Promise<void> {
  try {
    const day = todayKey();
    await db.execute(sql`
      INSERT INTO daily_push_counts (user_id, day, individual_count, digest_count, updated_at)
      VALUES (${userId}, ${day}, ${by}, 0, NOW())
      ON CONFLICT (user_id, day)
      DO UPDATE SET individual_count = daily_push_counts.individual_count + ${by}, updated_at = NOW()
    `);
  } catch (err) {
    console.warn("[NotifBudget] incrementIndividualPushCount error:", err);
  }
}

export async function incrementDigestPushCount(userId: string): Promise<void> {
  try {
    const day = todayKey();
    await db.execute(sql`
      INSERT INTO daily_push_counts (user_id, day, individual_count, digest_count, updated_at)
      VALUES (${userId}, ${day}, 0, 1, NOW())
      ON CONFLICT (user_id, day)
      DO UPDATE SET digest_count = daily_push_counts.digest_count + 1, updated_at = NOW()
    `);
  } catch (err) {
    console.warn("[NotifBudget] incrementDigestPushCount error:", err);
  }
}

export async function getDailyBudget(): Promise<number> {
  try {
    const { storage } = await import("../../storage");
    const s = await storage.getAppSetting("notification_individual_daily_budget");
    if (s?.value) {
      const n = parseInt(s.value, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {/* noop */}
  return DEFAULT_DAILY_INDIVIDUAL_BUDGET;
}
