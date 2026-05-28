// Task #2657 — WS subscriber che invalida la cache React Query in <2s alla
// ricezione di ai_event / ai_conflict_new dal bridge admin.
// Lifecycle stabile: l'effetto NON dipende da `opts` (object identity), così
// la connessione non viene ricreata ad ogni render. I callback più recenti
// vengono richiamati tramite ref.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import type { TimelineEvent } from "@/components/admin/ai-layer/EventTimeline";

export interface AiLayerWsOpts {
  onEvent?: (e: TimelineEvent) => void;
  onConflict?: () => void;
}

export function useAiLayerWs(opts: AiLayerWsOpts = {}) {
  const qc = useQueryClient();
  const optsRef = useRef<AiLayerWsOpts>(opts);
  optsRef.current = opts;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let retries = 0;
    function connect() {
      try {
        const base = getApiUrl();
        const url = base.replace(/^http/i, "ws").replace(/\/+$/, "") + "/ws/admin/notifications";
        ws = new WebSocket(url);
        ws.onopen = () => { retries = 0; };
        ws.onmessage = (msg) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(typeof msg.data === "string" ? msg.data : "");
            if (parsed?.type === "ai_event" && parsed.payload) {
              const p = parsed.payload as Record<string, unknown>;
              optsRef.current.onEvent?.({
                id: p.id as string | undefined,
                aiName: p.aiName as string,
                eventType: p.eventType as string,
                severity: p.severity as string | undefined,
                correlationId: p.correlationId as string | undefined,
                at: (parsed.at as string | undefined) ?? new Date().toISOString(),
              });
              qc.invalidateQueries({ queryKey: ["/api/admin/ai/overview"] });
              qc.invalidateQueries({ queryKey: ["/api/admin/ai/health"] });
              if (p.aiName === "admin" && (p.eventType === "pause" || p.eventType === "resume")) {
                qc.invalidateQueries({ queryKey: ["/api/admin/ai/paused"] });
              }
              if (p.aiName === "admin" && p.eventType === "override") {
                qc.invalidateQueries({ queryKey: ["/api/admin/ai/conflicts"] });
              }
            } else if (parsed?.type === "ai_conflict_new") {
              optsRef.current.onConflict?.();
              qc.invalidateQueries({ queryKey: ["/api/admin/ai/conflicts"] });
              qc.invalidateQueries({ queryKey: ["/api/admin/ai/overview"] });
            }
          } catch { /* noop */ }
        };
        ws.onclose = () => {
          if (cancelled) return;
          const wait = Math.min(15_000, 1000 * Math.pow(2, retries++));
          setTimeout(connect, wait);
        };
        ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
      } catch { /* noop */ }
    }
    connect();
    return () => { cancelled = true; try { ws?.close(); } catch { /* noop */ } };
  }, [qc]);
}
