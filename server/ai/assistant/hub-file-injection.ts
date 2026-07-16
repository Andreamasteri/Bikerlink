/**
 * AI-hub file operation injection for Ares and Quebracho — Task #163
 *
 * Ares e Quebracho NON usano tool-calling nativo (endpoint HTTP dedicati, nessun
 * `streamText`). Per dargli accesso ai file della cartella condivisa del TC
 * (~/agent-shared/) usiamo due meccanismi complementari:
 *
 * 1. PRE-COMPOSITION (read/list): se il messaggio dell'admin contiene un intento
 *    di lettura/elenco file, fetchhiamo il risultato dall'ai-hub PRIMA di comporre
 *    la domanda per l'agente e lo iniettiamo nel system prompt come contesto, esattamente
 *    come `buildNadirContextForPrompt` fa per i frammenti di Nadir. L'agente risponde
 *    così con i dati già disponibili nel contesto.
 *
 * 2. STREAMING FILTER + WRITE (save/write): il system prompt descrive la direttiva
 *    `[[AGENT_SAVE_FILE: path]]…[[/AGENT_SAVE_FILE]]` che l'agente può includere
 *    nella risposta per salvare un file. `createSaveDirectiveStreamFilter` sopprime
 *    i blocchi direttiva IN TEMPO REALE durante lo streaming (nessun byte della
 *    direttiva raggiunge mai il client), raccoglie path+contenuto, e al termine
 *    dello stream li esegue sull'hub via `executeHubFileSaves`.
 *
 * Sicurezza: stesse regole di tc-hub-tools.ts (nessun path traversal, solo path
 * relativi, hub non disponibile → nessun tentativo di rete).
 */

import { hubGet, hubPost, isHubAvailable, HUB_FILE_READ_TIMEOUT_MS } from "../../lib/ai-hub-client";

// ── Utilità path ───────────────────────────────────────────────────────────────

export function isSafeRelativePath(path: string): boolean {
  const p = (path ?? "").trim();
  if (p.startsWith("/") || p.includes("..") || p.includes("\0")) return false;
  return p.length > 0;
}

// ── Cue di intento sul messaggio utente ────────────────────────────────────────

/** Intento di lettura di un file dalla cartella condivisa. */
export const HUB_FILE_READ_RE =
  /\b(legg\w+|apri|apr\w+|mostra\w*|visualizz\w+|carica\w*|recupera\w*)\s+(il\s+|un\s+|questo\s+)?file|contenut\w*\s+del\s+file|file\s+(condivis\w+|nella\s+cartella|dell\w*\s+hub)|agent[\s-]?shared/i;

/** Intento di elenco file/directory dalla cartella condivisa. */
export const HUB_FILE_LIST_RE =
  /\b(elenc\w+|list\w+)\s+(i\s+|dei\s+)?file|quali\s+file|che\s+file\s+ci\s+(sono|stanno)|file\s+(present\w+|disponibil\w+)|contenut\w*\s+della\s+cartella|agent[\s-]?shared/i;

/** Intento di salvataggio/scrittura di un file nella cartella condivisa. */
export const HUB_FILE_SAVE_RE =
  /\b(salv\w+|scriv\w+|crea\w*|memorizz\w+|esporta\w*|pubblica\w*)\s+(un\s+|il\s+|questo\s+)?file|file\s+(condivis\w+|nella\s+cartella|dell\w*\s+hub)|agent[\s-]?shared/i;

/** true se il messaggio contiene un intento di operazione file verso l'hub. */
export function hasHubFileIntent(message: string): boolean {
  return (
    HUB_FILE_READ_RE.test(message) ||
    HUB_FILE_LIST_RE.test(message) ||
    HUB_FILE_SAVE_RE.test(message)
  );
}

// ── Streaming filter per [[AGENT_SAVE_FILE:...]]…[[/AGENT_SAVE_FILE]] ─────────
//
// Intercetta i blocchi direttiva DURANTE lo streaming (analogo a
// `createHandoffMarkerFilter` in roster.ts): nessun byte delle direttive
// raggiunge mai il client SSE. Il caller esegue le scritture a fine stream
// con `executeHubFileSaves`.

