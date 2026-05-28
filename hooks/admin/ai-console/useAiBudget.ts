// Task #2641 — Budget indicator. Task #2645: endpoint reale /ai/console/budget.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiBudgetState {
  spentUsd: number;
  budgetUsd: number;
  percent: number;
  monthLabel: string;
  approx: boolean;
  state?: "ok" | "warn" | "frozen";
}

export function useAiBudget() {
  return useQuery<AiBudgetState>({
    queryKey: ["/api/admin/ai/console/budget"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/admin/ai/console/budget");
        const j = await res.json() as {
          month: string; totalCostUsd: number; limitUsd: number; pct: number; state: "ok" | "warn" | "frozen";
        };
        return {
          spentUsd: Math.round(j.totalCostUsd * 10000) / 10000,
          budgetUsd: j.limitUsd,
          percent: Math.min(100, j.pct * 100),
          monthLabel: j.month,
          approx: false,
          state: j.state,
        };
      } catch {
        return {
          spentUsd: 0, budgetUsd: 50, percent: 0,
          monthLabel: new Date().toISOString().slice(0, 7),
          approx: true,
        };
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
