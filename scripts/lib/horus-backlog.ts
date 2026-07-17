/**
 * horus-backlog.ts — Funzioni pure per la generazione e filtraggio del backlog
 * di deduplicazione Horus. Estratte da log-analysis-horus.ts per consentire
 * unit testing senza dipendenze da path assoluti o filesystem globale.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.dirname(__dirname);

/**
 * Path del file contenente i ref (numeri) dei task CANCELLED/MERGED da escludere
 * dal backlog di deduplicazione Horus.
 *
 * Il file viene generato dall'agente via CodeExecution PRIMA di avviare il
 * triage, usando `queryProjectTasks({ states: ["CANCELLED", "MERGED"] })`:
 *
 *   const { tasks } = await queryProjectTasks({ states: ["CANCELLED", "MERGED"] });
 *   const refs = tasks.map(t => t.taskRef.replace(/^#/, ""));
 *   await (async (refsArg) => {
 *     "use impure";
 *     const fs = await import("node:fs/promises");
 *     await fs.writeFile(
 *       "scripts/data/horus-cancelled-refs.json",
 *       JSON.stringify({ refs: refsArg, generatedAt: new Date().toISOString(), states: ["CANCELLED", "MERGED"] }, null, 2),
 *       "utf8",
 *     );
 *   })(refs);
 *
 * Formato atteso:
 *   { "refs": ["154", "155", "450"], "generatedAt": "...", "states": [...] }
 *
 * Il file è versionato in .local/horus-cancelled-refs.json (non gitignored) così
 * un clone fresco ha già le esclusioni correnti senza richiedere un passo manuale.
 * Viene rigenerato dall'agente prima di ogni triage per includere i task chiusi
 * più recenti.
 */
/**
 * Il file è in `scripts/data/` (tracciato in git, non gitignored) così un
 * clone fresco ha già le esclusioni correnti senza richiedere un passo manuale.
 * Viene rigenerato dall'agente prima di ogni triage con
 * `queryProjectTasks({ states: ["CANCELLED", "MERGED"] })`.
 */
export const CANCELLED_REFS_FILE = path.join(SCRIPTS_DIR, "data", "horus-cancelled-refs.json");

/** Stati frontmatter che indicano un task chiuso/annullato. */
export const CLOSED_STATES = new Set(["cancelled", "merged"]);

/**
 * Parsa il frontmatter YAML minimo di un file markdown e ritorna il valore
 * lowercase del campo `state:` (es. "cancelled", "merged").
 * Ritorna null se assente o non parsabile.
 *
 * Supporta solo frontmatter semplice: ---\nkey: value\n---
 * Il blocco frontmatter deve essere all'inizio del file.
 */
export function parseFrontmatterState(content: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const frontmatter = content.slice(3, end);
  const match = frontmatter.match(/^state:\s*(\S+)/m);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Legge un file JSON di ref esclusi e ritorna l'insieme dei ref numerici
 * (come stringhe) dei task CANCELLED/MERGED.
 *
 * @param refsFile Path al file JSON. Default: CANCELLED_REFS_FILE.
 * @returns Set di stringhe (es. Set { "154", "155", "450" }).
 *          Ritorna un Set vuoto se il file è assente o illeggibile.
 */
export function loadCancelledRefs(refsFile: string = CANCELLED_REFS_FILE): Set<string> {
  if (!fs.existsSync(refsFile)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(refsFile, "utf8")) as Record<string, unknown>;
    const refs = Array.isArray(raw.refs) ? (raw.refs as unknown[]) : [];
    return new Set(refs.map(String));
  } catch {
    return new Set();
  }
}

/**
 * Legge la data di generazione dal file refs, oppure null se assente/illeggibile.
 */
export function readCancelledRefsAge(refsFile: string = CANCELLED_REFS_FILE): string | null {
  if (!fs.existsSync(refsFile)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(refsFile, "utf8")) as Record<string, unknown>;
    return typeof raw.generatedAt === "string" ? raw.generatedAt : null;
  } catch {
    return null;
  }
}

export interface BacklogCollectResult {
  titles: string[];
  skippedByRef: number;
  skippedByFrontmatter: number;
}

/**
 * Funzione pura: scorre una lista di nomi di file `.md`, legge ogni file da
 * `tasksDir`, applica i due meccanismi di esclusione (ref-list e frontmatter)
 * e ritorna i titoli inclusi insieme ai contatori di file saltati.
 *
 * Questa è la logica di filtro estratta da `generateBacklogFile()` per
 * consentire unit testing senza dipendenze da path globali.
 *
 * @param files     Lista di nomi di file (es. ["154-fix.md", "horus-abc.md"])
 * @param tasksDir  Directory assoluta da cui leggere i file
 * @param cancelledRefs  Set di ref numerici da escludere (es. Set { "154" })
 */
export function collectBacklogTitles(
  files: string[],
  tasksDir: string,
  cancelledRefs: Set<string>,
): BacklogCollectResult {
  let skippedByRef = 0;
  let skippedByFrontmatter = 0;
  const titles: string[] = [];

  for (const file of files) {
    // ── Meccanismo 1: escludi per ref numerico (da horus-cancelled-refs.json) ──
    const refMatch = /^(\d+)-/.exec(file);
    if (refMatch && cancelledRefs.has(refMatch[1])) {
      skippedByRef++;
      continue;
    }

    try {
      const content = fs.readFileSync(path.join(tasksDir, file), "utf8");

      // ── Meccanismo 2: escludi per frontmatter state: cancelled / merged ──
      const fmState = parseFrontmatterState(content);
      if (fmState && CLOSED_STATES.has(fmState)) {
        skippedByFrontmatter++;
        continue;
      }

      const firstLine = content.split("\n").find((l) => l.startsWith("# "));
      if (firstLine) {
        const title = firstLine.replace(/^#\s+/, "").trim();
        if (title.length > 0) titles.push(title);
      }
    } catch {
      // file non leggibile: saltato
    }
  }

  return { titles, skippedByRef, skippedByFrontmatter };
}
