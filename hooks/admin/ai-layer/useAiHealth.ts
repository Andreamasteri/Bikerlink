// Task #2657 — Health metrics per tab AI Layer.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiHealthPerAi {
  aiName: string;
  lastHeartbeatAt: string | null;
  secondsSinceHeartbeat: number | null;
  avgDecisionMs: number;
  decisions: number;
}
export interface AiHealth {
  perAi: AiHealthPerAi[];
  conflicts: { total: number; resolvedPolicy: number; resolvedAdmin: number; open: number };
  ratios: { conflictsPerDecisionPct: number; adminOverridePct: number };
  sinceHours: number;
}

export function useAiHealth(sinceHours = 24) {
  return useQuery<AiHealth>({
    queryKey: ["/api/admin/ai/health", { sinceHours }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/health?sinceHours=${sinceHours}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });
}
