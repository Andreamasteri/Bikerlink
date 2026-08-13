/**
 * run-migrations-neon.ts — Task #996
 *
 * Esegue runMigrations() contro DATABASE_URL_DEV (Neon) per portare lo schema
 * al livello corrente. Usato per la verifica di boot su Neon prima del cutover.
 *
 * BIKERLINK_DEPLOY_ENV viene impostato prima dell'import; pool.ts risolve
 * esclusivamente DATABASE_URL_DEV.
 */

// Static imports are evaluated before any module body runs in ESM/TSX.
// Therefore this file contains NO top-level static imports of server modules.
// The explicit development target is set first; server/migrate (and server/db → pool.ts) are
// loaded via dynamic import() AFTER BIKERLINK_DEPLOY_ENV is set, so pool.ts picks up
// DATABASE_URL_DEV at module-load time.

async function main() {
  const neonUrl = process.env.DATABASE_URL_DEV;
  if (!neonUrl) {
    console.error("FATAL: DATABASE_URL_DEV non impostato.");
    process.exit(1);
  }

  // Select development BEFORE any dynamic import that touches pool.ts.
  process.env.BIKERLINK_DEPLOY_ENV = "development";

  const host = (() => { try { return new URL(neonUrl).hostname; } catch { return neonUrl; } })();
  console.log(`[run-migrations-neon] Target: ${host}`);
  console.log("[run-migrations-neon] Avvio runMigrations() su Neon...\n");

  // Dynamic import AFTER explicit environment selection — pool.ts will see DATABASE_URL_DEV
  const { runMigrations } = await import("../server/migrate");
  const { pool } = await import("../server/db");

  await runMigrations();
  console.log("\n[run-migrations-neon] ✓ runMigrations() completato senza errori.");

  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
}

main().catch((err) => {
  console.error("[run-migrations-neon] FAIL:", err);
  process.exit(1);
});
