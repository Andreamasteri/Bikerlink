import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export function useAdRotationSettings() {
  const [settingsDuration, setSettingsDuration] = useState("10");
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">("sequential");

  const { data: rotationData } = useQuery<{ rotationDuration: number; rotationMode: "sequential" | "random" }>({
    queryKey: ["/api/settings/ads-rotation"],
  });

  const saveRotationSettings = useCallback(async (duration: number, mode: string) => {
     await apiRequest("POST", "/api/settings/ads-rotation", { duration, mode });
  }, []);

  const initFromServer = useCallback(() => {
    if (rotationData) {
      setSettingsDuration(String(rotationData.rotationDuration));
      setSettingsMode(rotationData.rotationMode);
    }
  }, [rotationData]);

  return {
    settingsDuration, setSettingsDuration,
    settingsMode, setSettingsMode,
    serverDuration: rotationData?.rotationDuration,
    saveRotationSettings,
    initFromServer
  };
}
