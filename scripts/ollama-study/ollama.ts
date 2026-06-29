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
