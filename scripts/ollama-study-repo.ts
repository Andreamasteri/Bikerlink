/**
 * BikerLink — Studio codebase + dump DB con Ollama (PC dedicato)  (Task #5187)
 *
 * Scarica l'intera codebase BikerLink da GitHub (token read-only), la manda a
 * Ollama a chunk per fargli studiare l'architettura, aggiunge al payload il dump
 * completo di schema + dati di ENTRAMBI i DB (dev e prod) e produce un report
 * architetturale in `logs/repo-study-<timestamp>.md`. La sezione `## Architettura`
 * del report viene iniettata in `.agents/skills/ollama-diagnostics/bikerlink-context.md`
 * così Ollama ha una conoscenza completa e persistente del progetto.
 *
 * Distinto da `scripts/ollama-diagnose.ts` (diagnosi crash/boot): questo è uno
 * STUDIO completo, non un triage di crash. Non modifica i DB (sola lettura).
 *
 * La chiamata è HTTP DIRETTA all'endpoint Ollama (`${DIAG_OLLAMA_URL}/api/chat`),
 * con gli header del Service Token Cloudflare Access (se configurati) + Bearer
 * fallback. NON passa dal backend Express.
 *
 * Uso:
 *   npx tsx scripts/ollama-study-repo.ts
 *   npx tsx scripts/ollama-study-repo.ts --dry-run            # lista file, niente invio
 *   npx tsx scripts/ollama-study-repo.ts --no-db              # salta il dump dei DB
 *   npx tsx scripts/ollama-study-repo.ts --branch develop     # altro branch
 *   npx tsx scripts/ollama-study-repo.ts --max-files 800      # limita i file scaricati
 *   npx tsx scripts/ollama-study-repo.ts --chunk-chars 360000 # dimensione chunk
 *
 * Secret/env:
 *   DIAG_OLLAMA_URL    — URL base dell'Ollama sul PC dedicato (via Cloudflare Tunnel).
 *   DIAG_OLLAMA_MODEL  — modello da usare (default "qwen3.6:35b").
 *   DIAG_OLLAMA_TOKEN  — opzionale, Bearer token se l'endpoint è protetto.
 *   DIAG_GITHUB_TOKEN  — token GitHub READ-ONLY (fine-grained, Contents:read).
 *                        Fallback a GITHUB_TOKEN solo se DIAG_GITHUB_TOKEN assente.
 *   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET — Service Token Cloudflare Access.
 *   DATABASE_URL       — DB dev (sola lettura).
 *   PROD_DATABASE_URL  — DB prod (sola lettura). Mancante → sezione "[non disponibile]".
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { cfAccessHeaders } from "../server/lib/cf-access";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione ───────────────────────────────────────────────────────────

const GITHUB_REPO = "Andreamasteri/Bikerlink";
const DEFAULT_BRANCH = "main";
const DEFAULT_MODEL = "qwen3.6:35b";

/** Estensioni di file da includere nello studio della codebase. */
const INCLUDE_EXTENSIONS = [".ts", ".tsx", ".sql", ".json"];

