import { db } from "./db";
import { sql } from "drizzle-orm";

// Cancella tutte le sessioni server-side per l'utente. La tabella `session`
// (connect-pg-simple) memorizza il payload come JSON nel campo `sess`.
// Errori DB vengono propagati: i caller devono fail-closed.
export async function revokeAllUserSessions(
  userId: string,
  options?: { excludeSid?: string },
): Promise<number> {
  if (!userId) return 0;
  const r = options?.excludeSid
    ? await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId} AND sid <> ${options.excludeSid}`)
    : await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId}`);
  return (r.rowCount as number) ?? 0;
}
