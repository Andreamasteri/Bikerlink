import { pool } from "../db";

/**
 * One-time deduplication script for the biker_biker_matches table.
 *
 * Before the unique index `biker_biker_symmetric_idx` was added, the same
 * biker pair + brand could appear multiple times. This script:
 *
 *  1. Keeps the oldest row per (LEAST(biker1_id,biker2_id),
 *     GREATEST(biker1_id,biker2_id), motorcycle_brand).
 *  2. Deletes every other row for that group.
 */
async function dedup() {
  const client = await pool.connect();
  try {
    // --- diagnostic: count before
    const before = await client.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM biker_biker_matches"
    );
    const totalBefore = parseInt(before.rows[0]?.total ?? "0", 10);

    const dupsBefore = await client.query<{ groups: string }>(`
      SELECT COUNT(*) AS groups FROM (
        SELECT 1
        FROM biker_biker_matches
        GROUP BY LEAST(biker1_id, biker2_id), GREATEST(biker1_id, biker2_id), motorcycle_brand
        HAVING COUNT(*) > 1
      ) sub
    `);
    const dupGroupsBefore = parseInt(dupsBefore.rows[0]?.groups ?? "0", 10);

    console.log(`[dedup] Before: ${totalBefore} total rows, ${dupGroupsBefore} duplicate groups`);

    if (dupGroupsBefore === 0) {
      console.log("[dedup] No duplicates found — nothing to do.");
      return;
    }

    await client.query("BEGIN");

    // Step 1 — delete all rows except the oldest per canonical pair + brand
    const deleteRes = await client.query(`
      DELETE FROM biker_biker_matches
      WHERE id NOT IN (
        SELECT DISTINCT ON (
          LEAST(biker1_id, biker2_id),
          GREATEST(biker1_id, biker2_id),
          motorcycle_brand
        ) id
        FROM biker_biker_matches
        ORDER BY
          LEAST(biker1_id, biker2_id),
          GREATEST(biker1_id, biker2_id),
          motorcycle_brand,
          created_at ASC
      )
    `);
    console.log(`[dedup] Deleted ${deleteRes.rowCount} duplicate rows`);

    await client.query("COMMIT");

    // --- diagnostic: count after
    const after = await client.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM biker_biker_matches"
    );
    const totalAfter = parseInt(after.rows[0]?.total ?? "0", 10);
    console.log(`[dedup] After: ${totalAfter} total rows`);
    console.log("[dedup] Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[dedup] Error — rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

dedup().catch((err) => {
  console.error("[dedup] Fatal:", err);
  process.exit(1);
});
