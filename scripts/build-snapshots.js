/**
 * build-snapshots.js
 * Incrementally builds schema snapshot files for migrations/meta/
 * by parsing each SQL migration file and applying schema changes to the
 * previous snapshot state.
 *
 * Usage: node scripts/build-snapshots.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function normalizeTableKey(name) {
  // Strip quotes, return lowercase
  return name.replace(/"/g, '').replace(/\bpublic\./i, '').trim().toLowerCase();
}

function tableKey(name) {
  return `public.${normalizeTableKey(name)}`;
}

function normalizeType(rawType) {
  if (!rawType) return 'text';
  let t = rawType.trim()
    .replace(/\s+/g, ' ')
    .replace(/::.*$/, '');  // strip casts like ::varchar

  const lo = t.toLowerCase();

  // Exact matches first
  const exact = {
    'text': 'text',
    'integer': 'integer',
    'int': 'integer',
    'int4': 'integer',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'boolean': 'boolean',
    'bool': 'boolean',
    'timestamp': 'timestamp',
    'timestamp without time zone': 'timestamp',
    'timestamptz': 'timestamp with time zone',
    'timestamp with time zone': 'timestamp with time zone',
    'double precision': 'double precision',
    'float8': 'double precision',
    'real': 'real',
    'jsonb': 'jsonb',
    'json': 'json',
    'uuid': 'uuid',
    'date': 'date',
    'text[]': 'text[]',
    'varchar[]': 'varchar[]',
  };
  if (exact[lo]) return exact[lo];

  // Pattern matches
  const m = lo.match(/^varchar\s*\((\d+)\)$/) || t.match(/^[Vv][Aa][Rr][Cc][Hh][Aa][Rr]\s*\((\d+)\)$/);
  if (m) return `varchar(${m[1]})`;

  const charM = lo.match(/^char\s*\((\d+)\)$/);
  if (charM) return `char(${charM[1]})`;

  const numM = lo.match(/^numeric\s*\((\d+)\s*,\s*(\d+)\)$/);
  if (numM) return `numeric(${numM[1]}, ${numM[2]})`;

  const vecM = lo.match(/^vector\s*\((\d+)\)$/);
  if (vecM) return `vector(${vecM[1]})`;

  const arrM = lo.match(/^(.+)\[\]$/);
  if (arrM) return `${normalizeType(arrM[1])}[]`;

  // Return as-is (lowercase)
  return lo;
}

function normalizeDefault(rawDef) {
  if (rawDef === null || rawDef === undefined) return undefined;
  const d = rawDef.trim();

  // Boolean literals
  if (d.toLowerCase() === 'true') return true;
  if (d.toLowerCase() === 'false') return false;

  // Integer literals
  if (/^-?\d+$/.test(d)) return parseInt(d, 10);

  // Float literals
  if (/^-?\d+\.\d+$/.test(d)) return parseFloat(d);

  // Keep string as-is (includes functions like gen_random_uuid(), now(), etc.)
  return d;
}

function blankTable(name) {
  return {
    name,
    schema: '',
    columns: {},
    indexes: {},
    foreignKeys: {},
    compositePrimaryKeys: {},
    uniqueConstraints: {},
    policies: {},
    checkConstraints: {},
    isRLSEnabled: false,
  };
}

// ─── SQL Statement Parser ─────────────────────────────────────────────────────

/**
 * Split SQL text into individual statements (by --> statement-breakpoint or semicolons).
 * Also strips comments.
 */
function splitStatements(sql) {
  // Remove single-line comments
  let cleaned = sql.replace(/--[^\n]*/g, '');
  // Split on breakpoints first
  const parts = cleaned.split(/--> statement-breakpoint/i);
  const stmts = [];
  for (const part of parts) {
    // Further split by semicolon at end of statement
    const sub = part.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    stmts.push(...sub);
  }
  return stmts.map(s => s.trim()).filter(s => s.length > 3);
}

/**
 * Parse a CREATE TABLE statement and return a table object for the snapshot.
 */
