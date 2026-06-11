import { db } from "../db";
import { sql } from "drizzle-orm";
import it from "../../lib/i18n/it";
import { storage } from "../storage";
import { dispatchMatchNotification } from "./notifications/dispatcher";
import type { MatchTable } from "./notifications/dispatcher-types";
import {
  recordNotifSent,
  recordNotifFailed,
  recordNotifRetried,
  canRetryMatch,
  incrementRetryAttempt,
  pruneRetryAttempts,
  markPermanentFailure,
} from "./notification-stats";
import { matchingLogger } from "../lib/logger";
import { addMatchLog } from "./match-log-buffer";

/**
 * Table descriptor used by the pending-notification retry loop.
 * user1Col / user2Col are the column names for the two participants.
 */
interface RetryTableSpec {
  table: MatchTable;
  user1Col: string;
  user2Col: string;
}

const RETRY_TABLE_SPECS: RetryTableSpec[] = [
  { table: "biker_zavorrina_matches",  user1Col: "biker_id",   user2Col: "zavorrina_id" },
  { table: "biker_biker_matches",       user1Col: "biker1_id",  user2Col: "biker2_id"    },
  { table: "bio_affinity_matches",      user1Col: "user_a_id",  user2Col: "user_b_id"    },
  { table: "route_affinity_matches",    user1Col: "user_a_id",  user2Col: "user_b_id"    },
  { table: "music_affinity_matches",    user1Col: "user_a_id",  user2Col: "user_b_id"    },
];

/**
 * Retry pending notifications for all match tables.
 *
 * Finds matches created in the last 24 h whose `notified_at` is still NULL
 * and that represent a true delivery failure:
 *
 *  • proposal_matches — always use createNotification (immediate push regardless
 *    of priority), so notified_at IS NULL always means the push was never sent.
 *  • All other tables — only rows with notification_priority = 'urgent' are
 *    retried.  Non-urgent rows (high/normal/low) are intentionally queued for
 *    the digest job (12:00 / 19:00); their notified_at IS NULL simply means
 *    "not yet delivered by cron", not "failed".  Forcing urgent on those rows
 *    would violate the product's deliberate pacing contract.
 *
 * Each match is retried at most MAX_RETRIES_PER_MATCH times across the
 * lifetime of the current server process (tracked in-memory via notification-stats).
 *
 * For `proposal_matches` the retry calls `createNotification` directly (same
 * mechanism as the original send). For all other tables `dispatchMatchNotification`
 * is used with "urgent" priority so the notification is sent immediately
 * (non-urgent priorities return early from the dispatcher without sending).
 * The underlying delivery table has a unique-index guard preventing duplicates.
 *
 * Implementation note: pruneRetryAttempts() is time-based (25 h TTL) so
 * attempt counters for matches NOT included in a limited LIMIT-N result are
 * preserved across cycles until the match ages out of the 24-hour window.
 * This prevents the max-3 cap from being inadvertently reset for un-fetched
 * entries.  ORDER BY created_at DESC, id makes the fetch deterministic so the
 * same matches are consistently retried rather than depending on storage order.
 */
