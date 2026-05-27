// Task #2555 — Hook client che apre una connessione WS al canale admin
// `/ws/admin/notifications` e, alla ricezione di `watchdog_snapshot`,
// invalida le query React Query rilevanti per forzare un refresh realtime
// del pannello System Health. Auto-reconnect con backoff esponenziale.
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

interface WsMsg { type?: string; payload?: unknown }

interface Options {
  enabled?: boolean;
  /** Invocato per ogni messaggio non-snapshot (es. urgent_match) per
   *  permettere al chiamante di gestire altri tipi. */
  onMessage?: (msg: WsMsg) => void;
}

export function useAdminWatchdogAlerts(opts: Options = {}): void {
  const { enabled = true, onMessage } = opts;
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === "web" && typeof window === "undefined") return;
    closedRef.current = false;

    function buildWsUrl(): string {
      try {
        const api = new URL(getApiUrl());
        const proto = api.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${api.host}/ws/admin/notifications`;
      } catch {
        return "/ws/admin/notifications";
      }
    }

    const connect = () => {
      if (closedRef.current) return;
      try {
        const ws = new WebSocket(buildWsUrl());
        wsRef.current = ws;

        ws.onopen = () => { retryRef.current = 0; };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as WsMsg;
            if (msg?.type === "watchdog_snapshot") {
              qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshot"] });
              qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshots"] });
            } else if (msg?.type && onMessage) {
              onMessage(msg);
            }
          } catch {/* ignore parse errors */}
        };
        const reconnect = () => {
          if (closedRef.current) return;
          const delay = Math.min(30_000, 1_000 * Math.pow(2, retryRef.current++));
          timerRef.current = setTimeout(connect, delay);
        };
        ws.onclose = reconnect;
        ws.onerror = () => { try { ws.close(); } catch {/* noop */} };
      } catch {
        const delay = Math.min(30_000, 1_000 * Math.pow(2, retryRef.current++));
        timerRef.current = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      try { wsRef.current?.close(); } catch {/* noop */}
      wsRef.current = null;
    };
  }, [enabled, qc, onMessage]);
}