function parseCreateTable(stmt) {
  // Extract table name
  const nameM = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/i);
  if (!nameM) return null;
  const tname = nameM[1];
  const table = blankTable(tname);

  // Extract the column definitions block
  const bodyM = stmt.match(/\((.+)\)\s*;?\s*$/s);
  if (!bodyM) return { name: tname, table };

  const body = bodyM[1];
  const lines = splitColumnLines(body);

  for (const line of lines) {
    const lTrim = line.trim();
    if (!lTrim) continue;

    // Skip table-level constraints we handle elsewhere
    const loLine = lTrim.toLowerCase();
    if (loLine.startsWith('constraint ') && loLine.includes('primary key')) {
      // composite PK - skip for now
      continue;
    }
    if (loLine.startsWith('constraint ') && loLine.includes('foreign key')) {
      // inline FK constraint
      const fkM = lTrim.match(/CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY\s*\("?(\w+)"?\)\s+REFERENCES\s+"?(\w+)"?\s*\("?(\w+)"?\)(?:\s+ON\s+DELETE\s+(\w+(?:\s+\w+)?))?(?:\s+ON\s+UPDATE\s+(\w+(?:\s+\w+)?))?/i);
      if (fkM) {
        const fkName = fkM[1];
        table.foreignKeys[fkName] = {
          name: fkName,
          tableFrom: tname,
          tableTo: fkM[3].replace(/"/g, ''),
          columnsFrom: [fkM[2]],
          columnsTo: [fkM[4]],
          onDelete: (fkM[5] || 'no action').toLowerCase(),
          onUpdate: (fkM[6] || 'no action').toLowerCase(),
        };
      }
      continue;
    }
    if (loLine.startsWith('constraint ') && loLine.includes('unique')) {
      const ucM = lTrim.match(/CONSTRAINT\s+"?(\w+)"?\s+UNIQUE\s*\((.+?)\)/i);
      if (ucM) {
        const ucName = ucM[1];
        const cols = ucM[2].split(',').map(c => c.trim().replace(/"/g, ''));
        table.uniqueConstraints[ucName] = { name: ucName, nullsNotDistinct: false, columns: cols };
      }
      continue;
    }
    // Skip bare PRIMARY KEY / UNIQUE table constraints
    if (loLine.startsWith('primary key') || loLine.startsWith('unique')) continue;

    // Parse column definition
    const col = parseColumnDef(lTrim, tname, table);
    if (col) {
      table.columns[col.name] = col;
    }
  }

  return { name: tname, table };
}

/**
 * Split the body of a CREATE TABLE into individual column/constraint lines,
 * being careful about nested parentheses.
 */
function splitColumnLines(body) {
  const lines = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      lines.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/**
 * Parse a single column definition line.
 * Returns column object or null if it's a constraint line.
 */
function parseColumnDef(line, tname, table) {
  const lo = line.toLowerCase();

  // Skip known constraint starters
  if (lo.startsWith('constraint ') || lo.startsWith('primary key') || lo.startsWith('unique') ||
      lo.startsWith('check ') || lo.startsWith('foreign key')) return null;

  // Column: "col_name" type [modifiers...]
  const colM = line.match(/^"?(\w+)"?\s+(.+)$/s);
  if (!colM) return null;

  const colName = colM[1];
  let rest = colM[2].trim();

  // Extract PRIMARY KEY
  const isPK = /\bPRIMARY\s+KEY\b/i.test(rest);
  const isNotNull = isPK || /\bNOT\s+NULL\b/i.test(rest);
  const isNull = !isNotNull && /\bNULL\b/i.test(rest) && !/\bNOT\s+NULL\b/i.test(rest);

  // Remove modifiers to get type
  let typeStr = rest
    .replace(/\bPRIMARY\s+KEY\b/gi, '')
    .replace(/\bNOT\s+NULL\b/gi, '')
    .replace(/\bNULL\b/gi, '')
    .replace(/\bUNIQUE\b/gi, '')
    .replace(/REFERENCES\s+.*/si, '')
    .replace(/DEFAULT\s+.*/si, '')
    .trim();

  // Extract DEFAULT value
  const defM = rest.match(/DEFAULT\s+(.+?)(?:\s+(?:NOT\s+NULL|NULL|UNIQUE|REFERENCES|PRIMARY)\b|$)/si);
  let defVal = undefined;
  if (defM) {
    defVal = normalizeDefault(defM[1].trim());
  }

  // Handle UNIQUE inline - add to table's uniqueConstraints
  if (/\bUNIQUE\b/i.test(rest)) {
    const ucName = `${tname}_${colName}_unique`;
    if (table) {
      table.uniqueConstraints[ucName] = { name: ucName, nullsNotDistinct: false, columns: [colName] };
    }
  }

  // Handle inline FK: col type REFERENCES othertable(othercol) [ON DELETE x]
  const inlineFkM = rest.match(/REFERENCES\s+"?(\w+)"?\s*\("?(\w+)"?\)(?:\s+ON\s+DELETE\s+([\w\s]+?))?(?:\s+ON\s+UPDATE\s+([\w\s]+?))?(?:\s*(?:NOT\s+NULL|NULL|DEFAULT|$))/si);
  if (inlineFkM && table) {
    const fkName = `${tname}_${colName}_${inlineFkM[1]}_id_fk`;
    table.foreignKeys[fkName] = {
      name: fkName,
      tableFrom: tname,
      tableTo: inlineFkM[1].replace(/"/g, ''),
      columnsFrom: [colName],
      columnsTo: [inlineFkM[2]],
      onDelete: (inlineFkM[3] || 'no action').toLowerCase().trim(),
      onUpdate: 'no action',
    };
  }

  const colObj = {
    name: colName,
    type: normalizeType(typeStr),
    primaryKey: isPK,
    notNull: isNotNull,
  };
  if (defVal !== undefined) colObj.default = defVal;

  return colObj;
}

/**
 * Parse ALTER TABLE ... ADD COLUMN statement.
 */
function applyAddColumn(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/si);
  if (!m) return;
  const tname = m[1];
  const tkey = tableKey(tname);
  if (!snapshot.tables[tkey]) return;

  const table = snapshot.tables[tkey];
  const col = parseColumnDef(m[2].trim(), tname, table);
  if (col && !table.columns[col.name]) {
    table.columns[col.name] = col;
  }
}

/**
 * Parse ALTER TABLE ... ADD COLUMN with multiple columns (comma-separated).
 */
function applyAddColumns(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/si);
  if (m) {
    applyAddColumn(stmt, snapshot);
    return;
  }
  // Multi-column ADD
  const m2 = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+(.+)$/si);
  if (!m2) return;
  const tname = m2[1];
  const tkey = tableKey(tname);
  if (!snapshot.tables[tkey]) return;
  const table = snapshot.tables[tkey];

  const body = m2[2].trim();
  // Could be "col1 type, col2 type"
  const cols = splitColumnLines(body);
  for (const colDef of cols) {
    const trimmed = colDef.trim();
    if (!trimmed) continue;
    if (/^COLUMN\s+/i.test(trimmed) || /^IF\s+NOT\s+EXISTS\s+/i.test(trimmed)) {
      const c = trimmed.replace(/^COLUMN\s+/i, '').replace(/^IF\s+NOT\s+EXISTS\s+/i, '');
      const col = parseColumnDef(c.trim(), tname, table);
      if (col && !table.columns[col.name]) table.columns[col.name] = col;
    } else {
      const col = parseColumnDef(trimmed, tname, table);
      if (col && !table.columns[col.name]) table.columns[col.name] = col;
    }
  }
}

/**
 * Parse ALTER TABLE ... DROP COLUMN
 */
function applyDropColumn(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/si);
  if (!m) return;
  const tkey = tableKey(m[1]);
  const colName = m[2];
  if (snapshot.tables[tkey]) {
    delete snapshot.tables[tkey].columns[colName];
  }
}

