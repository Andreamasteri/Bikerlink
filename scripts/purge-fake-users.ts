/**
 * BikerLink — One-shot purge: Delete all fake/seed users from production
 *
 * Identification logic (OR — conservative, catches all three markers):
 *   WHERE is_fake = true
 *      OR email LIKE '%@fakeuser.bikerlink.it'
 *      OR invitation_code LIKE 'mass_seed%'
 *
 * All child tables have ON DELETE CASCADE or ON DELETE SET NULL — no manual
 * child cleanup needed. The DELETE from `users` cascades automatically.
 *
 * Dry-run includes per-table cascade counts for the main FK children.
 *
 * Usage:
 *   npx tsx scripts/purge-fake-users.ts           # dry-run (default, safe)
 *   npx tsx scripts/purge-fake-users.ts --apply   # write to DB
 *
 * Exit 0 → success
 * Exit 1 → error
 */

import { Pool } from "pg";

const DRY_RUN = !process.argv.includes("--apply");
const FAKE_EMAIL_DOMAIN = "@fakeuser.bikerlink.it";

interface FakeUserStats {
  total: string;
  by_is_fake: string;
  by_email_domain: string;
  by_invitation_code: string;
}

interface CascadeStats {
  user_photos: string;
  user_motorcycles: string;
  motorcycle_photos: string;
  user_profiles: string;
  user_devices: string;
  user_time_profile: string;
  conversations_as_participant: string;
  messages_sent: string;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[purge-fake-users] ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("[purge-fake-users] === BikerLink Fake User Purge Script ===");
    console.log("[purge-fake-users] Identification criteria (OR logic):");
    console.log(`[purge-fake-users]   1. is_fake = true`);
    console.log(`[purge-fake-users]   2. email LIKE '%${FAKE_EMAIL_DOMAIN}'`);
    console.log(`[purge-fake-users]   3. invitation_code LIKE 'mass_seed%'`);
    console.log(`[purge-fake-users] Mode: ${DRY_RUN ? "DRY-RUN (safe, no writes)" : "APPLY (writing to DB)"}`);
    console.log();

    const statsResult = await pool.query<FakeUserStats>(`
      SELECT
        COUNT(*)                                                       AS total,
        COUNT(*) FILTER (WHERE is_fake = true)                        AS by_is_fake,
        COUNT(*) FILTER (WHERE email LIKE $1)                         AS by_email_domain,
        COUNT(*) FILTER (WHERE invitation_code LIKE 'mass_seed%')     AS by_invitation_code
      FROM users
      WHERE is_fake = true
         OR email LIKE $1
         OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);

    const stats = statsResult.rows[0];
    const total = parseInt(stats.total ?? "0", 10);
    const byIsFake = parseInt(stats.by_is_fake ?? "0", 10);
    const byEmailDomain = parseInt(stats.by_email_domain ?? "0", 10);
    const byInvCode = parseInt(stats.by_invitation_code ?? "0", 10);

    console.log("[purge-fake-users] Scan results:");
    console.log(`  - Total fake users found (OR logic):          ${total}`);
    console.log(`  - Matched by is_fake = true:                  ${byIsFake}`);
    console.log(`  - Matched by email domain (@fakeuser.*):      ${byEmailDomain}`);
    console.log(`  - Matched by invitation_code (mass_seed%):    ${byInvCode}`);
    console.log();

    if (total === 0) {
      console.log("[purge-fake-users] RESULT: No fake users found — database is already clean.");
      console.log("[purge-fake-users] Exiting cleanly.");
      await pool.end();
      process.exit(0);
    }

    const idsResult = await pool.query<{ id: string }>(`
      SELECT id
      FROM users
      WHERE is_fake = true
         OR email LIKE $1
         OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);

    const ids = idsResult.rows.map(r => r.id);

