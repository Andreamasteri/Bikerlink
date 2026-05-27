import { Cron } from "croner";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { users, matchPreferences } from "@shared/db";
import { inArray } from "drizzle-orm";
import { incrementDigestPushCount, getIndividualPushCount, getDailyBudget, incrementIndividualPushCount } from "./budget";
import { sendMatchPushNotifications } from "../../push-notifications";
import { listPendingDeliveries, recordDelivery } from "./deliveries";

const TIMEZONE = "Europe/Rome";

interface UserDeliverable {
  userId: string;
  count: number;
  rows: Array<{ table: import("./dispatcher-types").MatchTable; matchId: string }>;
}

async function loadUserPushFilters(userIds: string[]): Promise<{
  active: Set<string>;
  topOnly: Set<string>;
}> {
  const active = new Set<string>();
  const topOnly = new Set<string>();
  if (userIds.length === 0) return { active, topOnly };

  const userRows = await db
    .select({ id: users.id, expoPushToken: users.expoPushToken, status: users.status, isFake: users.isFake })
    .from(users)
    .where(inArray(users.id, userIds));
  for (const u of userRows) {
    if (u.status === "active" && !u.isFake && !!u.expoPushToken) active.add(u.id);
  }

  const prefRows = await db
    .select({ userId: matchPreferences.userId, topMatchesOnly: matchPreferences.topMatchesOnly })
    .from(matchPreferences)
    .where(inArray(matchPreferences.userId, userIds));
  for (const r of prefRows) if (r.topMatchesOnly) topOnly.add(r.userId);

  return { active, topOnly };
}

function aggregate(
  pending: Awaited<ReturnType<typeof listPendingDeliveries>>,
): UserDeliverable[] {
  const map = new Map<string, UserDeliverable>();
  for (const p of pending) {
    const cur = map.get(p.user_id) ?? { userId: p.user_id, count: 0, rows: [] };
    cur.count += 1;
    cur.rows.push({ table: p.match_table, matchId: p.match_id });
    map.set(p.user_id, cur);
  }
  return Array.from(map.values());
}

/**
 * Aggregate pending normal/low matches per-user and send a single digest push.
 * Records per-recipient delivery so each user only ever receives one push for
 * a given match — counterpart users may still get their own delivery later.
 *
 * Respects per-user `topMatchesOnly` (if true, normal/low are silently skipped).
 */
export async function runDigestPush(): Promise<{ usersNotified: number; matchesAggregated: number }> {
  try {
    const pending = await listPendingDeliveries(["normal", "low"]);
    if (pending.length === 0) return { usersNotified: 0, matchesAggregated: 0 };

    const perUser = aggregate(pending);
    const { active, topOnly } = await loadUserPushFilters(perUser.map((u) => u.userId));

    const deliverable = perUser.filter((u) => active.has(u.userId) && !topOnly.has(u.userId));
    if (deliverable.length === 0) return { usersNotified: 0, matchesAggregated: 0 };

    const targetIds = deliverable.map((u) => u.userId);
    sendMatchPushNotifications(targetIds);

    let aggregated = 0;
    for (const u of deliverable) {
      aggregated += u.count;
      await incrementDigestPushCount(u.userId);
      for (const r of u.rows) {
        await recordDelivery(r.table, r.matchId, u.userId, "digest");
      }
    }

    console.log(`[NotifDigest] Digest inviato a ${deliverable.length} utenti (${aggregated} match aggregati)`);
    return { usersNotified: deliverable.length, matchesAggregated: aggregated };
  } catch (err) {
    console.error("[NotifDigest] Errore digest job:", err);
    return { usersNotified: 0, matchesAggregated: 0 };
  }
}

/**
 * Flush `high` priority matches every 60 minutes — sends individual pushes
 * (one per user) for high-priority matches not yet delivered, respecting the
 * daily budget. Over-budget recipients have their pending row demoted to
 * `normal` so the digest job picks them up later (per-recipient: already-
 * delivered counterparts are not re-pushed).
 */
