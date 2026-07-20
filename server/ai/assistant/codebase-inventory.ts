// Task #86 — Inventario condiviso dei file sorgente + fingerprint per-file.
//
// Fonte di verità dell'elenco di file di codice che Horus legge nelle sue due
// scansioni on-demand (analisi codice+DB e generazione manuale). Usa `git ls-files`
// per enumerare i file: lista STABILE e ORDINATA, .gitignore applicato
// automaticamente (esclude node_modules, dist, .cache, android, ios, ecc. senza
// dover mantenere EXCLUDE_DIR_NAMES a mano), resume deterministico tramite lo
// store hash (nessun ricalcolo su file non tracciati).
//
// Per-file teniamo un fingerprint (hash del contenuto) + l'esito dell'ultima
// lettura (la "nota" prodotta da Horus): una passata successiva salta i file il
// cui hash non è cambiato — a costo zero, per TUTTE e tre le modalità (ognuna ha
// il suo store, perché la nota prodotta è diversa).
//
// Nessuna scrittura sul codice: sola lettura del filesystem + persistenza dello
// store in AppSettings (JSONB nel 3° argomento di upsertAppSetting).
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { storage } from "../../storage";

/** Le tre modalità di scansione condividono l'inventario ma NON lo store. */
export type ScanMode = "analysis" | "manual" | "security";

/**
 * Contratto di system prompt condiviso da tutte le chiamate Ollama delle scansioni
 * di Horus (nota per-file, sintesi proposte, sezioni di manuale).
 *
 * Verificato live (2026-07-15) su qwen3:4b/Ollama: `think:false` E `/no_think` NON
 * sopprimono il ragionamento — il modello "pensa ad alta voce" in inglese, spesso
 * SENZA alcun tag `<think>`, e con un budget di token insufficiente il ragionamento
 * consuma tutto lo spazio disponibile senza mai arrivare alla risposta vera
 * (troncamento a metà pensiero, non un output incompleto per scelta).
 *
 * Horus non è una chat: il suo output finisce in un file/proposta che un altro
 * agente interpreta, quindi vale la precisione sopra la rapidità — nessuna fretta,
 * nessun limite al ragionamento. La leva giusta non è "rispondi breve" ma dare un
 * contratto esplicito (racchiudi il pensiero, quanto ti serve, tra <think></think>)
 * + un budget di token generoso perché il ragionamento possa esaurirsi E la
 * risposta finale possa essere scritta per intero dopo il tag di chiusura.
 */
export const HORUS_THINK_TAG_CONTRACT = `Sei Horus. Puoi ragionare quanto ti serve, con tutta la profondità e il tempo necessari: nessuna fretta, nessun limite al pensiero — la precisione conta più della rapidità.
Però racchiudi SEMPRE ed ESCLUSIVAMENTE il tuo ragionamento tra i tag <think> e </think>.
Dopo il tag </think> di chiusura scrivi SOLO il risultato finale richiesto, senza ripetere né riassumere il ragionamento e senza premesse tipo "Okay", "Let me", "The user wants".
Se non hai bisogno di ragionare, va bene anche <think></think> vuoto seguito subito dal risultato finale.`;

/**
 * Task #152 — Blocco lingua/stile OBBLIGATORIO in testa a OGNI prompt della
 * generazione del manuale (per-file funzionale, per-file lessicale, per-sezione,
 * dizionario, panoramica, glossario).
 *
 * Il manuale è scritto SOLO in italiano (lingua sorgente e canonica: il
 * dizionario UI e la documentazione interna sono in italiano) e poi tradotto
 * automaticamente nelle altre 6 lingue app. Lo stile deve quindi essere chiaro e
 * traducibile: frasi complete, niente idiomi, terminologia tecnica internazionale,
 * nomi propri invariati, label UI tra virgolette in italiano.
 */
export const MANUAL_LANGUAGE_STYLE_BLOCK = `LINGUA E STILE DI SCRITTURA (obbligatorio):
Scrivi SEMPRE e SOLO in italiano. L'italiano è la lingua sorgente e canonica
di BikerLink: il dizionario UI, la documentazione interna e queste istruzioni
sono in italiano perché è la lingua più completa e precisa per l'app.

Il manuale verrà tradotto automaticamente in:
  • Inglese (English) • Tedesco (Deutsch) • Spagnolo (Español)
  • Francese (Français) • Greco (Ελληνικά) • Turco (Türkçe)

Per traduzioni accurate:
✓ Frasi complete (soggetto + verbo + complemento)
✓ No abbreviazioni italiane non universali (cfr., vd., s.v.)
✓ No modi di dire o metafore idiomatiche italiane
✓ Terminologia tecnica internazionale (routing, GPS, non instradamento/navigatore)
✓ Nomi propri (Bowie, Horus, Nadir, ThinkCentre…) invariati in tutte le lingue
✓ Label UI tra virgolette in italiano ("Partecipa", "Salva percorso")`;

