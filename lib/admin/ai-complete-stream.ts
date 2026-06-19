// Client SSE per POST /api/admin/translations/ai-complete.
// Emette il progresso batch-per-batch del completamento AI delle traduzioni.
// Usa expo/fetch (supporta getReader() su tutte le piattaforme) e l'header
// Accept: text/event-stream per attivare il path SSE lato server.
import { fetch as expoFetch } from "expo/fetch";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface AiCompleteStartEvent {
  totalMissing: number;
  totalBatches: number;
}

export interface AiCompleteBatchEvent {
  batchIndex: number;
  totalBatches: number;
  keysUpdatedThisBatch: number;
  totalKeysUpdated: number;
  summary: Record<string, number>;
  provider: string;
}

export interface AiCompleteDoneEvent {
  ok: boolean;
  message: string;
  summary: Record<string, number>;
  totalProcessed: number;
}

export interface AiCompleteErrorEvent {
  message: string;
  aiKeyMissing?: boolean;
}

export interface AiCompleteStreamHandlers {
  onStart?: (ev: AiCompleteStartEvent) => void;
  onBatch?: (ev: AiCompleteBatchEvent) => void;
  onDone?: (ev: AiCompleteDoneEvent) => void;
  onError?: (ev: AiCompleteErrorEvent) => void;
  signal?: AbortSignal;
}

export async function streamAiComplete(handlers: AiCompleteStreamHandlers): Promise<void> {
  const url = new URL("/api/admin/translations/ai-complete", getApiUrl()).toString();
  const headers = authFetchHeaders({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });

  const res = await expoFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
    credentials: "include",
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    let aiKeyMissing = false;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch { /* body non JSON */ }
    if (res.status === 503) aiKeyMissing = true;
    handlers.onError?.({ message: msg, aiKeyMissing });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // Normalizza CRLF→LF per tollerare il framing SSE di proxy/runtime diversi.
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
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
      let data: unknown;
      try {
        data = JSON.parse(dataStr);
      } catch {
        continue;
      }
      switch (evName) {
        case "start":
          handlers.onStart?.(data as AiCompleteStartEvent);
          break;
        case "batch":
          handlers.onBatch?.(data as AiCompleteBatchEvent);
          break;
        case "done":
          handlers.onDone?.(data as AiCompleteDoneEvent);
          break;
        case "error":
          handlers.onError?.(data as AiCompleteErrorEvent);
          break;
        default:
          break;
      }
    }
  }
}
