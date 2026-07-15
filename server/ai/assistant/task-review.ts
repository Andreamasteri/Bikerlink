// Task #50 — Revisione condivisa dei task plan ("propone, non applica mai").
//
// Dato un file o un testo di task plan, produce una review strutturata in
// italiano PRIMA che il piano venga eseguito, senza mai modificare nulla. A
// differenza del meccanismo Ares-only del catalogo di riferimento, qui la review
// è disponibile a TUTTE le persone (Horus, Bowie, Quebracho, Ares) — coerente
// col fatto che gli altri tool del catalogo sono multi-agente — e viene
// instradata all'agente richiesto. Resta valido l'invariante "propone, non
// applica": nessun tool di scrittura, solo analisi testuale + verifica dei
// riferimenti a file contro il checkout locale.
//
// Questo modulo NON importa il DB: così può essere usato anche dallo script CLI
// one-shot senza tirare dentro l'intero backend.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { callOllamaChat, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { isAresConfigured, getAresModelId, streamAresChat } from "../../lib/ares-client";
import { withAresVramPriority } from "../../lib/vram-arbiter";
import { isQuebrachoConfigured, streamQuebrachoChat } from "../../lib/quebracho-client";
import { createTimeoutSignal } from "./inter-agent";

export type ReviewAgent = "ares" | "quebracho" | "horus" | "bowie";

export interface ReviewTaskPlanOptions {
  /** Testo del task plan (alternativo a filePath). */
  content?: string;
  /** Percorso di un file di task plan da leggere (alternativo a content). */
  filePath?: string;
  /** Agente che esegue la review (default "ares"). */
  agent?: ReviewAgent;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Se false, la lettura di un `filePath` dal disco è vietata (solo `content`
   * inline è ammesso). Difesa contro la divulgazione di file arbitrari quando il
   * tool è esposto in sessioni non-admin. Default true (CLI operatore / admin).
   */
  allowFileRead?: boolean;
}

export interface ReviewTaskPlanResult {
  ok: boolean;
  /** Testo strutturato della review (se ok). */
  review?: string;
  /** Percorsi citati nel piano ma NON trovati nel checkout. */
  missingFiles?: string[];
  /** Percorsi citati e trovati. */
  foundFiles?: string[];
  /** Messaggio d'errore leggibile (se !ok). */
  error?: string;
}

export const REVIEW_BUSY_MESSAGE = "Una revisione è già in corso — riprova quando ha finito.";

// Lock a ciclo singolo, in-process (una revisione alla volta). TTL di sicurezza
// se il processo crasha lasciando il lock preso.
const REVIEW_LOCK_TTL_MS = 20 * 60_000;
let reviewRunningSince: number | null = null;

export function isReviewRunning(): boolean {
  return reviewRunningSince !== null && Date.now() - reviewRunningSince < REVIEW_LOCK_TTL_MS;
}

const REVIEW_TIMEOUT_MS = 120_000;

const REVIEW_SYSTEM_PROMPT = [
  "In questa modalità REVISIONI un task plan prima che venga eseguito da un agente:",
  "il tuo compito è trovare problemi nel piano, NON eseguirlo.",
  "",
  "REGOLA ASSOLUTA — 'proponi, non applichi mai':",
  "- NON applichi modifiche, NON scrivi file, NON installi nulla, NON esegui il task.",
  "- Solo analisi del piano e osservazioni. Le decisioni restano all'admin.",
  "",
  "Verifica le assunzioni del piano contro il codice reale del repository: i file",
  "citati esistono? Se ti viene fornito un elenco di 'file citati ma non trovati',",
  "trattalo come un segnale forte di riferimenti obsoleti o inventati. Non inventare:",
  "se non puoi confermare un'assunzione, segnalala come da verificare.",
  "",
  "Al termine produci una review in ITALIANO ESATTAMENTE così strutturata:",
  "1. Scope: il piano è ben delimitato? Fa troppo o troppo poco rispetto all'obiettivo?",
  "2. Rischi e dipendenze nascoste: cosa può rompersi; dipendenze non dichiarate.",
  "3. Step mancanti o ambigui: passi assenti, sottospecificati o nell'ordine sbagliato.",
  "4. Contraddizioni interne: parti del piano in conflitto tra loro.",
  "5. Out of scope da verificare: cose escluse che forse andrebbero incluse (o viceversa).",
  "6. Giudizio finale: PRONTO / DA CORREGGERE / DA RIPENSARE, con una frase di motivazione.",
  "Per i punti 1-5, quando puoi apri con un verdetto binario (OK / PROBLEMA) e poi elabora.",
  "Sii conciso e concreto.",
].join("\n");

