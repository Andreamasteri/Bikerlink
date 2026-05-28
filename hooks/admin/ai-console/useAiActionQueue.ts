// Task #2641 — Coda azioni pending consolidata multi-scope.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

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
  return useQuery<AiActionQueueResponse>({
    queryKey: ["/api/admin/ai/actions/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/actions/pending?limit=50");
      return res.json();
    },
    refetchInterval: opts?.refetchMs ?? 30_000,
    staleTime: 15_000,
    enabled: opts?.enabled ?? true,
  });
}
