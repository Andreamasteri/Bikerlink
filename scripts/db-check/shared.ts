/**
 * shared.ts — tipi, util e introspection condivisi dal generatore del report
 * di coerenza DB (scripts/generate-db-check-report.ts). Tutto READ-ONLY.
 */
import type { Pool } from "pg";

export interface ColRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  character_maximum_length: number | null;
  column_default: string | null;
}

export interface FkExpanded {
  constraint_name: string;
  child_table: string;
  parent_table: string;
  child_cols: string[];
  parent_cols: string[];
  child_col: string; // display (join ", ")
  parent_col: string;
}

export interface Actions {
  blocking: string[];
  important: string[];
  cosmetic: string[];
}

/** Contesto di introspezione raccolto una sola volta e passato a ogni sezione. */
export interface Ctx {
  nowIso: string;
  prodBaseline: string;
  tblCount: number;
  colCount: number;
  tableNames: string[];
  rowCounts: Map<string, number>;
  populated: [string, number][];
  totalRows: number;
  allCols: ColRow[];
  colsByTable: Map<string, ColRow[]>;
  pkTables: Set<string>;
  uniques: { table_name: string; constraint_name: string }[];
  uniqueIdx: { tablename: string; indexname: string; indexdef: string }[];
  checks: { tbl: string; conname: string; def: string }[];
  fks: FkExpanded[];
}

/** Escape del pipe per le celle di tabella markdown. */
export function md(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** Conteggio + fino a 5 esempi per una condizione WHERE su una tabella popolata. */
export async function countAndExamples(
  pool: Pool,
  rowCounts: Map<string, number>,
  table: string,
  whereSql: string,
  exampleCols: string,
): Promise<{ cnt: number; examples: Record<string, unknown>[] }> {
  const rows = rowCounts.get(table) ?? 0;
  if (rows <= 0) return { cnt: 0, examples: [] };
  const c = await pool.query<{ n: string }>(
    `SELECT count(*) n FROM "${table}" WHERE ${whereSql}`,
  );
  const cnt = Number(c.rows[0].n);
  let examples: Record<string, unknown>[] = [];
  if (cnt > 0) {
    const e = await pool.query(
      `SELECT ${exampleCols} FROM "${table}" WHERE ${whereSql} LIMIT 5`,
    );
    examples = e.rows as Record<string, unknown>[];
  }
  return { cnt, examples };
}

/** Raccoglie tutta l'introspezione schema/dati dal DB dev in un unico Ctx. */
export async function collectIntrospection(
  pool: Pool,
  nowIso: string,
  prodBaseline: string,
): Promise<Ctx> {
  const tblCount = (
    await pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    )
  ).rows[0].n;
  const colCount = (
    await pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public'`,
    )
  ).rows[0].n;

  const tableNames = (
    await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name);

  const rowCounts = new Map<string, number>();
  for (const t of tableNames) {
    try {
      const r = await pool.query<{ n: string }>(`SELECT count(*) n FROM "${t}"`);
      rowCounts.set(t, Number(r.rows[0].n));
    } catch {
      rowCounts.set(t, -1);
    }
  }
  const populated = [...rowCounts.entries()].filter(([, n]) => n > 0);
  const totalRows = [...rowCounts.values()].reduce((a, b) => a + (b > 0 ? b : 0), 0);

  const allCols = (
    await pool.query<ColRow>(
      `SELECT table_name, column_name, data_type, is_nullable,
              character_maximum_length, column_default
       FROM information_schema.columns
       WHERE table_schema='public'
       ORDER BY table_name, ordinal_position`,
    )
  ).rows;

  const pks = (
    await pool.query<{ table_name: string; n: number }>(
      `SELECT tc.table_name, count(*)::int n
       FROM information_schema.table_constraints tc
       WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
       GROUP BY tc.table_name`,
    )
  ).rows;
  const pkTables = new Set(pks.map((r) => r.table_name));

  const uniques = (
    await pool.query<{ table_name: string; constraint_name: string }>(
      `SELECT table_name, constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema='public' AND constraint_type='UNIQUE'
       ORDER BY table_name, constraint_name`,
    )
  ).rows;

  const uniqueIdx = (
    await pool.query<{ tablename: string; indexname: string; indexdef: string }>(
      `SELECT tablename, indexname, indexdef FROM pg_indexes
       WHERE schemaname='public' AND indexdef ILIKE '%CREATE UNIQUE INDEX%'
       ORDER BY tablename, indexname`,
    )
  ).rows;

  const checks = (
    await pool.query<{ tbl: string; conname: string; def: string }>(
      `SELECT rel.relname tbl, con.conname, pg_get_constraintdef(con.oid) def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid=con.conrelid
       JOIN pg_namespace n ON n.oid=rel.relnamespace
       WHERE n.nspname='public' AND con.contype='c'
       ORDER BY tbl, con.conname`,
    )
  ).rows;

  // FK via pg_catalog: conkey[]/confkey[] preservano l'accoppiamento posizionale
  // figlio↔parent (composite-FK safe; information_schema NON lo garantisce).
  const fks = (
    await pool.query<
      Omit<FkExpanded, "child_col" | "parent_col"> & {
        child_cols: string[];
        parent_cols: string[];
      }
    >(
      `SELECT con.conname AS constraint_name,
              child.relname  AS child_table,
              parent.relname AS parent_table,
              (SELECT array_agg(a.attname::text ORDER BY x.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum) AS child_cols,
              (SELECT array_agg(a.attname::text ORDER BY x.ord)
                 FROM unnest(con.confkey) WITH ORDINALITY AS x(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = x.attnum) AS parent_cols
       FROM pg_constraint con
       JOIN pg_class child  ON child.oid  = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace n  ON n.oid = child.relnamespace
       WHERE n.nspname='public' AND con.contype='f'
       ORDER BY child.relname, con.conname`,
    )
  ).rows.map(
    (r): FkExpanded => ({
      ...r,
      child_col: r.child_cols.join(", "),
      parent_col: r.parent_cols.join(", "),
    }),
  );

  const colsByTable = new Map<string, ColRow[]>();
  for (const c of allCols) {
    if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
    colsByTable.get(c.table_name)!.push(c);
  }

  return {
    nowIso,
    prodBaseline,
    tblCount,
    colCount,
    tableNames,
    rowCounts,
    populated,
    totalRows,
    allCols,
    colsByTable,
    pkTables,
    uniques,
    uniqueIdx,
    checks,
    fks,
  };
}
