/**
 * BikerLink — Horus Patch Scan
 *
 * Scansiona sistematicamente il codebase BikerLink alla ricerca di "cerotti"
 * (patch temporanee, workaround, soppressioni di errori, band-aid accumulati
 * nel tempo) e li invia a Horus per una classificazione ragionata.
 *
 * Uso:
 *   npx tsx scripts/horus-patch-scan.ts
 *   npx tsx scripts/horus-patch-scan.ts --dry-run      # stampa i chunk senza chiamare Horus
 *   npx tsx scripts/horus-patch-scan.ts --no-propose   # salta la proposta task automatica
 *
 * Output:
 *   logs/horus-patch-scan-<timestamp>.md  — report classificato
 *   .local/tasks/horus-<slug>.md          — file plan per ogni trovato CRITICO/ALTO
 *
 * Secret/env:
 *   HORUS_OLLAMA_URL    — URL base di Horus via Cloudflare Tunnel (obbligatorio)
 *   HORUS_OLLAMA_MODEL  — modello (default "qwen3:4b")
 *   HORUS_OLLAMA_TOKEN  — opzionale, Bearer token
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";
import { AGENT_MODEL_DEFAULTS } from "../server/lib/agent-constants";
import { titleToSlug } from "./lib/horus-slug";
import { isDuplicate } from "./horus-propose-tasks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione ────────────────────────────────────────────────────────────

const CHUNK_LINES = 220;          // righe massime per chunk inviato a Horus
const CONTEXT_LINES = 3;          // righe di contesto attorno a ogni trovato
const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_MODEL = AGENT_MODEL_DEFAULTS.horus;

/** Directory e file esclusi dalla scansione (fuori scope). */
const EXCLUDED_DIRS = [
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
const EXCLUDED_FILES = new Set([
  "scripts/horus-patch-scan.ts",
]);

// ─── CLI args ──────────────────────────────────────────────────────────────────

const IS_DRY_RUN = process.argv.includes("--dry-run");
const NO_PROPOSE = process.argv.includes("--no-propose");

// ─── Backlog file (deduplicazione) ─────────────────────────────────────────────

const BACKLOG_FILE = path.join(ROOT, ".local", "horus-backlog.json");

function loadBacklog(): string[] {
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

interface GrepHit {
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

function collectCandidates(): GrepHit[] {
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

interface EnrichedHit {
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

function deduplicateAndEnrich(hits: GrepHit[]): EnrichedHit[] {
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

function formatHit(h: EnrichedHit): string {
  return (
    `--- [${h.pattern}] ${h.file}:${h.line} ---\n` +
    `${h.context}\n`
  );
}

function buildChunks(hits: EnrichedHit[]): string[] {
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

interface ClassifiedHit {
  severity: "CRITICO" | "ALTO" | "MEDIO" | "BASSO";
  fileRef: string;   // file:riga
  pattern: string;
  reason: string;
}

function parseClassificationTable(text: string): ClassifiedHit[] {
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

async function callHorus(
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
        options: { temperature: 0.1, think: false, num_predict: 600 },
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
    // Rimuovi orphan </think> da qwen3 con think:false
    return raw.replace(/<\/think>/gi, "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Step 5: Proposta task per CRITICO/ALTO ────────────────────────────────────

function writePatchTaskFile(
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

// ─── Costruzione prompt per chunk ─────────────────────────────────────────────

function buildChunkPrompt(chunkIndex: number, totalChunks: number, chunkText: string): string {
  return (
    `Chunk ${chunkIndex + 1} di ${totalChunks}.\n` +
    `Classifica ogni trovato qui sotto secondo le istruzioni del system prompt.\n\n` +
    `=== TROVATI ===\n` +
    chunkText
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.env.HORUS_OLLAMA_URL?.trim() || process.env.OLLAMA_URL?.trim();
  const model = process.env.HORUS_OLLAMA_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.HORUS_OLLAMA_TOKEN?.trim() || process.env.OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus Patch Scan] Scansione cerotti e workaround");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  if (IS_DRY_RUN) console.log("  Modalità : DRY-RUN (nessuna chiamata a Horus)");
  if (NO_PROPOSE) console.log("  Proposta : disabilitata (--no-propose)");
  console.log("");

  // ── Step 1: Raccolta candidati ──
  console.log("  ⏳ Step 1: grep multi-pattern...");
  const rawHits = collectCandidates();
  console.log(`  🔍 Trovati grezzi: ${rawHits.length}`);

  // ── Step 2: Deduplicazione e arricchimento ──
  console.log("  ⏳ Step 2: deduplicazione e arricchimento contesto...");
  const enriched = deduplicateAndEnrich(rawHits);
  console.log(`  🔍 Trovati unici: ${enriched.length}`);

  // Salva candidati raw in /tmp per debug
  const candidatesFile = "/tmp/patch-candidates.txt";
  try {
    const rawText = enriched.map(formatHit).join("\n");
    fs.writeFileSync(candidatesFile, rawText, "utf8");
    console.log(`  💾 Candidati grezzi: ${candidatesFile}`);
  } catch {
    // Non fatale
  }

  // ── Step 3: Chunking ──
  console.log("  ⏳ Step 3: chunking...");
  const chunks = buildChunks(enriched);
  console.log(`  📦 Chunk da inviare a Horus: ${chunks.length}`);

  if (chunks.length === 0) {
    console.log("\n  ✅ Nessun candidato trovato. Il codebase è pulito!\n");
    return;
  }

  // ── DRY RUN ──
  if (IS_DRY_RUN) {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  CHUNK ANTEPRIMA (dry-run — Horus NON viene chiamato)");
    console.log("════════════════════════════════════════════════════════════\n");
    for (let i = 0; i < chunks.length; i++) {
      console.log(`\n──── CHUNK ${i + 1}/${chunks.length} ────\n`);
      console.log(chunks[i].slice(0, 2000) + (chunks[i].length > 2000 ? "\n[...troncato per dry-run]" : ""));
    }
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  Totale trovati unici: ${enriched.length}`);
    console.log(`  Chunk: ${chunks.length}`);
    console.log("════════════════════════════════════════════════════════════");
    return;
  }

  if (!baseUrl) {
    console.error(
      "\n❌ HORUS_OLLAMA_URL non impostato.\n" +
      "   Imposta il secret HORUS_OLLAMA_URL con l'URL di Horus (ThinkCentre).\n",
    );
    process.exitCode = 1;
    return;
  }

  // ── Step 4: Classificazione Horus (un chunk alla volta) ──
  console.log(`\n  ⏳ Step 4: classificazione Horus (${chunks.length} chunk, timeout ${REQUEST_TIMEOUT_MS / 1000}s/chunk)...\n`);

  const allClassified: ClassifiedHit[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkPrompt = buildChunkPrompt(i, chunks.length, chunks[i]);
    process.stdout.write(`  [${i + 1}/${chunks.length}] Invio chunk... `);

    try {
      const raw = await callHorus(baseUrl, model, token, chunkPrompt);
      const parsed = parseClassificationTable(raw);
      allClassified.push(...parsed);
      console.log(`✅ ${parsed.length} classificazioni`);
    } catch (err) {
      const e = err as Error;
      console.log(`❌ ERRORE: ${e.message.slice(0, 200)}`);
      console.warn(`  ⚠️  Chunk ${i + 1} saltato — classificazioni perse per questo blocco.`);
    }
  }

  console.log(`\n  📊 Classificazioni totali: ${allClassified.length}`);

  // ── Contatori per categoria ──
  const bySeverity: Record<string, ClassifiedHit[]> = {
    CRITICO: [],
    ALTO: [],
    MEDIO: [],
    BASSO: [],
  };
  for (const h of allClassified) {
    if (bySeverity[h.severity]) bySeverity[h.severity].push(h);
  }

  console.log(`  🔴 CRITICO: ${bySeverity.CRITICO.length}`);
  console.log(`  🟠 ALTO   : ${bySeverity.ALTO.length}`);
  console.log(`  🟡 MEDIO  : ${bySeverity.MEDIO.length}`);
  console.log(`  🟢 BASSO  : ${bySeverity.BASSO.length}`);

  // ── Step 5: Genera report ──
  const ts = new Date().toISOString();
  const tsSafe = ts.replace(/[:.]/g, "-");
  const outPath = path.join(ROOT, "logs", `horus-patch-scan-${tsSafe}.md`);

  const totalFound = allClassified.length;
  const totalCandidates = enriched.length;

  const tableSection = (hits: ClassifiedHit[], label: string, emoji: string): string => {
    if (hits.length === 0) return `### ${emoji} ${label} (0)\n\n_Nessun trovato in questa categoria._\n`;
    const rows = hits
      .map((h) => `| ${h.severity} | ${h.fileRef} | ${h.pattern} | ${h.reason} |`)
      .join("\n");
    return (
      `### ${emoji} ${label} (${hits.length})\n\n` +
      `| Severità | File:Riga | Pattern | Motivazione Horus |\n` +
      `|----------|-----------|---------|-------------------|\n` +
      rows + "\n"
    );
  };

  const reportContent =
    `# Horus Patch Scan — ${ts}\n\n` +
    `- Modello: \`${model}\`\n` +
    `- Candidati grep: ${totalCandidates}\n` +
    `- Classificazioni ricevute: ${totalFound}\n` +
    `- Chunk processati: ${chunks.length}\n\n` +
    `## Riepilogo\n\n` +
    `| Categoria | Conteggio |\n` +
    `|-----------|----------|\n` +
    `| 🔴 CRITICO | ${bySeverity.CRITICO.length} |\n` +
    `| 🟠 ALTO | ${bySeverity.ALTO.length} |\n` +
    `| 🟡 MEDIO | ${bySeverity.MEDIO.length} |\n` +
    `| 🟢 BASSO | ${bySeverity.BASSO.length} |\n\n` +
    `## Trovati Classificati\n\n` +
    tableSection(bySeverity.CRITICO, "CRITICO", "🔴") + "\n" +
    tableSection(bySeverity.ALTO, "ALTO", "🟠") + "\n" +
    tableSection(bySeverity.MEDIO, "MEDIO", "🟡") + "\n" +
    tableSection(bySeverity.BASSO, "BASSO", "🟢") + "\n";

  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    fs.writeFileSync(outPath, reportContent, "utf8");
  } catch (_err) {
    // Fallback a /tmp
    const fallback = `/tmp/horus-patch-scan-${tsSafe}.md`;
    try {
      fs.writeFileSync(fallback, reportContent, "utf8");
      console.warn(`\n  ⚠️  Salvato in fallback: ${fallback}`);
    } catch {
      console.error("  ❌ Impossibile salvare il report.");
    }
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  REPORT");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(reportContent);
  console.log(`\n  💾 Report salvato in: ${outPath}`);
  console.log("════════════════════════════════════════════════════════════");

  // ── Step 6: Proposta task automatica per CRITICO e ALTO ──
  if (NO_PROPOSE) {
    console.log("\n  ⏭️  Proposta task saltata (--no-propose).\n");
    return;
  }

  const toPropose = [...bySeverity.CRITICO, ...bySeverity.ALTO];
  if (toPropose.length === 0) {
    console.log("\n  ✅ Nessun trovato CRITICO/ALTO — nessun task da proporre.\n");
    return;
  }

  console.log(`\n  ⏳ Proposta task per ${toPropose.length} trovati CRITICO/ALTO...\n`);

  const backlog = loadBacklog();
  console.log(`  📋 Backlog attivo: ${backlog.length} task`);

  const proposed: Array<{ title: string; slug: string; filePath: string; severity: string }> = [];
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

  // Manifest compatibile con horus-propose-tasks.ts
  const manifest = {
    generatedAt: new Date().toISOString(),
    reportPath: outPath,
    scanType: "patch-scan",
    hasArchitectReview: false,
    architectFormatValid: true,
    tasks: proposed.map((t) => ({
      title: t.title,
      priority: t.severity === "CRITICO" ? "alta" : "media",
      filePath: path.relative(ROOT, t.filePath),
      slug: t.slug,
    })),
    skipped: skippedDup,
  };

  const manifestPath = path.join(ROOT, "logs", "horus-tasks-pending.json");
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch {
    // Non fatale
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RIEPILOGO PROPOSTA TASK");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  ✅ Task pronti da proporre : ${proposed.length}`);
  console.log(`  ⏭️  Task saltati (duplicati): ${skippedDup.length}`);
  console.log(`  💾 Report: ${outPath}`);
  if (proposed.length > 0) {
    console.log("\n  File plan generati:");
    for (const t of proposed) {
      console.log(`    • .local/tasks/horus-${t.slug}.md  [${t.severity}]  "${t.title}"`);
    }
    console.log(
      "\n  ➡️  Per proporli nel pannello Replit, chiedi all'agente: \"Proponi i task Horus pendenti\".\n",
    );
  }
}

main().catch((err) => {
  console.error("[horus-patch-scan] Errore inatteso:", err);
  process.exitCode = 1;
});