// ── Estrazione e verifica dei riferimenti a file (pura, testabile) ─────────────

/**
 * Estrae i percorsi di file citati in un task plan. Considera i token racchiusi
 * tra backtick che "sembrano" un percorso (hanno un'estensione), rimuovendo un
 * eventuale suffisso `:riga` o `:riga-riga` (es. `shared/db/x.ts:329-346`).
 * Pura: non tocca il filesystem. Restituisce percorsi unici in ordine di prima
 * apparizione.
 */
export function extractReferencedFiles(planText: string): string[] {
  const text = planText ?? "";
  const seen = new Set<string>();
  const out: string[] = [];
  // Token tra backtick singoli.
  const backtickRe = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickRe.exec(text)) !== null) {
    const token = m[1].trim();
    // Rimuovi suffisso :riga o :riga-riga.
    const withoutLine = token.replace(/:\d+(?:-\d+)?$/, "");
    // Un percorso valido: nessuno spazio, contiene un'estensione file.
    if (/\s/.test(withoutLine)) continue;
    if (!/^[A-Za-z0-9_@.][A-Za-z0-9_@./-]*\.[A-Za-z0-9]{1,8}$/.test(withoutLine)) continue;
    if (!seen.has(withoutLine)) {
      seen.add(withoutLine);
      out.push(withoutLine);
    }
  }
  return out;
}

/**
 * Verifica quali dei percorsi citati esistono nel checkout locale (relativi a
 * `cwd`). Restituisce found/missing. I percorsi assoluti sono verificati come
 * tali.
 */
export function checkReferencedFiles(
  paths: string[],
  opts: { cwd?: string } = {},
): { found: string[]; missing: string[] } {
  const cwd = opts.cwd ?? process.cwd();
  const found: string[] = [];
  const missing: string[] = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
    if (existsSync(abs)) found.push(p);
    else missing.push(p);
  }
  return { found, missing };
}

// ── Orchestrazione ─────────────────────────────────────────────────────────────

/**
 * Risolve un percorso di task plan confinandolo alla radice del progetto: rifiuta
 * i percorsi assoluti e ogni tentativo di uscire dalla root (`..`). Difesa contro
 * la divulgazione di file arbitrari (path traversal) da input controllato dal
 * modello/utente.
 */
export function resolveWorkspacePath(filePath: string): { ok: true; abs: string } | { ok: false; error: string } {
  if (path.isAbsolute(filePath)) {
    return { ok: false, error: "Percorso non ammesso: usa un percorso relativo alla radice del progetto (niente percorsi assoluti)." };
  }
  const root = process.cwd();
  const abs = path.resolve(root, filePath);
  const rel = path.relative(root, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: "Percorso non ammesso: fuori dalla radice del progetto." };
  }
  return { ok: true, abs };
}

// ── Task #57 — Rilevamento in-chat per Ares/Quebracho ──────────────────────────
// Ares e Quebracho non passano da streamText (nessun tool-calling nativo: usano
// un client HTTP diretto + una singola domanda composta), quindi non possono
// esporre `review_task_plan` come tool AI SDK come fanno Bowie/Horus. Per dare
// comunque un percorso in-chat, il messaggio dell'admin viene ispezionato PRIMA
// di comporre la domanda per l'agente: se sembra una richiesta di revisione
// piano, la conversazione salta il normale giro di chat e chiama direttamente
// `reviewTaskPlan`.
//
// Task #71 — L'euristica originale (lista chiusa di 5 verbi + parola piano + un
// percorso file O un blocco ≥200 char) mancava quasi tutte le formulazioni
// naturali di un admin in chat, anche quando il percorso ERA presente: la
// richiesta cadeva in silenzio sulla chat normale. Verbi ora ampliati e due
// aggiunte: (a) le formule idiomatiche "soft" ("dai un'occhiata", "che ne
// pensi", "un parere"…), che però attivano la review SOLO con un bersaglio
// esplicito (percorso o numero di task), mai col fallback ≥200 char, per non
// scattare su chiacchiere lunghe; (b) il riferimento "task N" risolto a
// `.local/tasks/task-N.md` (convenzione seguita da centinaia di file di piano),
// così un admin può dire "revisiona il piano del task 57" senza incollare il
// percorso. L'invariante resta: serve SEMPRE la parola piano/plan; senza un
// bersaglio da revisionare (percorso, numero task o testo incollato) si ricade
// sulla chat normale.

