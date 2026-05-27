// Task #2536 — Safety guard sull'SQL proposto dall'AI.
// Parser via pgsql-ast-parser. Allow-list di operazioni:
//   - SELECT sempre permesso
//   - UPDATE solo con WHERE esplicito e tabella in UPDATE_SAFE_TABLES
//   - DELETE vietato salvo tabelle in DELETE_SAFE_TABLES + WHERE
//   - INSERT vietato (rischio data corruption non revertibile)
//   - DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE sempre vietati
//   - WITH (CTE): ispezione ricorsiva — vietato se contiene UPDATE/DELETE/INSERT,
//     anche solo data-modifying CTE (es. WITH x AS (DELETE FROM t RETURNING *) ...)
import { parse, type Statement } from "pgsql-ast-parser";
import { DELETE_SAFE_TABLES, UPDATE_SAFE_TABLES } from "./framework";

export interface SafetyResult {
  safe: boolean;
  reasons: string[];
  statements: string[];        // tipi rilevati (per UI: SELECT, UPDATE...)
  affectedTables: string[];
}

const FORBIDDEN_KINDS = new Set([
  "drop", "truncate table", "alter table", "alter schema", "alter sequence",
  "create table", "create index", "create view", "create schema",
  "grant", "revoke", "do", "create function", "create trigger",
  "merge", "copy", "set", "reset", "vacuum", "analyze",
]);

interface AstNode {
  type?: string;
  where?: unknown;
  table?: { name?: string } | { name?: string }[];
  from?: unknown;
  bind?: AstNode[];                // CTE bindings (pgsql-ast-parser shape)
  in?: AstNode;                    // CTE body
  statement?: AstNode;             // inner statement for WITH
}

function tableNames(node: AstNode): string[] {
  const t = node.table;
  if (!t) return [];
  if (Array.isArray(t)) return t.map((x) => x?.name ?? "").filter(Boolean);
  return [t.name ?? ""].filter(Boolean);
}

// Camminata ricorsiva: cerca qualunque sotto-nodo "insert/update/delete/merge".
function findDataMutations(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  const n = node as Record<string, unknown>;
  const t = typeof n.type === "string" ? n.type.toLowerCase() : null;
  if (t === "insert" || t === "update" || t === "delete" || t === "merge") found.push(t);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((x) => findDataMutations(x, found));
    else if (v && typeof v === "object") findDataMutations(v, found);
  }
  return found;
}

function analyzeStatement(stmt: AstNode, reasons: string[], statementKinds: string[], tables: string[]): void {
  const kind = (stmt.type ?? "unknown").toLowerCase();
  statementKinds.push(kind);

  if (FORBIDDEN_KINDS.has(kind)) { reasons.push(`Operazione vietata: ${kind}`); return; }

  if (kind === "with" || kind === "with recursive") {
    // Vietato qualunque CTE che muta dati. Anche se la statement finale è SELECT.
    const muts = findDataMutations(stmt);
    if (muts.length) {
      reasons.push(`WITH/CTE contiene operazioni di mutazione vietate: ${Array.from(new Set(muts)).join(",")}`);
      return;
    }
    // Analizza la statement esterna se esposta
    if (stmt.in) analyzeStatement(stmt.in, reasons, statementKinds, tables);
    else if (stmt.statement) analyzeStatement(stmt.statement, reasons, statementKinds, tables);
    return;
  }

  if (kind === "select") return; // SELECT puro è sempre safe.

  if (kind === "update") {
    if (!stmt.where) { reasons.push("UPDATE senza WHERE vietato"); return; }
    const tbls = tableNames(stmt);
    if (!tbls.length) { reasons.push("UPDATE su tabella non identificabile"); return; }
    tables.push(...tbls);
    for (const t of tbls) {
      if (!UPDATE_SAFE_TABLES.has(t)) reasons.push(`UPDATE su tabella non in whitelist: ${t}`);
    }
    // Vieta sub-RETURNING che muta altre tabelle in modi non analizzati.
    return;
  }

  if (kind === "delete") {
    if (!stmt.where) { reasons.push("DELETE senza WHERE vietato"); return; }
    const tbls = tableNames(stmt);
    if (!tbls.length) { reasons.push("DELETE su tabella non identificabile"); return; }
    tables.push(...tbls);
    for (const t of tbls) {
      if (!DELETE_SAFE_TABLES.has(t)) reasons.push(`DELETE su tabella non in whitelist: ${t}`);
    }
    return;
  }

  if (kind === "insert") { reasons.push("INSERT vietato (non revertibile in auto)"); return; }

  reasons.push(`Tipo statement non riconosciuto/non consentito: ${kind}`);
}

export function analyzeSqlSafety(sql: string): SafetyResult {
  const reasons: string[] = [];
  const statementKinds: string[] = [];
  const tables: string[] = [];

  let asts: Statement[];
  try {
    asts = parse(sql, { locationTracking: false });
  } catch (err) {
    return { safe: false, reasons: [`Parser SQL fallito: ${(err as Error).message.slice(0, 150)}`], statements: [], affectedTables: [] };
  }
  if (!asts.length) return { safe: false, reasons: ["Nessuno statement SQL"], statements: [], affectedTables: [] };
  // Più di una statement separata da ';' = troppo rischio.
  if (asts.length > 1) return { safe: false, reasons: ["Più statement non consentiti (separa in chiamate distinte)"], statements: [], affectedTables: [] };

  for (const stmt of asts as unknown as AstNode[]) {
    analyzeStatement(stmt, reasons, statementKinds, tables);
  }

  return {
    safe: reasons.length === 0,
    reasons,
    statements: statementKinds,
    affectedTables: Array.from(new Set(tables)),
  };
}
