// Task #2657 — Read/validate/save policies YAML.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export interface PolicyStatus {
  loaded: boolean;
  version?: string;
  rulesCount: number;
  loadedAt?: string;
  error?: string | null;
}
export interface PoliciesPayload { yaml: string; status: PolicyStatus }

export function useAiPolicies() {
  return useQuery<PoliciesPayload>({
    queryKey: ["/api/admin/ai/policies"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/policies/yaml");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useValidatePolicies() {
  return useMutation({
    mutationFn: async (yamlText: string) => {
      const res = await apiRequest("POST", "/api/admin/ai/policies/validate", { yaml: yamlText });
      return res.json() as Promise<{ valid: boolean; error?: string; version?: string; rulesCount?: number }>;
    },
  });
}

export function useSavePolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (yamlText: string) => {
      const res = await apiRequest("PUT", "/api/admin/ai/policies", { yaml: yamlText });
      return res.json() as Promise<{ saved: boolean; count: number; status: PolicyStatus }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/policies"] });
    },
  });
}
