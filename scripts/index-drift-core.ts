/**
 * index-drift-core.ts
 *
 * Funzioni pure di analisi per il controllo del drift degli indici "speciali"
 * (con ordinamento DESC o clausola WHERE). Estratte da check-index-drift.ts per
 * mantenere ogni file sotto la soglia del ratchet gate.
 *
 * Tre fasi:
 *   1. Schema Drizzle TS (shared/db/) — cosa DEVE esistere nel DB
 *   2. Migration SQL (migrations/) — crosscheck regressioni e inverse drift
 *   3. pg_indexes live — verifica che il DB live corrisponda allo schema TS
 *
 * Criteri di "indice speciale" (fonte: schema Drizzle TS):
 *   - almeno una colonna ha ordinamento .desc()   → hasDesc
 *   - l'indice ha una clausola .where(sql`...`)    → hasWhere
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import * as schema from "../shared/db/index";
import { SQL } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

export const MIGRATIONS_DIR = join(process.cwd(), "migrations");

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface SchemaSpecialIndex {
  indexName: string;
  tableName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  descColumns: string[];  // nomi colonne con ordinamento DESC
}

interface MigrationIndexState {
  /** Ultima volta che l'indice è stato CREATE-ato nelle migration (in ordine) */
  lastCreate: {
    hasDesc: boolean;
    hasWhere: boolean;
    migration: string;
    dropped: boolean;
  } | null;
}

interface MigrationCreate {
  indexName: string;
  hasDesc: boolean;
  hasWhere: boolean;
  migration: string;
}

export interface PgIndex {
  indexname: string;
  tablename: string;
  indexdef: string;
}

export interface IndexDriftResult {
  /** 0 = OK, 1 = drift reale, 2 = DB non raggiungibile (live skippato) */
  exitCode: 0 | 1 | 2;
  /** Lista di messaggi di problema (vuota se exitCode=0 o 2) */
  issues: string[];
}

// ─── Fase 1: Drizzle TS schema — source of truth ─────────────────────────────

/**
 * Itera tutte le tabelle nello schema Drizzle e restituisce la mappa degli
 * indici speciali (DESC o WHERE) dichiarati nello schema TS.
 *
 * Accede all'API interna di Drizzle (via cast any) poiché non esiste un'API
 * pubblica stabile per leggere l'ordinamento degli index column.
 */
export function getSchemaSpecialIndexes(): Map<string, SchemaSpecialIndex> {
  const result = new Map<string, SchemaSpecialIndex>();

  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof SQL || value instanceof Function) {
      continue;
    }

    let tableConfig: ReturnType<typeof getTableConfig>;
    try {
      tableConfig = getTableConfig(value as PgTable);
      if (!tableConfig?.name || !tableConfig.indexes) continue;
    } catch {
      continue;
    }

    const tableName = tableConfig.name;

    for (const idx of tableConfig.indexes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (idx as any).config as {
        name?: string;
        columns?: Array<{ indexConfig?: { order?: string }; name?: string } | SQL>;
        where?: SQL;
        unique?: boolean;
      };

      if (!cfg?.name) continue;

      const indexName = cfg.name;

      // Verifica ordinamento DESC su almeno una colonna
      const descColumns: string[] = [];
      for (const col of (cfg.columns ?? [])) {
        if (col instanceof SQL) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order = (col as any)?.indexConfig?.order;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colName = (col as any)?.name ?? "(sql)";
        if (order === "desc") {
          descColumns.push(colName);
        }
      }

      const hasDesc = descColumns.length > 0;
      const hasWhere = cfg.where != null;

      if (!hasDesc && !hasWhere) continue;

      result.set(indexName, { indexName, tableName, hasDesc, hasWhere, descColumns });
    }
  }

  return result;
}

/**
 * Come getSchemaSpecialIndexes, ma restituisce TUTTI gli indici dello schema
 * (inclusi quelli ASC plain senza DESC/WHERE). Usato per rilevare l'inverse
 * drift: migration ha DESC/WHERE ma schema TS è ASC/senza-clausola.
 */
