import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useAdminSettingsSystemConfig(isAdmin: boolean) {
  const { data: refetchIntervalData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/profile-refetch-interval"],
  });
  const [refetchIntervalInput, setRefetchIntervalInput] = useState("");
  useEffect(() => {
    if (refetchIntervalData?.seconds != null && refetchIntervalInput === "") {
      setRefetchIntervalInput(String(refetchIntervalData.seconds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchIntervalData]);

  const { data: coordMaxAgeData } = useQuery<{ value: number }>({
    queryKey: ["/api/admin/settings/coordinates_max_age_seconds"],
    enabled: isAdmin,
  });
  const [coordMaxAgeInput, setCoordMaxAgeInput] = useState("");
  useEffect(() => {
    if (coordMaxAgeData?.value != null && coordMaxAgeInput === "") {
      setCoordMaxAgeInput(String(coordMaxAgeData.value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordMaxAgeData]);

  const refetchIntervalMutation = useMutation({
    mutationFn: async (seconds: number) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/profile_refetch_interval_seconds", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(seconds) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/profile-refetch-interval"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Intervallo aggiornato");
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const coordMaxAgeMutation = useMutation({
    mutationFn: async (seconds: number) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/coordinates_max_age_seconds", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(seconds) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/coordinates_max_age_seconds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Età max aggiornata");
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  return {
    refetchIntervalInput,
    setRefetchIntervalInput,
    refetchIntervalMutation,
    refetchIntervalData,
    coordMaxAgeInput,
    setCoordMaxAgeInput,
    coordMaxAgeMutation,
    coordMaxAgeData,
  };
}
