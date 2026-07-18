/**
 * BikerLink — Horus Patch Scan — Core (grep, classify, propose)
 *
 * Modulo interno usato da horus-patch-scan.ts.
 * Non invocare direttamente.
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";
import { AGENT_MODEL_DEFAULTS } from "../server/lib/agent-constants";
import { stripThinkBlock } from "../server/lib/ollama-think-strip";
import { titleToSlug } from "./lib/horus-slug";
import { isDuplicate } from "./horus-propose-tasks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione ────────────────────────────────────────────────────────────

export const CHUNK_LINES = 220;          // righe massime per chunk inviato a Horus
const CONTEXT_LINES = 3;                 // righe di contesto attorno a ogni trovato
export const REQUEST_TIMEOUT_MS = 180_000;
export const DEFAULT_MODEL = AGENT_MODEL_DEFAULTS.horus;

/** Directory e file esclusi dalla scansione (fuori scope). */
export const EXCLUDED_DIRS = [
  "node_modules",
  ".expo",
  "dist",
  "build",
  ".git",
  "android",
  "ios",
  "logs",
  "__tests__",
  ".next",
  ".cache",
];

/** File da escludere esplicitamente dalla scansione (es. questo script stesso). */
export const EXCLUDED_FILES = new Set([
  "scripts/horus-patch-scan.ts",
  "scripts/horus-patch-scan.core.ts",
]);

// ─── Backlog file (deduplicazione) ─────────────────────────────────────────────

const BACKLOG_FILE = path.join(ROOT, ".local", "horus-backlog.json");

export function loadBacklog(): string[] {
  if (!fs.existsSync(BACKLOG_FILE)) return [];
  try {
    const raw = fs.readFileSync(BACKLOG_FILE, "utf8");
    const data = JSON.parse(raw) as { titles?: string[] } | string[];
    const titles = Array.isArray(data) ? data : ((data as { titles?: string[] }).titles ?? []);
    return titles.filter((t): t is string => typeof t === "string" && t.length > 0);
  } catch {
    return [];
  }
}

// ─── Step 1: Grep multi-pattern ────────────────────────────────────────────────

