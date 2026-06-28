// Task #2536 — Check pack: JSONB con shape non valida vs schema Zod.
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

interface JsonbColumnSpec {
  id: string;
  name: string;
  table: string;
  column: string;
  pkColumn: string;
  schema: z.ZodTypeAny;
  expensive?: boolean;
}

// Mappa colonna jsonb → schema Zod atteso. Volutamente lasco (passthrough)
// per non bocciare campi opzionali aggiunti nel tempo, ma rigido sui tipi base.
const matchPreferencesSchema = z.object({
  weights: z.record(z.string(), z.number()).optional(),
}).passthrough();

const scoreBreakdownSchema = z.object({
  final: z.number().min(-0.001).max(1.001).optional(),
}).passthrough();

const spokenLanguagesArraySchema = z.array(z.string().min(2).max(8));

const COLUMNS: JsonbColumnSpec[] = [
  { id: "jsonb-shapes/match-preferences", name: "match_preferences.weights coerente", table: "match_preferences", column: "weights", pkColumn: "id", schema: matchPreferencesSchema },
  { id: "jsonb-shapes/bz-score-breakdown", name: "biker_zavorrina_matches.score_breakdown", table: "biker_zavorrina_matches", column: "score_breakdown", pkColumn: "id", schema: scoreBreakdownSchema },
  { id: "jsonb-shapes/bb-score-breakdown", name: "biker_biker_matches.score_breakdown", table: "biker_biker_matches", column: "score_breakdown", pkColumn: "id", schema: scoreBreakdownSchema },
  { id: "jsonb-shapes/users-spoken-languages", name: "users.spoken_languages array", table: "users", column: "spoken_languages", pkColumn: "id", schema: spokenLanguagesArraySchema, expensive: true },
];

async function validateColumn(spec: JsonbColumnSpec): Promise<CheckResult> {
  if (!(await tableExists(spec.table))) return { ok: true, count: 0, sample: [], details: { skipped: "missing-table" } };
  // Verifica esistenza colonna.
  const colCheck = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM information_schema.columns
    WHERE table_name = ${spec.table} AND column_name = ${spec.column}
  `);
  if (!Number((colCheck.rows?.[0] as { c?: number } | undefined)?.c ?? 0)) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-column" } };
  }
  const limit = spec.expensive ? 5000 : 2000;
  const safeT = spec.table.replace(/[^a-z_]/g, "");
  const safeC = spec.column.replace(/[^a-z_]/g, "");
  const safePk = spec.pkColumn.replace(/[^a-z_]/g, "");
  const rowsRes = await db.execute(
    sql`SELECT ${sql.identifier(safePk)} AS pk, ${sql.identifier(safeC)} AS val FROM ${sql.identifier(safeT)} WHERE ${sql.identifier(safeC)} IS NOT NULL ORDER BY ${sql.identifier(safePk)} DESC LIMIT ${limit}`,
  );
  const rows = (rowsRes.rows ?? []) as Array<{ pk: string; val: unknown }>;
  const invalid: Array<{ pk: string; data: Record<string, unknown> }> = [];
  for (const r of rows) {
    const parsed = spec.schema.safeParse(r.val);
    if (!parsed.success) {
      invalid.push({
        pk: String(r.pk),
        data: { value: r.val, issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) },
      });
      if (invalid.length >= 10) break;
    }
  }
  // count totale richiede un altro pass; per economia approssimiamo con il sample (è una scan campione).
  // Se il sample è pieno, marchiamo count come "almeno N" via details.
  if (invalid.length === 0) return { ok: true, count: 0, sample: [], details: { sampled: rows.length } };
  return { ok: false, count: invalid.length, sample: invalid, details: { sampled: rows.length, note: invalid.length >= 10 ? "campione saturo; potrebbero esserci più violazioni" : undefined } };
}

const checks: IntegrityCheck[] = COLUMNS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  category: "jsonb-shapes",
  severity: "high",
  cost: spec.expensive ? "expensive" : "medium",
  expensive: spec.expensive,
  description: `Valida che ${spec.table}.${spec.column} rispetti lo schema Zod dichiarato.`,
  query: () => validateColumn(spec),
}));
export default checks;
