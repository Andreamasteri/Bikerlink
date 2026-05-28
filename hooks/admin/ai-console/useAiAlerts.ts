// Task #2645 — Sottoscrizione WS canale admin `/ws/admin/notifications`.
// Riceve `watchdog_snapshot` / `urgent_match` e marca alert non letti come
// counter in-memory (badge FAB). Fallback: il chiamante mantiene il polling
// React Query a 60s sulla coda azioni se WS down.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";

// Task #2645 — auto-thread "Alerts — YYYY-MM-DD": crea o riusa per giorno una
// conversazione dedicata e vi preloada il contenuto dell'alert critico così
// da costruire incrementalmente un timeline navigabile dall'admin.
function todayBucketTitle(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `Alerts — ${y}-${m}-${day}`;
}

async function ensureAlertsThread(eventSummary: string): Promise<void> {
  if (_autoThreadInFlight) return;
  _autoThreadInFlight = true;
  try {
    const res = await apiRequest("POST", "/api/admin/ai/console/conversations", {
      title: todayBucketTitle(),
      reuseByTitle: true,
      preload: {
        role: "system",
        content: `🚨 Alert ricevuto via WS @ ${new Date().toISOString()}\n${eventSummary}`,
      },
    });
    const data = await res.json() as { conversation?: { id?: string } };
    if (data?.conversation?.id) {
      setGlobal({ alertsThreadId: data.conversation.id });
    }
  } catch { /* silent: il polling fallback copre comunque */ }
  finally { _autoThreadInFlight = false; }
}

interface WsMsg { type?: string; payload?: unknown; at?: string }

export interface AiAlertsState {
  connected: boolean;
  unread: number;
  lastAt: string | null;
  /** ID dell'auto-thread "Alerts AI" creato alla prima notifica critica. */
  alertsThreadId: string | null;
}

const listeners = new Set<(s: AiAlertsState) => void>();
let _state: AiAlertsState = { connected: false, unread: 0, lastAt: null, alertsThreadId: null };
let _autoThreadInFlight = false;

function setGlobal(next: Partial<AiAlertsState>) {
  _state = { ..._state, ...next };
  for (const l of listeners) try { l(_state); } catch { /* noop */ }
}

export function getAiAlertsState(): AiAlertsState { return _state; }
export function clearAiAlertsUnread(): void { setGlobal({ unread: 0 }); }

export function useAiAlertsState(): AiAlertsState {
  const [s, setS] = useState<AiAlertsState>(_state);
  useEffect(() => {
    const fn = (next: AiAlertsState) => setS(next);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return s;
}

/** Hook singleton che apre la connessione WS. Da chiamare UNA volta a livello alto. */
export function useAiAlertsSubscriber(opts: { enabled?: boolean } = {}): void {
  const { enabled = true } = opts;
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(() => {
    try {
      const api = new URL(getApiUrl());
      const proto = api.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${api.host}/ws/admin/notifications`;
    } catch { return "/ws/admin/notifications"; }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === "web" && typeof window === "undefined") return;
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      try {
        const ws = new WebSocket(buildUrl());
        wsRef.current = ws;
        ws.onopen = () => { retryRef.current = 0; setGlobal({ connected: true }); };
        ws.onmessage = (ev) => {
          try {
            const data = typeof ev.data === "string" ? ev.data : "";
            const msg = JSON.parse(data) as WsMsg;
            if (!msg?.type || msg.type === "hello") return;
            // Severità critica → bump badge.
            const payload = msg.payload as { severity?: string; status?: string } | undefined;
            const isCritical =
              msg.type === "urgent_match" ||
              (msg.type === "watchdog_snapshot" && (payload?.status === "red" || payload?.status === "orange")) ||
              payload?.severity === "critical";
            if (isCritical) {
              setGlobal({ unread: _state.unread + 1, lastAt: msg.at ?? new Date().toISOString() });
              const summary = `type=${msg.type}\npayload=${JSON.stringify(msg.payload ?? {}, null, 2).slice(0, 1500)}`;
              void ensureAlertsThread(summary);
            }
            // Invalida la coda azioni → niente più polling 30s.
            qc.invalidateQueries({ queryKey: ["/api/admin/ai/actions/pending"] });
          } catch { /* skip */ }
        };
        const reconnect = () => {
          setGlobal({ connected: false });
          if (closedRef.current) return;
          const delay = Math.min(30_000, 1_000 * Math.pow(2, retryRef.current++));
          timerRef.current = setTimeout(connect, delay);
        };
        ws.onclose = reconnect;
        ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
      } catch {
        const delay = Math.min(30_000, 1_000 * Math.pow(2, retryRef.current++));
        timerRef.current = setTimeout(connect, delay);
      }
    };

    connect();
    return () => {
      closedRef.current = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
      setGlobal({ connected: false });
    };
  }, [enabled, qc, buildUrl]);
}
