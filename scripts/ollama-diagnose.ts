/**
 * BikerLink — Diagnosi AI con Ollama (PC dedicato)  (Task #5084)
 *
 * Raccoglie log, crash e file chiave del boot, li invia al PC dedicato
 * (Windows + GPU) che esegue Ollama con un modello coder (default
 * `qwen3.6:35b`) e stampa/salva un report di diagnosi.
 *
 * I file SORGENTE vengono letti direttamente da GitHub API (branch main, sempre
 * aggiornato). Fallback al disco locale se GITHUB_TOKEN è assente o la fetch
 * fallisce.
 *
 * La chiamata è HTTP DIRETTA all'endpoint Ollama (`${DIAG_OLLAMA_URL}/api/chat`),
 * NON passa dal backend Express: funziona anche quando il server è giù.
 *
 * Uso:
 *   npx tsx scripts/ollama-diagnose.ts
 *   npx tsx scripts/ollama-diagnose.ts --tail 500      # più righe per log
 *
 * Secret/env:
 *   DIAG_OLLAMA_URL    — URL base dell'Ollama sul PC dedicato (via Cloudflare Tunnel).
 *                        Es: https://diag.example.com  (senza /api finale)
 *   DIAG_OLLAMA_MODEL  — modello da usare (default "qwen3.6:35b").
 *                        Può puntare a un modello custom (es. "bikerlink-diag")
 *                        creato via Modelfile sul PC dedicato.
 *   DIAG_OLLAMA_TOKEN  — opzionale, Bearer token se l'endpoint è protetto.
 *   DIAG_GITHUB_TOKEN  — token GitHub READ-ONLY (fine-grained, solo Contents:read
 *                        su Andreamasteri/Bikerlink); usato per fetch sorgenti
 *                        aggiornati. Se assente legge dal disco locale (fallback).
 *                        NON usare il GITHUB_TOKEN principale (ha write).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cfAccessHeaders } from "../server/lib/cf-access";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione ───────────────────────────────────────────────────────────
// Facilmente modificabile: aggiungi/rimuovi file da raccogliere qui.

/** File di log da includere (tail delle ultime righe). I mancanti vengono saltati. */
const LOG_FILES: string[] = [
  "/tmp/server-crash.log",
  "/tmp/backend.log",
  "logs/backend-crashes.log",
  "logs/error-monitor.log",
  "logs/cerbero.log",
];

/** File sorgente chiave del boot da includere (interi, ma troncati se enormi). */
const SOURCE_FILES: string[] = [
  "server/index.ts",
  "server/boot-sequence.ts",
  "server/init-state.ts",
];

/** Righe finali da prendere per ogni file di log (override con --tail N). */
const DEFAULT_TAIL_LINES = 300;

/** Caratteri massimi per singolo file sorgente (evita di saturare il context). */
const MAX_SOURCE_CHARS = 12_000;

/** Timeout della chiamata Ollama. Il 32b su CPU/RAM può impiegare 2-5 minuti. */
const REQUEST_TIMEOUT_MS = 180_000;

const DEFAULT_MODEL = "qwen3.6:35b";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTailArg(): number {
  const i = process.argv.indexOf("--tail");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TAIL_LINES;
}

/** Legge le ultime `tail` righe di un file. Ritorna null se assente/illeggibile. */
function readTail(relOrAbs: string, tail: number): string | null {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  try {
    if (!fs.existsSync(abs)) return null;
    const content = fs.readFileSync(abs, "utf8");
    if (!content.trim()) return null;
    const lines = content.split("\n");
    const slice = lines.slice(-tail).join("\n");
    return slice;
  } catch {
    return null;
  }
}

/** Legge un file sorgente intero dal disco, troncato a MAX_SOURCE_CHARS. */
function readSourceLocal(rel: string): string | null {
  const abs = path.join(ROOT, rel);
  try {
    if (!fs.existsSync(abs)) return null;
    let content = fs.readFileSync(abs, "utf8");
    if (content.length > MAX_SOURCE_CHARS) {
      content = content.slice(0, MAX_SOURCE_CHARS) + "\n\n...[troncato]...";
    }
    return content;
  } catch {
    return null;
  }
}