export async function retryPendingNotifications(): Promise<void> {
  type OtherRow = { id: string; user1: string; user2: string };

  // ── 1. Prune stale retry counters (time-based, independent of fetch results) ─
  pruneRetryAttempts();

  // ── 2. Fetch all pending rows (one query per table, errors non-blocking) ─────
  let proposalPending: Array<{ id: string; user_id_1: string; user_id_2: string }> = [];
  try {
    const res = await db.execute<{ id: string; user_id_1: string; user_id_2: string }>(sql`
      SELECT id, user_id_1, user_id_2
      FROM proposal_matches
      WHERE notified_at IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC, id
      LIMIT 100
    `);
    proposalPending = res.rows;
  } catch (err) {
    matchingLogger.warn({ err }, "retryPendingNotifications: errore query proposal_matches");
  }

  const otherPending = new Map<RetryTableSpec, OtherRow[]>();
  for (const spec of RETRY_TABLE_SPECS) {
    try {
      const res = await db.execute<OtherRow>(sql`
        SELECT id,
               ${sql.raw(spec.user1Col)} AS user1,
               ${sql.raw(spec.user2Col)} AS user2
        FROM   ${sql.raw(spec.table)}
        WHERE  notified_at IS NULL
          AND  notification_priority = 'urgent'
          AND  created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC, id
        LIMIT  50
      `);
      otherPending.set(spec, res.rows);
    } catch (err) {
      matchingLogger.warn({ err, table: spec.table }, "retryPendingNotifications: errore query tabella");
    }
  }

  // ── 3. Retry proposal_matches via createNotification ─────────────────────────
  const title = it["push.proposalMatch.title"] ?? "Hai un nuovo match proposta! 🔥";
  const body  = it["push.proposalMatch.body"]  ?? "Una proposta compatibile è stata trovata per il tuo viaggio.";

  for (const row of proposalPending) {
    const key = `proposal_matches:${row.id}`;
    if (!canRetryMatch(key)) {
      if (markPermanentFailure(key)) {
        recordNotifFailed();
        matchingLogger.warn(
          { match_id: row.id, user_id: row.user_id_1, event: "notification_failed", permanent: true },
          "ProposalMatching: notifica permanentemente fallita (cap retry raggiunto)",
        );
        addMatchLog("WARN", "proposal_matching",
          `Notifica permanentemente fallita match ${row.id} (max tentativi raggiunti)`);
      }
      continue;
    }

    incrementRetryAttempt(key);
    try {
      await storage.createNotification({
        userId: row.user_id_1, title, body,
        notificationType: "proposal_match",
        referenceType: "proposal_match",
        referenceId: row.id,
      });
      await storage.createNotification({
        userId: row.user_id_2, title, body,
        notificationType: "proposal_match",
        referenceType: "proposal_match",
        referenceId: row.id,
      });
      await db.execute(sql`
        UPDATE proposal_matches SET notified_at = NOW()
        WHERE id = ${row.id} AND notified_at IS NULL
      `);
      recordNotifRetried();
      matchingLogger.info(
        { match_id: row.id, user_id: row.user_id_1 },
        "ProposalMatching: notifica ri-inviata (retry)",
      );
    } catch (retryErr) {
      recordNotifFailed();
      matchingLogger.warn(
        { err: retryErr, match_id: row.id, user_id: row.user_id_1 },
        "ProposalMatching: retry notifica fallita",
      );
      addMatchLog("WARN", "proposal_matching",
        `Retry notifica fallita match ${row.id}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
    }
  }

  // ── 4. Retry other tables via dispatchMatchNotification (urgent = sends now) ──
  for (const [spec, rows] of otherPending) {
    for (const row of rows) {
      const key = `${spec.table}:${row.id}`;
      if (!canRetryMatch(key)) {
        if (markPermanentFailure(key)) {
          recordNotifFailed();
          matchingLogger.warn(
            { match_id: row.id, user_id: row.user1, table: spec.table, event: "notification_failed", permanent: true },
            "Matching: notifica permanentemente fallita (cap retry raggiunto)",
          );
          addMatchLog("WARN", spec.table,
            `Notifica permanentemente fallita match ${row.id} (max tentativi raggiunti)`);
        }
        continue;
      }

      incrementRetryAttempt(key);
      try {
        await dispatchMatchNotification({
          table: spec.table,
          matchId: row.id,
          userIds: [row.user1, row.user2],
          priority: "urgent",
        });
        recordNotifRetried();
        matchingLogger.info(
          { match_id: row.id, table: spec.table },
          "Matching: notifica ri-inviata (retry)",
        );
      } catch (retryErr) {
        recordNotifFailed();
        matchingLogger.warn(
          { err: retryErr, match_id: row.id, user_id: row.user1, table: spec.table },
          "Matching: retry notifica fallita",
        );
      }
    }
  }
}
