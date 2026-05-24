import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useBgLocationState(isAdmin: boolean, t: (k: string) => string) {
  const { data: bgLocationSettings, refetch: refetchBgLocation } = useQuery<{
    enabled: boolean;
    trigger: string;
    intervalSeconds: number;
    notificationText: string;
    ghostModeContinue: boolean;
  }>({
    queryKey: ["/api/admin/settings/bg-location"],
    enabled: isAdmin,
  });
  const [bgIntervalInput, setBgIntervalInput] = useState("");
  const [bgNotificationTextInput, setBgNotificationTextInput] = useState("");

  useEffect(() => {
    if (bgLocationSettings?.intervalSeconds != null && bgIntervalInput === "") {
      setBgIntervalInput(String(bgLocationSettings.intervalSeconds));
    }
    if (bgLocationSettings?.notificationText != null && bgNotificationTextInput === "") {
      setBgNotificationTextInput(bgLocationSettings.notificationText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgLocationSettings]);

  const bgLocationMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const url = new URL("/api/admin/settings/bg-location", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error((err as Error).message);
      }
      return res.json();
    },
    onSuccess: () => {
      refetchBgLocation();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/bg-location"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  return {
    bgLocationSettings,
    refetchBgLocation,
    bgIntervalInput,
    setBgIntervalInput,
    bgNotificationTextInput,
    setBgNotificationTextInput,
    bgLocationMutation,
  };
}
