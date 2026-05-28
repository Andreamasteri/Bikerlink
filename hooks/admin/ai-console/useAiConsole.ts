// Task #2641 — Hook orchestratore: streaming SSE su /api/admin/ai/console/message.
// Wrappa fetch + getReader. Espone send(message) e stato corrente.
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface AiToolCall {
  name: string;
  args?: unknown;
  result?: unknown;
}

export interface AiRouterDecision {
  scopes: string[];
  reasoning: string;
  cached?: boolean;
}

export interface AiStreamState {
  streaming: boolean;
  router: AiRouterDecision | null;
  toolCalls: AiToolCall[];
  text: string;
  error: string | null;
  doneMeta: {
    messageId?: string;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    provider?: string;
    model?: string;
  } | null;
}

const INITIAL_STATE: AiStreamState = {
  streaming: false,
  router: null,
  toolCalls: [],
  text: "",
  error: null,
  doneMeta: null,
};

export function useAiConsole(conversationId: string | null, onConversationCreated?: (id: string) => void) {
  const qc = useQueryClient();
  const [state, setState] = useState<AiStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, streaming: false }));
  }, []);

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || state.streaming) return;
      setState({ ...INITIAL_STATE, streaming: true });
      const ac = new AbortController();
      abortRef.current = ac;
      let convId = conversationId;
      try {
        const url = new URL("/api/admin/ai/console/message", getApiUrl()).toString();
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authFetchHeaders() },
          credentials: "include",
          body: JSON.stringify({ conversationId: conversationId ?? undefined, message: trimmed }),
          signal: ac.signal,
        });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const ev of events) {
            const lines = ev.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event: "));
            const dataLine = lines.find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;
            const eventName = eventLine.slice(7).trim();
            let payload: Record<string, unknown> = {};
            try { payload = JSON.parse(dataLine.slice(6)); } catch { continue; }
            handleSseEvent(eventName, payload, setState, (id: string) => {
              convId = id;
              onConversationCreated?.(id);
            });
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((s) => ({ ...s, error: (err as Error).message ?? "Errore stream", streaming: false }));
        }
      } finally {
        setState((s) => ({ ...s, streaming: false }));
        // invalida cache messaggi + conversazioni + budget + queue
        if (convId) {
          qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/conversations", convId, "messages"] });
        }
        qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/conversations"] });
        qc.invalidateQueries({ queryKey: ["/api/admin/ai/actions/pending"] });
      }
    },
    [conversationId, onConversationCreated, qc, state.streaming],
  );

  return { state, send, cancel, reset };
}

function handleSseEvent(
  name: string,
  payload: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<AiStreamState>>,
  onConv: (id: string) => void,
): void {
  switch (name) {
    case "conversation":
      if (typeof payload.id === "string") onConv(payload.id);
      return;
    case "router":
      setState((s) => ({
        ...s,
        router: {
          scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
          reasoning: typeof payload.reasoning === "string" ? payload.reasoning : "",
          cached: Boolean(payload.cached),
        },
      }));
      return;
    case "tool_call":
      setState((s) => ({
        ...s,
        toolCalls: [...s.toolCalls, { name: String(payload.name ?? "?"), args: payload.args }],
      }));
      return;
    case "tool_result":
      setState((s) => {
        const calls = [...s.toolCalls];
        const target = String(payload.name ?? "?");
        for (let i = calls.length - 1; i >= 0; i--) {
          if (calls[i].name === target && calls[i].result === undefined) {
            calls[i] = { ...calls[i], result: payload.result };
            break;
          }
        }
        return { ...s, toolCalls: calls };
      });
      return;
    case "delta":
      setState((s) => ({ ...s, text: s.text + String(payload.text ?? "") }));
      return;
    case "done":
      setState((s) => ({
        ...s,
        streaming: false,
        doneMeta: {
          messageId: typeof payload.messageId === "string" ? payload.messageId : undefined,
          tokensIn: typeof payload.tokensIn === "number" ? payload.tokensIn : undefined,
          tokensOut: typeof payload.tokensOut === "number" ? payload.tokensOut : undefined,
          costUsd: typeof payload.costUsd === "number" ? payload.costUsd : undefined,
          provider: typeof payload.provider === "string" ? payload.provider : undefined,
          model: typeof payload.model === "string" ? payload.model : undefined,
        },
      }));
      return;
    case "error":
      setState((s) => ({
        ...s,
        error: typeof payload.message === "string" ? payload.message : "Errore AI",
        streaming: false,
      }));
      return;
    default:
      return;
  }
}
