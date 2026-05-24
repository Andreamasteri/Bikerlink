import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";

export function useMatchingState(t: (k: string) => string) {
  const [matchingCountries, setMatchingCountries] = useState<string[]>([]);
  const [matchingTriggerFeedback, setMatchingTriggerFeedback] = useState<string | null>(null);

  const { data: autoMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/auto-matching"],
  });
  const autoMatchEnabled = autoMatchData?.enabled !== false;

  const { data: matchPrefVisibleData } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/match-preferences/gate"],
  });
  const matchPrefVisibleEnabled = matchPrefVisibleData?.visible === true;

  const matchPrefVisibleMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/match_preferences_visible", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: visible ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match-preferences/gate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const autoMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/auto_matching", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auto-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const triggerMatchingMutation = useMutation({
    mutationFn: async (data: { force?: boolean; country?: string }) => {
      const res = await apiRequest("POST", "/api/admin/matching/trigger", data);
      return res;
    },
    onSuccess: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matching trigger response from API
      setMatchingTriggerFeedback(`${t("admin.matchingTriggered")}: ${(data as any).count} ${t("admin.matchesCreated")}`);
      setTimeout(() => setMatchingTriggerFeedback(null), 5000);
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  return {
    matchingCountries,
    setMatchingCountries,
    matchingTriggerFeedback,
    setMatchingTriggerFeedback,
    autoMatchEnabled,
    autoMatchMutation,
    matchPrefVisibleEnabled,
    matchPrefVisibleMutation,
    triggerMatchingMutation,
  };
}