/** Prefissi di path da escludere (rumore / generati / pesanti). */
const EXCLUDE_PREFIXES = [
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
const RELEVANT_JSON = ["package.json", "app.json", "tsconfig.json", "eas.json", "drizzle.config.json"];

/** Dimensione massima di un singolo file scaricato (byte). Oltre → saltato. */
const MAX_FILE_BYTES = 100_000;

/** Concorrenza massima dei download da GitHub. */
const DOWNLOAD_CONCURRENCY = 10;

/** Dimensione di default di un chunk di codice (caratteri ≈ 4 char/token). */
const DEFAULT_CHUNK_CHARS = 480_000;

/** Budget massimo di caratteri per il dump DATI dei DB (schema sempre intero). */
const MAX_DB_CHARS = 200_000;

/** Timeout per singola chiamata Ollama (lo studio per chunk può essere lungo). */
const REQUEST_TIMEOUT_MS = 300_000;

/** Timeout connessione DB. */
const DB_CONNECT_TIMEOUT_MS = 10_000;

// ─── CLI ──────────────────────────────────────────────────────────────────────

interface Cli {
  dryRun: boolean;
  noDb: boolean;
  branch: string;
  maxFiles: number | null;
  chunkChars: number;
}

function parseCli(): Cli {
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

// ─── GitHub ─────────────────────────────────────────────────────────────────

function githubToken(): string | null {
  return process.env.DIAG_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BikerLink-Study/1.0",
  };
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

function isRelevantPath(p: string, size: number | undefined): boolean {
  if (EXCLUDE_PREFIXES.some((pre) => p === pre || p.startsWith(pre))) return false;
  if (typeof size === "number" && size > MAX_FILE_BYTES) return false;
  const ext = path.extname(p);
  if (!INCLUDE_EXTENSIONS.includes(ext)) return false;
  if (ext === ".json") {
    const base = path.basename(p);
    if (!RELEVANT_JSON.includes(base)) return false;
  }
  return true;
}

/** Ritorna la lista filtrata e ordinata dei path sorgente del repo. */
async function fetchFileList(branch: string, token: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub trees ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
  }
  const data = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
  if (data.truncated) {
    console.warn("⚠️  GitHub ha troncato l'albero (repo molto grande): alcuni file potrebbero mancare.");
  }
  const files = (data.tree || [])
    .filter((e) => e.type === "blob" && isRelevantPath(e.path, e.size))
    .map((e) => e.path)
    .sort();
  return files;
}

interface DownloadedFile {
  path: string;
  content: string;
}

/** Scarica un singolo file raw da GitHub (base64 decode). null se fallisce. */
async function downloadFile(rel: string, branch: string, token: string): Promise<DownloadedFile | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURI(rel)}?ref=${branch}`;
    const res = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { path: rel, content };
  } catch {
    return null;
  }
}

/** Scarica tutti i file in batch paralleli ≤ DOWNLOAD_CONCURRENCY. */
async function downloadAll(
  files: string[],
  branch: string,
  token: string,
): Promise<{ downloaded: DownloadedFile[]; failed: string[] }> {
  const downloaded: DownloadedFile[] = [];
  const failed: string[] = [];
  for (let i = 0; i < files.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = files.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(batch.map((f) => downloadFile(f, branch, token)));
    results.forEach((r, idx) => {
      if (r) downloaded.push(r);
      else failed.push(batch[idx]);
    });
    process.stdout.write(`\r  ⬇️  scaricati ${downloaded.length}/${files.length} file...`);
  }
  process.stdout.write("\n");
  return { downloaded, failed };
}

// ─── Chunking ───────────────────────────────────────────────────────────────

/** Raggruppa i file in chunk ≤ chunkChars rispettando i confini di file. */
function buildChunks(files: DownloadedFile[], chunkChars: number): string[] {
  const chunks: string[] = [];
  let buf: string[] = [];
  let len = 0;
  const flush = () => {
    if (buf.length) {
      chunks.push(buf.join("\n\n"));
      buf = [];
      len = 0;
    }
  };
  for (const f of files) {
    const block = `// FILE: ${f.path}\n${f.content}`;
    // Se un singolo file supera il budget, lo isola (troncato).
    if (block.length > chunkChars) {
      flush();
      chunks.push(block.slice(0, chunkChars) + "\n\n...[file troncato]...");
      continue;
    }
    if (len + block.length > chunkChars) flush();
    buf.push(block);
    len += block.length + 2;
  }
  flush();
  return chunks;
}

// ─── Dump DB ────────────────────────────────────────────────────────────────

interface TableRowCount {
  table: string;
  rows: number;
}

/** Quota un identificatore SQL (doppi apici raddoppiati) per uso sicuro in query. */
function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * Schema COMPLETO di un DB da pg_catalog: colonne, constraint (PK/FK/UNIQUE/CHECK),
 * indici, enum e sequenze. Sempre incluso per intero (mai troncato), così il
 * confronto dev↔prod resta affidabile.
 */
async function dumpSchema(client: Client): Promise<string> {
  // 1. Colonne per tabella
  const cols = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);
  const byTable = new Map<string, string[]>();
  for (const r of cols.rows) {
    const line = `  ${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}${
      r.column_default ? ` DEFAULT ${r.column_default}` : ""
    }`;
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name)!.push(line);
  }
  const tableParts: string[] = [];
  for (const [table, lines] of [...byTable.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    tableParts.push(`TABLE ${table}\n${lines.join("\n")}`);
  }

  // 2. Constraint (PK/FK/UNIQUE/CHECK) via pg_constraint + pg_get_constraintdef
  const cons = await client.query<{ table_name: string; conname: string; def: string }>(`
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, conname
  `);
  const consPart = cons.rows.map((r) => `  ${r.table_name}.${r.conname}: ${r.def}`).join("\n");

  // 3. Indici
  const idx = await client.query<{ tablename: string; indexname: string; indexdef: string }>(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname
  `);
  const idxPart = idx.rows.map((r) => `  ${r.indexdef}`).join("\n");

  // 4. Enum
  const enums = await client.query<{ typname: string; labels: string }>(`
    SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname
  `);
  const enumPart = enums.rows.map((r) => `  ${r.typname} = {${r.labels}}`).join("\n");

  // 5. Sequenze
  const seq = await client.query<{ sequence_name: string }>(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public' ORDER BY sequence_name
  `);
  const seqPart = seq.rows.map((r) => `  ${r.sequence_name}`).join("\n");

  return [
    `### Tabelle e colonne (${byTable.size})\n${tableParts.join("\n\n")}`,
    `### Constraint (${cons.rows.length})\n${consPart || "  (nessuno)"}`,
    `### Indici (${idx.rows.length})\n${idxPart || "  (nessuno)"}`,
    `### Enum (${enums.rows.length})\n${enumPart || "  (nessuno)"}`,
    `### Sequenze (${seq.rows.length})\n${seqPart || "  (nessuna)"}`,
  ].join("\n\n");
}