    const cascadeResult = await pool.query<CascadeStats>(`
      SELECT
        COUNT(DISTINCT up.id)   FILTER (WHERE up.user_id = ANY($1::text[]))  AS user_photos,
        COUNT(DISTINCT um.id)   FILTER (WHERE um.user_id = ANY($1::text[]))  AS user_motorcycles,
        COUNT(DISTINCT mp.id)   FILTER (WHERE um2.user_id = ANY($1::text[])) AS motorcycle_photos,
        COUNT(DISTINCT upr.id)  FILTER (WHERE upr.user_id = ANY($1::text[])) AS user_profiles,
        COUNT(DISTINCT ud.id)   FILTER (WHERE ud.user_id = ANY($1::text[]))  AS user_devices,
        COUNT(DISTINCT utp.id)  FILTER (WHERE utp.user_id = ANY($1::text[])) AS user_time_profile,
        COUNT(DISTINCT cp.id)   FILTER (WHERE cp.user_id = ANY($1::text[]))  AS conversations_as_participant,
        COUNT(DISTINCT ms.id)   FILTER (WHERE ms.sender_id = ANY($1::text[])) AS messages_sent
      FROM users u
      LEFT JOIN user_photos up ON up.user_id = ANY($1::text[])
      LEFT JOIN user_motorcycles um ON um.user_id = ANY($1::text[])
      LEFT JOIN motorcycle_photos mp ON mp.motorcycle_id IN (
        SELECT id FROM user_motorcycles WHERE user_id = ANY($1::text[])
      )
      LEFT JOIN user_motorcycles um2 ON um2.user_id = ANY($1::text[])
      LEFT JOIN user_profiles upr ON upr.user_id = ANY($1::text[])
      LEFT JOIN user_devices ud ON ud.user_id = ANY($1::text[])
      LEFT JOIN user_time_profile utp ON utp.user_id = ANY($1::text[])
      LEFT JOIN conversation_participants cp ON cp.user_id = ANY($1::text[])
      LEFT JOIN messages ms ON ms.sender_id = ANY($1::text[])
      WHERE u.id = ANY($1::text[])
    `, [ids]);

    const cascade = cascadeResult.rows[0];

    console.log("[purge-fake-users] Cascade impact (child rows deleted automatically via FK CASCADE):");
    console.log(`  - user_photos:                 ${cascade.user_photos ?? 0}`);
    console.log(`  - user_motorcycles:            ${cascade.user_motorcycles ?? 0}`);
    console.log(`  - motorcycle_photos:           ${cascade.motorcycle_photos ?? 0}`);
    console.log(`  - user_profiles:               ${cascade.user_profiles ?? 0}`);
    console.log(`  - user_devices:                ${cascade.user_devices ?? 0}`);
    console.log(`  - user_time_profile:           ${cascade.user_time_profile ?? 0}`);
    console.log(`  - conversation_participants:   ${cascade.conversations_as_participant ?? 0}`);
    console.log(`  - messages (sender_id):        ${cascade.messages_sent ?? 0}`);
    console.log();

    if (DRY_RUN) {
      console.log(`[purge-fake-users] DRY-RUN: Would DELETE ${ids.length} user(s) from the 'users' table.`);
      console.log("[purge-fake-users] Child tables cleaned automatically via ON DELETE CASCADE.");
      console.log("[purge-fake-users] Run with --apply to execute the purge.");
      await pool.end();
      process.exit(0);
    }

    console.log(`[purge-fake-users] Executing DELETE for ${ids.length} fake user(s)...`);

    const deleteResult = await pool.query(
      `DELETE FROM users WHERE id = ANY($1::text[])`,
      [ids]
    );

    const deleted = deleteResult.rowCount ?? 0;

    console.log(`[purge-fake-users] DONE: Deleted ${deleted} row(s) from 'users'.`);
    console.log("[purge-fake-users] Child table rows purged automatically via ON DELETE CASCADE.");

    const verifyResult = await pool.query<{ remaining: string }>(`
      SELECT COUNT(*) AS remaining
      FROM users
      WHERE is_fake = true
         OR email LIKE $1
         OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);
    const remaining = parseInt(verifyResult.rows[0]?.remaining ?? "0", 10);
    console.log(`[purge-fake-users] Verify: ${remaining} fake user(s) remaining (expected: 0).`);
    console.log("[purge-fake-users] Purge complete.");

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[purge-fake-users] ERROR:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
