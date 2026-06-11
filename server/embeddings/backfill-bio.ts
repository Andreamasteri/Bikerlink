import type { PoolClient } from "pg";
import { pool } from "../db";
import { upsertEmbedding } from "./store";
import { storage } from "../storage";

const DEFAULT_DELAY_MS = 500;
const DEFAULT_BATCH_SIZE = 50;

/**
 * Returns delay between embedding API calls in ms.
 * Configurable via AppSetting `bio_backfill_delay_ms` (integer >= 0, default 500).
 */
async function getDelayMs(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("bio_backfill_delay_ms");
    if (!setting?.value) return DEFAULT_DELAY_MS;
    const n = parseInt(setting.value, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS;
  } catch {
    return DEFAULT_DELAY_MS;
  }
}

/**
 * Returns how many users to process per run.
 * Configurable via AppSetting `bio_backfill_batch_size` (integer >= 1, default 50).
 */
async function getBatchSize(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("bio_backfill_batch_size");
    if (!setting?.value) return DEFAULT_BATCH_SIZE;
    const n = parseInt(setting.value, 10);
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_BATCH_SIZE;
  } catch {
    return DEFAULT_BATCH_SIZE;
  }
}

/**
 * Finds active users with a non-empty bio but a missing or stale 'bio' embedding.
 * "Stale" means the embedding's source_hash does not match sha256(trim(bio)).
 * Returns up to `limit` rows ordered by user creation date (oldest first).
 */
async function findUsersNeedingEmbedding(
  client: PoolClient,
  limit: number,
): Promise<Array<{ user_id: string; bio: string }>> {
  const result = await client.query<{ user_id: string; bio: string }>(
    `SELECT up.user_id, up.bio
     FROM user_profiles up
     JOIN users u ON u.id = up.user_id
     LEFT JOIN embeddings e
       ON e.entity_type = 'user'
      AND e.entity_id = up.user_id
      AND e.field = 'bio'
     WHERE u.status = 'active'
       AND up.bio IS NOT NULL
       AND trim(up.bio) != ''
       AND (
         e.id IS NULL
         OR e.source_hash IS NULL
         OR e.source_hash != encode(sha256(trim(up.bio)::bytea), 'hex')
       )
     ORDER BY u.created_at ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

/**
 * Boot-time fire-and-forget job that back-fills 'bio' embeddings for active
 * users who have a non-empty bio but no embedding (or a stale one).
 *
 * Rate-limited via `bio_backfill_delay_ms` AppSetting (default 500 ms between
 * calls) to avoid burning the embedding API budget.
 *
 * Also exported for use as a nightly scheduled job.
 */
export async function backfillBioEmbeddings(): Promise<{
  processed: number;
  backfilled: number;
  skipped: number;
  errors: number;
}> {
  const [delayMs, batchSize] = await Promise.all([getDelayMs(), getBatchSize()]);

  console.log(
    `[EMBED BACKFILL] Starting bio embedding back-fill` +
    ` (batchSize=${batchSize}, delayMs=${delayMs})`,
  );

  const client = await pool.connect();
  let rows: Array<{ user_id: string; bio: string }>;
  try {
    rows = await findUsersNeedingEmbedding(client, batchSize);
  } finally {
    client.release();
  }

  if (rows.length === 0) {
    console.log("[EMBED BACKFILL] No users need bio embedding back-fill — coverage is up to date.");
    return { processed: 0, backfilled: 0, skipped: 0, errors: 0 };
  }

  console.log(`[EMBED BACKFILL] Found ${rows.length} user(s) needing bio embedding.`);

  let backfilled = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { user_id, bio } = rows[i];
    try {
      const result = await upsertEmbedding("user", user_id, "bio", bio);
      if (result.cached) {
        skipped++;
      } else {
        backfilled++;
        if (backfilled % 10 === 0 || backfilled === 1) {
          console.log(
            `[EMBED BACKFILL] Progress: ${backfilled} back-filled` +
            ` (${i + 1}/${rows.length}, model=${result.model})`,
          );
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[EMBED BACKFILL] Failed to embed user ${user_id}: ${msg.slice(0, 120)}`);
    }

    if (delayMs > 0 && i < rows.length - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(
    `[EMBED BACKFILL] Done — backfilled=${backfilled} skipped=${skipped} errors=${errors}` +
    ` (total candidates=${rows.length})`,
  );

  return { processed: rows.length, backfilled, skipped, errors };
}
