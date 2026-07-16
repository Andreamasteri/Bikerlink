/**
 * ThinkCentre Repo-Drift Probe + Fix
 *
 * probeRepoDrift() — interroga /repo-drift su stats-server.js (GET).
 * fixRepoDrift()   — chiama /repo-drift-fix su stats-server.js (POST):
 *   esegue git checkout origin/main per ogni file di build Ollama che deriva.
 *
 * Il probe fallisce aperto (driftDetected: false) se il TC non è raggiungibile,
 * in modo da non bloccare il health check.
 * Il fix propaga l'identità dell'admin che ha premuto il pulsante per l'audit.
 */

export interface RepoDriftHealth {
  /** true se la probe è stata eseguita (TC raggiungibile). */
  checked: boolean;
  /** true se almeno un file di build differisce da origin/main. */
  driftDetected: boolean;
  /** numero di commit dietro a origin/main, null se non determinabile. */
  behind: number | null;
  /** elenco dei file che differiscono da origin/main. */
  driftedFiles: string[];
  /** timestamp ISO dell'esecuzione lato TC. */
  checkedAt: string | null;
  /** descrizione dell'errore, se il probe non è riuscito. */
  error?: string;
}

export interface RepoDriftFixResult {
  /** true se tutti i file sono stati ripristinati senza errori. */
  ok: boolean;
  /** file ripristinati con successo. */
  fixedFiles: string[];
  /** file che non è stato possibile ripristinare (con motivo). */
  errors: { file: string; error: string }[];
  /** timestamp ISO del completamento lato TC. */
  fixedAt: string | null;
  /** descrizione dell'errore di trasporto, se il TC non era raggiungibile. */
  error?: string;
}

/**
 * Chiama POST /repo-drift-fix su stats-server.js.
 * Esegue git checkout origin/main per ogni file di build Ollama tracciato.
 * @param triggeredBy identità dell'admin che ha avviato la sincronizzazione (per audit).
 */
export async function fixRepoDrift(triggeredBy: string): Promise<RepoDriftFixResult> {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  if (!metricsBase) {
    return {
      ok: false,
      fixedFiles: [],
      errors: [],
      fixedAt: null,
      error: "THINKCENTRE_METRICS_URL non configurato",
    };
  }

  const url = `${metricsBase}/repo-drift-fix`;
  const token = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Agent-Token"] = token;

  const controller = new AbortController();
  // 30 s: git fetch (≤15 s) + checkout per file (≤5 s ciascuno).
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({ triggeredBy }),
    });
    clearTimeout(timer);
    const data = await upstream.json() as Partial<RepoDriftFixResult>;
    return {
      ok: data.ok ?? false,
      fixedFiles: Array.isArray(data.fixedFiles) ? data.fixedFiles : [],
      errors: Array.isArray(data.errors) ? data.errors : [],
      fixedAt: typeof data.fixedAt === "string" ? data.fixedAt : null,
      ...(data.error ? { error: data.error } : {}),
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      fixedFiles: [],
      errors: [],
      fixedAt: null,
      error: isTimeout ? "timeout" : "non raggiungibile",
    };
  }
}

export async function probeRepoDrift(): Promise<RepoDriftHealth> {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  if (!metricsBase) {
    return {
      checked: false,
      driftDetected: false,
      behind: null,
      driftedFiles: [],
      checkedAt: null,
      error: "THINKCENTRE_METRICS_URL non configurato",
    };
  }

  const url = `${metricsBase}/repo-drift`;
  const token = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
  const headers: Record<string, string> = {};
  if (token) headers["X-Agent-Token"] = token;

  const controller = new AbortController();
  // 20 s: il server TC esegue git fetch (≤15 s) + operazioni git (≤3 s ciascuna).
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const upstream = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!upstream.ok) {
      return {
        checked: true,
        driftDetected: false,
        behind: null,
        driftedFiles: [],
        checkedAt: null,
        error: `HTTP ${upstream.status}`,
      };
    }
    const data = await upstream.json() as Partial<RepoDriftHealth>;
    return {
      checked: true,
      driftDetected: data.driftDetected ?? false,
      behind: data.behind ?? null,
      driftedFiles: Array.isArray(data.driftedFiles) ? data.driftedFiles : [],
      checkedAt: data.checkedAt ?? null,
      ...(data.error ? { error: data.error } : {}),
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      checked: true,
      driftDetected: false,
      behind: null,
      driftedFiles: [],
      checkedAt: null,
      error: isTimeout ? "timeout" : "non raggiungibile",
    };
  }
}
