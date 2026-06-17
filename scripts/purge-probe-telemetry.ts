/**
 * BikerLink — One-shot purge: Delete probe-* rows from ride_telemetry
 *
 * Before the probe auth-bypass fix, calls to the batch telemetry endpoint
 * attempted INSERTs with user_id = '__probe__' or session_id LIKE 'probe-%'.
 * Depending on FK constraint enforcement at the time, some rows may have been
 * written. This script removes any such residue.
 *
 * Identification criteria (OR logic):
 *   WHERE user_id = '__probe__'
 *      OR session_id LIKE 'probe-%'
 *
 * Usage:
 *   npx tsx scripts/purge-probe-telemetry.ts           # dry-run (default, safe)
 *   npx tsx scripts/purge-probe-telemetry.ts --apply   # write to DB
 *
 * Exit 0 → success (including "nothing to clean")
 * Exit 1 → error
 */

import { Pool } from "pg";

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[purge-probe-telemetry] ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("[purge-probe-telemetry] === BikerLink Probe Telemetry Purge ===");
    console.log("[purge-probe-telemetry] Identification criteria (OR logic):");
    console.log("[purge-probe-telemetry]   1. user_id = '__probe__'");
    console.log("[purge-probe-telemetry]   2. session_id LIKE 'probe-%'");
    console.log(`[purge-probe-telemetry] Mode: ${DRY_RUN ? "DRY-RUN (safe, no writes)" : "APPLY (writing to DB)"}`);
    console.log();

    const countResult = await pool.query<{
      probe_user_count: string;
      probe_session_count: string;
      total: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE user_id = '__probe__')       AS probe_user_count,
        COUNT(*) FILTER (WHERE session_id LIKE 'probe-%')  AS probe_session_count,
        COUNT(*)                                            AS total
      FROM ride_telemetry
      WHERE user_id = '__probe__'
         OR session_id LIKE 'probe-%'
    `);

    const row = countResult.rows[0];
    const total = parseInt(row.total ?? "0", 10);
    const byUserId = parseInt(row.probe_user_count ?? "0", 10);
    const bySessionId = parseInt(row.probe_session_count ?? "0", 10);

    console.log("[purge-probe-telemetry] Scan results:");
    console.log(`  - Total probe rows found:             ${total}`);
    console.log(`  - Matched by user_id = '__probe__':   ${byUserId}`);
    console.log(`  - Matched by session_id LIKE 'probe-%': ${bySessionId}`);
    console.log();

    if (total === 0) {
      console.log("[purge-probe-telemetry] RESULT: No probe rows found — database is already clean.");
      console.log("[purge-probe-telemetry] Exiting cleanly.");
      await pool.end();
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log(`[purge-probe-telemetry] DRY-RUN: Would DELETE ${total} row(s) from 'ride_telemetry'.`);
      console.log("[purge-probe-telemetry] Run with --apply to execute the purge.");
      await pool.end();
      process.exit(0);
    }

    console.log(`[purge-probe-telemetry] Executing DELETE for ${total} probe row(s)...`);

    const deleteResult = await pool.query(
      `DELETE FROM ride_telemetry WHERE user_id = '__probe__' OR session_id LIKE 'probe-%'`
    );

    const deleted = deleteResult.rowCount ?? 0;
    console.log(`[purge-probe-telemetry] DONE: Deleted ${deleted} row(s) from 'ride_telemetry'.`);

    const verifyResult = await pool.query<{ remaining: string }>(`
      SELECT COUNT(*) AS remaining
      FROM ride_telemetry
      WHERE user_id = '__probe__'
         OR session_id LIKE 'probe-%'
    `);
    const remaining = parseInt(verifyResult.rows[0]?.remaining ?? "0", 10);
    console.log(`[purge-probe-telemetry] Verify: ${remaining} probe row(s) remaining (expected: 0).`);

    if (remaining > 0) {
      console.error(`[purge-probe-telemetry] ERROR: ${remaining} rows still present after purge!`);
      await pool.end();
      process.exit(1);
    }

    console.log("[purge-probe-telemetry] Purge complete.");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[purge-probe-telemetry] ERROR:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
