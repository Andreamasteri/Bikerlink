import { useEffect, useState, useContext } from "react";
import { ChatSseContext, type PresenceSseEvent } from "@/lib/chat-sse-provider";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface PresenceState {
  onlineIds: Set<string>;
  lastSeenAt: Record<string, string | null>;
}

export function useChatPresence(
  conversationId: string | undefined,
  enabled: boolean
): PresenceState {
  const [state, setState] = useState<PresenceState>({ onlineIds: new Set(), lastSeenAt: {} });
  const ctx = useContext(ChatSseContext);

  useEffect(() => {
    if (!conversationId || !enabled) {
      setState({ onlineIds: new Set(), lastSeenAt: {} });
      return;
    }

    let cancelled = false;

    async function fetchInitial() {
      try {
        const url = new URL(`/api/chat/conversations/${conversationId}/presence`, getApiUrl()).toString();
        const res = await fetch(url, {
          credentials: "include",
          headers: authFetchHeaders({}),
        });
        if (!res.ok || cancelled) return;
        const data: { onlineUserIds: string[]; participantLastSeenAt?: Record<string, string | null> } = await res.json();
        if (!cancelled) {
          setState({
            onlineIds: new Set(data.onlineUserIds),
            lastSeenAt: data.participantLastSeenAt ?? {},
          });
        }
      } catch {
        // no-op: best-effort presence fetch
      }
    }

    fetchInitial();
    return () => { cancelled = true; };
  }, [conversationId, enabled]);

  useEffect(() => {
    if (!conversationId || !enabled || !ctx) return;

    return ctx.subscribePresence((evt: PresenceSseEvent) => {
      if (evt.conversationId !== conversationId) return;
      setState((prev) => ({
        onlineIds: new Set(evt.onlineUserIds),
        lastSeenAt: prev.lastSeenAt,
      }));
    });
  }, [conversationId, enabled, ctx]);

  return state;
}
