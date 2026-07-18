/**
 * VRAM Arbiter per Ares
 *
 * Ares invoca un modello pesante on-demand (`ARES_OLLAMA_MODEL`, default
 * "devstral:latest") sulla propria macchina Ollama dedicata (ARES_OLLAMA_URL).
 * Se quella stessa istanza Ollama ha altri modelli residenti in memoria (es.
 * un modello di embedding usato da un'altra pipeline, o un residuo di una
 * chiamata precedente con keep_alive lungo), il caricamento del modello di
 * Ares può saturare RAM/VRAM disponibile e far restare la chat "in hang" fino
 * al timeout invece di un errore chiaro.
 *
 * `withAresVramPriority` fa, SEMPRE best-effort (nessun throw da questo
 * modulo altera il flusso normale):
 *   1. Elenca i modelli residenti sull'istanza Ollama di Ares (`/api/ps`).
 *   2. Scarica (keep_alive:0) quelli diversi dal modello che stiamo per usare.
 *   3. Esegue la chiamata reale.
 *   4. Ricarica (best-effort, fire-and-forget) i modelli appena scaricati, così
 *      la prossima chiamata che li usa non riparte a freddo.
 *
 * Nessun secret stampato; usa le stesse variabili d'ambiente di ares-client.ts.
 */

const ARES_URL = process.env.ARES_OLLAMA_URL?.trim().replace(/\/$/, "");
const ARES_TOKEN = process.env.ARES_OLLAMA_TOKEN ?? "";
const ARBITER_TIMEOUT_MS = 4_000;

function aresHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ARES_TOKEN) h["X-Ollama-Token"] = ARES_TOKEN;
  return h;
}

interface OllamaPsModel {
  name?: string;
  model?: string;
}

/**
 * Elenca i modelli attualmente residenti sull'istanza Ollama di Ares.
 * Ritorna [] (mai lancia) se non raggiungibile o non configurato.
 */
export async function listAresResidentModels(): Promise<string[]> {
  if (!ARES_URL) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARBITER_TIMEOUT_MS);
    const res = await fetch(`${ARES_URL}/api/ps`, { method: "GET", headers: aresHeaders(), signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const body = (await res.json()) as { models?: OllamaPsModel[] };
    return (body.models ?? [])
      .map((m) => m.name ?? m.model)
      .filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

/** Scarica (best-effort) un modello dalla memoria dell'istanza Ollama di Ares. */
export async function evictAresModel(modelName: string): Promise<void> {
  if (!ARES_URL) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARBITER_TIMEOUT_MS);
    await fetch(`${ARES_URL}/api/generate`, {
      method: "POST",
      headers: aresHeaders(),
      body: JSON.stringify({ model: modelName, prompt: "", stream: false, keep_alive: 0 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    /* best-effort: se l'eviction fallisce, il caricamento del modello di Ares può
     * comunque riuscire (o fallire con un errore chiaro, gestito dal chiamante) */
  }
}

/** Ricarica (fire-and-forget, best-effort) un modello precedentemente scaricato. */
function restoreAresModel(modelName: string): void {
  if (!ARES_URL) return;
  void (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ARBITER_TIMEOUT_MS);
      await fetch(`${ARES_URL}/api/generate`, {
        method: "POST",
        headers: aresHeaders(),
        body: JSON.stringify({ model: modelName, prompt: "", stream: false }),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch { /* restore best-effort */ }
  })();
}

/**
 * Esegue `fn` dando priorità VRAM al modello di Ares: libera memoria PRIMA
 * della chiamata scaricando gli altri modelli residenti, la esegue, poi
 * ricarica (senza attendere) quelli scaricati. Non altera mai l'esito di `fn`:
 * un errore nell'arbitraggio (probe/eviction/restore) è sempre silenzioso.
 */
export async function withAresVramPriority<T>(activeModel: string, fn: () => Promise<T>): Promise<T> {
  let evicted: string[] = [];
  try {
    const resident = await listAresResidentModels();
    evicted = resident.filter((m) => m !== activeModel);
    if (evicted.length > 0) {
      await Promise.all(evicted.map((m) => evictAresModel(m)));
    }
  } catch {
    evicted = [];
  }
  try {
    return await fn();
  } finally {
    for (const m of evicted) restoreAresModel(m);
  }
}

/** Solo per i test. */
export function __getAresArbiterConfigForTests(): { url: string | undefined } {
  return { url: ARES_URL };
}