/**
 * DROP TABLE
 */
function applyDropTable(stmt, snapshot) {
  const m = stmt.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/si);
  if (!m) return;
  const tkey = tableKey(m[1]);
  delete snapshot.tables[tkey];
}

/**
 * CREATE INDEX / CREATE UNIQUE INDEX
 */
function applyCreateIndex(stmt, snapshot) {
  const m = stmt.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+"?(\w+)"?\s+(?:USING\s+(\w+)\s+)?\((.+)\)/si);
  if (!m) return;
  const isUnique = !!m[1];
  const idxName = m[2];
  const tname = m[3];
  const method = (m[4] || 'btree').toLowerCase();
  const colsStr = m[5];
  const tkey = tableKey(tname);
  if (!snapshot.tables[tkey]) return;

  const table = snapshot.tables[tkey];

  // Parse index columns
  const colDefs = splitColumnLines(colsStr);
  const columns = colDefs.map(c => {
    const trimmed = c.trim();
    const isExpression = /[(\s"']/.test(trimmed) && !/^"?\w+"?$/.test(trimmed.replace(/\s+ASC\s*$|\s+DESC\s*$/i, ''));
    const expr = trimmed.replace(/\s+ASC\s*$|\s+DESC\s*$/i, '').trim();
    const asc = !/\s+DESC\s*$/i.test(trimmed);
    if (isExpression || expr.includes('(') || expr.includes('"') && expr.includes(',')) {
      return { expression: expr.replace(/"/g, '"'), asc, isExpression: true, nulls: 'last' };
    }
    return { expression: expr.replace(/"/g, ''), asc, isExpression: false, nulls: 'last' };
  });

  table.indexes[idxName] = {
    name: idxName,
    columns,
    isUnique,
    concurrently: false,
    method,
    with: {},
  };
}

/**
 * DROP INDEX
 */
function applyDropIndex(stmt, snapshot) {
  const m = stmt.match(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/si);
  if (!m) return;
  const idxName = m[1];
  // Find and remove the index from any table
  for (const tkey of Object.keys(snapshot.tables)) {
    if (snapshot.tables[tkey].indexes[idxName]) {
      delete snapshot.tables[tkey].indexes[idxName];
    }
  }
}

/**
 * ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
 */
function applyAddForeignKey(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY\s*\("?(\w+)"?\)\s+REFERENCES\s+"?(?:public\.)?"?(\w+)"?\s*\("?(\w+)"?\)(?:\s+ON\s+DELETE\s+([\w\s]+?))?(?:\s+ON\s+UPDATE\s+([\w\s]+?))?(?:\s*;?\s*$)/si);
  if (!m) return;
  const tkey = tableKey(m[1]);
  if (!snapshot.tables[tkey]) return;
  const fkName = m[2];
  const tname = normalizeTableKey(m[1]);
  snapshot.tables[tkey].foreignKeys[fkName] = {
    name: fkName,
    tableFrom: tname,
    tableTo: m[4].replace(/"/g, ''),
    columnsFrom: [m[3]],
    columnsTo: [m[5]],
    onDelete: (m[6] || 'no action').toLowerCase().trim(),
    onUpdate: (m[7] || 'no action').toLowerCase().trim(),
  };
}

/**
 * ALTER TABLE ... ADD CONSTRAINT ... UNIQUE
 */
function applyAddUniqueConstraint(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+UNIQUE\s*\((.+?)\)/si);
  if (!m) return;
  const tkey = tableKey(m[1]);
  if (!snapshot.tables[tkey]) return;
  const ucName = m[2];
  const cols = m[3].split(',').map(c => c.trim().replace(/"/g, ''));
  snapshot.tables[tkey].uniqueConstraints[ucName] = {
    name: ucName,
    nullsNotDistinct: false,
    columns: cols,
  };
}

/**
 * ALTER TABLE ... RENAME CONSTRAINT (0047 migration)
 */
function applyRenameConstraint(stmt, snapshot) {
  const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+RENAME\s+CONSTRAINT\s+"?(\w+)"?\s+TO\s+"?(\w+)"?/si);
  if (!m) return;
  const tkey = tableKey(m[1]);
  if (!snapshot.tables[tkey]) return;
  const oldName = m[2];
  const newName = m[3];
  const table = snapshot.tables[tkey];
  // Rename in uniqueConstraints
  if (table.uniqueConstraints[oldName]) {
    table.uniqueConstraints[newName] = { ...table.uniqueConstraints[oldName], name: newName };
    delete table.uniqueConstraints[oldName];
  }
  // Rename in foreignKeys
  if (table.foreignKeys[oldName]) {
    table.foreignKeys[newName] = { ...table.foreignKeys[oldName], name: newName };
    delete table.foreignKeys[oldName];
  }
}

/**
 * Apply a single SQL statement to snapshot.
 */
function applyStatement(stmt, snapshot) {
  const lo = stmt.toLowerCase().trim();

  // Skip non-schema statements
  if (lo.startsWith('insert ') || lo.startsWith('update ') || lo.startsWith('delete ') ||
      lo.startsWith('select ') || lo.startsWith('do ') || lo.startsWith('do$') ||
      lo.startsWith('create extension') || lo.startsWith('create function') ||
      lo.startsWith('create or replace function') || lo.startsWith('create type') ||
      lo.startsWith('alter type') || lo.startsWith('comment on')) {
    return;
  }

  if (lo.startsWith('drop table')) {
    applyDropTable(stmt, snapshot);
  } else if (lo.startsWith('create table')) {
    const result = parseCreateTable(stmt);
    if (result) {
      const tkey = tableKey(result.name);
      if (!snapshot.tables[tkey]) {
        snapshot.tables[tkey] = result.table;
      }
    }
  } else if (lo.startsWith('alter table')) {
    if (/add\s+column/i.test(stmt)) {
      applyAddColumn(stmt, snapshot);
    } else if (/drop\s+column/i.test(stmt)) {
      applyDropColumn(stmt, snapshot);
    } else if (/add\s+constraint\s+\S+\s+foreign\s+key/i.test(stmt)) {
      applyAddForeignKey(stmt, snapshot);
    } else if (/add\s+constraint\s+\S+\s+unique/i.test(stmt)) {
      applyAddUniqueConstraint(stmt, snapshot);
    } else if (/rename\s+constraint/i.test(stmt)) {
      applyRenameConstraint(stmt, snapshot);
    } else if (/\badd\s+column\b/i.test(stmt)) {
      applyAddColumns(stmt, snapshot);
    } else if (/\badd\s+(?!constraint)/i.test(stmt)) {
      // ALTER TABLE ... ADD col type, col type (without COLUMN keyword)
      // like 0034_notification_priority_and_deliveries
      const m = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+(.+)$/si);
      if (m) {
        const tname = m[1];
        const tkey2 = tableKey(tname);
        if (snapshot.tables[tkey2]) {
          const table = snapshot.tables[tkey2];
          const colDefs = splitColumnLines(m[2]);
          for (const cd of colDefs) {
            const c = cd.trim();
            if (!c) continue;
            const col = parseColumnDef(c, tname, table);
            if (col && !table.columns[col.name]) table.columns[col.name] = col;
          }
        }
      }
    }
  } else if (lo.startsWith('create unique index') || lo.startsWith('create index')) {
    applyCreateIndex(stmt, snapshot);
  } else if (lo.startsWith('drop index')) {
    applyDropIndex(stmt, snapshot);
  }
}

/**
 * Apply a full migration SQL file to the snapshot.
 */
function applyMigration(sql, snapshot) {
  const stmts = splitStatements(sql);
  for (const stmt of stmts) {
    try {
      applyStatement(stmt, snapshot);
    } catch (e) {
      // Log but continue — best-effort parsing
      console.warn(`  WARN: failed to apply stmt: ${stmt.slice(0, 80)}...`, e.message);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const metaDir = path.join(__dirname, '..', 'migrations', 'meta');
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  // Load journal
  const journal = JSON.parse(fs.readFileSync(path.join(metaDir, '_journal.json'), 'utf8'));

  // Load base snapshot (idx=0)
  const baseSnap = JSON.parse(fs.readFileSync(path.join(metaDir, '0000_snapshot.json'), 'utf8'));
  const baseId = baseSnap.id;

  console.log(`Base snapshot id: ${baseId}`);
  console.log(`Total journal entries: ${journal.entries.length}`);

  // Build snapshots for idx=1 through last
  let prevId = baseId;
  let currentSnap = JSON.parse(JSON.stringify(baseSnap)); // deep clone

  for (let i = 1; i < journal.entries.length; i++) {
    const entry = journal.entries[i];
    const idx = entry.idx;
    const tag = entry.tag;
    const sqlFile = path.join(migrationsDir, `${tag}.sql`);

    if (!fs.existsSync(sqlFile)) {
      console.warn(`  WARNING: SQL file not found for tag ${tag}, skipping`);
      // Still create a snapshot (same state as previous)
    } else {
      const sql = fs.readFileSync(sqlFile, 'utf8');
      applyMigration(sql, currentSnap);
      console.log(`  Applied migration ${idx} (${tag}) → tables: ${Object.keys(currentSnap.tables).length}`);
    }

    // Write snapshot
    const prefix = String(idx).padStart(4, '0');
    const newId = uuid();
    const snapToWrite = JSON.parse(JSON.stringify(currentSnap));
    snapToWrite.id = newId;
    snapToWrite.prevId = prevId;

    const snapPath = path.join(metaDir, `${prefix}_snapshot.json`);
    fs.writeFileSync(snapPath, JSON.stringify(snapToWrite, null, 2));

    prevId = newId;
  }

  console.log('\nDone! Verifying chain...');

  // Verify chain
  const files = fs.readdirSync(metaDir).filter(f => f.endsWith('_snapshot.json')).sort();
  let prevVerifyId = null;
  let ok = true;
  for (const f of files) {
    const snap = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
    if (prevVerifyId !== null && snap.prevId !== prevVerifyId) {
      console.error(`CHAIN BROKEN at ${f}: expected prevId=${prevVerifyId}, got ${snap.prevId}`);
      ok = false;
    }
    prevVerifyId = snap.id;
  }
  if (ok) {
    console.log(`Chain OK — ${files.length} snapshots properly linked.`);
  }

  // Print table count progression
  console.log('\nSchema evolution summary:');
  for (const f of files) {
    const snap = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
    console.log(`  ${f}: ${Object.keys(snap.tables).length} tables`);
  }
}

main();
