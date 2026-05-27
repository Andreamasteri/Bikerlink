/**
 * Task #2531 — helper CSV inline (zero dipendenze).
 * Converte un array di oggetti omogenei in stringa CSV RFC 4180.
 */

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set())
  );
  const header = cols.map(escapeCell).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}
