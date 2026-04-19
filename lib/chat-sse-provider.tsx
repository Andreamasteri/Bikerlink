import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export interface ChatSseEvent {
  type: "new_message" | "conversation_update";
  conversationId: string;
  message?: Record<string, unknown>;
}

type Listener = (e: ChatSseEvent) => void;

export const ChatSseContext = createContext<{
  subscribe: (fn: Listener) => () => void;
} | null>(null);

export function ChatSseProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const listenersRef = useRef<Set<Listener>>(new Set());

  const subscribeRef = useRef((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  });

  useEffect(() => {
    if (!enabled) return;

    let aborted = false;
    let abortController = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (aborted) return;
      abortController = new AbortController();
      try {
        const url = new URL("/api/chat/stream", getApiUrl()).toString();
        const response = await fetch(url, {
          credentials: "include",
          signal: abortController.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!response.ok || !response.body) {
          if (!aborted) reconnectTimer = setTimeout(connect, 5000);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const block of parts) {
            if (!block.trim()) continue;
            let eventType = "";
            let data = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim();
              else if (line.startsWith("data: ")) data = line.slice(6).trim();
            }
            if (eventType === "chat" && data) {
              try {
                const evt: ChatSseEvent = JSON.parse(data);
                listenersRef.current.forEach(fn => fn(evt));
              } catch {}
            }
          }
        }
      } catch {}
      if (!aborted) reconnectTimer = setTimeout(connect, 4000);
    }

    connect();

    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        abortController.abort();
        connect();
      }
    });

    return () => {
      aborted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      abortController.abort();
      appStateSub.remove();
    };
  }, [enabled]);

  return (
    <ChatSseContext.Provider value={{ subscribe: subscribeRef.current }}>
      {children}
    </ChatSseContext.Provider>
  );
}

export function useChatSseContext() {
  return useContext(ChatSseContext);
}
