import { useEffect, useRef, useContext } from "react";
import { ChatSseContext, type ChatSseEvent } from "@/lib/chat-sse-provider";

export type { ChatSseEvent };

export function useChatSSE(onEvent: (event: ChatSseEvent) => void): void {
  const ctx = useContext(ChatSseContext);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((e) => onEventRef.current(e));
  }, [ctx]);
}

export function useChatSseConnected(): boolean {
  const ctx = useContext(ChatSseContext);
  return ctx?.isConnected ?? false;
}
