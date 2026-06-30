import { useState, useMemo } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { useUptimeWidget } from "@/lib/uptime-widget-context";
import { ThemeName } from "@/constants/colors";

// Sub-hooks
import { useCoordHistoryState } from "./useCoordHistoryState";
import { useMatchingState } from "./useMatchingState";
import { useMusicAdminState } from "./useMusicAdminState";
import { useToggleSettings } from "./useToggleSettings";

import { useAdminSettingsAppState } from "./useAdminSettingsAppState";
import { useAdminSettingsFeatureFlags } from "./useAdminSettingsFeatureFlags";
import { useAdminSettingsMaintenance } from "./useAdminSettingsMaintenance";
import { useAdminSettingsSystemConfig } from "./useAdminSettingsSystemConfig";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

function getDefaultSettings(t: (k: string) => string) {
  return [
    { key: "splash_message", label: t("admin.splashMessage"), placeholder: t("admin.splashPlaceholder") },
    { key: "max_photos_zavorrina", label: t("admin.maxPhotosZavorrina"), placeholder: "3" },
    { key: "max_daily_votes", label: t("admin.maxDailyVotes"), placeholder: "10" },
  ];
}

interface UseAdminSettingsStateProps {
  isAdmin: boolean;
  t: (k: string) => string;
  setTheme: (theme: ThemeName) => void;
}