/** Marcatore di apertura direttiva (stringa fissa nel system prompt). */
export const SAVE_OPEN_PREFIX = "[[AGENT_SAVE_FILE:"; // 18 chars
/** Marcatore di chiusura direttiva. */
export const SAVE_CLOSE_MARKER = "[[/AGENT_SAVE_FILE]]"; // 20 chars

export interface SaveDirective {
  path: string;
  content: string;
}

export interface SaveDirectiveStreamFilter {
  /**
   * Consuma un delta dallo stream; emette via `emit` SOLO i byte sicuri (testo
   * normale). I byte interni alle direttive sono soppressi silenziosamente.
   */
  push(delta: string, emit: (safe: string) => void): void;
  /**
   * Chiama a fine stream. Emette eventuali byte sicuri residui e restituisce
   * le direttive catturate (da eseguire con `executeHubFileSaves`).
   */
  flush(emit: (safe: string) => void): SaveDirective[];
}

/**
 * Crea un filtro di streaming che rimuove i blocchi `[[AGENT_SAVE_FILE:…]]` dal
 * flusso prima che raggiungano il client, raccogliendoli per l'esecuzione
 * post-stream. Gestisce correttamente i marcatori spezzati tra due chunk.
 */
export function createSaveDirectiveStreamFilter(): SaveDirectiveStreamFilter {
  // "pass": emette testo normale (con look-back buffer per marcatori spezzati)
  // "capturing": accumula dentro una direttiva fino al close marker
  let mode: "pass" | "capturing" = "pass";
  let pending = ""; // look-back buffer (pass) o accumulo direttiva (capturing)
  const captured: SaveDirective[] = [];

  const process = (emit: (safe: string) => void) => {
    // Loop finché non c'è più nulla da fare in ciascuno stato
    let again = true;
    while (again) {
      again = false;

      if (mode === "pass") {
        const idx = pending.indexOf(SAVE_OPEN_PREFIX);
        if (idx >= 0) {
          // Emetti il testo prima dell'apertura, poi entra in CAPTURING
          if (idx > 0) emit(pending.slice(0, idx));
          // Scarta il prefix "[[AGENT_SAVE_FILE:" — il resto (path...content) va in pending
          pending = pending.slice(idx + SAVE_OPEN_PREFIX.length);
          mode = "capturing";
          again = true; // riesegui per cercare subito il close marker
        } else {
          // Nessun open marker: emetti il prefisso sicuro (trattieni look-back)
          const lookBack = SAVE_OPEN_PREFIX.length - 1;
          const safeLen = Math.max(0, pending.length - lookBack);
          if (safeLen > 0) {
            emit(pending.slice(0, safeLen));
            pending = pending.slice(safeLen);
          }
        }
      } else {
        // mode === "capturing": cerca il close marker
        const idx = pending.indexOf(SAVE_CLOSE_MARKER);
        if (idx >= 0) {
          // Estrai path e contenuto dal corpo accumulato
          const body = pending.slice(0, idx);
          const headerEnd = body.indexOf("]]");
          if (headerEnd >= 0) {
            const rawPath = body.slice(0, headerEnd).trim();
            // Contenuto: dopo la prima newline post-header
            const contentStart = body.indexOf("\n", headerEnd + 2);
            const content = contentStart >= 0 ? body.slice(contentStart + 1) : "";
            if (rawPath && isSafeRelativePath(rawPath)) {
              captured.push({ path: rawPath, content });
            } else if (rawPath) {
              console.warn(`[hub-file-injection] path direttiva non sicuro ignorato: "${rawPath}"`);
            }
          }
          // Ritorna in PASS con il testo dopo il close marker
          pending = pending.slice(idx + SAVE_CLOSE_MARKER.length);
          mode = "pass";
          again = true; // riesegui per cercare altri open marker
        }
        // else: ancora incompleto, attendiamo altri delta
      }
    }
  };

  return {
    push(delta, emit) {
      pending += delta;
      process(emit);
    },
    flush(emit) {
      // Fine stream: se ancora in PASS, tutto il pending è testo sicuro
      if (mode === "pass") {
        if (pending) {
          emit(pending);
          pending = "";
        }
      }
      // Se ancora CAPTURING a fine stream: direttiva malformata, scarta silenziosamente
      return captured.slice();
    },
  };
}