export interface GrepHit {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

function buildExcludeArgs(): string[] {
  const args: string[] = [];
  for (const d of EXCLUDED_DIRS) {
    args.push("--exclude-dir", d);
  }
  return args;
}

function runGrep(pattern: string, label: string, extraFlags: string[] = []): GrepHit[] {
  const excludeArgs = buildExcludeArgs();
  const result = spawnSync(
    "grep",
    [
      "-rn",
      "--include=*.ts",
      "--include=*.tsx",
      "--include=*.js",
      "--include=*.jsx",
      "--include=*.sh",
      ...excludeArgs,
      ...extraFlags,
      "-E",
      pattern,
      ".",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
  );

  if (result.error || (result.status !== 0 && result.status !== 1)) return [];

  const hits: GrepHit[] = [];
  for (const line of (result.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rest = line.slice(colonIdx + 1);
    const lineNumIdx = rest.indexOf(":");
    if (lineNumIdx === -1) continue;
    const file = line.slice(0, colonIdx).replace(/^\.\//, "");
    const lineNum = parseInt(rest.slice(0, lineNumIdx), 10);
    const text = rest.slice(lineNumIdx + 1);
    if (!file || !lineNum || isNaN(lineNum)) continue;
    hits.push({ file, line: lineNum, pattern: label, text });
  }
  return hits;
}

export function collectCandidates(): GrepHit[] {
  const allHits: GrepHit[] = [];

  // Commenti TODO/FIXME/HACK/XXX
  allHits.push(...runGrep(
    "//.*\\b(TODO|FIXME|HACK|XXX)\\b|/\\*.*\\b(TODO|FIXME|HACK|XXX)\\b",
    "TODO/FIXME/HACK/XXX",
  ));

  // @ts-ignore e @ts-expect-error
  allHits.push(...runGrep(
    "@ts-ignore|@ts-expect-error",
    "@ts-ignore/@ts-expect-error",
  ));

  // eslint-disable e oxlint-disable
  allHits.push(...runGrep(
    "eslint-disable|oxlint-disable",
    "eslint/oxlint-disable",
    ["--include=*.ts", "--include=*.tsx"],
  ));

  // as never (cast forzato)
  allHits.push(...runGrep(
    "\\bas never\\b",
    "as never",
  ));

  // as any (cast pericoloso)
  allHits.push(...runGrep(
    "\\bas any\\b",
    "as any",
  ));

  // catch vuoti o con solo console.warn/log
  allHits.push(...runGrep(
    "catch\\s*(\\([^)]*\\))?\\s*\\{\\s*(console\\.(warn|log|error)[^}]*)?\\s*\\}",
    "catch-vuoto/warn-only",
  ));

  // setTimeout con 0 o valori molto piccoli (workaround di timing)
  allHits.push(...runGrep(
    "setTimeout\\s*\\([^,]+,\\s*(0|[1-9][0-9]?)\\s*\\)",
    "setTimeout(0/tiny)",
  ));

  // Parole chiave in italiano per patch temporanee
  allHits.push(...runGrep(
    "\\b(cerotto|temporane[ao]|rattoppo|workaround|patch|band.?aid|soluzione\\s+provvisoria|hack\\s+temporaneo)\\b",
    "keyword-cerotto-IT",
    ["-i"],
  ));

  return allHits;
}

// ─── Step 2: Deduplicazione e arricchimento con contesto ──────────────────────

export interface EnrichedHit {
  file: string;
  line: number;
  pattern: string;
  text: string;
  context: string; // ±3 righe
}

/** Cache file → linee già lette */
const fileCache = new Map<string, string[]>();

function getFileLines(file: string): string[] {
  if (fileCache.has(file)) return fileCache.get(file)!;
  try {
    const abs = path.join(ROOT, file);
    const lines = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8").split("\n") : [];
    fileCache.set(file, lines);
    return lines;
  } catch {
    fileCache.set(file, []);
    return [];
  }
}

function buildContext(file: string, lineNum: number): string {
  const lines = getFileLines(file);
  if (lines.length === 0) return "";
  const from = Math.max(0, lineNum - CONTEXT_LINES - 1);
  const to = Math.min(lines.length - 1, lineNum + CONTEXT_LINES - 1);
  return lines
    .slice(from, to + 1)
    .map((l, i) => `${from + i + 1}: ${l}`)
    .join("\n");
}

export function deduplicateAndEnrich(hits: GrepHit[]): EnrichedHit[] {
  const seen = new Set<string>(); // file:line
  const enriched: EnrichedHit[] = [];

  for (const h of hits) {
    // Salta file esplicitamente esclusi (es. questo script stesso)
    if (EXCLUDED_FILES.has(h.file)) continue;
    const key = `${h.file}:${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    enriched.push({
      ...h,
      context: buildContext(h.file, h.line),
    });
  }

  return enriched;
}

// ─── Step 3: Chunking ─────────────────────────────────────────────────────────

export function formatHit(h: EnrichedHit): string {
  return (
    `--- [${h.pattern}] ${h.file}:${h.line} ---\n` +
    `${h.context}\n`
  );
}

export function buildChunks(hits: EnrichedHit[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLines = 0;

  for (const h of hits) {
    const block = formatHit(h);
    const blockLines = block.split("\n").length;

    if (currentLines + blockLines > CHUNK_LINES && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      currentLines = 0;
    }

    current.push(block);
    currentLines += blockLines;
  }

  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

// ─── Step 4: Classificazione Horus ────────────────────────────────────────────

const PATCH_SCAN_SYSTEM_PROMPT = `Sei Horus, senior engineer BikerLink. Ricevi un elenco di "trovati" — righe di codice che contengono pattern sospetti (TODO, FIXME, @ts-ignore, as any, as never, catch vuoti, setTimeout(0), ecc.).

Per ogni trovato classificalo su questa scala ESATTA:
- CRITICO: maschera un bug attivo o un rischio sicurezza immediato (es. catch che inghiotte un'eccezione critica, @ts-ignore su un cast che potrebbe fallire a runtime, workaround che bypassa una guard di sicurezza).
- ALTO: debito tecnico con rischio reale di regressione (es. setTimeout(0) che fa assumere un ordine di esecuzione non garantito, as any che bypassa il type-checker in un punto critico).
- MEDIO: da pulire prima del prossimo major release ma non urgente (es. TODO con commento chiaro ma mai eseguito).
- BASSO: legittimo o accettabile nel contesto (es. @ts-ignore con commento che spiega perché, eslint-disable su linea che non puoi controllare, as never su route Expo documentato).

FORMATO OBBLIGATORIO — rispondi SOLO con una tabella markdown:

| Severità | File:Riga | Pattern | Motivazione |
|----------|-----------|---------|-------------|
| CRITICO | server/foo.ts:42 | @ts-ignore | [motivo breve] |
| ALTO | app/bar.tsx:10 | as any | [motivo breve] |

Una riga per trovato. Non aggiungere testo fuori dalla tabella. Italiano.`;

export interface ClassifiedHit {
  severity: "CRITICO" | "ALTO" | "MEDIO" | "BASSO";
  fileRef: string;   // file:riga
  pattern: string;
  reason: string;
}

export function parseClassificationTable(text: string): ClassifiedHit[] {
  const hits: ClassifiedHit[] = [];
  const lines = text.split("\n");
  let inTable = false;
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable && headerParsed) break;
      continue;
    }
    inTable = true;
    if (!headerParsed) { headerParsed = true; continue; }
    if (/^\|[-| ]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 4) continue;

    const [sev, fileRef, pattern, ...reasonParts] = cells;
    const severity = sev?.toUpperCase().trim();
    if (!["CRITICO", "ALTO", "MEDIO", "BASSO"].includes(severity)) continue;

    hits.push({
      severity: severity as ClassifiedHit["severity"],
      fileRef: fileRef?.trim() ?? "",
      pattern: pattern?.trim() ?? "",
      reason: reasonParts.join("|").trim(),
    });
  }
  return hits;
}

export async function callHorus(
  baseUrl: string,
  model: string,
  token: string | undefined,
  content: string,
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
      body: JSON.stringify({
        model,
        stream: false,
        // think:true — Horus ragiona prima di rispondere, producendo output strutturato
        // più fedele alle istruzioni. Il blocco <think>…</think> viene strippato
        // da stripThinkBlock() prima di passare il testo al parser.
        // num_predict alzato a 800 per compensare i token usati dal reasoning.
        options: { temperature: 0.1, think: true, num_predict: 800 },
        messages: [
          { role: "system", content: PATCH_SCAN_SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
    }

    interface OllamaResponse {
      message?: { role: string; content: string };
      error?: string;
    }

    const data = (await res.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const raw = data.message?.content?.trim() ?? "";
    // Strippa il blocco <think>…</think> completo (think:true non-streaming).
    return stripThinkBlock(raw);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Step 5: Proposta task per CRITICO/ALTO ────────────────────────────────────

export function writePatchTaskFile(
  severity: string,
  fileRef: string,
  pattern: string,
  reason: string,
): { slug: string; filePath: string } {
  const title = `Fix cerotto ${severity.toLowerCase()} [${pattern}] in ${fileRef}`;
  const slug = titleToSlug(title);
  const filePath = path.join(ROOT, ".local", "tasks", `horus-${slug}.md`);

  const content =
    `# ${title}\n\n` +
    `## What & Why\n` +
    `Trovato durante la scansione automatica Horus dei cerotti nel codebase.\n\n` +
    `**Pattern:** \`${pattern}\`\n` +
    `**File:** \`${fileRef}\`\n` +
    `**Motivazione Horus:** ${reason}\n\n` +
    `## Done looks like\n` +
    `- Il cerotto è rimosso o sostituito con una soluzione permanente.\n` +
    `- Il file non contiene più il pattern \`${pattern}\` in quella riga.\n` +
    `- Nessuna regressione sui flussi correlati.\n\n` +
    `## Out of scope\n` +
    `- Refactoring non correlato al problema specifico.\n\n` +
    `## Steps\n` +
    `1. **Analisi** — Leggere il contesto completo di \`${fileRef}\` per capire il workaround.\n` +
    `2. **Fix** — Implementare la soluzione permanente o aggiungere una spiegazione documentata se il pattern è legittimo.\n` +
    `3. **Verifica** — Confermare che il comportamento corretto non è cambiato.\n\n` +
    `## Relevant files\n` +
    `- \`${fileRef.split(":")[0]}\`\n\n` +
    `---\n` +
    `_Proposto automaticamente da horus-patch-scan. Severità: ${severity}._\n`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return { slug, filePath };
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

export function buildChunkPrompt(chunkIndex: number, totalChunks: number, chunkText: string): string {
  return (
    `Chunk ${chunkIndex + 1} di ${totalChunks}.\n` +
    `Classifica ogni trovato qui sotto secondo le istruzioni del system prompt.\n\n` +
    `=== TROVATI ===\n` +
    chunkText
  );
}

// ─── Manifest / propose helpers ───────────────────────────────────────────────

export interface ProposeResult {
  title: string;
  slug: string;
  filePath: string;
  severity: string;
}

export function buildProposals(
  toPropose: ClassifiedHit[],
  backlog: string[],
): { proposed: ProposeResult[]; skippedDup: string[] } {
  const proposed: ProposeResult[] = [];
  const skippedDup: string[] = [];

  for (const h of toPropose) {
    const title = `Fix cerotto ${h.severity.toLowerCase()} [${h.pattern}] in ${h.fileRef}`;
    if (isDuplicate(title, backlog)) {
      skippedDup.push(title);
      console.log(`  ⏭️  Saltato (duplicato): "${title}"`);
      continue;
    }
    const { slug, filePath } = writePatchTaskFile(h.severity, h.fileRef, h.pattern, h.reason);
    proposed.push({ title, slug, filePath, severity: h.severity });
    console.log(`  ✅ Pronto: "${title}" → .local/tasks/horus-${slug}.md`);
  }

  return { proposed, skippedDup };
}
