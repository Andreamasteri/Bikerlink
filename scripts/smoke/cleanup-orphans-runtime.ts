/**
 * BikerLink — cleanup orfani smoke runtime.
 *
 * Funzione invocata da run-smoke.ts all'avvio per rimuovere utenti smoke
 * residui da run precedenti (cleanup per-run pulisce solo il proprio utente,
 * eventuali process kill mid-run lasciano leak). Estratta in file separato per
 * rispettare il ratchet 800 righe su run-smoke.ts.
 */

export async function cleanupOrphanSmokeUsers(): Promise<void> {
  if (process.env.SMOKE_CLEANUP_ORPHANS !== "1") return;
  const databaseUrl = process.env.DATABASE_URL_CANDIDATE ?? process.env.DATABASE_URL;
  if (!databaseUrl) return;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(
      "DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email ILIKE 'smoke+%@bikerlink.test')"
    );
    const r = await client.query(
      "DELETE FROM users WHERE email ILIKE 'smoke+%@bikerlink.test' OR nickname LIKE 'smoke%'"
    );
    if (r.rowCount && r.rowCount > 0) {
      console.log(`[smoke] cleanup orfani: rimossi ${r.rowCount} utenti smoke residui`);
    }
  } catch (e) {
    console.warn(`[smoke] cleanup orfani fallita (non bloccante): ${(e as Error).message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
