import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { Platform, AppState } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { queryClient, getApiUrl } from "@/lib/query-client";

interface WebSocketContextValue {
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({ isConnected: false });

export function useWebSocket() {
  return useContext(WebSocketContext);
}

const EVENT_INVALIDATION_MAP: Record<string, string[][]> = {
  "chat:newMessage": [["/api/chat/conversations"], ["/api/chat/unread-total"]],
  "chat:messageSent": [["/api/chat/conversations"]],
  "user:availabilityChanged": [["/api/users/profile"], ["/api/users/online-count"], ["/api/users/biker-available-count"], ["/api/users/zavorrine-available-count"]],
  "user:profileUpdated": [["/api/users/profile"]],
  "notification:new": [["/api/notifications"]],
};

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const apiUrl = getApiUrl();
      const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
      const host = apiUrl.replace(/^https?:\/\//, "");
      const wsUrl = `${wsProtocol}://${host}/ws`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const parsed = JSON.parse(event.data);
          const { event: eventName } = parsed;
          const queryKeys = EVENT_INVALIDATION_MAP[eventName];
          if (queryKeys) {
            for (const key of queryKeys) {
              queryClient.invalidateQueries({ queryKey: key });
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        ws.close();
      };

      wsRef.current = ws;
    } catch {}
  }, [user]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !user) return;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current += 1;
    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && user) {
        connect();
      }
    }, delay);
  }, [user, connect]);

  useEffect(() => {
    mountedRef.current = true;

    if (user) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, connect]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && user && wsRef.current?.readyState !== WebSocket.OPEN) {
        reconnectAttemptsRef.current = 0;
        connect();
      }
    });

    return () => subscription.remove();
  }, [user, connect]);

  return (
    <WebSocketContext.Provider value={{ isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