const GITHUB_REPO = "Andreamasteri/Bikerlink";
const GITHUB_BRANCH = "main";

/**
 * Fetcha un file sorgente direttamente da GitHub API (sempre aggiornato).
 * Ritorna null se DIAG_GITHUB_TOKEN manca, il file non esiste, o la rete fallisce.
 */
async function fetchGitHubFile(rel: string): Promise<{ content: string; source: "github" } | null> {
  const token = process.env.DIAG_GITHUB_TOKEN?.trim();
  if (!token) return null;
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${rel}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "BikerLink-Diag/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    let content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    if (content.length > MAX_SOURCE_CHARS) {
      content = content.slice(0, MAX_SOURCE_CHARS) + "\n\n...[troncato]...";
    }
    return { content, source: "github" };
  } catch {
    return null;
  }
}

function loadSystemPrompt(): string {
  const ctxPath = path.join(__dirname, "..", ".agents", "skills", "ollama-diagnostics", "bikerlink-context.md");
  try {
    return fs.readFileSync(ctxPath, "utf8");
  } catch {
    return (
      "Sei un ingegnere senior. Analizza i log e i sorgenti BikerLink e rispondi in " +
      "italiano con le sezioni: ## Problemi trovati, ## Causa probabile, ## Azione suggerita."
    );
  }
}

function fmtSection(title: string, body: string): string {
  return `\n===== ${title} =====\n${body}\n`;
}

// ─── Raccolta contesto ──────────────────────────────────────────────────────────

async function collectContext(tail: number): Promise<{ prompt: string; collected: string[]; missing: string[]; githubUsed: boolean }> {
  const collected: string[] = [];
  const missing: string[] = [];
  const parts: string[] = [];
  let githubUsed = false;

  const hasGithubToken = Boolean(process.env.DIAG_GITHUB_TOKEN?.trim());

  parts.push("# CONTESTO DI DIAGNOSI BIKERLINK\n");
  parts.push(`Generato: ${new Date().toISOString()}\n`);

  parts.push("\n## LOG\n");
  for (const f of LOG_FILES) {
    const body = readTail(f, tail);
    if (body == null) {
      missing.push(f);
      continue;
    }
    collected.push(f);
    parts.push(fmtSection(`LOG: ${f} (ultime ${tail} righe)`, body));
  }

  parts.push("\n## FILE SORGENTE CHIAVE DEL BOOT\n");
  for (const f of SOURCE_FILES) {
    // Prova prima GitHub API (sempre aggiornato), fallback a disco locale
    const gh = hasGithubToken ? await fetchGitHubFile(f) : null;
    if (gh) {
      githubUsed = true;
      collected.push(`${f} [github]`);
      parts.push(fmtSection(`FILE: ${f} (da GitHub main)`, gh.content));
    } else {
      const body = readSourceLocal(f);
      if (body == null) {
        missing.push(f);
        continue;
      }
      collected.push(`${f} [locale]`);
      parts.push(fmtSection(`FILE: ${f} (da disco locale)`, body));
    }
  }

  parts.push(
    "\n## RICHIESTA\n" +
      "Analizza i log e i sorgenti qui sopra. Perché l'app crasha o non parte? " +
      "Quali sono i punti deboli? Rispondi con le sezioni richieste: " +
      "## Problemi trovati, ## Causa probabile, ## Azione suggerita.\n",
  );

  return { prompt: parts.join("\n"), collected, missing, githubUsed };
}

// ─── Chiamata Ollama diretta ─────────────────────────────────────────────────

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

