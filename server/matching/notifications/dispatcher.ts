import { sql } from "drizzle-orm";
import { db } from "../../db";
import { matchPreferences } from "@shared/db";
import { inArray } from "drizzle-orm";
import { sendMatchPushNotifications } from "../../push-notifications";
import type { NotificationPriority } from "./classify";
import { getDailyBudget, getIndividualPushCount, incrementIndividualPushCount } from "./budget";
import { broadcastAdminUrgent } from "./ws-server";
import { recordDelivery } from "./deliveries";
import type { MatchTable } from "./dispatcher-types";

export type { MatchTable } from "./dispatcher-types";

export interface DispatchInput {
  table: MatchTable;
  matchId: string;
  userIds: string[];
  priority: NotificationPriority;
  isSupermatch?: boolean;
  distanceKm?: number | null;
  matchName?: string;
  thumbnailUrl?: string;
}

async function loadTopOnlyMap(userIds: string[]): Promise<Map<string, boolean>> {
  const m = new Map<string, boolean>();
  if (userIds.length === 0) return m;
  try {
    const rows = await db
      .select({ userId: matchPreferences.userId, topMatchesOnly: matchPreferences.topMatchesOnly })
      .from(matchPreferences)
      .where(inArray(matchPreferences.userId, userIds));
    for (const r of rows) m.set(r.userId, !!r.topMatchesOnly);
  } catch {/* default = false */}
  return m;
}

async function setRowPriority(table: MatchTable, matchId: string, priority: NotificationPriority): Promise<void> {
  try {
    if (table === "biker_zavorrina_matches") {
      await db.execute(sql`UPDATE biker_zavorrina_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "biker_biker_matches") {
      await db.execute(sql`UPDATE biker_biker_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "proposal_matches") {
      await db.execute(sql`UPDATE proposal_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "proposal_profile_matches") {
      await db.execute(sql`UPDATE proposal_profile_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "bio_affinity_matches") {
      await db.execute(sql`UPDATE bio_affinity_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "route_affinity_matches") {
      await db.execute(sql`UPDATE route_affinity_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    } else if (table === "music_affinity_matches") {
      await db.execute(sql`UPDATE music_affinity_matches SET notification_priority = ${priority} WHERE id = ${matchId}`);
    }
  } catch (err) {
    console.warn("[NotifDispatcher] setRowPriority error:", err);
  }
}

/**
 * Routes a freshly-created match through the notification pipeline:
 * - persists priority on the row
 * - filters per-user via topMatchesOnly preference
 * - urgent: immediate per-user push (budget-aware). Per-recipient delivery is
 *   tracked; if ANY participant is over budget the row is demoted to `normal`
 *   so the digest will still cover the unhandled recipients (and any future
 *   ones that join the queue).
 * - high:   left for the hourly flush job
 * - normal/low: left for the digest job (12:00 / 19:00)
 */
export async function dispatchMatchNotification(input: DispatchInput): Promise<void> {
  await setRowPriority(input.table, input.matchId, input.priority);

  if (input.priority === "urgent" && input.isSupermatch) {
    try {
      broadcastAdminUrgent({
        table: input.table,
        matchId: input.matchId,
        userIds: input.userIds,
        distanceKm: input.distanceKm ?? null,
      });
    } catch {/* noop */}
  }

  if (input.priority !== "urgent") {
    // Non-urgent priorities are handled exclusively by the cron jobs, which
    // read pending deliveries from match_notification_deliveries.
    return;
  }

  const topOnly = await loadTopOnlyMap(input.userIds);
  // For urgent, topMatchesOnly users still receive immediate pushes (urgent
  // IS the top tier). topOnly only filters normal/low — handled by digest job.
  void topOnly;

  const budget = await getDailyBudget();
  const allowedNow: string[] = [];
  let anyOverBudget = false;

  for (const uid of input.userIds) {
    const used = await getIndividualPushCount(uid);
    if (used < budget) {
      allowedNow.push(uid);
      await incrementIndividualPushCount(uid, 1);
    } else {
      anyOverBudget = true;
    }
  }

  if (allowedNow.length > 0) {
    sendMatchPushNotifications(allowedNow, {
      matchName: input.matchName,
      thumbnailUrl: input.thumbnailUrl,
    });
    for (const uid of allowedNow) {
      await recordDelivery(input.table, input.matchId, uid, "push");
    }
  }

  // If any recipient was over budget, demote the row to `normal` so the
  // digest job will pick them up at 12:00 / 19:00. Recipients we already
  // delivered to are excluded by their delivery record, so they won't be
  // double-pushed.
  if (anyOverBudget) {
    await setRowPriority(input.table, input.matchId, "normal");
  }
}