// Verbi/nomi che esprimono INEQUIVOCABILMENTE l'intento di revisione. Abilitano
// tutti i casi, incluso il piano incollato inline (≥200 char).
const REVIEW_TRIGGER_RE =
  /\b(revisiona|revisione|revisionare|rivedi|rivedere|rivisiona|rivisita|rivisitare|controlla|controllare|verifica|verificare|esamina|esaminare|valuta|valutare|analizza|analizzare|critica|criticare|commenta|commentare|review)\b/i;
// Formule idiomatiche "soft": esprimono comunque una richiesta di parere ma sono
// ampie, quindi attivano la review SOLO se c'è un bersaglio esplicito (percorso o
// numero di task), MAI il fallback inline ≥200 char (evita falsi positivi su
// messaggi lunghi che nominano "un piano" senza chiedere una revisione).
const SOFT_INTENT_RE =
  /(\bocchiata\b|che ne pensi|cosa ne pensi|\bun parere\b|il tuo parere|un'opinione|la tua opinione|\bun feedback\b|\bfeedback\b|\bguarda\b|\bguardare\b)/i;
const PLAN_WORD_RE = /\b(piano|task ?plan|plan)\b/i;
// Percorso "nudo" (non tra backtick) plausibile: almeno una directory + estensione md/txt.
const BARE_PATH_RE = /(?:[.\w-]+\/)+[\w.-]+\.(?:md|txt)\b/;
// Riferimento a un task per numero: "task 57", "task plan 57", "task #57",
// "del task 57". Risolto a `.local/tasks/task-N.md`.
const TASK_NUMBER_RE = /\btask(?:[ -]?plan)?\s*#?\s*(\d{1,6})\b/i;
const MIN_INLINE_CONTENT_CHARS = 200;

export interface DetectedPlanReviewRequest {
  filePath?: string;
  content?: string;
}

/**
 * Ispeziona un messaggio in chat e decide se è una richiesta di revisione di un
 * task plan. Ritorna `null` se non riconosciuto (il chiamante prosegue con la
 * chat normale). Pura: nessun accesso al filesystem o al modello.
 */
export function detectPlanReviewRequest(message: string): DetectedPlanReviewRequest | null {
  const text = (message ?? "").trim();
  if (!text) return null;
  if (!PLAN_WORD_RE.test(text)) return null;
  const hasStrongIntent = REVIEW_TRIGGER_RE.test(text);
  const hasSoftIntent = SOFT_INTENT_RE.test(text);
  if (!hasStrongIntent && !hasSoftIntent) return null;

  // 1) Percorso citato tra backtick (stesso formato accettato dal tool AI SDK).
  const backticked = extractReferencedFiles(text);
  if (backticked.length > 0) return { filePath: backticked[0] };

  // 2) Percorso "nudo" nel testo (es. "revisiona .local/tasks/task-57.md").
  const bare = BARE_PATH_RE.exec(text);
  if (bare) return { filePath: bare[0] };

  // 3) Riferimento "task N": risolvi al file di piano canonico. Se il file non
  // esiste, reviewTaskPlan risponde con un errore chiaro ("File non trovato"),
  // non un crash — meglio di un silenzioso fallback a chat.
  const taskNum = TASK_NUMBER_RE.exec(text);
  if (taskNum) return { filePath: `.local/tasks/task-${taskNum[1]}.md` };

  // 4) Nessun bersaglio esplicito: solo con intento FORTE e un messaggio
  // sostanzioso lo trattiamo come piano incollato per intero (le formule soft
  // non arrivano qui, per non scattare su chiacchiere lunghe).
  if (hasStrongIntent && text.length >= MIN_INLINE_CONTENT_CHARS) return { content: text };

  return null;
}

function agentConfigured(agent: ReviewAgent): boolean {
  switch (agent) {
    case "ares":
      return isAresConfigured;
    case "quebracho":
      return isQuebrachoConfigured;
    case "horus":
    case "bowie":
      return isOllamaConfigured;
  }
}

function stripThink(text: string): string {
  return (text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function buildReviewPrompt(planText: string, missingFiles: string[]): string {
  const missingBlock =
    missingFiles.length > 0
      ? [
          "",
          "File CITATI NEL PIANO ma NON TROVATI nel checkout (verifica se sono",
          "riferimenti obsoleti, rinominati o inventati):",
          ...missingFiles.map((f) => `- ${f}`),
        ].join("\n")
      : "\n(Tutti i file citati nel piano risultano presenti nel checkout.)";
  return [
    "Task plan da revisionare (prima dell'esecuzione). Contenuto integrale tra i marcatori:",
    "--- INIZIO TASK PLAN ---",
    planText.trim(),
    "--- FINE TASK PLAN ---",
    missingBlock,
  ].join("\n");
}

async function callReviewAgent(
  agent: ReviewAgent,
  prompt: string,
  system: string,
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? REVIEW_TIMEOUT_MS;
  if (agent === "ares") {
    const { text } = await withAresVramPriority(getAresModelId(), () =>
      streamAresChat({
        system,
        messages: [{ role: "user", content: prompt }],
        signal: opts.signal,
        timeoutMs,
        numPredict: 1200,
      }),
    );
    return stripThink(text);
  }
  if (agent === "quebracho") {
    const { text } = await streamQuebrachoChat({
      system,
      messages: [{ role: "user", content: prompt }],
      signal: opts.signal,
      timeoutMs,
      numPredict: 1200,
    });
    return stripThink(text);
  }
  // horus / bowie → Ollama chat con la persona corrispondente. callOllamaChat
  // accetta solo un abortSignal: applichiamo il timeout via signal composito.
  const t = createTimeoutSignal(opts.signal, timeoutMs);
  try {
    const raw = await callOllamaChat(prompt, undefined, {
      persona: agent === "horus" ? "horus" : "bowie",
      system,
      temperature: 0.3,
      numPredict: 1200,
      abortSignal: t.signal,
    });
    return stripThink(raw ?? "");
  } finally {
    t.cleanup();
  }
}

/**
 * Orchestrazione completa della revisione di un task plan.
 * Ordine: preflight (piano vuoto / file mancante / agente non configurato →
 * esce SENZA contattare il modello) → lock a ciclo singolo → verifica riferimenti
 * → chiamata all'agente. Il lock viene sempre rilasciato in `finally`.
 */
export async function reviewTaskPlan(opts: ReviewTaskPlanOptions): Promise<ReviewTaskPlanResult> {
  const agent: ReviewAgent = opts.agent ?? "ares";

  // ── Preflight (nessun contatto col modello) ──────────────────────────────────
  const allowFileRead = opts.allowFileRead !== false; // default: consentito (CLI/admin)
  let planText: string;
  if (opts.filePath) {
    if (!allowFileRead) {
      return {
        ok: false,
        error: "La revisione da file è riservata agli amministratori: incolla il testo del piano da revisionare.",
      };
    }
    const resolved = resolveWorkspacePath(opts.filePath);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    if (!existsSync(resolved.abs)) {
      return { ok: false, error: `File del task plan non trovato: ${opts.filePath}` };
    }
    try {
      planText = await readFile(resolved.abs, "utf8");
    } catch (err) {
      return { ok: false, error: `Impossibile leggere il file: ${(err as Error).message}` };
    }
  } else {
    planText = opts.content ?? "";
  }

  if (planText.trim().length === 0) {
    return { ok: false, error: "Task plan vuoto: niente da revisionare." };
  }

  if (!agentConfigured(agent)) {
    return {
      ok: false,
      error: `L'agente "${agent}" non è configurato o raggiungibile: impossibile eseguire la revisione.`,
    };
  }

  // Lock: una revisione alla volta.
  if (isReviewRunning()) {
    return { ok: false, error: REVIEW_BUSY_MESSAGE };
  }
  reviewRunningSince = Date.now();

  try {
    // Reachability per gli agenti Ollama (Horus/Bowie): probe cheap, non è il modello.
    if ((agent === "horus" || agent === "bowie") && !(await isOllamaReachable(agent === "horus" ? "horus" : "bowie"))) {
      return {
        ok: false,
        error: `L'agente "${agent}" non è raggiungibile in questo momento: riprova più tardi.`,
      };
    }

    const referenced = extractReferencedFiles(planText);
    const { found, missing } = checkReferencedFiles(referenced);
    const prompt = buildReviewPrompt(planText, missing);

    const review = await callReviewAgent(agent, prompt, REVIEW_SYSTEM_PROMPT, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    });

    if (!review) {
      return { ok: false, error: "L'agente non ha prodotto una review utilizzabile.", missingFiles: missing, foundFiles: found };
    }
    return { ok: true, review, missingFiles: missing, foundFiles: found };
  } catch (err) {
    return { ok: false, error: `Revisione fallita: ${(err as Error).message}` };
  } finally {
    reviewRunningSince = null;
  }
}
