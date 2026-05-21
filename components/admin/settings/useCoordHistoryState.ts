import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useCoordHistoryState(isAdmin: boolean, t: (k: string) => string, coordHistoryExpanded: boolean) {
  const { data: coordHistorySettings, refetch: refetchCoordHistory } = useQuery<{
    enabled: boolean; interval: number; maxRecords: number; mode: string; selectedUsers: string[];
  }>({
    queryKey: ["/api/admin/coordinate-history/settings"],
    enabled: isAdmin,
  });
  const { data: coordHistoryStats } = useQuery<{
    totalRecords: number; trackedUsers: number; oldestRecord: string | null; newestRecord: string | null;
  }>({
    queryKey: ["/api/admin/coordinate-history/stats"],
    enabled: isAdmin,
  });
  const [chIntervalInput, setChIntervalInput] = useState("");
  const [chMaxRecordsInput, setChMaxRecordsInput] = useState("");

  useEffect(() => {
    if (coordHistorySettings?.interval != null && chIntervalInput === "") {
      setChIntervalInput(String(coordHistorySettings.interval));
    }
    if (coordHistorySettings?.maxRecords != null && chMaxRecordsInput === "") {
      setChMaxRecordsInput(String(coordHistorySettings.maxRecords));
    }
  }, [coordHistorySettings]);

  const coordHistoryMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const url = new URL("/api/admin/coordinate-history/settings", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.settingsUpdateError"));
      return res.json();
    },
    onSuccess: () => {
      refetchCoordHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coordinate-history/stats"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const [chUserSearch, setChUserSearch] = useState("");
  const { data: chSearchResults } = useQuery<Array<{ id: string; nickname: string; userType: string }>>({
    queryKey: ["/api/users/search", chUserSearch],
    enabled: coordHistoryExpanded && coordHistorySettings?.mode === "selected" && chUserSearch.length >= 2,
  });

  return {
    coordHistorySettings,
    refetchCoordHistory,
    coordHistoryStats,
    chIntervalInput,
    setChIntervalInput,
    chMaxRecordsInput,
    setChMaxRecordsInput,
    coordHistoryMutation,
    chUserSearch,
    setChUserSearch,
    chSearchResults,
  };
}
