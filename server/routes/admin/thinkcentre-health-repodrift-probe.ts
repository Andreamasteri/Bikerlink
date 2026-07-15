/**
 * ThinkCentre Repo-Drift Probe
 *
 * Interroga l'endpoint /repo-drift esposto da stats-server.js sul ThinkCentre.
 * Restituisce se il checkout ~/bikerlink è allineato con origin/main sui file
 * critici per i build dei modelli custom Ollama (Modelfile + setup script).
 *
 * Timeout generoso (20 s) perché il server-side chiama `git fetch` che può
 * impiegare qualche secondo.  Il probe fallisce aperto (ok: true, driftDetected:
 * false) se il TC non è raggiungibile, in modo da non bloccare il health check.
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
