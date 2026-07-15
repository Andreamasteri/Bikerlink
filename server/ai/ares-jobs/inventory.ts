/**
 * Ares Jobs — inventario dei file sorgente + raggruppamento in chunk (Task #87).
 *
 * Condiviso da entrambe le modalità (analisi e manuale). Legge il checkout
 * LOCALE (process.cwd()): l'intero codice dell'app è già presente sul disco, non
 * serve passare da GitHub. Applica lo STESSO criterio di esclusione "di sempre"
 * usato dal ratchet dei file grandi (scripts/lib/large-files-core.ts): stessi
 * EXCLUDED_DIRS e stesse estensioni sorgente. Qui è replicato (non importato)
 * perché scripts/ non fa parte del programma TypeScript del server.
 *
 * Ares è sola lettura: questo modulo LEGGE soltanto file, non scrive mai.
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative, extname, sep } from "path";
import {
  CHUNK_BYTE_BUDGET,
  MAX_FILE_BYTES,
  SAFETY_MAX_CHUNKS,
} from "./constants";

const ROOT = process.cwd();

// Estensioni sorgente (come SCAN_EXTENSIONS del ratchet).
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

// Directory escluse — specchio di EXCLUDED_DIRS del ratchet, più cartelle che
// non descrivono funzionalità dell'app (asset, riferimenti, build).
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".local",
  ".agents",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  "server_dist",
  ".bikerblog-ref",
  "attached_assets",
  "logs",
]);

function isExcludedFile(rel: string): boolean {
  // I test non descrivono funzionalità: fuori sia per l'analisi che per il manuale.
  if (/(^|[\\/])__tests__[\\/]/.test(rel)) return true;
  if (/\.(test|spec)\.tsx?$/.test(rel)) return true;
  if (/\.d\.ts$/.test(rel)) return true;
  return false;
}

export interface AresInventoryEntry {
  /** Percorso relativo alla root del repo (POSIX-like, con `/`). */
  path: string;
  bytes: number;
}

/**
 * Elenco deterministico (ordinato per path) di tutti i file sorgente dell'app da
 * far leggere ad Ares. Ordinato così i chunk sono stabili tra le riprese.
 */
export function buildAresFileInventory(): AresInventoryEntry[] {
  const out: AresInventoryEntry[] = [];

  const walk = (absDir: string) => {
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (EXCLUDED_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
        walk(join(absDir, ent.name));
      } else if (ent.isFile()) {
        if (!SCAN_EXTENSIONS.has(extname(ent.name))) continue;
        const abs = join(absDir, ent.name);
        const rel = relative(ROOT, abs).split(sep).join("/");
        if (isExcludedFile(rel)) continue;
        let bytes = 0;
        try {
          bytes = statSync(abs).size;
        } catch {
          continue;
        }
        out.push({ path: rel, bytes });
      }
    }
  };

  walk(ROOT);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export interface AresChunk {
  /** Indice del chunk (stabile). */
  index: number;
  files: string[];
}

/**
 * Raggruppa l'inventario in chunk per budget di byte (dimensionato per il
 * throughput di Ares). Ogni chunk contiene più file finché non si supera
 * CHUNK_BYTE_BUDGET. Deterministico dato l'inventario ordinato.
 */
export function groupIntoChunks(inventory: AresInventoryEntry[]): AresChunk[] {
  const chunks: AresChunk[] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const entry of inventory) {
    const effBytes = Math.min(entry.bytes, MAX_FILE_BYTES);
    if (current.length > 0 && currentBytes + effBytes > CHUNK_BYTE_BUDGET) {
      chunks.push({ index: chunks.length, files: current });
      current = [];
      currentBytes = 0;
      if (chunks.length >= SAFETY_MAX_CHUNKS) break;
    }
    current.push(entry.path);
    currentBytes += effBytes;
  }
  if (current.length > 0 && chunks.length < SAFETY_MAX_CHUNKS) {
    chunks.push({ index: chunks.length, files: current });
  }
  return chunks;
}

/**
 * Legge il contenuto dei file di un chunk, troncando i file troppo grandi (testa)
 * per stare nel budget. Ritorna un blob unico etichettato per file, pronto per il
 * prompt. Sola lettura: nessuna scrittura.
 */
export function readChunkContent(files: string[]): string {
  const parts: string[] = [];
  for (const rel of files) {
    let content = "";
    try {
      content = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    let truncated = false;
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      content = content.slice(0, MAX_FILE_BYTES);
      truncated = true;
    }
    parts.push(
      `----- FILE: ${rel}${truncated ? " (troncato)" : ""} -----\n${content}`,
    );
  }
  return parts.join("\n\n");
}