/** Conteggio righe per tabella, dalla più piccola alla più grande. */
async function tableCounts(client: Client): Promise<TableRowCount[]> {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const counts: TableRowCount[] = [];
  for (const { table_name } of tables.rows) {
    try {
      const c = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quoteIdent(table_name)}`);
      counts.push({ table: table_name, rows: parseInt(c.rows[0]?.n ?? "0", 10) });
    } catch {
      counts.push({ table: table_name, rows: -1 });
    }
  }
  return counts.sort((a, b) => a.rows - b.rows);
}

/** Serializza i dati riga per riga, priorità tabelle piccole, budget MAX_DB_CHARS. */
async function dumpData(client: Client, counts: TableRowCount[]): Promise<string> {
  const parts: string[] = [];
  let used = 0;
  for (const { table, rows } of counts) {
    if (rows <= 0) {
      parts.push(`-- ${table}: ${rows === 0 ? "vuota" : "conteggio non disponibile"}`);
      continue;
    }
    if (used >= MAX_DB_CHARS) {
      parts.push(`-- ${table}: ${rows} righe [omesse: budget ${MAX_DB_CHARS} char esaurito]`);
      continue;
    }
    let res;
    try {
      res = await client.query(`SELECT * FROM ${quoteIdent(table)}`);
    } catch (err) {
      parts.push(`-- ${table}: errore lettura — ${(err as Error).message}`);
      continue;
    }
    const lines: string[] = [`-- ${table} (${rows} righe)`];
    let truncated = 0;
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i] as Record<string, unknown>;
      const serial = Object.entries(row)
        .map(([k, v]) => `${k}=${serializeVal(v)}`)
        .join(" | ");
      const line = `${table} | ${serial}`;
      if (used + line.length > MAX_DB_CHARS) {
        truncated = res.rows.length - i;
        break;
      }
      lines.push(line);
      used += line.length + 1;
    }
    if (truncated > 0) lines.push(`-- ...${truncated} righe troncate (budget esaurito)`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

function serializeVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}

/** Dump completo (schema + dati) di un DB. Ritorna messaggio di errore se irraggiungibile. */
async function dumpDatabase(label: string, connString: string | undefined, noDb: boolean): Promise<string> {
  if (noDb) return `## DATABASE ${label}\n\n[saltato: --no-db]`;
  if (!connString) return `## DATABASE ${label}\n\n[non disponibile: variabile d'ambiente non impostata]`;
  const client = new Client({
    connectionString: connString,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    statement_timeout: 30_000,
  });
  try {
    await client.connect();
    const schema = await dumpSchema(client);
    const counts = await tableCounts(client);
    const data = await dumpData(client, counts);
    const summary = counts.map((c) => `${c.table}=${c.rows < 0 ? "?" : c.rows}`).join(", ");
    return (
      `## DATABASE ${label}\n\n` +
      `### Riepilogo righe per tabella\n${summary}\n\n` +
      `### Schema completo\n\`\`\`\n${schema}\n\`\`\`\n\n` +
      `### Dati (troncati a ${MAX_DB_CHARS} char, tabelle piccole prioritarie)\n\`\`\`\n${data}\n\`\`\``
    );
  } catch (err) {
    return `## DATABASE ${label}\n\n[non disponibile: ${(err as Error).message}]`;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Ollama ─────────────────────────────────────────────────────────────────

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

const STUDY_SYSTEM_PROMPT =
  "Sei un architetto software senior esperto di Node.js, Express, TypeScript, " +
  "Expo/React Native, Drizzle ORM e PostgreSQL. Stai STUDIANDO a fondo la codebase " +
  "di un'app italiana per motociclisti chiamata BikerLink, ricevuta a chunk insieme " +
  "al dump di schema e dati di due database (dev e prod). Il tuo obiettivo è costruire " +
  "una comprensione completa e persistente dell'architettura: moduli, dipendenze, " +
  "pattern ripetuti, punti di rischio e drift dev↔prod. Rispondi sempre in italiano, " +
  "in modo tecnico e strutturato. Durante l'invio dei chunk fornisci solo un breve " +
  "consolidamento; il report completo lo produrrai alla richiesta finale.";

async function callOllama(
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[],
  token: string | undefined,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  Object.assign(headers, cfAccessHeaders());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ model, stream: false, options: { temperature: 0.2 }, messages }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 500)}` : ""}`);
    }
    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const content = data.message?.content?.trim();
    if (!content) throw new Error("Risposta vuota dal modello.");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Aggiornamento context ─────────────────────────────────────────────────

