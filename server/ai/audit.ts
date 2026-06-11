// Audit log per le chiamate AI schedulate (proposer, digest, weekly-report,
// campaigns-self-check, backfill-bio). Ogni chiamata emette una riga [AI-AUDIT]
// e aggiorna ATOMICAMENTE un contatore JSONB giornaliero su app_settings.
// Il contatore è aggiornato con una singola INSERT ... ON CONFLICT DO UPDATE
// per evitare race-condition read-modify-write con chiamate concorrenti.
import { db } from "../db";
import { appSettings } from "@shared/db";
import { sql } from "drizzle-orm";

export interface AiUsageEntry {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  total: number;
  lastAt: string;
  lastTrigger?: string;
}

export interface AiTokenAuditData {
  subsystems: Record<string, AiUsageEntry>;
}

function todayKey(): string {
  return `ai_token_audit_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Logs one AI call and atomically increments the daily JSONB counter in
 * `app_settings` using a single INSERT … ON CONFLICT DO UPDATE statement.
 * Safe for concurrent callers — no read-modify-write race.
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
    // Initial value for INSERT (first call of the day for this subsystem).
    const initialJson = JSON.stringify({
      subsystems: {
        [subsystem]: {
          calls: 1,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          total,
          lastAt: now,
          lastTrigger: trigger ?? null,
        },
      },
    });

    // Atomic single-statement upsert: increments counters server-side via JSONB || merge.
    // ON CONFLICT merges the new subsystem entry into the existing subsystems object
    // without a read-round-trip, preventing lost updates under concurrent callers.
    await db.execute(sql`
      INSERT INTO app_settings (id, key, value_json, updated_at)
      VALUES (gen_random_uuid(), ${key}, ${initialJson}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET
        value_json = COALESCE(app_settings.value_json, '{"subsystems":{}}'::jsonb)
          || jsonb_build_object(
               'subsystems',
               COALESCE(app_settings.value_json->'subsystems', '{}'::jsonb)
               || jsonb_build_object(
                    ${subsystem}::text,
                    jsonb_build_object(
                      'calls',
                      COALESCE((app_settings.value_json->'subsystems'->${subsystem}->>'calls')::int, 0) + 1,
                      'tokensIn',
                      COALESCE((app_settings.value_json->'subsystems'->${subsystem}->>'tokensIn')::int, 0)
                        + ${usage.tokensIn}::int,
                      'tokensOut',
                      COALESCE((app_settings.value_json->'subsystems'->${subsystem}->>'tokensOut')::int, 0)
                        + ${usage.tokensOut}::int,
                      'total',
                      COALESCE((app_settings.value_json->'subsystems'->${subsystem}->>'total')::int, 0)
                        + ${total}::int,
                      'lastAt',   ${now}::text,
                      'lastTrigger', ${trigger ?? null}
                    )
                  )
             ),
        updated_at = now()
    `);
  } catch (err) {
    console.warn("[AI-AUDIT] error updating daily counter:", (err as Error).message);
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
    return row.value_json as AiTokenAuditData;
  } catch {
    return null;
  }
}
