import { db } from "../../db";
import {
  matchFeedback,
  matchNegativePreferences,
  users,
  userMotorcycles,
} from "@shared/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

const REJECT_LOOKBACK_DAYS = 30;
const MIN_PATTERN_COUNT = 5;
const MIN_PATTERN_RATE = 0.6;

export interface DetectionResult {
  usersProcessed: number;
  suggestionsInserted: number;
}

/**
 * Daily job: for each user with recent reject feedback, analyze the rejected
 * users' attributes and detect recurring patterns. When ≥ 5 rejects of the
 * same attribute (bike type, user type, region) and the rate exceeds 60% of
 * that user's recent rejects, insert a pending auto-suggestion.
 */
export async function runDetectNegativePatternsJob(): Promise<DetectionResult> {
  const since = new Date(Date.now() - REJECT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find users who have rejects in the window.
  const usersWithRejects = await db
    .selectDistinct({ userId: matchFeedback.userId })
    .from(matchFeedback)
    .where(and(eq(matchFeedback.action, "reject"), gte(matchFeedback.createdAt, since)));

  let suggestionsInserted = 0;
  let usersProcessed = 0;

  for (const { userId } of usersWithRejects) {
    usersProcessed++;
    try {
      const rejects = await db
        .select({ otherUserId: matchFeedback.otherUserId })
        .from(matchFeedback)
        .where(and(
          eq(matchFeedback.userId, userId),
          eq(matchFeedback.action, "reject"),
          gte(matchFeedback.createdAt, since),
        ));

      if (rejects.length < MIN_PATTERN_COUNT) continue;
      const otherIds = Array.from(new Set(rejects.map((r) => r.otherUserId)));
      if (otherIds.length === 0) continue;

      const userRows = await db
        .select({ id: users.id, userType: users.userType, region: users.region })
        .from(users)
        .where(inArray(users.id, otherIds));
      const userMap = new Map(userRows.map((u) => [u.id, u]));

      const motoRows = await db
        .select({ userId: userMotorcycles.userId, motorcycleType: userMotorcycles.motorcycleType })
        .from(userMotorcycles)
        .where(inArray(userMotorcycles.userId, otherIds));
      const bikeMap = new Map<string, string[]>();
      for (const m of motoRows) {
        if (!m.motorcycleType) continue;
        const arr = bikeMap.get(m.userId) ?? [];
        arr.push(m.motorcycleType.toLowerCase());
        bikeMap.set(m.userId, arr);
      }

      const totalRejects = rejects.length;

      // Tally counts per (kind, value) over the *reject events* (not unique users)
      const counts = new Map<string, { kind: string; value: unknown; n: number }>();
      const bump = (kind: string, value: unknown) => {
        const k = `${kind}:${JSON.stringify(value)}`;
        const prev = counts.get(k) ?? { kind, value, n: 0 };
        prev.n += 1;
        counts.set(k, prev);
      };
      for (const r of rejects) {
        const u = userMap.get(r.otherUserId);
        if (u) {
          if (u.userType) bump("exclude_user_type", { userType: u.userType.toLowerCase() });
          if (u.region) bump("exclude_region", { region: u.region });
        }
        const seenTypes = new Set<string>();
        for (const t of bikeMap.get(r.otherUserId) ?? []) {
          if (seenTypes.has(t)) continue;
          seenTypes.add(t);
          bump("bike_type", { type: t });
        }
      }

      // Existing manual prefs and previously resolved suggestions to avoid spam.
      const existingNeg = await db
        .select({ kind: matchNegativePreferences.kind, value: matchNegativePreferences.value })
        .from(matchNegativePreferences)
        .where(eq(matchNegativePreferences.userId, userId));
      const existingKeys = new Set(existingNeg.map((e) => `${e.kind}:${JSON.stringify(e.value)}`));

      for (const [, { kind, value, n }] of counts) {
        if (n < MIN_PATTERN_COUNT) continue;
        const rate = n / totalRejects;
        if (rate < MIN_PATTERN_RATE) continue;
        const key = `${kind}:${JSON.stringify(value)}`;
        if (existingKeys.has(key)) continue;

        try {
          await db.execute(sql`
            INSERT INTO pending_auto_suggestions (user_id, kind, value, reject_count, status)
            VALUES (${userId}, ${kind}, ${sql.raw(`'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`)}, ${n}, 'pending')
            ON CONFLICT (user_id, kind, (value::text))
            DO UPDATE SET reject_count = EXCLUDED.reject_count, status = 'pending'
            WHERE pending_auto_suggestions.status NOT IN ('accepted', 'rejected')
          `);
          suggestionsInserted++;
        } catch {
          // Unique constraint or other — ignore silently for this user.
        }
      }
    } catch (err) {
      console.error("[NegPatternJob] error for user", userId, err);
    }
  }

  return { usersProcessed, suggestionsInserted };
}
