/**
 * In-memory notification stats for the current matching cycle.
 *
 * Tracks:
 *  - sent:    notifications successfully delivered this cycle
 *  - failed:  notifications that threw an error and could not be sent
 *  - retried: notifications re-attempted for matches with notified_at IS NULL
 *
 * Retry attempts are tracked per matchId (composite key `table:id`) so the
 * max-3-attempts cap is enforced across cycles without adding schema columns.
 * The map is pruned by time (25h TTL) so entries for matches that have aged
 * out of the 24-hour retry window are cleaned up automatically — independently
 * of which subset was fetched in any given cycle.  This prevents the cap from
 * being accidentally reset just because a match didn't appear in a limited
 * LIMIT-N query result.
 */

export type NotificationCycleStats = {
  sent: number;
  failed: number;
  retried: number;
};

const MAX_RETRIES_PER_MATCH = 3;
/** TTL for retry-attempt entries: slightly beyond the 24-hour query window. */
const RETRY_ENTRY_TTL_MS = 25 * 60 * 60 * 1000;

type RetryEntry = { count: number; firstSeenAt: number };
const retryAttempts = new Map<string, RetryEntry>();

/**
 * Tracks keys that have already been logged/counted as permanently failed
 * (retry cap reached) so repeated cycles do not double-count them.
 * Pruned by the same TTL as retryAttempts.
 */
const permanentlyFailedKeys = new Map<string, number>(); // key → timestamp of first marking

let cycleStats: NotificationCycleStats = { sent: 0, failed: 0, retried: 0 };

/** Call at the start of a new matching cycle to zero out the per-cycle counters. */
export function resetNotificationCycleStats(): void {
  cycleStats = { sent: 0, failed: 0, retried: 0 };
}

export function recordNotifSent(): void {
  cycleStats.sent++;
}

export function recordNotifFailed(): void {
  cycleStats.failed++;
}

export function recordNotifRetried(): void {
  cycleStats.retried++;
}

/** Returns a snapshot of the current cycle counters. */
export function getNotificationCycleStats(): NotificationCycleStats {
  return { ...cycleStats };
}

/**
 * Returns true if the given key has not yet exceeded MAX_RETRIES_PER_MATCH.
 * The key is typically `"table:matchId"` to be unique across tables.
 */
export function canRetryMatch(key: string): boolean {
  return (retryAttempts.get(key)?.count ?? 0) < MAX_RETRIES_PER_MATCH;
}

/** Records one retry attempt for the given key. */
export function incrementRetryAttempt(key: string): void {
  const existing = retryAttempts.get(key);
  if (existing) {
    existing.count++;
  } else {
    retryAttempts.set(key, { count: 1, firstSeenAt: Date.now() });
  }
}

/**
 * Removes entries from the retry-attempt map that have exceeded the TTL.
 * Should be called once per matching cycle (before the retry loop) to prevent
 * unbounded growth.  Does NOT take a set-of-active-ids parameter — pruning is
 * purely time-based so counters for matches not included in a limited query
 * result are preserved until the match ages out of the 24-hour retry window.
 */
export function pruneRetryAttempts(): void {
  const cutoff = Date.now() - RETRY_ENTRY_TTL_MS;
  for (const [key, entry] of retryAttempts) {
    if (entry.firstSeenAt < cutoff) {
      retryAttempts.delete(key);
    }
  }
  for (const [key, ts] of permanentlyFailedKeys) {
    if (ts < cutoff) {
      permanentlyFailedKeys.delete(key);
    }
  }
}

/**
 * Marks a match key as permanently failed (retry cap reached).
 * Returns `true` the FIRST time the key is marked so the caller knows to
 * log and increment the failed counter.  Returns `false` on subsequent cycles
 * to prevent repeated double-counting of the same match.
 */
export function markPermanentFailure(key: string): boolean {
  if (permanentlyFailedKeys.has(key)) return false;
  permanentlyFailedKeys.set(key, Date.now());
  return true;
}
