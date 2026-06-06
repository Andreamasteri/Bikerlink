/**
 * route-provider-stats.ts
 *
 * Traccia il numero di parse AI completati con successo per provider,
 * aggregati per giorno negli ultimi 7 giorni.
 *
 * Strategia: una chiave app_settings per giorno (`ai_parse_stats_YYYY-MM-DD`)
 * con valueJson = { ollama: N, groq: N, gemini: N, openai: N }.
 * L'incremento usa un UPDATE atomico SQL (jsonb_set + COALESCE) per evitare
 * race-condition tra richieste concorrenti.
 *
 * Fire-and-forget: il chiamante non deve attendere l'esito — un fallimento
 * di tracciamento non deve rompere il flow principale.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const KEY_PREFIX = "ai_parse_stats_";

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${KEY_PREFIX}${yyyy}-${mm}-${dd}`;
}

/**
 * Incrementa atomicamente il contatore del provider per il giorno corrente.
 * Fire-and-forget: eventuali errori vengono loggati ma non propagati.
 */
export function incrementProviderStat(provider: string): void {
  const key = todayKey();
  // Atomic upsert con jsonb_set lato DB — no read-modify-write in JS.
  db.execute(sql`
    INSERT INTO app_settings (id, key, value_json, updated_at)
    VALUES (gen_random_uuid(), ${key}, jsonb_build_object(${provider}, 1), NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      value_json = jsonb_set(
        COALESCE(app_settings.value_json, '{}'::jsonb),
        ARRAY[${provider}::text],
        to_jsonb(COALESCE((app_settings.value_json->>${provider})::bigint, 0) + 1)
      ),
      updated_at = NOW()
  `).catch((err: unknown) => {
    console.warn("[route-provider-stats] incrementProviderStat error:", (err as Error)?.message ?? err);
  });
}

export interface ProviderStatRow {
  provider: string;
  count: number;
}

/**
 * Legge e aggrega i contatori degli ultimi 7 giorni da app_settings.
 * Restituisce un array ordinato per count decrescente.
 */
export async function getProviderStats7Days(): Promise<ProviderStatRow[]> {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    days.push(`${KEY_PREFIX}${yyyy}-${mm}-${dd}`);
  }

  const result = await db.execute(sql`
    SELECT key, value_json
    FROM app_settings
    WHERE key = ANY(${days}::text[])
  `);

  const totals: Record<string, number> = {};
  for (const row of result.rows as { key: string; value_json: unknown }[]) {
    const json = row.value_json as Record<string, number> | null;
    if (!json || typeof json !== "object") continue;
    for (const [provider, count] of Object.entries(json)) {
      totals[provider] = (totals[provider] ?? 0) + Number(count);
    }
  }

  return Object.entries(totals)
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count);
}
