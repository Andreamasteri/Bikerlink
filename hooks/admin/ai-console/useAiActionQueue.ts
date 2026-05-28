// Task #2641 — Coda azioni pending consolidata multi-scope.
// Task #2645 — refresh tramite WS (vedi useAiAlerts) + fallback polling 60s.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { useAiAlertsState } from "./useAiAlerts";

export interface AiActionItem {
  id: string;
  kind: string;
  scope: string;
  severity: string | null;
  summary: string | null;
  refId: string | null;
  createdAt: string;
  priority: number;
}

export interface AiActionQueueResponse {
  items: AiActionItem[];
  total: number;
  byScope: Record<string, number>;
}

export function useAiActionQueue(opts?: { refetchMs?: number; enabled?: boolean }) {
  // Task #2645 — WS sostituisce il polling 30s. Quando WS è connesso il
  // refresh è guidato da invalidateQueries del subscriber → polling lento
  // (5min safety net). Quando WS è down, fallback polling 60s come da spec.
  const { connected } = useAiAlertsState();
  const defaultInterval = connected ? 300_000 : 60_000;
  return useQuery<AiActionQueueResponse>({
    queryKey: ["/api/admin/ai/actions/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/actions/pending?limit=50");
      return res.json();
    },
    refetchInterval: opts?.refetchMs ?? defaultInterval,
    staleTime: 15_000,
    enabled: opts?.enabled ?? true,
  });
}