const CONTEXT_PATH = path.join(ROOT, ".agents", "skills", "ollama-diagnostics", "bikerlink-context.md");
const ARCH_BEGIN = "<!-- BEGIN AUTO-ARCHITETTURA (ollama-study-repo) -->";
const ARCH_END = "<!-- END AUTO-ARCHITETTURA (ollama-study-repo) -->";

/** Estrae la sezione "## Architettura" dal report (fino al prossimo H2 o fine). */
function extractArchitecture(report: string): string | null {
  const m = report.match(/^##\s+Architettura\b[\s\S]*?(?=^##\s+|$(?![\s\S]))/m);
  return m ? m[0].trim() : null;
}

/** Inietta/sostituisce il blocco Architettura in bikerlink-context.md. */
function updateContext(arch: string): boolean {
  let current: string;
  try {
    current = fs.readFileSync(CONTEXT_PATH, "utf8");
  } catch {
    return false;
  }
  const block = `${ARCH_BEGIN}\n\n${arch}\n\n${ARCH_END}`;
  let next: string;
  if (current.includes(ARCH_BEGIN) && current.includes(ARCH_END)) {
    next = current.replace(new RegExp(`${ARCH_BEGIN}[\\s\\S]*?${ARCH_END}`), block);
  } else {
    next = current.trimEnd() + `\n\n${block}\n`;
  }
  fs.writeFileSync(CONTEXT_PATH, next, "utf8");
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseCli();
  const baseUrl = process.env.DIAG_OLLAMA_URL?.trim();
  const model = process.env.DIAG_OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.DIAG_OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Studio codebase + dump DB con Ollama");
  console.log("════════════════════════════════════════════════════════════");

  const ghToken = githubToken();
  if (!ghToken) {
    console.error("\n❌ Nessun token GitHub (DIAG_GITHUB_TOKEN o GITHUB_TOKEN). Impossibile scaricare la codebase.");
    process.exitCode = 1;
    return;
  }
  if (!cli.dryRun && !baseUrl) {
    console.error("\n❌ DIAG_OLLAMA_URL non impostato. Imposta il secret e riprova (oppure usa --dry-run).");
    process.exitCode = 1;
    return;
  }

  // 1. Lista file
  console.log(`\n  📋 Recupero lista file da GitHub (${GITHUB_REPO}@${cli.branch})...`);
  let files: string[];
  try {
    files = await fetchFileList(cli.branch, ghToken);
  } catch (err) {
    console.error(`\n❌ Impossibile recuperare la lista file: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  if (cli.maxFiles && files.length > cli.maxFiles) {
    console.log(`  ✂️  Limito a ${cli.maxFiles} file (su ${files.length}).`);
    files = files.slice(0, cli.maxFiles);
  }
  console.log(`  ✅ ${files.length} file rilevanti.`);

  if (cli.dryRun) {
    console.log("\n  --dry-run: elenco file (nessun invio):\n");
    files.forEach((f) => console.log(`    ${f}`));
    console.log(`\n  Totale: ${files.length} file.`);
    return;
  }

  // 2. Download
  console.log(`\n  ⬇️  Scarico i contenuti (concorrenza ${DOWNLOAD_CONCURRENCY})...`);
  const { downloaded, failed } = await downloadAll(files, cli.branch, ghToken);
  if (failed.length) console.log(`  ⚠️  ${failed.length} file non scaricati.`);
  console.log(`  ✅ ${downloaded.length} file scaricati.`);

  // 3. Chunking
  const chunks = buildChunks(downloaded, cli.chunkChars);
  const totalChars = downloaded.reduce((a, f) => a + f.content.length, 0);
  console.log(`  📦 ${chunks.length} chunk (~${cli.chunkChars} char/chunk, ${totalChars} char totali).`);

  // 4. Dump DB
  console.log(`\n  🗄️  Dump database${cli.noDb ? " (saltato: --no-db)" : " dev + prod"}...`);
  const [devDump, prodDump] = await Promise.all([
    dumpDatabase("DEV", process.env.DATABASE_URL, cli.noDb),
    dumpDatabase("PROD", process.env.PROD_DATABASE_URL, cli.noDb),
  ]);

  // 5. Invio progressivo a Ollama
  console.log(`\n  🤖 Invio a Ollama (${baseUrl}, modello ${model})...`);
  const conversation: { role: string; content: string }[] = [{ role: "system", content: STUDY_SYSTEM_PROMPT }];
  try {
    for (let i = 0; i < chunks.length; i++) {
      const header = `Chunk ${i + 1} di ${chunks.length} della codebase BikerLink.\n\n`;
      conversation.push({ role: "user", content: header + chunks[i] + "\n\nConsolida brevemente." });
      console.log(`  ⏳ Chunk ${i + 1}/${chunks.length} (timeout ${REQUEST_TIMEOUT_MS / 1000}s)...`);
      const reply = await callOllama(baseUrl!, model, conversation, token);
      conversation.push({ role: "assistant", content: reply });
    }

    if (!cli.noDb) {
      console.log("  ⏳ Invio dump DB (schema + dati dev/prod)...");
      conversation.push({
        role: "user",
        content:
          "Di seguito il dump di schema e dati dei due database BikerLink. Studialo e " +
          "annota il drift dev↔prod. Consolida brevemente.\n\n" +
          devDump +
          "\n\n" +
          prodDump,
      });
      const dbReply = await callOllama(baseUrl!, model, conversation, token);
      conversation.push({ role: "assistant", content: dbReply });
    }

    // 6. Sintesi finale
    console.log("  ⏳ Richiesta report finale...");
    conversation.push({
      role: "user",
      content:
        "Produci ora un report completo dell'architettura BikerLink basato su tutto il " +
        "materiale ricevuto. Usa ESATTAMENTE queste sezioni H2:\n" +
        "## Architettura — panoramica architetturale e mappa dei moduli\n" +
        "## Dipendenze critiche\n" +
        "## Pattern ripetuti\n" +
        "## Punti di rischio\n" +
        "## Confronto schema dev↔prod\n" +
        "La sezione '## Architettura' deve essere autosufficiente: verrà estratta e " +
        "usata come system prompt persistente.",
    });
    const report = await callOllama(baseUrl!, model, conversation, token);

    // Salvataggio report
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(ROOT, "logs");
    const outPath = path.join(outDir, `repo-study-${ts}.md`);
    fs.mkdirSync(outDir, { recursive: true });
    const head =
      `# Studio codebase BikerLink — ${new Date().toISOString()}\n\n` +
      `- Modello: \`${model}\`\n` +
      `- Endpoint: \`${baseUrl}\`\n` +
      `- Branch: \`${cli.branch}\`\n` +
      `- File studiati: ${downloaded.length} (${chunks.length} chunk)\n` +
      `- DB: ${cli.noDb ? "saltato" : "dev + prod inclusi"}\n\n---\n\n`;
    fs.writeFileSync(outPath, head + report + "\n", "utf8");

    // 7. Aggiornamento context
    const arch = extractArchitecture(report);
    let ctxMsg = "⚠️  sezione '## Architettura' non trovata nel report — context non aggiornato.";
    if (arch && updateContext(arch)) {
      ctxMsg = `✅ bikerlink-context.md aggiornato con la sezione Architettura (${arch.length} char).`;
    }

    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  💾 Report: ${path.relative(ROOT, outPath)}`);
    console.log(`  📝 ${ctxMsg}`);
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(report.slice(0, 2000));
    if (report.length > 2000) console.log("\n...[report troncato nella console, vedi il file]...");
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    console.error("\n❌ Studio non riuscito: l'endpoint Ollama non ha risposto correttamente.");
    if (e.name === "AbortError") console.error(`   Timeout dopo ${REQUEST_TIMEOUT_MS / 1000}s.`);
    else if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(e.cause?.code ?? ""))
      console.error("   Host irraggiungibile (PC spento o Cloudflare Tunnel giù).");
    console.error(`   Dettaglio: ${e.message}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ollama-study-repo] Errore inatteso:", err);
  process.exitCode = 1;
});
