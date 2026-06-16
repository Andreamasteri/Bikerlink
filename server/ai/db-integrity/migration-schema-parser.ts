// Parser STRUTTURALE e table-qualified dei file di migration SQL.
//
// Ricostruisce, leggendo i CREATE TABLE e gli ALTER TABLE ... ADD/DROP/RENAME
// COLUMN in ordine documentale, una mappa `tabella → set di colonne`. È usato
// dalla guardia pre-merge (check-schema-migration-drift.ts) per verificare che
// ogni tabella/colonna dichiarata nel registry Drizzle sia effettivamente
// creata da almeno una migration numerata PER QUELLA TABELLA.
//
// È volutamente table-qualified: la presenza del nome di una colonna in un'altra
// tabella NON la conta come coperta (niente falsi negativi cross-tabella, es.
// `created_at` o `status` ripetuti in molte tabelle).
//
// È puro (nessun I/O, nessuna connessione al DB): riceve il contenuto dei file
// già letti, così da essere facilmente testabile.

// Parole chiave che, in cima a una riga del corpo di un CREATE TABLE,
// identificano un vincolo e NON una colonna. NB: "KEY" NON va incluso — una
// riga di vincolo inizia sempre con PRIMARY/FOREIGN (mai con "KEY" da solo) e
// "key" è un nome di colonna legittimo (es. app_settings.key).
const CONSTRAINT_KEYWORDS = new Set([
  "CONSTRAINT",
  "PRIMARY",
  "FOREIGN",
  "UNIQUE",
  "CHECK",
  "EXCLUDE",
]);

