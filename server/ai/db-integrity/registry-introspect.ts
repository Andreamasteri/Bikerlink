// Task #3395 — Introspezione del registry Drizzle (@shared/db) SENZA dipendenze
// dal DB. Volutamente leggero: importa solo lo schema TS così può essere usato
// sia dai check (che girano nel server), sia dallo script di guardia dev
// (che gira come validation step e non deve aprire una connessione al DB).
import * as schema from "@shared/db";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";

export interface DeclaredColumn {
  name: string;
  notNull: boolean;
}
export interface DeclaredTable {
  name: string;
  columns: DeclaredColumn[];
}
export interface DeclaredUniqueIndex {
  table: string;
  name: string;
}

/**
 * Tabelle presenti nel DB ma volutamente NON dichiarate nel registry Drizzle.
 * Sono oggetti di sistema / infrastruttura che non devono mai generare un
 * falso positivo nel check inverso (DB → registry) né sporcare il manifest.
 *
 * NB: gli stessi nomi sono filtrati in drizzle.config.ts per la publish flow.
 */
export const EXCLUDED_TABLES = new Set<string>([
  // PostGIS — gestite dall'estensione, di proprietà di cloud_admin.
  "spatial_ref_sys",
  "geography_columns",
  "geometry_columns",
  // Infrastruttura non descritta nel registry TS.
  "session", // connect-pg-simple
  "schema_migrations", // server/migrate.ts tracking
  // App-integrity (#2537) — tracciate via SQL, escluse dal diff drizzle.
  "integrity_runs",
  "integrity_violations",
  "integrity_quarantine",
]);

/**
 * Una tabella è "critica" quando appartiene ai domini telemetria o matching.
 * Qualsiasi drift di schema su queste tabelle deve produrre severità critical
 * e finire negli alert critici. Il match per pattern copre sia i nomi
 * dichiarati sia quelli letti dal DB (confronto bidirezionale).
 *
 * Esempi coperti: maps_telemetry_events, ride_telemetry, segment_telemetry,
 * user_telemetry_profile, ai_assistant_telemetry, telemetry_affinity_matches,
 * matches, match_feedback, match_preferences, match_rules, match_thresholds,
 * biker_biker_matches, biker_zavorrina_matches, *_affinity_matches.
 */
export function isCriticalTable(name: string): boolean {
  return /telemetry|match/i.test(name);
}

/**
 * Elenca le tabelle dichiarate nel registry Drizzle con le loro colonne.
 * Usa l'API canonica getTableConfig: i metadati interni di Drizzle vivono sotto
 * Symbol, quindi l'accesso "a property" non è affidabile fra le versioni.
 */
export function listDeclaredTables(): DeclaredTable[] {
  const out: DeclaredTable[] = [];
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue;
    const cfg = getTableConfig(v);
    out.push({
      name: cfg.name,
      columns: cfg.columns.map((c) => ({ name: c.name, notNull: !!c.notNull })),
    });
  }
  return out;
}

/** Set dei nomi tabella dichiarati (per i confronti DB → registry). */
export function declaredTableNames(): Set<string> {
  return new Set(listDeclaredTables().map((t) => t.name));
}

/**
 * Elenca tutti i `uniqueIndex()` dichiarati nel registry Drizzle.
 * Usa getTableConfig().indexes filtrato a unique:true.
 * Il nome dell'indice è quello passato a `uniqueIndex("name")` e corrisponde
 * al nome del constraint/index SQL che la migration deve creare.
 */
export function listDeclaredUniqueIndexes(): DeclaredUniqueIndex[] {
  const out: DeclaredUniqueIndex[] = [];
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue;
    const cfg = getTableConfig(v);
    for (const idx of cfg.indexes) {
      if (idx.config.unique && idx.config.name) {
        out.push({ table: cfg.name, name: idx.config.name });
      }
    }
  }
  return out;
}