async function callOllama(
  baseUrl: string,
  model: string,
  system: string,
  user: string,
  token: string | undefined,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Cloudflare Access Service Token: l'Ollama del PC dedicato è esposto via
  // Cloudflare Tunnel su biker-link.net, dietro lo stesso layer Access degli
  // altri servizi self-hosted. Innocuo se la policy non è attiva (l'origine
  // ignora gli header). Mai inviato a endpoint pubblici di terzi.
  Object.assign(headers, cfAccessHeaders());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.env.DIAG_OLLAMA_URL?.trim();
  const model = process.env.DIAG_OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.DIAG_OLLAMA_TOKEN?.trim() || undefined;
  const tail = parseTailArg();

  console.log("════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Diagnosi AI con Ollama (PC dedicato)");
  console.log("════════════════════════════════════════════════════════════");

  if (!baseUrl) {
    console.error(
      "\n❌ DIAG_OLLAMA_URL non impostato.\n" +
        "   Imposta il secret DIAG_OLLAMA_URL con l'URL dell'Ollama sul PC dedicato\n" +
        "   (es. https://diag.example.com tramite Cloudflare Tunnel) e riprova.\n",
    );
    process.exitCode = 1;
    return;
  }

  const { prompt, collected, missing, githubUsed } = await collectContext(tail);
  const system = loadSystemPrompt();

  console.log(`\n  Endpoint : ${baseUrl}`);
  console.log(`  Modello  : ${model}`);
  console.log(`  Tail     : ${tail} righe/log`);
  console.log(`  Sorgenti : ${githubUsed ? "✅ GitHub API (main)" : "⚠️  disco locale (GITHUB_TOKEN assente)"}`);
  console.log(`  Raccolti : ${collected.length ? collected.join(", ") : "(nessuno)"}`);
  if (missing.length) console.log(`  Mancanti : ${missing.join(", ")}`);

  if (collected.length === 0) {
    console.warn("\n⚠️  Nessun file di log o sorgente raccolto: la diagnosi avrà poco contesto.");
  }

  console.log(`\n  ⏳ Invio al modello (timeout ${REQUEST_TIMEOUT_MS / 1000}s, il 32b può impiegare 2-5 min)...\n`);

  let report: string;
  try {
    report = await callOllama(baseUrl, model, system, prompt, token);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const isAbort = e.name === "AbortError";
    const code = e.cause?.code;
    console.error("\n❌ Diagnosi non riuscita: l'endpoint Ollama non ha risposto.");
    if (isAbort) {
      console.error(`   Timeout dopo ${REQUEST_TIMEOUT_MS / 1000}s — il modello è troppo lento o l'host non risponde.`);
    } else if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
      console.error("   Host irraggiungibile (PC spento o Cloudflare Tunnel giù).");
    }
    console.error(`   Dettaglio: ${e.message}`);
    console.error("\n   Verifica che il PC dedicato sia acceso, che Ollama sia in esecuzione");
    console.error("   e che il tunnel/hostname in DIAG_OLLAMA_URL sia raggiungibile.\n");
    process.exitCode = 1;
    return;
  }

  // ── Salvataggio ──
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(ROOT, "logs");
  const outPath = path.join(outDir, `ai-diagnosis-${ts}.md`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const header =
      `# Diagnosi AI BikerLink — ${new Date().toISOString()}\n\n` +
      `- Modello: \`${model}\`\n` +
      `- Endpoint: \`${baseUrl}\`\n` +
      `- Sorgenti: ${githubUsed ? "GitHub API (main)" : "disco locale"}\n` +
      `- File analizzati: ${collected.join(", ") || "(nessuno)"}\n\n` +
      `---\n\n`;
    fs.writeFileSync(outPath, header + report + "\n", "utf8");
  } catch (err) {
    console.warn(`\n⚠️  Impossibile salvare il report su file: ${(err as Error).message}`);
  }

  // ── Stampa a console ──
  console.log("════════════════════════════════════════════════════════════");
  console.log("  REPORT DI DIAGNOSI");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(report);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  💾 Report salvato in: ${path.relative(ROOT, outPath)}`);
  console.log("════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[ollama-diagnose] Errore inatteso:", err);
  process.exitCode = 1;
});
