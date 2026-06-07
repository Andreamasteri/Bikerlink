// Task #3395 — Manifest/fingerprint canonico dello schema pubblico.
//
// Ogni ambiente (dev, prod) genera un manifest deterministico del proprio
// schema (tabelle + colonne + tipo + nullability, tutto ordinato) e un hash
// sha256 riepilogativo. Persistito in app_settings così dev e prod possono
// essere confrontati in modo esplicito e ispezionabile dal pannello admin:
// se i due hash combaciano, gli schemi sono allineati.
//
// La source-of-truth resta il registry Drizzle; il manifest serve a rendere il
// confronto cross-ambiente esplicito e deterministico (indipendente dall'ordine).
import { sql } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../../db";
import { storage } from "../../storage";
import { EXCLUDED_TABLES } from "./registry-introspect";

export const SCHEMA_MANIFEST_KEY = "schema_manifest_v1";

export interface ManifestColumn {
  name: string;
  type: string;
  nullable: boolean;
}
export interface ManifestTable {
  name: string;
  columns: ManifestColumn[];
}
export interface SchemaManifest {
  version: 1;
  environment: string;
  capturedAt: string;
  tableCount: number;
  columnCount: number;
  /** sha256 del corpo canonico (solo `tables`), indipendente da env/capturedAt. */
  hash: string;
  tables: ManifestTable[];
}

export function currentEnvironment(): string {
  if (process.env.REPLIT_DEPLOYMENT === "1") return "production";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

/**
 * Costruisce il manifest canonico interrogando information_schema.
 * Tabelle e colonne sono ordinate per nome → l'hash è deterministico e non
 * dipende dall'ordine di creazione delle colonne (ordinal_position).
 */
export async function generateSchemaManifest(): Promise<SchemaManifest> {
  const r = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);
  const rows = (r.rows ?? []) as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;

  const byTable = new Map<string, ManifestColumn[]>();
  for (const row of rows) {
    if (EXCLUDED_TABLES.has(row.table_name)) continue;
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
    byTable.get(row.table_name)!.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    });
  }

  const tables: ManifestTable[] = [...byTable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, cols]) => ({
      name,
      columns: cols.slice().sort((x, y) => x.name.localeCompare(y.name)),
    }));

  const columnCount = tables.reduce((n, t) => n + t.columns.length, 0);
  const canonicalBody = JSON.stringify(tables);
  const hash = createHash("sha256").update(canonicalBody).digest("hex");

  return {
    version: 1,
    environment: currentEnvironment(),
    capturedAt: new Date().toISOString(),
    tableCount: tables.length,
    columnCount,
    hash,
    tables,
  };
}

export async function persistSchemaManifest(m: SchemaManifest): Promise<void> {
  // 3° arg = valueJson (JSONB). Vedi memoria appsetting-valuejson.
  await storage.upsertAppSetting(SCHEMA_MANIFEST_KEY, undefined, m);
}

export async function loadPersistedManifest(): Promise<SchemaManifest | null> {
  const row = await storage.getAppSetting(SCHEMA_MANIFEST_KEY);
  const v = row?.valueJson as SchemaManifest | null | undefined;
  return v && typeof v === "object" && Array.isArray(v.tables) ? v : null;
}

/** Riepilogo leggero (senza il corpo `tables`) per lo status admin. */
export function manifestSummary(m: SchemaManifest | null) {
  if (!m) return null;
  return {
    version: m.version,
    environment: m.environment,
    capturedAt: m.capturedAt,
    tableCount: m.tableCount,
    columnCount: m.columnCount,
    hash: m.hash,
  };
}

/** Genera e persiste in un colpo solo; ritorna il manifest. */
export async function refreshSchemaManifest(): Promise<SchemaManifest> {
  const m = await generateSchemaManifest();
  await persistSchemaManifest(m);
  return m;
}