/** Normalizza un identificatore SQL: rimuove virgolette, schema, lowercase. */
export function norm(id: string): string {
  return id
    .replace(/"/g, "")
    .replace(/`/g, "")
    .replace(/^[a-z0-9_]+\./i, "") // elimina eventuale prefisso schema (public.)
    .trim()
    .toLowerCase();
}

/** Estrae i nomi colonna dal corpo di un CREATE TABLE (tra parentesi). */
export function parseCreateBody(body: string): string[] {
  const cols: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,\s*$/, "");
    if (!line) continue;
    // Una definizione di colonna inizia con un identificatore (eventualmente
    // quotato) seguito da spazio e dal tipo. I vincoli (UNIQUE(...),
    // PRIMARY KEY(...)) non hanno spazio prima della parentesi e vengono saltati.
    const m = line.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+\S/);
    if (!m) continue;
    const ident = m[1];
    if (CONSTRAINT_KEYWORDS.has(ident.toUpperCase())) continue;
    cols.push(ident.toLowerCase());
  }
  return cols;
}

const CREATE_HEAD = /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_."]+"?)\s*\(/i;
const ALTER_HEAD = /^alter\s+table\s+("?[a-zA-Z0-9_."]+"?)/i;
// Un singolo statement ALTER può contenere più clausole (es. drizzle/0073
// raggruppa più ADD COLUMN separati da virgola): si scandiscono TUTTE le
// occorrenze, non solo la prima. Si richiede la keyword "column" per non
// confondere ADD CONSTRAINT / ADD PRIMARY KEY con una colonna.
const ADD_COL_RE = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)/gi;
const DROP_COL_RE = /\bdrop\s+column\s+(?:if\s+exists\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)/gi;
const RENAME_COL_RE = /\brename\s+column\s+("?[a-zA-Z0-9_]+"?)\s+to\s+("?[a-zA-Z0-9_]+"?)/gi;

// Unique constraint/index patterns:
// ALTER TABLE tbl ADD CONSTRAINT name UNIQUE (cols)  — possibilmente su più righe
const ADD_UNIQUE_CONSTRAINT_RE = /\badd\s+constraint\s+("?[a-zA-Z0-9_]+"?)\s+unique\b/gi;
// CREATE UNIQUE INDEX name ON table (cols)
const CREATE_UNIQUE_INDEX_RE =
  /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_]+"?)\s+on\s+("?[a-zA-Z0-9_.]+"?)/gi;
// CREATE INDEX (non-unique) name ON table (cols)
// NB: "create unique index" è già catturato sopra; il lookahead negativo \b(?!unique\b)
// garantisce che solo gli indici plain siano inclusi qui (case-insensitive tramite flag /gi).
const CREATE_INDEX_RE =
  /create\s+index\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_]+"?)\s+on\s+("?[a-zA-Z0-9_.]+"?)/gi;

/**
 * Ricostruisce dalle migration la mappa tabella → set di colonne, applicando in
 * ordine documentale: CREATE TABLE, ALTER ... ADD COLUMN, RENAME COLUMN,
 * DROP COLUMN. `files` è il contenuto testuale dei .sql, già ordinato per nome
 * (= ordine di applicazione).
 */
export function buildMigrationSchema(files: string[]): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const ensure = (table: string): Set<string> => {
    let s = schema.get(table);
    if (!s) {
      s = new Set<string>();
      schema.set(table, s);
    }
    return s;
  };

  for (const file of files) {
    // Si rimuovono PRIMA i commenti SQL ('--' e i marker drizzle '-->') così da
    // non scambiare una menzione di "ALTER TABLE" in un commento per DDL reale
    // (es. 0072 cita "via ALTER TABLE manuale" in un commento).
    const clean = file.replace(/--[^\n]*/g, "");
    // Si divide per ';' (le migration drizzle terminano ogni statement con ';').
    // I corpi dei CREATE TABLE non contengono ';' interni; i blocchi DO $$..$$
    // vengono frammentati ma i singoli EXECUTE 'ALTER TABLE ... ADD COLUMN ...'
    // restano riconoscibili dalle regex sui frammenti.
    for (const rawStmt of clean.split(";")) {
      const stmt = rawStmt.trim();
      if (!stmt) continue;

      const create = stmt.match(CREATE_HEAD);
      if (create) {
        const table = norm(create[1]);
        const open = stmt.indexOf("(", create.index ?? 0);
        const close = stmt.lastIndexOf(")");
        if (open !== -1 && close > open) {
          const set = ensure(table);
          for (const c of parseCreateBody(stmt.slice(open + 1, close))) set.add(c);
        } else {
          ensure(table); // tabella presente anche se il corpo non è parsabile
        }
        continue;
      }

      // Un frammento DO/EXECUTE può contenere l'ALTER non in testa: si cerca
      // l'inizio dell'ALTER TABLE prima di applicare le regex.
      const alterIdx = stmt.search(/alter\s+table\s+/i);
      if (alterIdx === -1) continue;
      const alter = stmt.slice(alterIdx);
      const head = alter.match(ALTER_HEAD);
      if (!head) continue;
      const table = norm(head[1]);

      let m: RegExpExecArray | null;
      RENAME_COL_RE.lastIndex = 0;
      while ((m = RENAME_COL_RE.exec(alter))) {
        const s = ensure(table);
        s.delete(norm(m[1]));
        s.add(norm(m[2]));
      }
      ADD_COL_RE.lastIndex = 0;
      while ((m = ADD_COL_RE.exec(alter))) ensure(table).add(norm(m[1]));
      DROP_COL_RE.lastIndex = 0;
      while ((m = DROP_COL_RE.exec(alter))) {
        const s = schema.get(table);
        if (s) s.delete(norm(m[1]));
      }
    }
  }

  return schema;
}

/**
 * Ricostruisce dalle migration la mappa tabella → set di nomi di indici plain (non-unique).
 * Copre la forma DDL:
 *   - CREATE INDEX "name" ON "table" (...)
 *
 * Il confronto avviene PER NOME dell'indice, allineandosi a come Drizzle ORM
 * dichiara i `index("name")` nel registro TS.
 *
 * NB: `CREATE UNIQUE INDEX` usa una parola chiave diversa (`create unique index`)
 * e NON corrisponde alla regex CREATE_INDEX_RE — è già gestito da buildMigrationUniqueIndexes.
 */
export function buildMigrationIndexes(files: string[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const ensure = (table: string): Set<string> => {
    let s = result.get(table);
    if (!s) {
      s = new Set<string>();
      result.set(table, s);
    }
    return s;
  };

  for (const file of files) {
    const clean = file.replace(/--[^\n]*/g, "");

    CREATE_INDEX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_INDEX_RE.exec(clean))) {
      const indexName = norm(m[1]);
      const tableName = norm(m[2]);
      ensure(tableName).add(indexName);
    }
  }

  return result;
}

/**
 * Ricostruisce dalle migration la mappa tabella → set di nomi di unique index/constraint.
 * Copre due forme DDL:
 *   - CREATE UNIQUE INDEX "name" ON "table" (...)
 *   - ALTER TABLE "table" ... ADD CONSTRAINT "name" UNIQUE (...)
 *
 * Il confronto avviene PER NOME dell'indice/constraint (non per colonne), allineandosi
 * a come Drizzle ORM dichiara i `uniqueIndex("name")` nel registro TS.
 */
export function buildMigrationUniqueIndexes(files: string[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const ensure = (table: string): Set<string> => {
    let s = result.get(table);
    if (!s) {
      s = new Set<string>();
      result.set(table, s);
    }
    return s;
  };

  for (const file of files) {
    const clean = file.replace(/--[^\n]*/g, "");

    // CREATE UNIQUE INDEX "name" ON "table" — scansione sull'intero file (non diviso per statement)
    CREATE_UNIQUE_INDEX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_UNIQUE_INDEX_RE.exec(clean))) {
      const indexName = norm(m[1]);
      const tableName = norm(m[2]);
      ensure(tableName).add(indexName);
    }

    // ALTER TABLE "table" ADD CONSTRAINT "name" UNIQUE — si divide per ';' e si cerca
    // il nome tabella dall'ALTER HEAD, poi ADD CONSTRAINT ... UNIQUE dallo stesso statement.
    for (const rawStmt of clean.split(";")) {
      const alterIdx = rawStmt.search(/alter\s+table\s+/i);
      if (alterIdx === -1) continue;
      const alter = rawStmt.slice(alterIdx);
      const head = alter.match(ALTER_HEAD);
      if (!head) continue;
      const tableName = norm(head[1]);

      ADD_UNIQUE_CONSTRAINT_RE.lastIndex = 0;
      while ((m = ADD_UNIQUE_CONSTRAINT_RE.exec(alter))) {
        ensure(tableName).add(norm(m[1]));
      }
    }
  }

  return result;
}
