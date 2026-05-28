// Task #2641 — Placeholder budget indicator.
// Il backend #2637 traccia costi in aiUsageBudget ma non espone ancora un
// endpoint pubblico — sommiamo client-side i messaggi delle conversazioni
// recenti (placeholder). Endpoint reale arriverà col task #2610.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import type { AiConversationSummary, AiMessageRow } from "./useAiConversation";

export interface AiBudgetState {
  spentUsd: number;
  budgetUsd: number;
  percent: number;
  monthLabel: string;
  approx: boolean;
}

const MONTHLY_BUDGET_USD = 50; // budget di default per la UI; sostituibile via env futuro

export function useAiBudget() {
  return useQuery<AiBudgetState>({
    queryKey: ["/api/admin/ai/console/budget-approx"],
    queryFn: async () => {
      const monthIso = new Date().toISOString().slice(0, 7);
      const convRes = await apiRequest("GET", "/api/admin/ai/console/conversations?limit=20");
      const conv = await convRes.json() as { conversations: AiConversationSummary[] };
      let spent = 0;
      // Limita a 10 conversazioni più recenti per non saturare la rete (placeholder).
      const top = (conv.conversations ?? []).slice(0, 10);
      for (const c of top) {
        try {
          const r = await apiRequest("GET", `/api/admin/ai/console/conversations/${c.id}/messages`);
          const j = await r.json() as { messages: AiMessageRow[] };
          for (const m of j.messages) {
            if (typeof m.createdAt === "string" && m.createdAt.startsWith(monthIso)) {
              const n = parseFloat(m.costUsd);
              if (!Number.isNaN(n)) spent += n;
            }
          }
        } catch { /* skip */ }
      }
      const percent = Math.min(100, (spent / MONTHLY_BUDGET_USD) * 100);
      return {
        spentUsd: Math.round(spent * 10000) / 10000,
        budgetUsd: MONTHLY_BUDGET_USD,
        percent,
        monthLabel: monthIso,
        approx: true,
      };
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
