/**
 * Dump completo (schema + dati) di un database PostgreSQL BikerLink.
 * Sola lettura. Lo schema è sempre incluso per intero (mai troncato), i dati
 * sono limitati a MAX_DB_CHARS dando priorità alle tabelle più piccole.
 */

import { Client } from "pg";
import { MAX_DB_CHARS, DB_CONNECT_TIMEOUT_MS } from "./config";

interface TableRowCount {
  table: string;
  rows: number;
}

/** Quota un identificatore SQL (doppi apici raddoppiati) per uso sicuro in query. */
function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * Schema COMPLETO di un DB da pg_catalog: colonne, constraint (PK/FK/UNIQUE/CHECK),
 * indici, enum e sequenze. Sempre incluso per intero (mai troncato), così il
 * confronto dev↔prod resta affidabile.
 */
async function dumpSchema(client: Client): Promise<string> {
  // 1. Colonne per tabella
  const cols = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);
  const byTable = new Map<string, string[]>();
  for (const r of cols.rows) {
    const line = `  ${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}${
      r.column_default ? ` DEFAULT ${r.column_default}` : ""
    }`;
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name)!.push(line);
  }
  const tableParts: string[] = [];
  for (const [table, lines] of [...byTable.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    tableParts.push(`TABLE ${table}\n${lines.join("\n")}`);
  }

  // 2. Constraint (PK/FK/UNIQUE/CHECK) via pg_constraint + pg_get_constraintdef
  const cons = await client.query<{ table_name: string; conname: string; def: string }>(`
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, conname
  `);
  const consPart = cons.rows.map((r) => `  ${r.table_name}.${r.conname}: ${r.def}`).join("\n");

  // 3. Indici
  const idx = await client.query<{ tablename: string; indexname: string; indexdef: string }>(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname
  `);
  const idxPart = idx.rows.map((r) => `  ${r.indexdef}`).join("\n");

  // 4. Enum
  const enums = await client.query<{ typname: string; labels: string }>(`
    SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname
  `);
  const enumPart = enums.rows.map((r) => `  ${r.typname} = {${r.labels}}`).join("\n");

  // 5. Sequenze
  const seq = await client.query<{ sequence_name: string }>(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public' ORDER BY sequence_name
  `);
  const seqPart = seq.rows.map((r) => `  ${r.sequence_name}`).join("\n");

  return [
    `### Tabelle e colonne (${byTable.size})\n${tableParts.join("\n\n")}`,
    `### Constraint (${cons.rows.length})\n${consPart || "  (nessuno)"}`,
    `### Indici (${idx.rows.length})\n${idxPart || "  (nessuno)"}`,
    `### Enum (${enums.rows.length})\n${enumPart || "  (nessuno)"}`,
    `### Sequenze (${seq.rows.length})\n${seqPart || "  (nessuna)"}`,
  ].join("\n\n");
}

/** Conteggio righe per tabella, dalla più piccola alla più grande. */
async function tableCounts(client: Client): Promise<TableRowCount[]> {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const counts: TableRowCount[] = [];
  for (const { table_name } of tables.rows) {
    try {
      const c = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quoteIdent(table_name)}`);
      counts.push({ table: table_name, rows: parseInt(c.rows[0]?.n ?? "0", 10) });
    } catch {
      counts.push({ table: table_name, rows: -1 });
    }
  }
  return counts.sort((a, b) => a.rows - b.rows);
}

function serializeVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}

/** Serializza i dati riga per riga, priorità tabelle piccole, budget MAX_DB_CHARS. */
async function dumpData(client: Client, counts: TableRowCount[]): Promise<string> {
  const parts: string[] = [];
  let used = 0;
  for (const { table, rows } of counts) {
    if (rows <= 0) {
      parts.push(`-- ${table}: ${rows === 0 ? "vuota" : "conteggio non disponibile"}`);
      continue;
    }
    if (used >= MAX_DB_CHARS) {
      parts.push(`-- ${table}: ${rows} righe [omesse: budget ${MAX_DB_CHARS} char esaurito]`);
      continue;
    }
    let res;
    try {
      res = await client.query(`SELECT * FROM ${quoteIdent(table)}`);
    } catch (err) {
      parts.push(`-- ${table}: errore lettura — ${(err as Error).message}`);
      continue;
    }
    const lines: string[] = [`-- ${table} (${rows} righe)`];
    let truncated = 0;
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i] as Record<string, unknown>;
      const serial = Object.entries(row)
        .map(([k, v]) => `${k}=${serializeVal(v)}`)
        .join(" | ");
      const line = `${table} | ${serial}`;
      if (used + line.length > MAX_DB_CHARS) {
        truncated = res.rows.length - i;
        break;
      }
      lines.push(line);
      used += line.length + 1;
    }
    if (truncated > 0) lines.push(`-- ...${truncated} righe troncate (budget esaurito)`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

/** Dump completo (schema + dati) di un DB. Ritorna messaggio di errore se irraggiungibile. */
export async function dumpDatabase(label: string, connString: string | undefined, noDb: boolean): Promise<string> {
  if (noDb) return `## DATABASE ${label}\n\n[saltato: --no-db]`;
  if (!connString) return `## DATABASE ${label}\n\n[non disponibile: variabile d'ambiente non impostata]`;
  const client = new Client({
    connectionString: connString,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    statement_timeout: 30_000,
  });
  try {
    await client.connect();
    const schema = await dumpSchema(client);
    const counts = await tableCounts(client);
    const data = await dumpData(client, counts);
    const summary = counts.map((c) => `${c.table}=${c.rows < 0 ? "?" : c.rows}`).join(", ");
    return (
      `## DATABASE ${label}\n\n` +
      `### Riepilogo righe per tabella\n${summary}\n\n` +
      `### Schema completo\n\`\`\`\n${schema}\n\`\`\`\n\n` +
      `### Dati (troncati a ${MAX_DB_CHARS} char, tabelle piccole prioritarie)\n\`\`\`\n${data}\n\`\`\``
    );
  } catch (err) {
    return `## DATABASE ${label}\n\n[non disponibile: ${(err as Error).message}]`;
  } finally {
    await client.end().catch(() => {});
  }
}
