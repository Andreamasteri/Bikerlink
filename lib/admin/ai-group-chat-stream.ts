// Task #51 — Client SSE per la conversazione osservabile a più agenti.
// Consuma lo stream admin di avvio/ripresa e inoltra gli eventi di turno.
import { fetch as expoFetch } from "expo/fetch";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface GroupTurnPersona {
  id: string;
  name: string;
}

export interface GroupConversationEvent {
  id: string;
  topic: string;
  participants: string[];
  maxTurns: number;
  turnCount: number;
  status: string;
}

export interface GroupTurnStartEvent {
  turnIndex: number;
  persona: GroupTurnPersona;
}

export interface GroupDeltaEvent {
  turnIndex: number;
  text: string;
}

export interface GroupTurnEndEvent {
  turnIndex: number;
  persona: GroupTurnPersona;
  content: string;
}

export interface GroupDoneEvent {
  status: string;
  turnCount: number;
}

export interface GroupErrorEvent {
  turnIndex?: number;
  persona?: string;
  message: string;
}

export interface GroupChatStreamHandlers {
  onConversation?: (ev: GroupConversationEvent) => void;
  onTurnStart?: (ev: GroupTurnStartEvent) => void;
  onDelta?: (ev: GroupDeltaEvent) => void;
  onTurnEnd?: (ev: GroupTurnEndEvent) => void;
  onDone?: (ev: GroupDoneEvent) => void;
  onError?: (ev: GroupErrorEvent) => void;
  signal?: AbortSignal;
}

interface StartOpts extends GroupChatStreamHandlers {
  topic: string;
  participants?: string[];
  maxTurns?: number;
  /** Task #130 — lingua dell'utente presente: tutti i turni visibili la usano. */
  language?: string;
}

/** Avvia una nuova conversazione di gruppo e ne streamma i turni. */
export async function startGroupChat(opts: StartOpts): Promise<void> {
  const url = new URL("/api/admin/ai/group-chat/conversations", getApiUrl()).toString();
  await consumeStream(
    url,
    { topic: opts.topic, participants: opts.participants, maxTurns: opts.maxTurns, language: opts.language },
    opts,
  );
}

/** Riprende una conversazione interrotta dall'ultimo turno completato. */
export async function resumeGroupChat(id: string, handlers: GroupChatStreamHandlers): Promise<void> {
  const url = new URL(`/api/admin/ai/group-chat/conversations/${id}/resume`, getApiUrl()).toString();
  await consumeStream(url, {}, handlers);
}

async function consumeStream(
  url: string,
  body: Record<string, unknown>,
  handlers: GroupChatStreamHandlers,
): Promise<void> {
  const headers = authFetchHeaders({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  const res = await expoFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch { /* body non JSON */ }
    handlers.onError?.({ message: msg });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
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
        case "conversation": handlers.onConversation?.(data as GroupConversationEvent); break;
        case "turn-start": handlers.onTurnStart?.(data as GroupTurnStartEvent); break;
        case "delta": handlers.onDelta?.(data as GroupDeltaEvent); break;
        case "turn-end": handlers.onTurnEnd?.(data as GroupTurnEndEvent); break;
        case "done": handlers.onDone?.(data as GroupDoneEvent); break;
        case "error": handlers.onError?.(data as GroupErrorEvent); break;
        default: break;
      }
    }
  }
}
