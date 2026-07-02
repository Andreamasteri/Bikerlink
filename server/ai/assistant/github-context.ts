// Soluzione 3 — Contesto codice sorgente da GitHub per la modalità admin.
//
// Fetcha i file chiave dell'assistente direttamente da GitHub API (branch main),
// così l'admin vede il codice REALE aggiornato. Cache in-memory 10 min, per persona.
//
// Task #5326 (hardening) — Un token GitHub PER-AI, fine-grained e READ-ONLY
// (Contents:read + Metadata:read su Andreamasteri/Bikerlink), MAI il token che
// usiamo noi per lavorare sul repo (quello ha write). Ogni persona ha il suo
// secret dedicato: se manca, quella persona semplicemente non ha contesto
// GitHub (nessun fallback silenzioso su un token di un'altra persona).
const GITHUB_REPO = "Andreamasteri/Bikerlink";
const GITHUB_BRANCH = "main";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_CHARS = 6_000;

export type AiGithubPersona = "bowie" | "horus" | "ares" | "quebracho";

const PERSONA_TOKEN_ENV: Record<AiGithubPersona, string> = {
  bowie: "BOWIE_GITHUB_TOKEN",
  horus: "HORUS_GITHUB_TOKEN",
  ares: "ARES_GITHUB_TOKEN",
  quebracho: "QUEBRACHO_GITHUB_TOKEN",
};

function githubTokenFor(persona: AiGithubPersona): string | null {
  const envKey = PERSONA_TOKEN_ENV[persona];
  const raw = process.env[envKey]?.trim();
  return raw ? raw : null;
}

const FILES_TO_FETCH = [
  "server/ai/assistant/tools.ts",
  "server/ai/assistant/actions.ts",
  "server/ai/assistant/admin-actions.ts",
  "server/ai/assistant/knowledge.ts",
];

interface CacheEntry { ts: number; content: string }
const _cache = new Map<AiGithubPersona, CacheEntry>();

async function fetchFile(rel: string, token: string): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${rel}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "BikerLink-AdminAssistant/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) return null;
    let content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + "\n...[troncato]...";
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Fetcha i file sorgente chiave dell'assistente da GitHub (main, sempre aggiornato).
 * Cache 10 min in-memory, per persona. Ritorna stringa vuota se il token della
 * persona è assente.
 */
export async function fetchAdminCodeContext(persona: AiGithubPersona = "bowie"): Promise<string> {
  const token = githubTokenFor(persona);
  if (!token) return "";

  const cached = _cache.get(persona);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.content;
  }

  const result = await fetchCodeContextForFiles(FILES_TO_FETCH, persona, "[CODICE SORGENTE ASSISTENTE — GitHub main]");
  if (result) _cache.set(persona, { ts: Date.now(), content: result });
  return result;
}

// ── Task #5326 — Generalizzazione per Horus (code review) e ricerca repo ─────
//
// Stessa infrastruttura read-only (token fine-grained per persona, no scrittura
// possibile), ma parametrizzata su un elenco di file arbitrario così Horus può
// ispezionare qualsiasi percorso del repo per la modalità "code reviewer" o per
// l'esplorazione autonoma, senza duplicare la logica di fetch/troncamento.

/** Fetcha un singolo file da GitHub (nessuna cache: uso puntuale code-review). */
export async function fetchGithubFile(relPath: string, persona: AiGithubPersona = "horus"): Promise<string | null> {
  const token = githubTokenFor(persona);
  if (!token) return null;
  return fetchFile(relPath, token);
}

/** Fetcha più file e li assembla in un unico blocco di contesto testuale. */
export async function fetchCodeContextForFiles(
  files: string[],
  persona: AiGithubPersona = "horus",
  header = "[CODICE SORGENTE — GitHub main]",
): Promise<string> {
  const tok = githubTokenFor(persona);
  if (!tok) return "";

  const parts: string[] = [header];
  let fetched = 0;
  for (const rel of files) {
    const content = await fetchFile(rel, tok);
    if (content) {
      parts.push(`\n--- ${rel} ---\n${content}`);
      fetched++;
    }
  }
  if (fetched === 0) return "";
  return parts.join("\n");
}

export function isGithubContextConfigured(persona: AiGithubPersona = "horus"): boolean {
  return githubTokenFor(persona) !== null;
}
