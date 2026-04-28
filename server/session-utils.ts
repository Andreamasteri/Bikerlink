import { pool } from "./db";

/**
 * Task #1121 (vuln 2): cancella tutte le sessioni server-side per un dato
 * utente. La tabella `session` (gestita da connect-pg-simple) salva il
 * payload della sessione come JSON nel campo `sess`; filtriamo per `userId`
 * estratto dal JSON.
 *
 * Usato dai flussi di password-reset (utente e admin) per invalidare ogni
 * sessione esistente: il sistema emette token Bearer long-lived (TTL 1 anno
 * con `rolling: true`), quindi senza questa pulizia un attacker che ha
 * sottratto un token resta autenticato anche dopo il reset password.
 *
 * Ritorna il numero di righe cancellate. Eventuali errori del DB vengono
 * loggati e PROPAGATI al caller (fail-closed): un fallimento silenzioso
 * lascerebbe il post-reset in uno stato inconsistente in cui la password
 * è cambiata ma le vecchie sessioni dell'attacker sono ancora valide.
 * I caller (reset-password, admin reset) devono trattare un'eccezione
 * come errore di flusso e rispondere 500, in modo che l'operatore possa
 * ritentare l'operazione.
 *
 * Opzionalmente è possibile preservare una specifica `excludeSid` (es. la
 * sessione del caller dopo che è già stata associata al nuovo userId) per
 * evitare di invalidare il login appena emesso.
 */
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
  try {
    const r = await pool.query(`DELETE FROM session WHERE ${where}`, params);
    return r.rowCount ?? 0;
  } catch (e) {
    console.error("[session-utils] revokeAllUserSessions failed for user", userId, e);
    throw e;
  }
}
