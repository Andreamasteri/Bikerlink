// Task #2698 — Prefs opt-out AI Assistant per utente.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import type { AssistantPrefs } from "@/lib/ai-assistant/types";

export function useAssistantPrefs() {
  return useQuery<{ prefs: AssistantPrefs }>({
    queryKey: ["/api/users/me/assistant-prefs"],
    staleTime: 60 * 1000,
  });
}

export function useUpdateAssistantPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AssistantPrefs>) => {
      const res = await apiRequest("PATCH", "/api/users/me/assistant-prefs", patch);
      return res.json() as Promise<{ prefs: AssistantPrefs }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me/assistant-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/assistant/config"] });
    },
  });
}
