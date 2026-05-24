import { Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl, queryClient } from "@/lib/query-client";

export function useAdminSettingsFeatureFlags(_isAdmin: boolean, _t: (k: string) => string) {
  const { data: adsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
  });
  const adsEnabled = adsEnabledData?.enabled !== false;

  const { data: synecoData } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/settings/syneco-branding"],
  });
  const synecoVisible = synecoData?.visible === true;

  const { data: emailVerifData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const emailVerifEnabled = emailVerifData?.enabled === true;

  const { data: primalData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/primal-user"],
  });
  const primalEnabled = primalData?.enabled === true;

  const { data: motoclubCreationData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/motoclub-user-creation"],
  });
  const motoclubCreationEnabled = motoclubCreationData?.enabled === true;

  const { data: customRoutesData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/custom-routes"],
  });
  const customRoutesEnabled = customRoutesData?.enabled !== false;

  const { data: motoclubZavData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/motoclub-include-zav"],
  });
  const motoclubZavEnabled = motoclubZavData?.enabled !== false;

  const { data: ghostModeData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ghost-mode-enabled"],
  });
  const ghostModeEnabled = ghostModeData?.enabled === true;

  const { data: phoneFieldData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-field-enabled"],
  });
  const phoneFieldEnabled = phoneFieldData?.enabled === true;

  const { data: userAvailableData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/user-available-on-login"],
  });
  const userAvailableOnLogin = userAvailableData?.enabled !== false;

  const { data: showSearchPrefData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/show-search-preference"],
  });
  const showSearchPrefEnabled = showSearchPrefData?.enabled === true;

  const { data: searchPrefLockedData } = useQuery<{ locked: boolean }>({
    queryKey: ["/api/settings/search-preference-locked"],
  });
  const searchPrefLockedEnabled = searchPrefLockedData?.locked === true;

  const { data: allSettingsData } = useQuery<{ unitsPrefEnabled?: boolean }>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
  });
  const unitsPrefEnabled = allSettingsData?.unitsPrefEnabled === true;

  const { data: sosData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/sos-enabled"],
  });
  const sosEnabled = sosData?.enabled !== false;

  const { data: mapsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/maps-enabled"],
  });
  const mapsEnabled = mapsEnabledData?.enabled !== false;

  const { data: mapsProviderData } = useQuery<{ provider: "esri_gray" | "carto_light" | "carto_dark" }>({
    queryKey: ["/api/settings/maps-provider"],
  });
  const mapsProvider = mapsProviderData?.provider || "esri_gray";

  const { data: gpsRequiredData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/gps-required"],
  });
  const gpsRequired = gpsRequiredData?.enabled !== false;

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: donationData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/donation"],
  });
  const donationEnabled = donationData?.enabled === true;

  const motoclubCreationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/motoclub_user_creation_enabled", baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/motoclub-user-creation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const showSearchPrefMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/show_search_preference", baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/show-search-preference"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const searchPrefLockedMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/search_preference_locked", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: locked ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/search-preference-locked"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const sosMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/sos_enabled", baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/sos-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const mapsEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_enabled", baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  const mapsProviderMutation = useMutation({
    mutationFn: async (provider: "esri_gray" | "carto_light" | "carto_dark") => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_provider", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: provider }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-provider"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (e: Error) => Alert.alert("Errore", (e as Error).message),
  });

  return {
    adsEnabled,
    synecoVisible,
    emailVerifEnabled,
    primalEnabled,
    motoclubCreationEnabled,
    motoclubCreationMutation,
    customRoutesEnabled,
    motoclubZavEnabled,
    ghostModeEnabled,
    phoneFieldEnabled,
    userAvailableOnLogin,
    showSearchPrefEnabled,
    showSearchPrefMutation,
    searchPrefLockedEnabled,
    searchPrefLockedMutation,
    unitsPrefEnabled,
    sosEnabled,
    sosMutation,
    mapsEnabled,
    mapsEnabledMutation,
    mapsProvider,
    mapsProviderMutation,
    gpsRequired,
    marketplaceEnabled,
    donationEnabled,
  };
}
