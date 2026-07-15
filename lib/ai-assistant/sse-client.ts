// Task #2698 — Client SSE per /api/ai/assistant/message usando expo/fetch.
import { fetch as expoFetch } from "expo/fetch";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface AssistantStreamEvent {
  // Task #5197 — "persona" annuncia quale AI (Bowie/Horus/Ares) sta rispondendo.
  // Task #141 — "thinking" segnala che il modello sta ragionando (prima di
  // qualunque delta di testo): la UI mostra "sta pensando…".
  event: "delta" | "action" | "done" | "error" | "persona" | "thinking";
  data: unknown;
}

export interface AssistantStreamOpts {
  // Task #4842 — "admin" abilita la chat assistant del pannello admin.
  message: string;
  platform: "android" | "ios" | "web" | "admin";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onEvent: (ev: AssistantStreamEvent) => void;
  // Task #107 — lingua app corrente: il server la usa per recuperare dal
  // manuale (Nadir) la traduzione corrispondente invece del solo italiano.
  // Assente → il server ricade sull'italiano.
  language?: string;
}

export async function streamAssistantMessage(opts: AssistantStreamOpts): Promise<void> {
  const url = new URL("/api/ai/assistant/message", getApiUrl()).toString();
  const headers = authFetchHeaders({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  const res = await expoFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: opts.message,
      platform: opts.platform,
      history: opts.history ?? [],
      ...(opts.language ? { language: opts.language } : {}),
    }),
    credentials: "include",
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json() as { message?: string }; if (j?.message) msg = j.message; } catch { /* */ }
    // Task #44 — questi fallimenti (400/403/429/503) sono decisi PRIMA di aprire
    // lo stream (config disabilitata, nessun provider, rate-limit): un retry
    // immediato della stessa richiesta darebbe lo stesso esito, quindi non sono
    // "recoverable" via il pulsante Riprova (a differenza degli errori emessi
    // DENTRO lo stream già aperto, che portano il flag dal server).
    opts.onEvent({ event: "error", data: { code: res.status, message: msg, recoverable: false } });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = raw.split("\n");
      let evName = "message";
      let dataStr = "";
      for (const l of lines) {
        if (l.startsWith("event:")) evName = l.slice(6).trim();
        else if (l.startsWith("data:")) dataStr += l.slice(5).trim();
      }
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
        opts.onEvent({ event: evName as AssistantStreamEvent["event"], data });
      } catch { /* skip malformed */ }
    }
  }
}
