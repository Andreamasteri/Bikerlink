// check-tc-admin-card-tests: invalidate-only
// Questo file usa /api/admin/thinkcentre-health solo in invalidateQueries (side-effect
// post-mutation). Non monta un componente che dipende dal payload TC → nessun render test richiesto.
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, authFetchHeaders, queryClient } from "@/lib/query-client";

async function apiFetch(path: string, method = "GET", body?: object) {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    method,
    headers: {
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(await authFetchHeaders()),
    },
    credentials: "include",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const PUSH_KEY = ["/api/admin/settings/thinkcentre-service-push"] as const;
const MAINT_KEY = ["/api/admin/thinkcentre/maintenance"] as const;
const POWERED_OFF_KEY = ["/api/admin/thinkcentre/powered-off"] as const;
const IGNORE_TESTS_KEY = ["/api/admin/thinkcentre/ignore-for-tests"] as const;

export function useThinkCentreToggles() {
  const { data: pushData, isLoading: pushLoading } = useQuery<{ enabled: boolean }>({
    queryKey: PUSH_KEY,
    queryFn: () => apiFetch("/api/admin/settings/thinkcentre-service-push"),
    staleTime: 60_000,
  });

  const pushMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch("/api/admin/settings/thinkcentre-service-push", "PUT", { enabled }),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: PUSH_KEY });
      const previous = queryClient.getQueryData<{ enabled: boolean }>(PUSH_KEY);
      queryClient.setQueryData(PUSH_KEY, { enabled });
      return { previous };
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PUSH_KEY, context.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PUSH_KEY });
    },
  });

  const { data: maintenanceData, isLoading: maintenanceLoading } = useQuery<{ enabled: boolean }>({
    queryKey: MAINT_KEY,
    queryFn: () => apiFetch("/api/admin/thinkcentre/maintenance"),
    staleTime: 30_000,
  });

  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch("/api/admin/thinkcentre/maintenance", "POST", { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MAINT_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/thinkcentre-health"] });
    },
  });

  const { data: poweredOffData, isLoading: poweredOffLoading } = useQuery<{ enabled: boolean }>({
    queryKey: POWERED_OFF_KEY,
    queryFn: () => apiFetch("/api/admin/thinkcentre/powered-off"),
    staleTime: 30_000,
  });

  const poweredOffMutation = useMutation<{ ok: boolean; enabled: boolean }, Error, boolean, { prev: { enabled: boolean } | undefined }>({
    mutationFn: (enabled: boolean) =>
      apiFetch("/api/admin/thinkcentre/powered-off", "POST", { enabled }),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: POWERED_OFF_KEY });
      const prev = queryClient.getQueryData<{ enabled: boolean }>(POWERED_OFF_KEY);
      queryClient.setQueryData(POWERED_OFF_KEY, { enabled });
      return { prev };
    },
    onError: (_err, _enabled, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(POWERED_OFF_KEY, context.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: POWERED_OFF_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/thinkcentre-health"] });
    },
  });

  const { data: ignoreTestsData, isLoading: ignoreTestsLoading } = useQuery<{ enabled: boolean }>({
    queryKey: IGNORE_TESTS_KEY,
    queryFn: () => apiFetch("/api/admin/thinkcentre/ignore-for-tests"),
    staleTime: 30_000,
  });

  const ignoreTestsMutation = useMutation<{ ok: boolean; enabled: boolean }, Error, boolean, { prev: { enabled: boolean } | undefined }>({
    mutationFn: (enabled: boolean) =>
      apiFetch("/api/admin/thinkcentre/ignore-for-tests", "POST", { enabled }),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: IGNORE_TESTS_KEY });
      const prev = queryClient.getQueryData<{ enabled: boolean }>(IGNORE_TESTS_KEY);
      queryClient.setQueryData(IGNORE_TESTS_KEY, { enabled });
      return { prev };
    },
    onError: (_err, _enabled, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(IGNORE_TESTS_KEY, context.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: IGNORE_TESTS_KEY });
    },
  });

  return {
    pushData,
    pushLoading,
    pushMutation,
    maintenanceData,
    maintenanceLoading,
    maintenanceMutation,
    maintenanceActive: maintenanceData?.enabled ?? false,
    poweredOffData,
    poweredOffLoading,
    poweredOffMutation,
    poweredOffActive: poweredOffData?.enabled ?? false,
    ignoreTestsData,
    ignoreTestsLoading,
    ignoreTestsMutation,
    ignoreTestsActive: ignoreTestsData?.enabled ?? false,
  };
}
