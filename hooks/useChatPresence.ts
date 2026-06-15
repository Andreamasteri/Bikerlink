import { useEffect, useState, useContext } from "react";
import { ChatSseContext, type PresenceSseEvent } from "@/lib/chat-sse-provider";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export function useChatPresence(conversationId: string | undefined, enabled: boolean): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const ctx = useContext(ChatSseContext);

  useEffect(() => {
    if (!conversationId || !enabled) {
      setOnlineIds(new Set());
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
        const data: { onlineUserIds: string[] } = await res.json();
        if (!cancelled) setOnlineIds(new Set(data.onlineUserIds));
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
      setOnlineIds(new Set(evt.onlineUserIds));
    });
  }, [conversationId, enabled, ctx]);

  return onlineIds;
}
