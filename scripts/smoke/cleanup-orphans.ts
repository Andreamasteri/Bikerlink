#!/usr/bin/env tsx
/**
 * BikerLink — Cleanup utenti smoke residui.
 *
 * Cancella tutti gli utenti con email LIKE 'smoke+%@bikerlink.test' rimasti nel
 * DB dai run dello smoke test precedenti alla correzione (task #2693). Le
 * dipendenze su `users` hanno ON DELETE CASCADE (vedi shared/db/*.ts), quindi
 * la DELETE su users propaga su tutto il grafo. Rimuoviamo esplicitamente
 * email_verification_tokens prima, perché in alcuni schemi non ha CASCADE.
 *
 * Variabili d'ambiente:
 *   DATABASE_URL          obbligatoria
 *   SMOKE_ALLOW_PROD=1    necessaria per girare contro un host di produzione
 */

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOW_PROD = process.env.SMOKE_ALLOW_PROD === "1";

if (!DATABASE_URL) {
  console.error("[cleanup-orphans] DATABASE_URL non impostata");
  process.exit(2);
}

function looksLikeProd(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /bikerlink\.(app|com|it)$/i.test(host) || /prod/i.test(host);
  } catch {
    return false;
  }
}

if (looksLikeProd(DATABASE_URL) && !ALLOW_PROD) {
  console.error("[cleanup-orphans] DATABASE_URL sembra di produzione. Imposta SMOKE_ALLOW_PROD=1 per forzare.");
  process.exit(2);
}

async function main(): Promise<void> {
  const pg = await import("pg");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const sel = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email ILIKE 'smoke+%@bikerlink.test' ORDER BY email",
    );
    console.log(`[cleanup-orphans] trovati ${sel.rowCount} utenti smoke residui`);
    if (sel.rowCount === 0) return;
    for (const row of sel.rows) console.log(`  - ${row.email} (${row.id})`);

    const ids = sel.rows.map(r => r.id);
    try {
      await client.query("DELETE FROM email_verification_tokens WHERE user_id = ANY($1::text[])", [ids]);
    } catch (e: unknown) {
      console.log(`[cleanup-orphans] nota: delete email_verification_tokens: ${e instanceof Error ? e.message : String(e)}`);
    }
    const del = await client.query("DELETE FROM users WHERE id = ANY($1::text[])", [ids]);
    console.log(`[cleanup-orphans] cancellati ${del.rowCount} utenti smoke`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[cleanup-orphans] errore fatale:", e?.message ?? e);
  process.exit(1);
});
