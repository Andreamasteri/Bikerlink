// Soluzione 3 — Contesto codice sorgente da GitHub per la modalità admin.
//
// Fetcha i file chiave dell'assistente direttamente da GitHub API (branch main),
// così l'admin vede il codice REALE aggiornato. Cache in-memory 10 min.
// Usa DIAG_GITHUB_TOKEN (read-only, fine-grained) — MAI GITHUB_TOKEN (ha write).

const GITHUB_REPO = "Andreamasteri/Bikerlink";
const GITHUB_BRANCH = "main";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_CHARS = 6_000;

const FILES_TO_FETCH = [
  "server/ai/assistant/tools.ts",
  "server/ai/assistant/actions.ts",
  "server/ai/assistant/admin-actions.ts",
  "server/ai/assistant/knowledge.ts",
];

interface CacheEntry { ts: number; content: string }
let _cache: CacheEntry | null = null;

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
 * Cache 10 min in-memory. Ritorna stringa vuota se DIAG_GITHUB_TOKEN è assente.
 */
export async function fetchAdminCodeContext(): Promise<string> {
  const token = process.env.DIAG_GITHUB_TOKEN?.trim();
  if (!token) return "";

  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.content;
  }

  const parts: string[] = ["[CODICE SORGENTE ASSISTENTE — GitHub main]"];
  let fetched = 0;

  for (const rel of FILES_TO_FETCH) {
    const content = await fetchFile(rel, token);
    if (content) {
      parts.push(`\n--- ${rel} ---\n${content}`);
      fetched++;
    }
  }

  if (fetched === 0) return "";

  const result = parts.join("\n");
  _cache = { ts: Date.now(), content: result };
  return result;
}
