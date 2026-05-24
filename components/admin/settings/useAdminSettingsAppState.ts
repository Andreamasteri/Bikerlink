import { useState, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";
import { ThemeName } from "@/constants/colors";

export function useAdminSettingsAppState(isAdmin: boolean, t: (k: string) => string, setTheme: (theme: ThemeName) => void) {
  const [homeMessageText, setHomeMessageText] = useState("");
  const [isSavingHomeMessage, setIsSavingHomeMessage] = useState(false);

  const { data: homeMessageData } = useQuery<{ enabled: boolean; text: string }>({
    queryKey: ["/api/settings/home-message"],
  });
  const homeMessageEnabled = homeMessageData?.enabled === true;

  useEffect(() => {
    if (homeMessageData?.text !== undefined) {
      setHomeMessageText(homeMessageData.text);
    }
  }, [homeMessageData?.text]);

  const homeMessageToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/home_message_enabled", baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/home-message"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const handleSaveHomeMessageText = async () => {
    try {
      setIsSavingHomeMessage(true);
      await apiRequest("PUT", "/api/admin/settings/home_message_text", { value: homeMessageText });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/home-message"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Messaggio home salvato");
    } catch (error: unknown) {
      Alert.alert("Errore", (error as Error).message || "Errore durante il salvataggio");
    } finally {
      setIsSavingHomeMessage(false);
    }
  };

  const { data: themeServerData } = useQuery<{ userSwitchingEnabled: boolean; defaultTheme: string }>({
    queryKey: ["/api/settings/theme"],
  });
  const themeUserSwitching = themeServerData?.userSwitchingEnabled === true;
  const themeDefaultName: ThemeName = (["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).includes(themeServerData?.defaultTheme as ThemeName)
    ? (themeServerData!.defaultTheme as ThemeName)
    : "attuale";

  const themeSwitchingMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const url = new URL("/api/admin/settings/theme_user_switching_enabled", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.themeUpdateError"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/theme"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const themeDefaultMutation = useMutation({
    mutationFn: async (value: ThemeName) => {
      const url = new URL("/api/admin/settings/theme_default", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.defaultThemeUpdateError"));
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setTheme(variables);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/theme"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const { data: splashModeData } = useQuery<{ value: string }>({
    queryKey: ["/api/admin/settings/splash_mode"],
    enabled: isAdmin,
  });
  const splashMode = splashModeData?.value || "standard";

  const handleSaveSplashMode = async (mode: string) => {
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_mode", { value: mode });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/splash_mode"] });
    } catch (error: unknown) {
      Alert.alert("Errore", (error as Error).message);
    }
  };

  const { data: splashListRaw } = useQuery<{ value: string }>({
    queryKey: ["/api/admin/settings/splash_messages_list"],
    enabled: isAdmin,
  });
  const splashMessagesList = useMemo(() => {
    try { return JSON.parse(splashListRaw?.value || "[]"); } catch { return []; }
  }, [splashListRaw]);

  const handleSaveSplashList = async (list: string[]) => {
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_messages_list", { value: JSON.stringify(list) });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/splash_messages_list"] });
    } catch (error: unknown) {
      Alert.alert("Errore", (error as Error).message);
    }
  };

  return {
    homeMessageEnabled,
    homeMessageToggleMutation,
    homeMessageText,
    setHomeMessageText,
    handleSaveHomeMessageText,
    isSavingHomeMessage,
    themeUserSwitching,
    themeDefaultName,
    themeSwitchingMutation,
    themeDefaultMutation,
    splashMode,
    handleSaveSplashMode,
    splashMessagesList,
    handleSaveSplashList,
  };
}