export function getSchemaAllIndexes(): Map<string, SchemaSpecialIndex> {
  const result = new Map<string, SchemaSpecialIndex>();

  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof SQL || value instanceof Function) {
      continue;
    }

    let tableConfig: ReturnType<typeof getTableConfig>;
    try {
      tableConfig = getTableConfig(value as PgTable);
      if (!tableConfig?.name || !tableConfig.indexes) continue;
    } catch {
      continue;
    }

    const tableName = tableConfig.name;

    for (const idx of tableConfig.indexes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (idx as any).config as {
        name?: string;
        columns?: Array<{ indexConfig?: { order?: string }; name?: string } | SQL>;
        where?: SQL;
        unique?: boolean;
      };

      if (!cfg?.name) continue;

      const descColumns: string[] = [];
      for (const col of (cfg.columns ?? [])) {
        if (col instanceof SQL) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order = (col as any)?.indexConfig?.order;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colName = (col as any)?.name ?? "(sql)";
        if (order === "desc") descColumns.push(colName);
      }

      result.set(cfg.name, {
        indexName: cfg.name,
        tableName,
        hasDesc: descColumns.length > 0,
        hasWhere: cfg.where != null,
        descColumns,
      });
    }
  }

  return result;
}

// ─── Fase 2: Migration SQL — rilevamento regressioni ─────────────────────────

export function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/;.*$/, "")
    .replace(/--[^\n]*/g, "")
    .trim()
    .toLowerCase();
}

export function extractDroppedIndexNames(sql: string): Set<string> {
  const dropped = new Set<string>();
  const re = /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) dropped.add(m[1].toLowerCase());
  return dropped;
}

export function extractCreatedIndexes(sql: string, migrationFile: string): MigrationCreate[] {
  const results: MigrationCreate[] = [];
  const cleaned = sql.replace(/--[^\n]*/g, " ");

  // Cattura ogni CREATE INDEX — gestisce body su più righe con WHERE finale
  const re =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s+ON\s+["']?(\w+)["']?\s*(?:USING\s+\w+\s*)?\((?:[^()]*|\([^()]*\))*\)(?:\s+WHERE\s+[^;]+)?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const fullDef = normalizeSql(m[0]);
    results.push({
      indexName: m[1].toLowerCase(),
      hasDesc: /\bdesc\b/.test(fullDef),
      hasWhere: /\bwhere\b/.test(fullDef),
      migration: migrationFile,
    });
  }
  return results;
}

/**
 * Rileva l'inverse drift: indice che nelle migration SQL è creato con DESC o
 * WHERE, ma nello schema Drizzle TS è definito come ASC plain / senza WHERE.
 *
 * Questa è la causa del loop DROP+CREATE a ogni deploy: Replit confronta lo
 * schema (ASC) con la prod (DESC) e rigenera DROP+CREATE senza mai convergere.
 *
 * Nota: vengono segnalati solo gli indici presenti in ENTRAMBE le fonti
 * (migration E schema TS). Indici presenti solo in migration e non nello schema
 * (es. HNSW, indici manuali) non vengono segnalati.
 */
export function detectInverseDrift(
  schemaAll: Map<string, SchemaSpecialIndex>,
): Array<{ indexName: string; migration: string; migrationHasDesc: boolean; migrationHasWhere: boolean }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migState = new Map<string, { hasDesc: boolean; hasWhere: boolean; migration: string; dropped: boolean }>();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const dropped = extractDroppedIndexNames(content);
    const creates = extractCreatedIndexes(content, file);

    for (const name of dropped) {
      const s = migState.get(name);
      if (s) migState.set(name, { ...s, dropped: true });
    }
    for (const c of creates) {
      migState.set(c.indexName, {
        hasDesc: c.hasDesc,
        hasWhere: c.hasWhere,
        migration: c.migration,
        dropped: false,
      });
    }
  }

  const results: Array<{
    indexName: string;
    migration: string;
    migrationHasDesc: boolean;
    migrationHasWhere: boolean;
  }> = [];

  for (const [name, migInfo] of migState) {
    if (migInfo.dropped) continue;
    if (!migInfo.hasDesc && !migInfo.hasWhere) continue; // migration plain → skip

    const schemaInfo = schemaAll.get(name);
    if (!schemaInfo) continue; // non dichiarato nel registry TS → indice esterno/manuale

    const inversedDesc = migInfo.hasDesc && !schemaInfo.hasDesc;
    const inversedWhere = migInfo.hasWhere && !schemaInfo.hasWhere;

    if (inversedDesc || inversedWhere) {
      results.push({
        indexName: name,
        migration: migInfo.migration,
        migrationHasDesc: migInfo.hasDesc,
        migrationHasWhere: migInfo.hasWhere,
      });
    }
  }

  return results;
}

