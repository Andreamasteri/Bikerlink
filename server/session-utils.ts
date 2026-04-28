import { pool } from "./db";

// Cancella tutte le sessioni server-side per l'utente. La tabella `session`
// (connect-pg-simple) memorizza il payload come JSON nel campo `sess`.
// Errori DB vengono propagati: i caller devono fail-closed.
export async function revokeAllUserSessions(
  userId: string,
  options?: { excludeSid?: string },
): Promise<number> {
  if (!userId) return 0;
  const params: unknown[] = [userId];
  let where = "sess->>'userId' = $1";
  if (options?.excludeSid) {
    params.push(options.excludeSid);
    where += " AND sid <> $2";
  }
  const r = await pool.query(`DELETE FROM session WHERE ${where}`, params);
  return r.rowCount ?? 0;
}