const ROOT = process.cwd();

// Task #152 — Dizionario i18n italiano passato ai prompt LESSICALI del manuale,
// così Horus risolve `t("proposals.join")` → "Partecipa" invece di trattare la
// chiave come testo opaco. Letto una sola volta per scansione. Cap prudente per
// non far esplodere i prompt (il dizionario è ampio ma non illimitato).
const I18N_DICT_FILES = ["lib/i18n/it.ts", "lib/i18n/ai-assistant-it.ts"] as const;
const I18N_DICT_MAX_CHARS = 60_000;

// Radici di codice sorgente da leggere: backend (server), codice condiviso
// (shared) e l'INTERO frontend dell'app Expo. In questo repo il frontend NON è
// sotto `client/` (che non esiste): è distribuito su app/ (schermate/router),
// components/, hooks/, lib/ e constants/. Tutto il resto (dipendenze, build,
// asset generati, riferimenti esterni, app annidate come bowie-terminal, servizi
// separati) è escluso perché non fa parte del codice dell'app principale.
// NOTA: è una allowlist — qualsiasi cartella non elencata qui è esclusa d'ufficio.
// Con git ls-files l'esclusione delle directory generate è automatica via .gitignore;
// SOURCE_ROOTS funge da ulteriore filtro per restringere lo scope.
export const SOURCE_ROOTS = [
  "server",
  "shared",
  "app",
  "components",
  "hooks",
  "lib",
  "constants",
] as const;

/** File da escludere anche se tracciati da git (tipi generati). */
function isExcludedFile(relPath: string): boolean {
  return relPath.endsWith(".d.ts");
}

/**
 * Task #683 — Filtro file ad alto rischio per la modalità SECURITY.
 * Seleziona solo file del backend con pattern sensibili alla sicurezza:
 * route API, autenticazione, middleware, helper DB diretti, upload/file.
 * Solo backend (server/): il frontend React Native è escluso per questa modalità.
 */
export const SECURITY_FILE_PATTERNS = [
  "server/routes/",
  "server/auth",
  "server/middleware/",
  "server/lib/",
  "server/ai/coordinator/",
] as const;

const SECURITY_FILENAME_RE = /\b(query|sql|db|upload|file)\b/i;

export function isSecurityFile(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (!p.startsWith("server/")) return false;
  for (const prefix of SECURITY_FILE_PATTERNS) {
    if (p.startsWith(prefix)) return true;
  }
  const filename = p.split("/").pop() ?? "";
  return SECURITY_FILENAME_RE.test(filename);
}

/**
 * Task #176 — Verifica se un file è eleggibile per la nota lessicale UI.
 * Spostato da horus-scanner.ts in questo modulo così che computePending possa
 * usarlo per il backfill delle note lessicali mancanti (vedi sotto).
 *
 * Solo `.tsx` in `app/` e `components/` ha un'interfaccia utente documentabile.
 */
export function isLexiconEligible(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  return p.endsWith(".tsx") && (p.startsWith("app/") || p.startsWith("components/"));
}

/**
 * Enumera tutti i file di codice sorgente rilevanti usando `git ls-files`.
 *
 * Vantaggi rispetto al walker ricorsivo precedente:
 * - Lista STABILE e ORDINATA ad ogni run (indice = file → cursore lastFile affidabile).
 * - .gitignore applicato automaticamente: node_modules, dist, .cache, android, ios
 *   ecc. esclusi senza dover aggiornare EXCLUDE_DIR_NAMES.
 * - Resume deterministico: lo stesso file ha sempre lo stesso indice nella lista.
 * - Più veloce: O(git index) invece di O(filesystem).
 *
 * Post-filtro JS:
 * - Solo file sotto SOURCE_ROOTS (allowlist di cartelle sorgente).
 * - Solo estensioni di codice (.ts, .tsx, .js, .jsx).
 * - Esclusi i file .d.ts (tipi generati).
 */
