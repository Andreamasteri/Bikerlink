// Task #2657 — Conflicts list + override mutation.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AiConflictRow {
  id: string;
  eventIdA: string;
  eventIdB: string;
  conflictType: string;
  resolvedBy: string;
  policyRuleId: string | null;
  resolutionRationale: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export function useAiConflicts(onlyOpen = true) {
  return useQuery<{ conflicts: AiConflictRow[]; count: number }>({
    queryKey: ["/api/admin/ai/conflicts", { onlyOpen }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/conflicts?open=${onlyOpen ? 1 : 0}`);
      return res.json();
    },
    refetchInterval: 10_000,
  });
}

export function useOverrideConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; decision: "useEventA" | "useEventB" | "custom"; rationale: string }) => {
      const res = await apiRequest("POST", `/api/admin/ai/conflicts/${args.id}/override`, {
        decision: args.decision, rationale: args.rationale,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/conflicts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/audit"] });
    },
  });
}

export function usePauseAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { aiName: string; reason: string; ttlSeconds?: number }) => {
      const res = await apiRequest("POST", "/api/admin/ai/pause", args);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/paused"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/overview"] });
    },
  });
}

export function useResumeAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { aiName: string }) => {
      const res = await apiRequest("POST", "/api/admin/ai/resume", args);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/paused"] });
    },
  });
}
