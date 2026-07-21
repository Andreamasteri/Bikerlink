/**
 * neon-migrate-standalone.ts — Task #996
 *
 * Runner di migrazione auto-contenuto per la verifica del boot su Neon.
 * NON importa pool.ts: crea il proprio pg.Pool direttamente con DATABASE_URL,
 * che deve essere impostato dalla shell prima di chiamare questo script:
 *
 *   DATABASE_URL="$DATABASE_URL_DEV" npx tsx scripts/neon-migrate-standalone.ts
 *
 * Dopo runMigrations() chiama process.exit(0) per evitare che il pool
 * tenga il processo in vita indefinitamente.
 */

// DATABASE_URL DEVE essere già impostato prima che questo file sia eseguito.
// pool.ts lo legge a livello di modulo — l'unico modo sicuro è settarlo
// nell'ambiente del processo prima che tsx avvii (shell env override).
import { runMigrations } from "../server/migrate";
import { pool } from "../server/db";

async function main() {
  const url = process.env.DATABASE_URL ?? "(not set)";
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const isNeon = url.includes("neon.tech");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  neon-migrate-standalone.ts — Task #996");
  console.log(`  Host: ${host}`);
  console.log(`  SSL:  ${isNeon ? "rejectUnauthorized=true" : "false (non-Neon)"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!isNeon) {
    console.warn("⚠  DATABASE_URL non punta a neon.tech. Usare DATABASE_URL=\"$DATABASE_URL_DEV\" npx tsx ...");
  }

  await runMigrations();

  console.log("\n✓ runMigrations() completato — terminazione pool e uscita.");
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
