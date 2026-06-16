// Audit log per le chiamate AI schedulate (proposer, digest, weekly-report,
// campaigns-self-check, backfill-bio). Ogni chiamata emette una riga [AI-AUDIT]
// e aggiorna il contatore JSONB giornaliero su app_settings.
//
// Strategia di concorrenza: advisory lock pg_advisory_xact_lock(hashtext(key)).
// A differenza di SELECT…FOR UPDATE, l'advisory lock serializza anche i writer
// che arrivano PRIMA che la riga esista (primo inserimento del giorno), eliminando
// la race condition "entrambi leggono NULL, entrambi inseriscono da zero".
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface AiUsageEntry {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  total: number;
  lastAt: string;
  lastTrigger?: string | null;
}

export interface AiTokenAuditData {
  subsystems: Record<string, AiUsageEntry>;
}

function todayKey(): string {
  return `ai_token_audit_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Estrae il messaggio di errore reale da un DrizzleQueryError o da un errore generico.
 * DrizzleQueryError wrappa l'errore postgres in .cause — il .message contiene solo la
 * query SQL completa, non l'errore postgres effettivo.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) return cause.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parsa in modo sicuro il valore JSONB da app_settings.
 * Restituisce { subsystems: {} } se il valore è assente, null, non un oggetto,
 * o non ha la chiave "subsystems" — il contatore riparte da zero invece di
 * bloccare la scrittura con un errore silenzioso.
 */
function parseSafeAuditData(raw: unknown): AiTokenAuditData {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "subsystems" in raw &&
    raw.subsystems &&
    typeof raw.subsystems === "object" &&
    !Array.isArray(raw.subsystems)
  ) {
    return raw as AiTokenAuditData;
  }
  return { subsystems: {} };
}

/**
 * Logs one AI call and atomically increments the daily JSONB counter in
 * `app_settings`.
 *
 * Concurrency strategy: acquire an exclusive transaction-scoped advisory lock
 * on hashtext(key) BEFORE reading the row. This serializes all concurrent
 * writers for the same day-key even when the row does not yet exist, preventing
 * the first-insert-of-the-day lost-update race that SELECT…FOR UPDATE cannot fix.
 *
 * Lock is released automatically when the transaction ends.
 */
export async function logAiUsage(
  subsystem: string,
  model: string,
  usage: { tokensIn: number; tokensOut: number },
  trigger?: string,
): Promise<void> {
  const total = usage.tokensIn + usage.tokensOut;
  const now = new Date().toISOString();
  console.info(
    `[AI-AUDIT] subsystem=${subsystem} model=${model}` +
    ` tokensIn=${usage.tokensIn} tokensOut=${usage.tokensOut} total=${total}` +
    (trigger ? ` trigger=${trigger}` : ""),
  );

  try {
    const key = todayKey();

    await db.transaction(async (tx) => {
      // Acquire an exclusive advisory lock scoped to this transaction.
      // hashtext() maps the string key to a 32-bit int (pg_advisory_xact_lock
      // takes bigint; passing a 32-bit int is fine — postgres widens it).
      // Any concurrent transaction that calls this with the same key will
      // block here until the current transaction commits or rolls back.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);

      // Safe to read — no other writer for this key can be in this section.
      const rows = await tx.execute<{ value_json: unknown }>(
        sql`SELECT value_json FROM app_settings WHERE key = ${key} LIMIT 1`,
      );
      const existing = rows.rows?.[0]?.value_json;

      // Merge in-memory — fall back to empty structure if JSON is invalid/absent.
      const current = parseSafeAuditData(existing);
      const prev = current.subsystems[subsystem];

      current.subsystems[subsystem] = {
        calls: (prev?.calls ?? 0) + 1,
        tokensIn: (prev?.tokensIn ?? 0) + usage.tokensIn,
        tokensOut: (prev?.tokensOut ?? 0) + usage.tokensOut,
        total: (prev?.total ?? 0) + total,
        lastAt: now,
        lastTrigger: trigger ?? null,
      };

      const jsonValue = JSON.stringify(current);

      // Simple upsert with the already-merged value — no complex server-side
      // JSONB path operations that risk PostgreSQL type-inference errors.
      await tx.execute(sql`
        INSERT INTO app_settings (id, key, value_json, updated_at)
        VALUES (gen_random_uuid(), ${key}, ${jsonValue}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET
          value_json = ${jsonValue}::jsonb,
          updated_at = now()
      `);
    });
  } catch (err) {
    console.warn("[AI-AUDIT] error updating daily counter:", extractErrorMessage(err));
  }
}

export async function getAiTokenAudit(date?: string): Promise<AiTokenAuditData | null> {
  try {
    const key = date ? `ai_token_audit_${date}` : todayKey();
    const rows = await db.execute<{ value_json: unknown }>(
      sql`SELECT value_json FROM app_settings WHERE key = ${key} LIMIT 1`,
    );
    const row = rows.rows?.[0];
    if (!row?.value_json) return { subsystems: {} };
    return parseSafeAuditData(row.value_json);
  } catch {
    return null;
  }
}