export async function runHighFlush(): Promise<{ pushed: number; demoted: number }> {
  try {
    const pending = await listPendingDeliveries(["high"]);
    if (pending.length === 0) return { pushed: 0, demoted: 0 };

    const budget = await getDailyBudget();
    const perUser = aggregate(pending);
    const { active, topOnly } = await loadUserPushFilters(perUser.map((u) => u.userId));
    void topOnly; // high is still top-tier; topMatchesOnly does NOT suppress it

    const pushedUsers: string[] = [];
    const demotedRows = new Set<string>();

    for (const u of perUser) {
      if (!active.has(u.userId)) {
        // Inactive / no token: demote their rows so they don't block the queue
        for (const r of u.rows) demotedRows.add(`${r.table}::${r.matchId}`);
        continue;
      }
      const used = await getIndividualPushCount(u.userId);
      if (used >= budget) {
        for (const r of u.rows) demotedRows.add(`${r.table}::${r.matchId}`);
      } else {
        pushedUsers.push(u.userId);
        await incrementIndividualPushCount(u.userId, 1);
        for (const r of u.rows) {
          await recordDelivery(r.table, r.matchId, u.userId, "push");
        }
      }
    }

    if (pushedUsers.length > 0) {
      sendMatchPushNotifications(pushedUsers);
    }

    // Demote `high` rows that still have any undelivered participant after
    // this flush. We re-evaluate per row at the end so we don't demote a row
    // that has only delivered participants left.
    let demotedCount = 0;
    if (demotedRows.size > 0) {
      // Re-check: only demote rows where at least one participant is still pending
      const stillPending = await listPendingDeliveries(["high"]);
      const stillPendingRows = new Set(stillPending.map((p) => `${p.match_table}::${p.match_id}`));
      const toDemote = Array.from(demotedRows).filter((k) => stillPendingRows.has(k));
      for (const key of toDemote) {
        const [table, id] = key.split("::") as [string, string];
        if (table === "biker_zavorrina_matches") {
          await db.execute(sql`UPDATE biker_zavorrina_matches SET notification_priority = 'normal' WHERE id = ${id} AND notification_priority = 'high'`);
        } else if (table === "biker_biker_matches") {
          await db.execute(sql`UPDATE biker_biker_matches SET notification_priority = 'normal' WHERE id = ${id} AND notification_priority = 'high'`);
        } else if (table === "proposal_matches") {
          await db.execute(sql`UPDATE proposal_matches SET notification_priority = 'normal' WHERE id = ${id} AND notification_priority = 'high'`);
        } else if (table === "proposal_profile_matches") {
          await db.execute(sql`UPDATE proposal_profile_matches SET notification_priority = 'normal' WHERE id = ${id} AND notification_priority = 'high'`);
        }
        demotedCount += 1;
      }
    }

    console.log(`[NotifHighFlush] pushed=${pushedUsers.length}, demoted=${demotedCount}`);
    return { pushed: pushedUsers.length, demoted: demotedCount };
  } catch (err) {
    console.error("[NotifHighFlush] Errore:", err);
    return { pushed: 0, demoted: 0 };
  }
}

let digestNoonJob: Cron | null = null;
let digestEveningJob: Cron | null = null;
let highFlushJob: Cron | null = null;

export function startNotificationJobs(): void {
  if (digestNoonJob || digestEveningJob || highFlushJob) {
    console.log("[NotifJobs] Already started, skipping");
    return;
  }
  digestNoonJob = new Cron("0 12 * * *", { timezone: TIMEZONE, protect: true }, () => {
    void runDigestPush();
  });
  digestEveningJob = new Cron("0 19 * * *", { timezone: TIMEZONE, protect: true }, () => {
    void runDigestPush();
  });
  highFlushJob = new Cron("0 * * * *", { timezone: TIMEZONE, protect: true }, () => {
    void runHighFlush();
  });
  console.log("[NotifJobs] Digest scheduled at 12:00 + 19:00 Europe/Rome; high-flush every hour");
}

export function stopNotificationJobs(): void {
  digestNoonJob?.stop();
  digestEveningJob?.stop();
  highFlushJob?.stop();
  digestNoonJob = null;
  digestEveningJob = null;
  highFlushJob = null;
}

export function getNotificationJobsState(): {
  digestNoonNext: string | null;
  digestEveningNext: string | null;
  highFlushNext: string | null;
} {
  return {
    digestNoonNext: digestNoonJob?.nextRun()?.toISOString() ?? null,
    digestEveningNext: digestEveningJob?.nextRun()?.toISOString() ?? null,
    highFlushNext: highFlushJob?.nextRun()?.toISOString() ?? null,
  };
}
