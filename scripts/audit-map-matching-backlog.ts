/**
 * Read-only audit of the map-matching backlog.
 *
 * It identifies the users and sessions behind pending/retry telemetry.
 * It never updates or deletes production data.
 *
 * Usage:
 *   npx tsx scripts/audit-map-matching-backlog.ts
 *   DATABASE_URL=... npx tsx scripts/audit-map-matching-backlog.ts --json
 */
import { Pool } from "pg";

const json = process.argv.includes("--json");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL non configurato: audit non eseguito.");
  process.exit(2);
}

const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();
try {
  const summary = await client.query(`
    SELECT
      COUNT(*)::int AS samples,
      COUNT(DISTINCT rt.session_id)::int AS sessions,
      COUNT(DISTINCT rt.user_id)::int AS users,
      COUNT(*) FILTER (WHERE rt.match_status = 'pending')::int AS pending_samples,
      COUNT(*) FILTER (WHERE rt.match_status = 'retry')::int AS retry_samples,
      MIN(rt.created_at) AS oldest_created_at,
      MAX(rt.created_at) AS newest_created_at
    FROM ride_telemetry rt
    WHERE rt.match_status IN ('pending', 'retry')
  `);
  const users = await client.query(`
    SELECT
      rt.user_id,
      u.nickname,
      u.email,
      u.status AS user_status,
      u.is_fake,
      u.is_system,
      u.last_login_at,
      COUNT(DISTINCT rt.session_id)::int AS sessions,
      COUNT(*)::int AS samples,
      MIN(rt.created_at) AS oldest_created_at,
      MAX(rt.created_at) AS newest_created_at,
      COUNT(*) FILTER (WHERE rt.match_status = 'pending')::int AS pending_samples,
      COUNT(*) FILTER (WHERE rt.match_status = 'retry')::int AS retry_samples
    FROM ride_telemetry rt
    LEFT JOIN users u ON u.id = rt.user_id
    WHERE rt.match_status IN ('pending', 'retry')
    GROUP BY rt.user_id, u.nickname, u.email, u.status, u.is_fake, u.is_system, u.last_login_at
    ORDER BY sessions DESC, newest_created_at ASC
  `);
  const sessions = await client.query(`
    SELECT
      rt.user_id,
      COALESCE(u.nickname, '[utente eliminato]') AS nickname,
      rt.session_id,
      COUNT(*)::int AS samples,
      MIN(rt.created_at) AS created_at,
      MAX(rt.created_at) AS updated_at,
      MIN(rt.match_status) AS match_status,
      MAX(rt.match_attempts)::int AS attempts
    FROM ride_telemetry rt
    LEFT JOIN users u ON u.id = rt.user_id
    WHERE rt.match_status IN ('pending', 'retry')
    GROUP BY rt.user_id, u.nickname, rt.session_id
    ORDER BY updated_at ASC
  `);
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: summary.rows[0],
    users: users.rows,
    sessions: sessions.rows,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("MAP-MATCHING BACKLOG — AUDIT SOLA LETTURA");
    console.table([report.summary]);
    console.table(report.users);
    console.log(`Sessioni dettagliate: ${report.sessions.length}`);
    console.log("Per eliminare o archiviare serve una decisione separata: questo comando non modifica nulla.");
  }
} finally {
  client.release();
  await pool.end();
}
