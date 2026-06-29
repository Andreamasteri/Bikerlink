// Task #2698 — Client SSE per /api/ai/assistant/message usando expo/fetch.
import { fetch as expoFetch } from "expo/fetch";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface AssistantStreamEvent {
  // Task #5197 — "persona" annuncia quale AI (Bowie/Horus/Ares) sta rispondendo.
  event: "delta" | "action" | "done" | "error" | "persona";
  data: unknown;
}

export interface AssistantStreamOpts {
  // Task #4842 — "admin" abilita la chat assistant del pannello admin.
  message: string;
  platform: "android" | "ios" | "web" | "admin";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onEvent: (ev: AssistantStreamEvent) => void;
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
    }),
    credentials: "include",
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json() as { message?: string }; if (j?.message) msg = j.message; } catch { /* */ }
    opts.onEvent({ event: "error", data: { code: res.status, message: msg } });
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
