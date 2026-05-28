// Task #2645 — Preferenze admin (es. onboarding AI Console).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface AdminPrefs {
  aiConsoleOnboarded?: boolean;
  [k: string]: unknown;
}

export function useAdminPrefs() {
  return useQuery<{ prefs: AdminPrefs }>({
    queryKey: ["/api/admin/ai/console/admin-prefs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/console/admin-prefs");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateAdminPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: AdminPrefs) => {
      const res = await apiRequest("PATCH", "/api/admin/ai/console/admin-prefs", patch);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/ai/console/admin-prefs"] }),
  });
}
