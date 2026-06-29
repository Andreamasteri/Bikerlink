/**
 * Configurazione + CLI per lo studio codebase BikerLink con Ollama (Task #5187).
 * Vedi `scripts/ollama-study-repo.ts` per la descrizione completa e l'uso.
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Radice del workspace (scripts/ollama-study/ → ../..). */
export const ROOT = path.resolve(__dirname, "../..");

// ─── Costanti ──────────────────────────────────────────────────────────────

export const GITHUB_REPO = "Andreamasteri/Bikerlink";
export const DEFAULT_BRANCH = "main";
export const DEFAULT_MODEL = "qwen3.6:35b";

/** Estensioni di file da includere nello studio della codebase. */
export const INCLUDE_EXTENSIONS = [".ts", ".tsx", ".sql", ".json"];

/** Prefissi di path da escludere (rumore / generati / pesanti). */
export const EXCLUDE_PREFIXES = [
  "node_modules/",
  ".expo/",
  "dist/",
  "build/",
  ".cache/",
  "ios/",
  "android/",
  "assets/",
  "logs/",
  ".local/",
  "package-lock.json",
];

/** File JSON rilevanti (gli altri .json — es. lockfile, traduzioni enormi — saltati). */
export const RELEVANT_JSON = ["package.json", "app.json", "tsconfig.json", "eas.json", "drizzle.config.json"];

/** Dimensione massima di un singolo file scaricato (byte). Oltre → saltato. */
export const MAX_FILE_BYTES = 100_000;

/** Concorrenza massima dei download da GitHub. */
export const DOWNLOAD_CONCURRENCY = 10;

/** Dimensione di default di un chunk di codice (caratteri ≈ 4 char/token). */
export const DEFAULT_CHUNK_CHARS = 480_000;

/** Budget massimo di caratteri per il dump DATI dei DB (schema sempre intero). */
export const MAX_DB_CHARS = 200_000;

/** Timeout per singola chiamata Ollama (lo studio per chunk può essere lungo). */
export const REQUEST_TIMEOUT_MS = 300_000;

/** Timeout connessione DB. */
export const DB_CONNECT_TIMEOUT_MS = 10_000;

/** Un file sorgente scaricato dal repo. */
export interface DownloadedFile {
  path: string;
  content: string;
}

// ─── CLI ──────────────────────────────────────────────────────────────────

export interface Cli {
  dryRun: boolean;
  noDb: boolean;
  branch: string;
  maxFiles: number | null;
  chunkChars: number;
}

export function parseCli(): Cli {
  const argv = process.argv;
  const flag = (name: string): boolean => argv.includes(name);
  const value = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
  };
  const intValue = (name: string, fallback: number | null): number | null => {
    const raw = value(name);
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    dryRun: flag("--dry-run"),
    noDb: flag("--no-db"),
    branch: value("--branch") || DEFAULT_BRANCH,
    maxFiles: intValue("--max-files", null),
    chunkChars: intValue("--chunk-chars", DEFAULT_CHUNK_CHARS) ?? DEFAULT_CHUNK_CHARS,
  };
}
