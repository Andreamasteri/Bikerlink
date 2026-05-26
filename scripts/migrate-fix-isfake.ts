/**
 * BikerLink — One-shot migration: Fix real users incorrectly marked as isFake=true
 *
 * After a mass seed operation, some real users may have been incorrectly marked
 * as isFake=true. This script identifies them using a three-layer rule:
 *
 * PRIMARY discriminator: email NOT ending in @fakeuser.bikerlink.it
 *   → All seeded fake users have this domain. Real users never do.
 *
 * SECONDARY discriminator: invitation_code IS NULL OR NOT LIKE 'mass_seed%'
 *   → All mass-seed users are tagged invitationCode='mass_seed_5k_v1'. Real users
 *     were not created by the seed process and have NULL or different codes.
 *
 * TERTIARY guard: email_verified=true OR last_login_at within last 30 days
 *   → Confirms the account was actively used. Filters out unactivated test accounts
 *     that may have been manually created with isFake=true intentionally.
 *
 * Together, these three layers are conservative and accurate:
 *   - Fake seed users: fake domain + seed tag → excluded by PRIMARY + SECONDARY
 *   - Unactivated manual fake accounts: no verified/login evidence → excluded by TERTIARY
 *   - Real registered users: real email + no seed tag + verified/active → caught by all three
 *
 * Non-admin, non-moderator accounts only.
 *
 * Usage:
 *   npx tsx scripts/migrate-fix-isfake.ts           # dry-run (default, safe)
 *   npx tsx scripts/migrate-fix-isfake.ts --apply   # write to DB
 *
 * Exit 0 → success
 * Exit 1 → error
 */

import { Pool } from "pg";

const DRY_RUN = !process.argv.includes("--apply");
const FAKE_EMAIL_DOMAIN = "@fakeuser.bikerlink.it";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[migrate-fix-isfake] ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("[migrate-fix-isfake] === BikerLink isFake Remediation Migration ===");
    console.log(`[migrate-fix-isfake] PRIMARY:   email NOT LIKE '%${FAKE_EMAIL_DOMAIN}'`);
    console.log("[migrate-fix-isfake] SECONDARY: invitation_code IS NULL OR NOT LIKE 'mass_seed%'");
    console.log("[migrate-fix-isfake] TERTIARY:  email_verified=true OR last_login >= 30 days ago");
    console.log(`[migrate-fix-isfake] Mode: ${DRY_RUN ? "DRY-RUN (safe, no writes)" : "APPLY (writing to DB)"}`);
    console.log();

    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

    const overlapCheck = await pool.query<{
      seed_tagged_count: string;
      fake_domain_count: string;
      candidate_count: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE invitation_code LIKE 'mass_seed%') AS seed_tagged_count,
        COUNT(*) FILTER (WHERE email LIKE $1) AS fake_domain_count,
        COUNT(*) FILTER (
          WHERE email NOT LIKE $1
            AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
            AND role NOT IN ('admin', 'moderator')
            AND (email_verified = true OR last_login_at >= $2)
        ) AS candidate_count
      FROM users
      WHERE is_fake = true
    `, [`%${FAKE_EMAIL_DOMAIN}`, thirtyDaysAgo]);

    const stats = overlapCheck.rows[0];
    const seedTaggedCount = parseInt(stats.seed_tagged_count ?? "0", 10);
    const fakeDomainCount = parseInt(stats.fake_domain_count ?? "0", 10);
    const candidateCount = parseInt(stats.candidate_count ?? "0", 10);

    console.log("[migrate-fix-isfake] Scan results (is_fake=true users):");
    console.log(`  - With seed tag (mass_seed%):              ${seedTaggedCount} → SAFE, not touched (SECONDARY guard)`);
    console.log(`  - With fake domain (${FAKE_EMAIL_DOMAIN}): ${fakeDomainCount} → SAFE, not touched (PRIMARY guard)`);
    console.log(`  - Candidates to fix (all 3 layers match):  ${candidateCount}`);
    console.log();

    if (candidateCount === 0) {
      console.log("[migrate-fix-isfake] RESULT: No real users incorrectly marked as isFake found.");
      console.log("[migrate-fix-isfake] Nothing to do — exiting cleanly.");
      await pool.end();
      process.exit(0);
    }

    const candidatesResult = await pool.query<{
      id: string;
      nickname: string;
      email: string;
      email_verified: boolean;
      last_login_at: Date | null;
      created_at: Date;
      invitation_code: string | null;
    }>(`
      SELECT id, nickname, email, email_verified, last_login_at, created_at, invitation_code
      FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE $1
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
        AND (email_verified = true OR last_login_at >= $2)
      ORDER BY last_login_at DESC NULLS LAST
    `, [`%${FAKE_EMAIL_DOMAIN}`, thirtyDaysAgo]);

    const candidates = candidatesResult.rows;

    console.log("[migrate-fix-isfake] Affected users:");
    for (const u of candidates) {
      console.log(`  - id=${u.id} nickname=${u.nickname} email=${u.email} verified=${u.email_verified} invCode=${u.invitation_code ?? "null"} lastLogin=${u.last_login_at?.toISOString() ?? "never"}`);
    }
    console.log();

    if (DRY_RUN) {
      console.log("[migrate-fix-isfake] DRY-RUN: Would set isFake=false for the above users.");
      console.log("[migrate-fix-isfake] Run with --apply to commit the fix.");
      await pool.end();
      process.exit(0);
    }

    const ids = candidates.map(u => u.id);
    const result = await pool.query<{ id: string; nickname: string }>(`
      UPDATE users
      SET is_fake = false
      WHERE id = ANY($1::text[])
      RETURNING id, nickname
    `, [ids]);

    console.log(`[migrate-fix-isfake] APPLIED: reset isFake=false for ${result.rowCount} user(s).`);
    for (const r of result.rows) {
      console.log(`  - fixed: id=${r.id} nickname=${r.nickname}`);
    }
    console.log();
    console.log("[migrate-fix-isfake] Migration complete.");

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[migrate-fix-isfake] ERROR:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
