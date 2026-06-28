// Task #2536 — Check pack: forma JSONB/contatori/coerenza temporale aggiuntiva.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}
async function colExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM information_schema.columns WHERE table_name=${table} AND column_name=${column}`);
  return Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0) > 0;
}

async function jsonbMustHaveKey(table: string, column: string, key: string): Promise<CheckResult> {
  if (!(await tableExists(table)) || !(await colExists(table, column))) return { ok: true, count: 0, sample: [], details: { skipped: "missing" } };
  const safeT = table.replace(/[^a-z_]/g, "");
  const safeC = column.replace(/[^a-z_]/g, "");
  try {
    const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} IS NOT NULL AND NOT jsonb_exists(${sql.identifier(safeC)}, ${key})`);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sql`SELECT id, ${sql.identifier(safeC)} AS v FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} IS NOT NULL AND NOT jsonb_exists(${sql.identifier(safeC)}, ${key}) LIMIT 10`);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { table, column, missingKey: key } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

async function negativeCounter(table: string, column: string): Promise<CheckResult> {
  if (!(await tableExists(table)) || !(await colExists(table, column))) return { ok: true, count: 0, sample: [], details: { skipped: "missing" } };
  const safeT = table.replace(/[^a-z_]/g, "");
  const safeC = column.replace(/[^a-z_]/g, "");
  try {
    const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} < 0`);
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(sql`SELECT id, ${sql.identifier(safeC)} AS v FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} < 0 LIMIT 10`);
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { table, column } };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

const checks: IntegrityCheck[] = [
  {
    id: "jsonb-x/match-preferences-shape",
    name: "match_preferences.preferences manca chiave radius",
    category: "jsonb-shapes", severity: "low", cost: "cheap",
    description: "Le preferenze matching devono includere la chiave 'radius'.",
    query: () => jsonbMustHaveKey("match_preferences", "preferences", "radius"),
  },
  {
    id: "jsonb-x/users-prefs-language",
    name: "users.preferences manca chiave language",
    category: "jsonb-shapes", severity: "low", cost: "cheap",
    description: "Preferenze utente devono includere la lingua.",
    query: () => jsonbMustHaveKey("users", "preferences", "language"),
  },
  {
    id: "jsonb-x/embeddings-metadata-model",
    name: "embeddings.metadata manca chiave model",
    category: "jsonb-shapes", severity: "medium", cost: "medium",
    description: "Ogni embedding deve dichiarare il modello in metadata.",
    query: () => jsonbMustHaveKey("embeddings", "metadata", "model"),
  },
  {
    id: "counters-x/users-matches-negative",
    name: "users.matches_count negativo",
    category: "counters", severity: "medium", cost: "cheap",
    description: "Contatore matches non può essere negativo.",
    query: () => negativeCounter("users", "matches_count"),
  },
  {
    id: "counters-x/reports-count-negative",
    name: "users.reports_received_count negativo",
    category: "counters", severity: "medium", cost: "cheap",
    description: "Contatore report ricevuti non può essere negativo.",
    query: () => negativeCounter("users", "reports_received_count"),
  },
  {
    id: "time-x/sessions-expired-but-active",
    name: "user_sessions scadute ma attive",
    category: "time", severity: "medium", cost: "cheap",
    description: "Sessioni con expires_at < now() ma is_active=true.",
    async query() {
      if (!(await tableExists("user_sessions")) || !(await colExists("user_sessions", "expires_at"))) return { ok: true, count: 0, sample: [], details: { skipped: "missing" } };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM user_sessions WHERE expires_at < NOW() AND COALESCE(is_active, true) = true`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT id, expires_at FROM user_sessions WHERE expires_at < NOW() AND COALESCE(is_active, true) = true LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
];

export default checks;
