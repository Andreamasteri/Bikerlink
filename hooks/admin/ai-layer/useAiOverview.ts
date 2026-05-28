// Task #2657 — Overview + paused state per tab AI Layer.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiOverviewPerAi {
  aiName: string;
  events: number;
  decisions: number;
  criticals: number;
  conflictsOpen: number;
  lastActivityAt: string | null;
  lastEventType: string | null;
  healthScore: number;
}
export interface AiOverview {
  perAi: AiOverviewPerAi[];
  totals: { events: number; decisions: number; criticals: number; conflictsOpen: number };
  sinceHours: number;
  queryMs?: number;
}

export function useAiOverview(sinceHours = 24) {
  return useQuery<AiOverview>({
    queryKey: ["/api/admin/ai/overview", { sinceHours }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/overview?sinceHours=${sinceHours}`);
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export interface AiPausedItem { aiName: string; reason?: string; at?: string; ttl?: number }
export function useAiPaused() {
  return useQuery<{ paused: AiPausedItem[] }>({
    queryKey: ["/api/admin/ai/paused"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/paused");
      return res.json();
    },
    refetchInterval: 10_000,
  });
}
