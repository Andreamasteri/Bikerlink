/**
 * Pure string-transform helpers used by both log-analysis-horus.ts (to
 * normalise the raw Horus response) and the companion unit-test suite.
 * No server-side imports — keep this file dependency-free.
 */

/**
 * Converts a Horus response that contains "## TASK PROPOSTI DA HORUS" as a
 * bullet/numbered list into a markdown table so that horus-propose-tasks.ts
 * can parse it uniformly.
 *
 * Rules applied to each list item:
 *  1. Strip trailing "(file: …)" annotations (complete or cut-off).
 *  2. Truncate at a word boundary (last space ≤ 80 chars) instead of
 *     mid-character, falling back to a hard cut only when no space is found
 *     within the first 10 characters.
 *  3. Escape pipe characters with an em-dash so the table stays valid.
 *
 * If the section already contains a markdown table, or if the section is
 * absent, the report is returned unchanged.
 */
export function normalizeTaskSection(report: string): string {
  const TASK_HEADER = "## TASK PROPOSTI DA HORUS";
  const idx = report.indexOf(TASK_HEADER);
  if (idx === -1) return report;

  const before = report.slice(0, idx + TASK_HEADER.length);
  const after = report.slice(idx + TASK_HEADER.length);

  // Se c'è già una tabella (almeno una riga con pipe), lascia invariato
  if (/^\s*\|/m.test(after.split(/\n##/)[0])) return report;

  // Estrai righe della lista (numerate "1. testo" o puntate "- testo" o "* testo")
  const sectionBody = after.split(/\n##/)[0];
  const restAfterSection = after.slice(sectionBody.length);

  const listItemRe = /^(?:\d+\.|[-*])\s+(.+)$/;
  const rows: string[] = [];
  for (const line of sectionBody.split("\n")) {
    const m = listItemRe.exec(line.trim());
    if (m) {
      // Strip trailing "(file: ...)" annotations that Horus sometimes appends
      // (handles both complete "(file: foo.ts)" and incomplete "(file: `foo" cut-offs)
      let raw = m[1].replace(/\s*\(file:[^)]*\)?$/, "").trim();
      // Truncate at word boundary instead of mid-character
      if (raw.length > 80) {
        const cut = raw.slice(0, 80);
        const lastSpace = cut.lastIndexOf(" ");
        raw = lastSpace > 10 ? cut.slice(0, lastSpace) : cut;
      }
      const titolo = raw.replace(/\|/g, "—");
      rows.push(`| ${titolo} | media | vedi analisi | ${titolo} |`);
    }
  }

  if (rows.length === 0) return report; // niente da convertire

  const table =
    "\n| Titolo | Priorità | Problema | Azione |\n" +
    "|--------|----------|---------|--------|\n" +
    rows.join("\n") +
    "\n";

  return before + table + (restAfterSection ? restAfterSection : "");
}