// ── Esecuzione scritture post-stream ──────────────────────────────────────────

export interface HubFileSaveOutcome {
  path: string;
  ok: boolean;
  error?: string;
}

/**
 * Esegue le scritture sull'hub per le direttive catturate dal filtro di streaming.
 * Best-effort: ogni errore viene loggato ma non rilancia. Hub non disponibile →
 * restituisce un outcome con ok:false per ogni direttiva.
 */
export async function executeHubFileSaves(directives: SaveDirective[]): Promise<HubFileSaveOutcome[]> {
  if (directives.length === 0) return [];
  const outcomes: HubFileSaveOutcome[] = [];
  for (const { path, content } of directives) {
    if (!isHubAvailable()) {
      outcomes.push({ path, ok: false, error: "ai-hub non disponibile" });
      continue;
    }
    try {
      const res = await hubPost("/files/write", { path, content });
      if (res.ok) {
        console.log(`[hub-file-injection] file salvato: "${path}"`);
        outcomes.push({ path, ok: true });
      } else {
        console.warn(`[hub-file-injection] save_file fallito ("${path}"): ${res.error}`);
        outcomes.push({ path, ok: false, error: res.error });
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.warn(`[hub-file-injection] save_file eccezione ("${path}"): ${msg}`);
      outcomes.push({ path, ok: false, error: msg });
    }
  }
  return outcomes;
}

// ── Pre-composition: lettura/elenco file ───────────────────────────────────────

interface FileReadResponse {
  ok: boolean;
  content?: string;
  path?: string;
  error?: string;
}

interface FileListResponse {
  ok: boolean;
  files?: Array<{ name: string; type: "file" | "directory"; size?: number }>;
  path?: string;
  error?: string;
}

/**
 * Estrae il path di file dal messaggio dell'admin (euristica semplice: cerca un token
 * che assomigli a un path relativo — contiene "/" o estensione nota).
 * Restituisce null se non trovato.
 */
function extractFilePath(message: string): string | null {
  const match = message.match(/(?<![/\\])\b([\w.-]+\/[\w./-]+\.[\w]+|[\w.-]+\.(?:md|txt|json|yaml|yml|log|csv|ts|js|py|sh))\b/);
  return match ? match[0] : null;
}

/**
 * Task #163 — Pre-composition per Ares e Quebracho: lettura e/o elenco di file
 * dall'ai-hub TC. Se il messaggio contiene un intento file, esegue l'operazione
 * e restituisce un blocco da appendere al system prompt (stesso pattern di
 * `buildNadirContextForPrompt`). Nessun intento → stringa vuota. Best-effort.
 */
export async function buildHubFileContextForPrompt(
  message: string,
  opts: { includeWrite?: boolean } = {},
): Promise<string> {
  if (!isHubAvailable()) return "";

  const sections: string[] = [];

  // Elenco file
  if (HUB_FILE_LIST_RE.test(message)) {
    try {
      const dirMatch = message.match(/(?:in\s+|directory\s+|cartella\s+|folder\s+)([\w/.-]+)/i);
      const dir = dirMatch ? dirMatch[1] : "";
      const res = await hubGet<FileListResponse>("/files/list", dir ? { path: dir } : {}, HUB_FILE_READ_TIMEOUT_MS);
      if (res.ok && res.data) {
        const d = res.data as FileListResponse;
        if (d.files && d.files.length > 0) {
          const listing = d.files
            .map((f) => `  ${f.type === "directory" ? "📁" : "📄"} ${f.name}${f.size !== undefined ? ` (${f.size} byte)` : ""}`)
            .join("\n");
          sections.push(`AI-HUB FILE LIST (~/agent-shared/${d.path ? d.path + "/" : ""}):\n${listing}`);
        } else {
          sections.push(`AI-HUB FILE LIST: la cartella ${d.path ? `"${d.path}"` : "root"} è vuota o non trovata.`);
        }
      } else {
        sections.push(`AI-HUB FILE LIST: errore recupero lista — ${res.error ?? "hub irraggiungibile"}`);
      }
    } catch (e) {
      console.warn("[hub-file-injection] list_files fallito (non-fatal):", (e as Error)?.message ?? e);
    }
  }

  // Lettura file specifico
  if (HUB_FILE_READ_RE.test(message)) {
    try {
      const filePath = extractFilePath(message);
      if (filePath && isSafeRelativePath(filePath)) {
        const res = await hubGet<FileReadResponse>("/files/read", { path: filePath }, HUB_FILE_READ_TIMEOUT_MS);
        if (res.ok && res.data) {
          const d = res.data as FileReadResponse;
          if (d.content !== undefined) {
            sections.push(`AI-HUB FILE READ — "${filePath}":\n\`\`\`\n${d.content}\n\`\`\``);
          } else {
            sections.push(`AI-HUB FILE READ "${filePath}": file vuoto.`);
          }
        } else {
          sections.push(`AI-HUB FILE READ "${filePath}": errore — ${res.error ?? "hub irraggiungibile"}.`);
        }
      } else if (!filePath) {
        sections.push(`AI-HUB FILE READ: path non estratto dal messaggio. Specifica il path relativo del file (es. "nadir/note.md").`);
      }
    } catch (e) {
      console.warn("[hub-file-injection] read_file fallito (non-fatal):", (e as Error)?.message ?? e);
    }
  }

  if (sections.length === 0) return "";

  const writeHint = opts.includeWrite
    ? "\n\nPer SALVARE un file, includi alla fine della tua risposta la direttiva:\n" +
      `${SAVE_OPEN_PREFIX} path/relativo/file.md]]\n` +
      "contenuto del file qui\n" +
      `${SAVE_CLOSE_MARKER}\n` +
      "Il sistema la eseguirà automaticamente e il marcatore non sarà visibile all'admin."
    : "";

  return (
    `\n\n---\nAI-HUB TC (~/agent-shared/ — sola lettura recuperata prima della risposta):\n` +
    sections.join("\n\n") +
    writeHint +
    `\n---`
  );
}

// ── Descrizione per il system prompt ──────────────────────────────────────────

/**
 * Blocco di testo che descrive le capacità file-hub ad Ares/Quebracho nel loro
 * system prompt. `includeWrite` aggiunge la direttiva di scrittura (Ares e Quebracho).
 */
export function buildHubFileCapabilitiesBlock(opts: { includeWrite: boolean }): string {
  const readSection =
    `CAPACITÀ FILE TC (~/agent-shared/ — cartella condivisa tra tutti gli agenti AI):\n` +
    `- LEGGI un file: l'admin può chiederti "leggi il file X" e il sistema pre-carica il contenuto nel tuo contesto prima di questa risposta (sezione "AI-HUB FILE READ" sopra).\n` +
    `- ELENCA file: l'admin può chiederti "elenca i file" e il sistema pre-carica la lista nel tuo contesto (sezione "AI-HUB FILE LIST" sopra).`;

  if (!opts.includeWrite) return readSection;

  return (
    readSection +
    `\n- SALVA un file: per scrivere nella cartella condivisa, includi ALLA FINE della risposta (ultima cosa, dopo qualsiasi testo) la direttiva:\n` +
    `  ${SAVE_OPEN_PREFIX} path/relativo/file.md]]\n` +
    `  contenuto testuale del file\n` +
    `  ${SAVE_CLOSE_MARKER}\n` +
    `  Il sistema eseguirà la scrittura e il marcatore non raggiungerà mai l'admin. Usa path relativi (es. "ares/report-2026.md"), mai path assoluti o "../".`
  );
}
