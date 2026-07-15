// Task #86 — Inventario condiviso dei file sorgente + fingerprint per-file.
//
// Fonte di verità dell'elenco di file di codice che Horus legge nelle sue due
// scansioni on-demand (analisi codice+DB e generazione manuale). Legge il
// checkout LOCALE (non GitHub): il checkout È il codice, è gratis e veloce, e
// l'esclusione di `.bikerblog-ref` (clone di riferimento su disco) conferma che
// lo scanning avviene sul filesystem.
//
// Per-file teniamo un fingerprint (hash del contenuto) + l'esito dell'ultima
// lettura (la "nota" prodotta da Horus): una passata successiva salta i file il
// cui hash non è cambiato — a costo zero, per ENTRAMBE le modalità (ognuna ha il
// suo store, perché la nota prodotta è diversa: osservazioni vs descrizione).
//
// Nessuna scrittura sul codice: sola lettura del filesystem + persistenza dello
// store in AppSettings (JSONB nel 3° argomento di upsertAppSetting).
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { storage } from "../../storage";

/** Le due modalità di scansione condividono l'inventario ma NON lo store. */
export type ScanMode = "analysis" | "manual";

const ROOT = process.cwd();

// Radici di codice sorgente da leggere: backend (server), codice condiviso
// (shared) e l'INTERO frontend dell'app Expo. In questo repo il frontend NON è
// sotto `client/` (che non esiste): è distribuito su app/ (schermate/router),
// components/, hooks/, lib/ e constants/. Tutto il resto (dipendenze, build,
// asset generati, riferimenti esterni, app annidate come bowie-terminal, servizi
// separati) è escluso perché non fa parte del codice dell'app principale.
// NOTA: è una allowlist — qualsiasi cartella non elencata qui è esclusa d'ufficio.
export const SOURCE_ROOTS = [
  "server",
  "shared",
  "app",
  "components",
  "hooks",
  "lib",
  "constants",
] as const;
const INCLUDE_DIRS = SOURCE_ROOTS;

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

// Directory da NON scandire mai: dipendenze, build, cache, asset generati,
// riferimenti esterni (.bikerblog-ref = clone read-only del repo gemello).
const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".expo",
  ".cache",
  "coverage",
  "logs",
  "attached_assets",
  ".bikerblog-ref",
  "android",
  "ios",
  "__snapshots__",
]);

/** File da escludere anche se hanno estensione di codice (tipi generati). */
function isExcludedFile(relPath: string): boolean {
  return relPath.endsWith(".d.ts");
}

/** Enumera (ricorsivamente) tutti i file di codice sorgente rilevanti, ordinati. */
export async function enumerateSourceFiles(): Promise<string[]> {
  const out: string[] = [];

  async function walk(absDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return; // directory assente/illeggibile: salta senza far fallire l'inventario
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        if (!CODE_EXTENSIONS.has(path.extname(entry.name))) continue;
        const rel = path.relative(ROOT, abs);
        if (isExcludedFile(rel)) continue;
        out.push(rel);
      }
    }
  }

  for (const dir of INCLUDE_DIRS) {
    await walk(path.join(ROOT, dir));
  }
  out.sort();
  return out;
}

/** Legge un file e ne calcola l'hash del contenuto (null se illeggibile/sparito). */
export async function readAndHashFile(
  relPath: string,
): Promise<{ hash: string; content: string } | null> {
  try {
    const content = await fs.readFile(path.join(ROOT, relPath), "utf8");
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 32);
    return { hash, content };
  } catch {
    return null;
  }
}

// ── Store persistente per-file (hash + nota + timestamp) ─────────────────────

export interface FileScanRecord {
  /** Hash del contenuto letto l'ultima volta. */
  hash: string;
  /** Esito della lettura: osservazioni (analisi) o descrizione (manuale). */
  note: string;
  /** ISO timestamp dell'ultima lettura. */
  at: string;
}

export type FileScanStore = Record<string, FileScanRecord>;

const STORE_KEY: Record<ScanMode, string> = {
  analysis: "horus_scan_files_analysis",
  manual: "horus_scan_files_manual",
};

export async function loadFileScanStore(mode: ScanMode): Promise<FileScanStore> {
  const row = await storage.getAppSetting(STORE_KEY[mode]);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as FileScanStore;
  }
  return {};
}

export async function saveFileScanStore(mode: ScanMode, store: FileScanStore): Promise<void> {
  // JSONB nel 3° argomento (memory: appsetting-valuejson).
  await storage.upsertAppSetting(STORE_KEY[mode], undefined, store);
}

export interface PendingComputation {
  /** Tutti i file sorgente correnti. */
  files: string[];
  /** File cambiati o mai analizzati (da leggere in questa passata). */
  pending: string[];
  /** Quanti file invariati sono stati saltati. */
  unchanged: number;
  /** Store corrente (già ripulito dai file spariti). */
  store: FileScanStore;
  /** Hash correnti per path (per marcare lo store man mano). */
  hashes: Record<string, string>;
}

/**
 * Confronta il filesystem con lo store per capire cosa va (ri)analizzato. I file
 * il cui hash coincide con lo store vengono saltati; quelli spariti vengono
 * rimossi dallo store.
 */
export async function computePending(mode: ScanMode): Promise<PendingComputation> {
  const files = await enumerateSourceFiles();
  const store = await loadFileScanStore(mode);
  const present = new Set(files);
  const pending: string[] = [];
  const hashes: Record<string, string> = {};
  let unchanged = 0;

  for (const rel of files) {
    const read = await readAndHashFile(rel);
    if (!read) continue;
    hashes[rel] = read.hash;
    if (store[rel] && store[rel].hash === read.hash) {
      unchanged++;
    } else {
      pending.push(rel);
    }
  }

  // Poda: rimuovi dallo store i file che non esistono più (niente note stantie).
  for (const key of Object.keys(store)) {
    if (!present.has(key)) delete store[key];
  }

  return { files, pending, unchanged, store, hashes };
}
