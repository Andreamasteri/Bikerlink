/**
 * run-migrations-neon.ts — Task #996
 *
 * Esegue runMigrations() contro DATABASE_URL_DEV (Neon) per portare lo schema
 * al livello corrente. Usato per la verifica di boot su Neon prima del cutover.
 *
 * DATABASE_URL viene sovrascritto PRIMA di qualsiasi import che usa pool.ts,
 * così Pool viene creato con la stringa Neon.
 */

// Static imports are evaluated before any module body runs in ESM/TSX.
// Therefore this file contains NO top-level static imports of server modules.
// The env override happens first; server/migrate (and server/db → pool.ts) are
// loaded via dynamic import() AFTER DATABASE_URL is set, so pool.ts picks up
// the Neon URL at module-load time.

async function main() {
  const neonUrl = process.env.DATABASE_URL_DEV;
  if (!neonUrl) {
    console.error("FATAL: DATABASE_URL_DEV non impostato.");
    process.exit(1);
  }

  // Override BEFORE any dynamic import that touches pool.ts
  process.env.DATABASE_URL = neonUrl;

  const host = (() => { try { return new URL(neonUrl).hostname; } catch { return neonUrl; } })();
  console.log(`[run-migrations-neon] Target: ${host}`);
  console.log("[run-migrations-neon] Avvio runMigrations() su Neon...\n");

  // Dynamic import AFTER env override — pool.ts will see DATABASE_URL = Neon URL
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