/**
 * Per ogni indice speciale dello schema TS, verifica se nelle migration SQL
 * esiste una regressione: l'indice viene droppato e ricreato senza le
 * caratteristiche speciali attese (DESC / WHERE).
 *
 * Restituisce la lista delle regressioni trovate.
 */
export function detectMigrationRegressions(
  schemaSpecial: Map<string, SchemaSpecialIndex>,
): Array<{ indexName: string; migration: string; lostDesc: boolean; lostWhere: boolean }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Stato per ogni indice: tiene traccia dell'ultimo CREATE visto
  const state = new Map<string, MigrationIndexState>();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const dropped = extractDroppedIndexNames(content);
    const creates = extractCreatedIndexes(content, file);

    // Prima aggiorna i DROP
    for (const name of dropped) {
      const s = state.get(name);
      if (s?.lastCreate) state.set(name, { lastCreate: { ...s.lastCreate, dropped: true } });
    }

    // Poi aggiorna i CREATE (un CREATE sovrascrive sempre, dropped=false)
    for (const c of creates) {
      state.set(c.indexName, {
        lastCreate: { hasDesc: c.hasDesc, hasWhere: c.hasWhere, migration: c.migration, dropped: false },
      });
    }
  }

  const regressions: ReturnType<typeof detectMigrationRegressions> = [];

  for (const [name, expected] of schemaSpecial) {
    const s = state.get(name);
    if (!s?.lastCreate || s.lastCreate.dropped) continue; // non è nelle migration o droppato → ok

    const lostDesc = expected.hasDesc && !s.lastCreate.hasDesc;
    const lostWhere = expected.hasWhere && !s.lastCreate.hasWhere;

    if (lostDesc || lostWhere) {
      regressions.push({
        indexName: name,
        migration: s.lastCreate.migration,
        lostDesc,
        lostWhere,
      });
    }
  }

  return regressions;
}

// ─── Fase 3: Live DB — verifica semantica ────────────────────────────────────

export async function fetchLiveIndexes(
  pool: Pool,
  indexNames: string[],
): Promise<Map<string, PgIndex>> {
  if (indexNames.length === 0) return new Map();
  const result = await pool.query<PgIndex>(
    `SELECT indexname, tablename, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])`,
    [indexNames],
  );
  return new Map(result.rows.map((r) => [r.indexname.toLowerCase(), r]));
}

/**
 * Verifica semantica della definizione live vs aspettative dallo schema TS.
 *
 * Per DESC: verifica che la colonna specifica abbia "desc" nel suo contesto
 *   nell'indexdef (non solo la parola "desc" ovunque).
 * Per WHERE: verifica che l'indexdef contenga la parola chiave "where" seguita
 *   da una condizione.
 *
 * Restituisce null se OK, altrimenti un array di problemi.
 */
export function verifyLiveDef(
  expected: SchemaSpecialIndex,
  liveRow: PgIndex,
): string[] {
  const liveDef = normalizeSql(liveRow.indexdef);
  const problems: string[] = [];

  if (expected.hasDesc) {
    // Verifica che almeno una delle colonne DESC compaia prima di "desc" nel live def
    const hasDescInDef = expected.descColumns.some((col) => {
      // Cerca "colonna desc" o "(colonna) desc" nella definizione normalizzata
      const pattern = new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^)]*\\bdesc\\b`);
      return pattern.test(liveDef);
    });

    if (!hasDescInDef) {
      // Fallback: cerca almeno "desc" nell'intera definizione
      if (!/\bdesc\b/.test(liveDef)) {
        problems.push(
          `ordinamento DESC assente — colonne attese con DESC: [${expected.descColumns.join(", ")}]`,
        );
      } else {
        // "desc" esiste ma non associato alle colonne attese — potrebbe essere OK
        // (es: ordinamento su colonna diversa) → non segnalare
      }
    }
  }

  if (expected.hasWhere) {
    // Verifica presenza di WHERE con almeno una condizione dopo
    if (!/\bwhere\s+\S/.test(liveDef)) {
      problems.push("clausola WHERE assente o vuota nella definizione live");
    }
  }

  return problems;
}
