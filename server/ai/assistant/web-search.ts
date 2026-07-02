// Task #5326 — Ricerca web reale per l'ecosistema AI (Horus/Ares/Bowie).
//
// Provider: SearXNG — metamotore di ricerca open-source, self-hosted (nessuna
// API key, nessun costo, nessun rate-limit sulla propria istanza). Coerente con
// l'architettura BikerLink: gira sul ThinkCentre (come GraphHopper/Ollama/…) ed
// è raggiungibile via SEARXNG_URL. Espone /search?q=...&format=json.
//
// Nessun fallback silenzioso: se SEARXNG_URL manca o la chiamata fallisce, il
// tool ritorna { error, available:false } — mai dati inventati. Letture
// pubbliche (nessun dato utente inviato al motore): la query va passata "pulita"
// (già filtrata a monte dal chiamante se necessario).
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 5;
const MAX_SNIPPET_CHARS = 500;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  available: boolean;
  query: string;
  answer: string | null;
  results: WebSearchResult[];
  error?: string;
}

/** URL base dell'istanza SearXNG (senza slash finale), o null se non configurata. */
function searxngBaseUrl(): string | null {
  const raw = process.env.SEARXNG_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** Token del gate nginx davanti a SearXNG (header X-Searxng-Key), se configurato. */
function searxngGateToken(): string | null {
  const raw = process.env.SEARXNG_GATE_TOKEN?.trim();
  return raw ? raw : null;
}

export function isWebSearchConfigured(): boolean {
  return searxngBaseUrl() !== null;
}

/**
 * Esegue una ricerca web reale via SearXNG. Sola lettura, nessuna azione,
 * nessuna scrittura — usato da Horus (ricerca autonoma), Ares (diagnostica
 * esterna) e Bowie (tool calling) per rispondere con informazioni aggiornate
 * non presenti nella knowledge base locale.
 */
export async function webSearch(query: string, opts: { maxResults?: number } = {}): Promise<WebSearchResponse> {
  const base = searxngBaseUrl();
  const trimmedQuery = query.trim().slice(0, 400);
  if (!base) {
    return { available: false, query: trimmedQuery, answer: null, results: [], error: "web search non configurata (SEARXNG_URL assente)" };
  }
  if (!trimmedQuery) {
    return { available: true, query: trimmedQuery, answer: null, results: [], error: "query vuota" };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", trimmedQuery);
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", "1");
    const gateToken = searxngGateToken();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BikerLink-AI/1.0",
        ...(gateToken ? { "X-Searxng-Key": gateToken } : {}),
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { available: true, query: trimmedQuery, answer: null, results: [], error: `SearXNG HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
      answers?: Array<string | { answer?: string }>;
      infoboxes?: Array<{ content?: string }>;
    };

    const limit = Math.min(opts.maxResults ?? MAX_RESULTS, MAX_RESULTS);
    const results: WebSearchResult[] = (data.results ?? [])
      .filter((r) => r.url)
      .slice(0, limit)
      .map((r) => ({
        title: (r.title ?? "").slice(0, 200),
        url: r.url as string,
        snippet: (r.content ?? "").slice(0, MAX_SNIPPET_CHARS),
      }));

    // SearXNG non restituisce una "answer" sintetica come le API a pagamento;
    // usiamo la prima risposta istantanea / infobox se presente, altrimenti null.
    const rawAnswer =
      data.answers?.map((a) => (typeof a === "string" ? a : a?.answer)).find((a) => a && a.trim()) ??
      data.infoboxes?.map((b) => b?.content).find((c) => c && c.trim()) ??
      null;

    return {
      available: true,
      query: trimmedQuery,
      answer: rawAnswer ? rawAnswer.slice(0, 1000) : null,
      results,
    };
  } catch (err) {
    return { available: true, query: trimmedQuery, answer: null, results: [], error: (err as Error).message.slice(0, 200) };
  }
}

/** Formatta una risposta di ricerca per l'injection in un prompt/report. */
export function formatWebSearchResult(res: WebSearchResponse): string {
  if (!res.available) return `[ricerca web non disponibile: ${res.error ?? "non configurata"}]`;
  if (res.error) return `[ricerca web fallita: ${res.error}]`;
  const lines: string[] = [];
  if (res.answer) lines.push(`Sintesi: ${res.answer}`);
  for (const r of res.results) {
    lines.push(`- ${r.title} (${r.url}): ${r.snippet}`);
  }
  return lines.length > 0 ? lines.join("\n") : "[nessun risultato]";
}
