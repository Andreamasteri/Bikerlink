import { db } from "../db";
import { sql } from "drizzle-orm";
import { matchFeedback } from "@shared/db";
import { computeProfileForUser, upsertUserMatchProfile, inferIgnoreFeedback } from "./feedback";

/**
 * Recompute per-user match profiles for every user that has any feedback.
 * Called daily by the scheduler. Logs aggregate counts but never throws.
 */
export async function recomputeAllUserMatchProfiles(): Promise<{ users: number; errors: number }> {
  let users = 0;
  let errors = 0;
  try {
    const ignored = await inferIgnoreFeedback(7);
    if (ignored > 0) console.log(`[ProfileRecompute] Inferred ${ignored} ignore feedbacks`);
  } catch (err) {
    console.error("[ProfileRecompute] inferIgnoreFeedback error:", err);
  }

  let rows: Array<{ userId: string }>;
  try {
    rows = await db
      .selectDistinct({ userId: matchFeedback.userId })
      .from(matchFeedback);
  } catch (err) {
    console.error("[ProfileRecompute] failed to load feedback users:", err);
    return { users, errors: 1 };
  }

  for (const r of rows) {
    try {
      const { weights, stats, totalFeedback } = await computeProfileForUser(r.userId);
      await upsertUserMatchProfile(r.userId, weights, stats, totalFeedback);
      users++;
    } catch (err) {
      errors++;
      console.error(`[ProfileRecompute] user ${r.userId} failed:`, err);
    }
  }

  void sql;
  console.log(`[ProfileRecompute] Done: ${users} profiles updated, ${errors} errors`);
  return { users, errors };
}