export async function enumerateSourceFiles(): Promise<string[]> {
  const result = spawnSync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx", "*.js", "*.jsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
  );

  if (result.error) {
    throw new Error(`git ls-files non disponibile: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git ls-files fallita (exit ${result.status}): ${(result.stderr ?? "").slice(0, 300)}`);
  }

  const lines = (result.stdout ?? "").split("\n");
  const out: string[] = [];
  for (const rel of lines) {
    if (!rel) continue;
    // Normalizza separatori (Windows → unix) per i confronti con SOURCE_ROOTS.
    const normalized = rel.replace(/\\/g, "/");
    // Allowlist: solo le cartelle sorgente definite in SOURCE_ROOTS.
    const inSourceRoot = SOURCE_ROOTS.some(
      (r) => normalized === r || normalized.startsWith(r + "/"),
    );
    if (!inSourceRoot) continue;
    // Escludi file generati (.d.ts).
    if (isExcludedFile(normalized)) continue;
    out.push(normalized);
  }
  // git ls-files restituisce già output ordinato; .sort() non necessario.
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

/**
 * Task #152 — Carica il dizionario i18n italiano come stringa compatta
 * `chiave=valore` (una per riga), da passare ai prompt LESSICALI del manuale.
 * Legge i file sorgente del dizionario e ne estrae le coppie `"chiave": "valore"`
 * con una regex (nessun import di moduli RN lato server). Troncato a
 * I18N_DICT_MAX_CHARS per non gonfiare i prompt. Chiamato una sola volta per
 * scansione (il risultato è passato ai prompt dei file frontend).
 */
export async function loadI18nDictionary(): Promise<string> {
  const lines: string[] = [];
  let size = 0;
  const pairRe = /"([A-Za-z0-9_.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const rel of I18N_DICT_FILES) {
    let text: string;
    try {
      text = await fs.readFile(path.join(ROOT, rel), "utf8");
    } catch {
      continue; // file assente: salta senza far fallire la scansione
    }
    let m: RegExpExecArray | null;
    pairRe.lastIndex = 0;
    while ((m = pairRe.exec(text)) !== null) {
      const key = m[1];
      const value = m[2]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!value) continue;
      const line = `${key}=${value}`;
      if (size + line.length + 1 > I18N_DICT_MAX_CHARS) return lines.join("\n");
      lines.push(line);
      size += line.length + 1;
    }
  }
  return lines.join("\n");
}

// ── Store persistente per-file (hash + nota + timestamp) ─────────────────────

export interface FileScanRecord {
  /** Hash del contenuto letto l'ultima volta. */
  hash: string;
  /** Esito della lettura: osservazioni (analisi) o descrizione funzionale (manuale). */
  note: string;
  /**
   * Task #152 — Solo modalità MANUALE, solo per le schermate/componenti UI
   * (`.tsx` in `app/` e `components/`): documentazione lessicale dell'interfaccia
   * (titolo, tab, bottoni, campi, messaggi, modal, voci di menu con testo esatto
   * risolto dal dizionario i18n). Separato da `note` (funzionale) così le due
   * fasi del manuale — sezioni funzionali e dizionario dell'interfaccia — usano
   * ognuna la propria fonte.
   */
  lexiconNote?: string;
  /** ISO timestamp dell'ultima lettura. */
  at: string;
}

export type FileScanStore = Record<string, FileScanRecord>;

const STORE_KEY: Record<ScanMode, string> = {
  analysis: "horus_scan_files_analysis",
  manual: "horus_scan_files_manual",
  security: "horus_scan_files_security",
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
 * rimossi dallo store. Per la modalità SECURITY il set di file viene pre-filtrato
 * ai soli file ad alto rischio backend (isSecurityFile), riducendo il carico da
 * 500+ a 80-150 file circa.
 */
export async function computePending(mode: ScanMode): Promise<PendingComputation> {
  const allFiles = await enumerateSourceFiles();
  // Task #683 — modalità security: solo file ad alto rischio del backend.
  const files = mode === "security" ? allFiles.filter(isSecurityFile) : allFiles;
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
      // Task #176 — Backfill: anche se l'hash non è cambiato, se siamo in
      // modalità MANUALE e il file è eleggibile per la nota lessicale ma ne è
      // privo (scansioni pre-Task #152 o completamenti parziali), va inserito
      // nel batch così che processFile produca la lexiconNote mancante.
      if (mode === "manual" && isLexiconEligible(rel) && !store[rel].lexiconNote) {
        pending.push(rel);
      } else {
        unchanged++;
      }
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
