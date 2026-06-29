/**
 * Chunking della codebase, chiamata HTTP diretta a Ollama (con header
 * Cloudflare Access) e iniezione della sezione Architettura in
 * bikerlink-context.md.
 */

import fs from "fs";
import path from "path";
import { cfAccessHeaders } from "../../server/lib/cf-access";
import { ROOT, REQUEST_TIMEOUT_MS, type DownloadedFile } from "./config";

// ─── Chunking ───────────────────────────────────────────────────────────────

/** Raggruppa i file in chunk ≤ chunkChars rispettando i confini di file. */
export function buildChunks(files: DownloadedFile[], chunkChars: number): string[] {
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

// ─── Ollama ─────────────────────────────────────────────────────────────────

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

export const STUDY_SYSTEM_PROMPT =
  "Sei un architetto software senior esperto di Node.js, Express, TypeScript, " +
  "Expo/React Native, Drizzle ORM e PostgreSQL. Stai STUDIANDO a fondo la codebase " +
  "di un'app italiana per motociclisti chiamata BikerLink, ricevuta a chunk insieme " +
  "al dump di schema e dati di due database (dev e prod). Il tuo obiettivo è costruire " +
  "una comprensione completa e persistente dell'architettura: moduli, dipendenze, " +
  "pattern ripetuti, punti di rischio e drift dev↔prod. Rispondi sempre in italiano, " +
  "in modo tecnico e strutturato. Durante l'invio dei chunk fornisci solo un breve " +
  "consolidamento; il report completo lo produrrai alla richiesta finale.";

export async function callOllama(
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[],
  token: string | undefined,
  numCtx?: number,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  Object.assign(headers, cfAccessHeaders());
  const options: Record<string, unknown> = { temperature: 0.2 };
  if (numCtx && numCtx > 0) options.num_ctx = numCtx;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ model, stream: false, options, messages }),
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
export function extractArchitecture(report: string): string | null {
  const m = report.match(/^##\s+Architettura\b[\s\S]*?(?=^##\s+|$(?![\s\S]))/m);
  return m ? m[0].trim() : null;
}

/** Inietta/sostituisce il blocco Architettura in bikerlink-context.md. */
export function updateContext(arch: string): boolean {
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

// ─── Map-reduce: riassunto per-chunk + sintesi finale ───────────────────────

/** Budget di caratteri in input per stare in `numCtx` (≈3 char/token), lasciando
 *  ~20% del contesto all'output del modello. */
export function ctxCharBudget(numCtx: number): number {
  return Math.max(8_000, Math.floor(numCtx * 3 * 0.8));
}

/**
 * REDUCE intermedio (fold): consolida un BATCH di riassunti parziali in UN solo
 * riassunto conciso, preservando i fatti chiave (moduli, responsabilità,
 * dipendenze, rischi). Serve a far entrare nel contesto la sintesi finale quando
 * i chunk sono tanti. Non produce le sezioni H2 finali: è un consolidamento.
 */
export async function foldSummaries(
  baseUrl: string,
  model: string,
  parts: string[],
  token: string | undefined,
  numCtx: number,
): Promise<string> {
  const budget = ctxCharBudget(numCtx);
  let joined = parts.map((p, i) => `### Parte ${i + 1}\n${p}`).join("\n\n");
  if (joined.length > budget) joined = joined.slice(0, budget) + "\n\n...[troncato per limite contesto]...";
  const messages = [
    { role: "system", content: STUDY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "Consolida i seguenti riassunti parziali della codebase BikerLink in UN UNICO riassunto conciso, " +
        "preservando i fatti chiave (moduli e responsabilità, dipendenze, pattern, punti di rischio). " +
        "NON usare intestazioni H2; niente preamboli.\n\n" +
        joined,
    },
  ];
  return callOllama(baseUrl, model, messages, token, numCtx);
}

/**
 * MAP: riassume UN singolo chunk in ISOLAMENTO (nessuna history accumulata).
 * Questo evita l'overflow di contesto su repo grandi e rende ogni chiamata
 * indipendente (quindi resumabile).
 */
export async function summarizeChunk(
  baseUrl: string,
  model: string,
  chunk: string,
  idx: number,
  total: number,
  token: string | undefined,
  numCtx: number,
): Promise<string> {
  const budget = ctxCharBudget(numCtx);
  const body = chunk.length > budget ? chunk.slice(0, budget) + "\n\n...[troncato per limite contesto]..." : chunk;
  const messages = [
    { role: "system", content: STUDY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Questo è il chunk ${idx + 1}/${total} della codebase BikerLink, da analizzare in ISOLAMENTO. ` +
        "Riassumi in modo strutturato e CONCISO (max ~350 parole): moduli/file presenti e loro responsabilità, " +
        "dipendenze chiave, pattern ricorrenti, eventuali punti di rischio. Niente preamboli.\n\n" +
        body,
    },
  ];
  return callOllama(baseUrl, model, messages, token, numCtx);
}

/** MAP per testo generico (es. dump DB): riassunto strutturato entro il contesto. */
export async function summarizeText(
  baseUrl: string,
  model: string,
  label: string,
  text: string,
  token: string | undefined,
  numCtx: number,
): Promise<string> {
  const budget = ctxCharBudget(numCtx);
  const body = text.length > budget ? text.slice(0, budget) + "\n\n...[troncato per limite contesto]..." : text;
  const messages = [
    { role: "system", content: STUDY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Riassumi in modo strutturato e conciso ${label}. Evidenzia lo schema principale, le tabelle chiave, ` +
        "le relazioni e ogni drift dev↔prod che noti.\n\n" +
        body,
    },
  ];
  return callOllama(baseUrl, model, messages, token, numCtx);
}

/**
 * REDUCE: sintetizza i riassunti per-chunk (+ riassunto DB) nel report finale.
 * L'input sono solo i riassunti (piccoli), quindi sta comodamente nel contesto.
 */
export async function composeReport(
  baseUrl: string,
  model: string,
  summaries: string[],
  dbSummary: string | null,
  token: string | undefined,
  numCtx: number,
): Promise<string> {
  const db = dbSummary ? `\n\n### Riassunto database (dev/prod)\n${dbSummary}` : "";
  // Rete di sicurezza finale: anche se il fold gerarchico ha ridotto la coda,
  // qui garantiamo che payload (riassunti + DB + scaffolding del prompt) stia nel
  // budget di contesto. Copre anche il caso coda di 1 solo elemento sovradimensionato.
  const budget = ctxCharBudget(numCtx);
  const SCAFFOLD_OVERHEAD = 1_500;
  const partsBudget = Math.max(2_000, budget - db.length - SCAFFOLD_OVERHEAD);
  let parts = summaries.map((s, i) => `### Riassunto chunk ${i + 1}\n${s}`).join("\n\n");
  if (parts.length > partsBudget) parts = parts.slice(0, partsBudget) + "\n\n...[troncato per limite contesto]...";
  const messages = [
    { role: "system", content: STUDY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Di seguito i riassunti per-chunk dell'INTERA codebase BikerLink${dbSummary ? " e dei due database" : ""}. ` +
        "Sintetizzali in un UNICO report architetturale completo. Usa ESATTAMENTE queste sezioni H2:\n" +
        "## Architettura — panoramica architetturale e mappa dei moduli\n" +
        "## Dipendenze critiche\n" +
        "## Pattern ripetuti\n" +
        "## Punti di rischio\n" +
        "## Confronto schema dev↔prod\n" +
        "La sezione '## Architettura' deve essere autosufficiente: verrà estratta e usata come system prompt persistente.\n\n" +
        parts +
        db,
    },
  ];
  return callOllama(baseUrl, model, messages, token, numCtx);
}

// ─── Manuale utente Q&A (Task #5189) ────────────────────────────────────────

/** Percorso del manuale utente Q&A generato (tracciato da git). */
export const QA_MANUAL_PATH = path.join(ROOT, "docs", "bikerlink-qa-manual.md");

const QA_SYSTEM_PROMPT =
  "Sei un esperto di prodotto che scrive documentazione per gli UTENTI FINALI dell'app " +
  "italiana per motociclisti BikerLink. Conosci a fondo l'app dal report architetturale " +
  "ricevuto. Scrivi in italiano semplice e amichevole, dal punto di vista di chi USA l'app: " +
  "niente codice, niente nomi di file/funzioni/tabelle, niente dettagli implementativi, " +
  "nessun dato di altri utenti.";

/**
 * REDUCE finale alternativo: a partire dal report architetturale, genera un
 * manuale utente in formato Q&A (50-100 coppie) dal punto di vista dell'utente.
 */
export async function generateQaManual(
  baseUrl: string,
  model: string,
  context: string,
  token: string | undefined,
  numCtx: number,
): Promise<string> {
  const budget = ctxCharBudget(numCtx);
  const body = context.length > budget ? context.slice(0, budget) + "\n\n...[troncato per limite contesto]..." : context;
  const messages = [
    { role: "system", content: QA_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "Genera un MANUALE UTENTE BikerLink in formato Q&A: tra 50 e 100 coppie domanda/risposta " +
        "che coprano TUTTE le funzionalità dell'app dal punto di vista dell'UTENTE FINALE. " +
        "Risposte concise (2-4 frasi). Usa ESATTAMENTE questo formato per ogni voce, una dopo l'altra:\n" +
        "## D: <domanda>\n**R:** <risposta>\n\n" +
        "Nessun preambolo e nessuna conclusione: SOLO le coppie Q&A.\n\n" +
        "--- REPORT ARCHITETTURALE DELLA CODEBASE ---\n" +
        body,
    },
  ];
  return callOllama(baseUrl, model, messages, token, numCtx);
}

/** Scrive il manuale Q&A in docs/bikerlink-qa-manual.md. Ritorna il path relativo. */
export function writeQaManual(content: string): string {
  fs.mkdirSync(path.dirname(QA_MANUAL_PATH), { recursive: true });
  const head =
    "# BikerLink — Manuale utente (Q&A)\n\n" +
    "> Generato automaticamente da `scripts/ollama-study-repo.ts` (Ares, Ollama PC fisso).\n" +
    "> Da iniettare in Bowie (assistente in-app, ThinkCentre) con `scripts/ollama-push-manual.ts`.\n" +
    `> Ultimo aggiornamento: ${new Date().toISOString()}\n\n---\n\n`;
  fs.writeFileSync(QA_MANUAL_PATH, head + content.trim() + "\n", "utf8");
  return path.relative(ROOT, QA_MANUAL_PATH);
}