export function useAdminSettingsState({ isAdmin, t, setTheme }: UseAdminSettingsStateProps) {
  const defaultSettings = useMemo(() => getDefaultSettings(t), [t]);
  
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [protectedToggle, setProtectedToggle] = useState<{ key: string; value: boolean; label: string } | null>(null);
  const [protectedPassword, setProtectedPassword] = useState("");
  const [clubInviteFeedback, setClubInviteFeedback] = useState<string | null>(null);
  const { enabled: uptimeWidgetEnabled, setEnabled: setUptimeWidgetEnabled } = useUptimeWidget();
  
  const [matchingEngineExpanded, setMatchingEngineExpanded] = useState(false);
  const [coordHistoryExpanded, setCoordHistoryExpanded] = useState(false);
  const [musicSystemExpanded, setMusicSystemExpanded] = useState(false);
  const [mapsExpanded, setMapsExpanded] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [distanceCounterExpanded, setDistanceCounterExpanded] = useState(false);

  // Initialize sub-hooks
  const coordHistory = useCoordHistoryState(isAdmin, t, coordHistoryExpanded);
  const matching = useMatchingState(t);
  const music = useMusicAdminState();
  const toggles = useToggleSettings(t, setProtectedToggle, setProtectedPassword);

  const appState = useAdminSettingsAppState(isAdmin, t, setTheme);
  const featureFlags = useAdminSettingsFeatureFlags();
  const maintenance = useAdminSettingsMaintenance(isAdmin, t);
  const systemConfig = useAdminSettingsSystemConfig(isAdmin);

  const handleUptimeToggle = (val: boolean) => {
    setUptimeWidgetEnabled(val);
  };

  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.settingsUpdateError"));
      return res.json();
    },
    onSuccess: () => {
      setEditingKey(null);
      setEditValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const getSettingValue = (key: string) => settings.find((s) => s.key === key)?.value || "";
  const startEditing = (key: string) => { setEditingKey(key); setEditValue(getSettingValue(key)); };
  const handleSave = () => { if (editingKey) updateMutation.mutate({ key: editingKey, value: editValue }); };

  return {
    defaultSettings,
    settings,
    isLoading,
    editingKey,
    setEditingKey,
    editValue,
    setEditValue,
    protectedToggle,
    setProtectedToggle,
    protectedPassword,
    setProtectedPassword,
    clubInviteFeedback,
    setClubInviteFeedback,
    uptimeWidgetEnabled,
    handleUptimeToggle,
    autoMatchMutation: matching.autoMatchMutation,
    matchingEngineExpanded,
    setMatchingEngineExpanded,
    coordHistoryExpanded,
    setCoordHistoryExpanded,
    musicSystemExpanded,
    setMusicSystemExpanded,
    mapsExpanded,
    setMapsExpanded,
    docsExpanded,
    setDocsExpanded,
    distanceCounterExpanded,
    setDistanceCounterExpanded,
    adsEnabled: featureFlags.adsEnabled,
    synecoVisible: featureFlags.synecoVisible,
    emailVerifEnabled: featureFlags.emailVerifEnabled,
    refetchIntervalInput: systemConfig.refetchIntervalInput,
    setRefetchIntervalInput: systemConfig.setRefetchIntervalInput,
    refetchIntervalMutation: systemConfig.refetchIntervalMutation,
    refetchIntervalData: systemConfig.refetchIntervalData,
    coordMaxAgeInput: systemConfig.coordMaxAgeInput,
    setCoordMaxAgeInput: systemConfig.setCoordMaxAgeInput,
    coordMaxAgeMutation: systemConfig.coordMaxAgeMutation,
    coordMaxAgeData: systemConfig.coordMaxAgeData,
    coordHistorySettings: coordHistory.coordHistorySettings,
    coordHistoryStats: coordHistory.coordHistoryStats,
    chIntervalInput: coordHistory.chIntervalInput,
    setChIntervalInput: coordHistory.setChIntervalInput,
    chMaxRecordsInput: coordHistory.chMaxRecordsInput,
    setChMaxRecordsInput: coordHistory.setChMaxRecordsInput,
    coordHistoryMutation: coordHistory.coordHistoryMutation,
    chUserSearch: coordHistory.chUserSearch,
    setChUserSearch: coordHistory.setChUserSearch,
    chSearchResults: coordHistory.chSearchResults,
    primalEnabled: featureFlags.primalEnabled,
    motoclubCreationEnabled: featureFlags.motoclubCreationEnabled,
    motoclubCreationMutation: featureFlags.motoclubCreationMutation,
    customRoutesEnabled: featureFlags.customRoutesEnabled,
    motoclubZavEnabled: featureFlags.motoclubZavEnabled,
    ghostModeEnabled: featureFlags.ghostModeEnabled,
    phoneFieldEnabled: featureFlags.phoneFieldEnabled,
    userAvailableOnLogin: featureFlags.userAvailableOnLogin,
    showSearchPrefEnabled: featureFlags.showSearchPrefEnabled,
    showSearchPrefMutation: featureFlags.showSearchPrefMutation,
    matchPrefVisibleEnabled: matching.matchPrefVisibleEnabled,
    matchPrefVisibleMutation: matching.matchPrefVisibleMutation,
    searchPrefLockedEnabled: featureFlags.searchPrefLockedEnabled,
    searchPrefLockedMutation: featureFlags.searchPrefLockedMutation,
    themeUserSwitching: appState.themeUserSwitching,
    themeDefaultName: appState.themeDefaultName,
    themeSwitchingMutation: appState.themeSwitchingMutation,
    themeDefaultMutation: appState.themeDefaultMutation,
    unitsPrefEnabled: featureFlags.unitsPrefEnabled,
    syncStatus: maintenance.syncStatus,
    syncMutation: maintenance.syncMutation,
    disableFeatureMutation: toggles.disableFeatureMutation,
    protectedToggleMutation: toggles.protectedToggleMutation,
    sosEnabled: featureFlags.sosEnabled,
    sosMutation: featureFlags.sosMutation,
    musicMatchEnabled: music.musicMatchEnabled,
    musicMatchMutation: music.musicMatchMutation,
    musicExportEnabled: music.musicExportEnabled,
    musicExportMutation: music.musicExportMutation,
    musicImportEnabled: music.musicImportEnabled,
    musicImportMutation: music.musicImportMutation,
    musicImportPending: music.musicImportPending,
    homeMessageEnabled: appState.homeMessageEnabled,
    homeMessageToggleMutation: appState.homeMessageToggleMutation,
    homeMessageText: appState.homeMessageText,
    setHomeMessageText: appState.setHomeMessageText,
    handleSaveHomeMessageText: appState.handleSaveHomeMessageText,
    isSavingHomeMessage: appState.isSavingHomeMessage,
    mapsEnabled: featureFlags.mapsEnabled,
    mapsEnabledMutation: featureFlags.mapsEnabledMutation,
    mapsProvider: featureFlags.mapsProvider,
    mapsProviderMutation: featureFlags.mapsProviderMutation,
    gpsRequired: featureFlags.gpsRequired,
    marketplaceEnabled: featureFlags.marketplaceEnabled,
    donationEnabled: featureFlags.donationEnabled,
    isUploadingEula: false,
    handleUploadEula: maintenance.handleUploadEula,
    getSettingValue,
    startEditing,
    handleSave,
    updateMutation,
    emailConfigModalVisible: maintenance.emailConfigModalVisible,
    setEmailConfigModalVisible: maintenance.setEmailConfigModalVisible,
    emailConfigAdminPass: maintenance.emailConfigAdminPass,
    setEmailConfigAdminPass: maintenance.setEmailConfigAdminPass,
    emailConfigGmail: maintenance.emailConfigGmail,
    setEmailConfigGmail: maintenance.setEmailConfigGmail,
    emailConfigAppPass: maintenance.emailConfigAppPass,
    setEmailConfigAppPass: maintenance.setEmailConfigAppPass,
    isSavingEmailConfig: maintenance.isSavingEmailConfig,
    emailConfigData: maintenance.emailConfigData,
    handleSaveEmailConfig: maintenance.handleSaveEmailConfig,
    paypalEmail: maintenance.paypalEmail,
    setPaypalEmail: maintenance.setPaypalEmail,
    isSavingPaypal: maintenance.isSavingPaypal,
    handleSavePaypal: maintenance.handleSavePaypal,
    splashMode: appState.splashMode,
    handleSaveSplashMode: appState.handleSaveSplashMode,
    splashMessagesList: appState.splashMessagesList,
    handleSaveSplashList: appState.handleSaveSplashList,
    matchingCountries: matching.matchingCountries,
    setMatchingCountries: matching.setMatchingCountries,
    matchingTriggerFeedback: matching.matchingTriggerFeedback,
    setMatchingTriggerFeedback: matching.setMatchingTriggerFeedback,
    autoMatchEnabled: matching.autoMatchEnabled,
    triggerMatchingMutation: matching.triggerMatchingMutation,
  };
}
