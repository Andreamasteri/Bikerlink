import { pool, withDbRetry } from "../db";
import { withBgDbSlot } from "../lib/bg-db-limiter";
import fs from "fs";
import path from "path";

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableSnapshot {
  [tableName: string]: ColumnInfo[];
}

export interface SchemaSnapshot {
  capturedAt: string;
  tables: TableSnapshot;
}

export async function captureSchemaSnapshot(): Promise<SchemaSnapshot> {
  const client = await pool.connect();
  try {
    const result = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const tables: TableSnapshot = {};
    for (const row of result.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push({
        column_name: row.column_name,
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
      });
    }

    return { capturedAt: new Date().toISOString(), tables };
  } finally {
    client.release();
  }
}

export async function saveSchemaSnapshot(): Promise<void> {
  try {
    // Job di boot/manutenzione: la query su information_schema è pesante in prod
    // (vedi db-integrity schema-registry). Passa dal budget connessioni dei job
    // in background così non compete col traffico utente, e ritenta i blip
    // transitori invece di fallire al primo errore di connessione.
    const snapshot = await withBgDbSlot(() => withDbRetry(() => captureSchemaSnapshot()));
    const dataDir = path.resolve(process.cwd(), "server", "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const snapshotPath = path.join(dataDir, "schema-snapshot.json");
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
    console.log(`[SchemaSnapshot] Saved ${Object.keys(snapshot.tables).length} tables to ${snapshotPath}`);
  } catch (err) {
    console.warn("[SchemaSnapshot] Failed to save schema snapshot (non-fatal):", err);
  }
}

export function loadSchemaSnapshot(): SchemaSnapshot | null {
  try {
    const snapshotPath = path.resolve(process.cwd(), "server", "data", "schema-snapshot.json");
    if (!fs.existsSync(snapshotPath)) return null;
    return JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as SchemaSnapshot;
  } catch {
    return null;
  }
}

export interface SchemaDiff {
  addedTables: string[];
  removedTables: string[];
  modifiedTables: {
    tableName: string;
    addedColumns: string[];
    removedColumns: string[];
    changedColumns: Array<{ column: string; from: Partial<ColumnInfo>; to: Partial<ColumnInfo> }>;
  }[];
}

export function diffSchemas(previous: SchemaSnapshot, current: SchemaSnapshot): SchemaDiff {
  const prevTables = new Set(Object.keys(previous.tables));
  const currTables = new Set(Object.keys(current.tables));

  const addedTables = [...currTables].filter((t) => !prevTables.has(t));
  const removedTables = [...prevTables].filter((t) => !currTables.has(t));
  const commonTables = [...currTables].filter((t) => prevTables.has(t));

  const modifiedTables: SchemaDiff["modifiedTables"] = [];

  for (const tableName of commonTables) {
    const prevCols = new Map(previous.tables[tableName].map((c) => [c.column_name, c]));
    const currCols = new Map(current.tables[tableName].map((c) => [c.column_name, c]));

    const addedColumns = [...currCols.keys()].filter((c) => !prevCols.has(c));
    const removedColumns = [...prevCols.keys()].filter((c) => !currCols.has(c));
    const changedColumns: SchemaDiff["modifiedTables"][number]["changedColumns"] = [];

    for (const colName of currCols.keys()) {
      if (!prevCols.has(colName)) continue;
      const prev = prevCols.get(colName)!;
      const curr = currCols.get(colName)!;
      if (prev.data_type !== curr.data_type || prev.is_nullable !== curr.is_nullable) {
        changedColumns.push({
          column: colName,
          from: { data_type: prev.data_type, is_nullable: prev.is_nullable },
          to: { data_type: curr.data_type, is_nullable: curr.is_nullable },
        });
      }
    }

    if (addedColumns.length > 0 || removedColumns.length > 0 || changedColumns.length > 0) {
      modifiedTables.push({ tableName, addedColumns, removedColumns, changedColumns });
    }
  }

  return { addedTables, removedTables, modifiedTables };
}
