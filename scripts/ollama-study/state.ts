/**
 * Stato persistente su disco per lo studio codebase, così il run può avanzare
 * UNA chiamata Ollama per invocazione e sopravvivere a interruzioni / cap di
 * tempo (es. il limite 120s del foreground nel loop dell'agent).
 *
 * - `files.json`  cache dei file scaricati da GitHub (si scarica una volta sola).
 * - `state.json`  avanzamento: riassunti per-chunk, dump+riassunto DB, report.
 */

import fs from "fs";
import path from "path";
import { ROOT, type DownloadedFile } from "./config";

export interface StudyState {
  branch: string;
  model: string;
  chunkChars: number;
  numCtx: number;
  noDb: boolean;
  maxFiles: number | null;
  totalChunks: number;
  /** Riassunto per ogni chunk; `null` = ancora da fare. */
  summaries: (string | null)[];
  /** Dump grezzo (dev+prod) in cache; `null` = ancora da estrarre. */
  dbRaw: string | null;
  /** Riassunto del dump DB; `null` = ancora da fare. */
  dbSummary: string | null;
  /**
   * Coda del REDUCE gerarchico: parte dai riassunti per-chunk e viene ridotta
   * (fold) UN passo per invocazione finché entra nel budget di contesto, così
   * anche il report finale non sfora `num_ctx`. `null` = non ancora inizializzata.
   */
  reduceQueue: string[] | null;
  reportPath: string | null;
  done: boolean;
}

export function resolveStateDir(dir: string | null): string {
  return dir ? path.resolve(ROOT, dir) : path.join(ROOT, ".local", "ollama-study-state");
}

function filesFile(dir: string): string {
  return path.join(dir, "files.json");
}
function stateFile(dir: string): string {
  return path.join(dir, "state.json");
}

export function loadFiles(dir: string): DownloadedFile[] | null {
  try {
    return JSON.parse(fs.readFileSync(filesFile(dir), "utf8")) as DownloadedFile[];
  } catch {
    return null;
  }
}
export function saveFiles(dir: string, files: DownloadedFile[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filesFile(dir), JSON.stringify(files), "utf8");
}

export function loadState(dir: string): StudyState | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile(dir), "utf8")) as StudyState;
  } catch {
    return null;
  }
}
export function saveState(dir: string, s: StudyState): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFile(dir), JSON.stringify(s, null, 2), "utf8");
}

export function clearState(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
