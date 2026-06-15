import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

interface RotationSettings {
  duration: number;
  mode: "sequential" | "random";
}

const SETTINGS_KEY = ["/api/admin/advertisements/settings"] as const;
const DEFAULT_SETTINGS: RotationSettings = { duration: 10, mode: "sequential" };

export function useAdRotationSettings() {
  const { data } = useQuery<RotationSettings>({
    queryKey: SETTINGS_KEY,
    placeholderData: DEFAULT_SETTINGS,
  });

  const serverSettings = data ?? DEFAULT_SETTINGS;

  const [settingsDuration, setSettingsDuration] = useState(String(serverSettings.duration));
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">(serverSettings.mode);

  const saveMutation = useMutation({
    mutationFn: async ({ duration, mode }: { duration: number; mode: string }) => {
      const res = await apiRequest("POST", "/api/admin/advertisements/settings", { duration, mode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  function initFromServer() {
    setSettingsDuration(String(serverSettings.duration));
    setSettingsMode(serverSettings.mode);
  }

  function saveRotationSettings(duration: number, mode: string) {
    saveMutation.mutate({ duration, mode });
  }

  return {
    settingsDuration,
    setSettingsDuration,
    settingsMode,
    setSettingsMode,
    serverDuration: serverSettings.duration,
    serverMode: serverSettings.mode,
    saveRotationSettings,
    initFromServer,
    isSavingSettings: saveMutation.isPending,
  };
}
