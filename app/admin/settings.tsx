import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch, Modal, ScrollView } from "react-native";
import { EUROPEAN_COUNTRIES } from "@/lib/countries-regions";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

const defaultSettings = [
  { key: "splash_message", label: "Messaggio Splash", placeholder: "Messaggio da mostrare nello splash..." },
  { key: "max_photos_zavorrina", label: "Max foto zavorrina", placeholder: "3" },
  { key: "max_daily_votes", label: "Max voti giornalieri", placeholder: "10" },
];

function ManualAdminSection() {
  const [uploading, setUploading] = useState(false);

  const { data: manualInfo, refetch } = useQuery<{
    available: boolean;
    fileName?: string;
    fileSize?: number;
    lastModified?: string;
  }>({
    queryKey: ["/api/manual/info"],
  });

  const handleDownload = () => {
    const url = new URL("/api/manual/download", getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "manual.pdf",
        type: "application/pdf",
      } as any);

      const res = await fetch(new URL("/api/admin/manual/upload", getApiUrl()).toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", data.message || "Manuale aggiornato");
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <View style={manualStyles.card}>
      <View style={manualStyles.row}>
        <Ionicons name="document-text" size={32} color={Colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={manualStyles.title}>BikerLink-Manual.pdf</Text>
          <Text style={manualStyles.subtitle}>
            {manualInfo?.available
              ? `${formatSize(manualInfo.fileSize)} — ${manualInfo.lastModified ? new Date(manualInfo.lastModified).toLocaleDateString("it-IT") : ""}`
              : "Nessun manuale caricato"}
          </Text>
        </View>
      </View>
      <View style={manualStyles.actions}>
        {manualInfo?.available && (
          <TouchableOpacity style={manualStyles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={manualStyles.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[manualStyles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={manualStyles.btnText}>Carica nuovo PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const manualStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  downloadBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadBtn: {
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

function PdfDocumentAdminSection({
  title,
  fileName,
  infoEndpoint,
  downloadEndpoint,
  uploadEndpoint,
}: {
  title: string;
  fileName: string;
  infoEndpoint: string;
  downloadEndpoint: string;
  uploadEndpoint: string;
}) {
  const [uploading, setUploading] = useState(false);

  const { data: fileInfo, refetch } = useQuery<{
    available: boolean;
    fileName?: string;
    fileSize?: number;
    lastModified?: string;
  }>({
    queryKey: [infoEndpoint],
  });

  const handleDownload = () => {
    const url = new URL(downloadEndpoint, getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "document.pdf",
        type: "application/pdf",
      } as any);

      const res = await fetch(new URL(uploadEndpoint, getApiUrl()).toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", data.message || "Documento aggiornato");
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <View style={manualStyles.card}>
      <View style={manualStyles.row}>
        <Ionicons name="document-text-outline" size={32} color={Colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={manualStyles.title}>{fileName}</Text>
          <Text style={manualStyles.subtitle}>
            {fileInfo?.available
              ? `${formatSize(fileInfo.fileSize)} — ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleDateString("it-IT") : ""}`
              : `Nessun ${title} caricato`}
          </Text>
        </View>
      </View>
      <View style={manualStyles.actions}>
        {fileInfo?.available && (
          <TouchableOpacity style={manualStyles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={manualStyles.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[manualStyles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={manualStyles.btnText}>Carica nuovo PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminSettings() {
  const insets = useSafeAreaInsets();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [protectedToggle, setProtectedToggle] = useState<{ key: string; value: boolean; label: string } | null>(null);
  const [protectedPassword, setProtectedPassword] = useState("");
  const [matchingCountries, setMatchingCountries] = useState<string[]>([]);
  const [matchingTriggerFeedback, setMatchingTriggerFeedback] = useState<string | null>(null);
  const [clubInviteFeedback, setClubInviteFeedback] = useState<string | null>(null);
  const [uptimeWidgetEnabled, setUptimeWidgetEnabled] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem("uptime_widget_enabled").then((val) => {
      setUptimeWidgetEnabled(val === null ? true : val === "true");
    });
  }, []);

  const handleUptimeToggle = (val: boolean) => {
    setUptimeWidgetEnabled(val);
    AsyncStorage.setItem("uptime_widget_enabled", val ? "true" : "false");
  };

  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

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

  const { data: autoMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/auto-matching"],
  });
  const autoMatchEnabled = autoMatchData?.enabled !== false;

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

  const disableFeatureMutation = useMutation({
    mutationFn: async (key: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/disable-feature", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const protectedToggleMutation = useMutation({
    mutationFn: async ({ key, value, adminPassword }: { key: string; value: string; adminPassword: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/toggle-protected", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, adminPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/gps-required"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/marketplace-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ghost-mode-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/phone-field-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/user-available-on-login"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setProtectedToggle(null);
      setProtectedPassword("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const { data: sosData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/sos-enabled"],
  });
  const sosEnabled = sosData?.enabled !== false;

  const { data: homeMessageData } = useQuery<{ enabled: boolean; text: string }>({
    queryKey: ["/api/settings/home-message"],
  });
  const homeMessageEnabled = homeMessageData?.enabled === true;
  const [homeMessageText, setHomeMessageText] = useState("");
  const [isSavingHomeMessage, setIsSavingHomeMessage] = useState(false);

  React.useEffect(() => {
    if (homeMessageData?.text !== undefined) {
      setHomeMessageText(homeMessageData.text);
    }
  }, [homeMessageData?.text]);

  const homeMessageToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/home_message_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
  });

  async function handleSaveHomeMessageText() {
    try {
      setIsSavingHomeMessage(true);
      await apiRequest("PUT", "/api/admin/settings/home_message_text", { value: homeMessageText });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/home-message"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Messaggio home salvato");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingHomeMessage(false);
    }
  }

  const sosMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/sos_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
  });

  const customRoutesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/custom_routes_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/custom-routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const motoclubZavMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/motoclub_include_zav", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/motoclub-include-zav"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/auto_matching_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
  });

  const showSearchPrefMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/show_search_preference", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
  });

  const motoclubCreationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/motoclub_user_creation_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
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
  });

  const { data: matchingStats, refetch: refetchMatchingStats } = useQuery<{
    totalZavarrinaMatches: number;
    totalBikerBikerMatches: number;
    lastCycle: { completedAt: string; durationMs: number; zavarrinaMatchesNew: number; bikerBikerMatchesNew: number } | null;
  }>({
    queryKey: ["/api/admin/matching-stats"],
    refetchInterval: 30000,
  });

  const matchingTriggerMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/matching/trigger", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ started: boolean; reason?: string }>;
    },
    onSuccess: (data) => {
      if (data.started) {
        setMatchingTriggerFeedback("Ciclo avviato");
      } else if (data.reason?.startsWith("debounced")) {
        const match = data.reason.match(/last run (\d+)s ago/);
        const sec = match ? match[1] : "?";
        setMatchingTriggerFeedback(`Debounce attivo (ultimo ciclo ${sec}s fa)`);
      } else if (data.reason === "already_running") {
        setMatchingTriggerFeedback("Già in esecuzione");
      } else {
        setMatchingTriggerFeedback(data.reason ?? "Risposta inattesa");
      }
      setTimeout(() => setMatchingTriggerFeedback(null), 5000);
      refetchMatchingStats();
    },
    onError: () => setMatchingTriggerFeedback("Errore nel trigger"),
  });

  const { data: matchingCountriesData } = useQuery<{ countries: string[] }>({
    queryKey: ["/api/admin/settings/matching_countries"],
  });

  useEffect(() => {
    if (matchingCountriesData?.countries) {
      setMatchingCountries(matchingCountriesData.countries);
    }
  }, [matchingCountriesData]);

  const matchingCountriesMutation = useMutation({
    mutationFn: async (countries: string[]) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/matching_countries", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(countries) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/matching_countries"] });
    },
  });

  const reconcileClubInvitesMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/reconcile-club-invites", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: { motorsChecked: number; pendingInvites: number; message: string }) => {
      setClubInviteFeedback(data.message);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/motoclubs");
        },
      });
    },
    onError: (error: Error) => {
      setClubInviteFeedback(`Errore: ${error.message}`);
    },
  });

  const primalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/primal_user_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/primal-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const { data: mapsData } = useQuery<{ enabled: boolean; provider: string; userChoiceEnabled: boolean }>({
    queryKey: ["/api/settings/maps"],
  });
  const mapsEnabled = mapsData?.enabled !== false;
  const mapsProvider = (mapsData?.provider || "carto_light") as "carto_light" | "carto_dark" | "esri_gray";
  const mapsUserChoiceEnabled = mapsData?.userChoiceEnabled !== false;

  const mapsEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const mapsProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_provider", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: provider }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const mapsUserChoiceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_user_choice_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const [isUploadingEula, setIsUploadingEula] = useState(false);

  const [paypalEmail, setPaypalEmail] = useState("");
  const [isSavingPaypal, setIsSavingPaypal] = useState(false);

  const { data: donationData } = useQuery<{ enabled: boolean; text: string; paypalEmail: string }>({
    queryKey: ["/api/settings/donation"],
  });
  const donationEnabled = donationData?.enabled !== false;

  const [donationText, setDonationText] = useState("");
  const [donationTextPassword, setDonationTextPassword] = useState("");
  const [showDonationTextPasswordModal, setShowDonationTextPasswordModal] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  React.useEffect(() => {
    if (donationData?.text !== undefined) {
      setDonationText(donationData.text);
    }
  }, [donationData?.text]);

  const { data: gpsRequiredData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
  });
  const gpsRequired = gpsRequiredData?.required !== false;

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const [emailConfigModalVisible, setEmailConfigModalVisible] = useState(false);
  const [emailConfigAdminPass, setEmailConfigAdminPass] = useState("");
  const [emailConfigGmail, setEmailConfigGmail] = useState("");
  const [emailConfigAppPass, setEmailConfigAppPass] = useState("");
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);

  const { data: emailConfigData } = useQuery<{ configured: boolean; maskedEmail: string }>({
    queryKey: ["/api/admin/settings/email-config"],
  });

  async function handleSaveEmailConfig() {
    if (!emailConfigAdminPass) {
      Alert.alert("Errore", "Inserisci la password admin");
      return;
    }
    if (!emailConfigGmail && !emailConfigAppPass) {
      Alert.alert("Errore", "Inserisci almeno un campo da aggiornare");
      return;
    }
    try {
      setIsSavingEmailConfig(true);
      await apiRequest("PUT", "/api/admin/settings/email-config", {
        gmailUser: emailConfigGmail || undefined,
        gmailAppPassword: emailConfigAppPass || undefined,
        adminPassword: emailConfigAdminPass,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-config"] });
      setEmailConfigModalVisible(false);
      setEmailConfigAdminPass("");
      setEmailConfigGmail("");
      setEmailConfigAppPass("");
      Alert.alert("Successo", "Configurazione email aggiornata");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Password admin non corretta o errore durante il salvataggio");
    } finally {
      setIsSavingEmailConfig(false);
    }
  }

  const { data: paypalData } = useQuery<{ email: string }>({
    queryKey: ["/api/settings/paypal"],
  });

  React.useEffect(() => {
    if (paypalData?.email !== undefined) {
      setPaypalEmail(paypalData.email);
    }
  }, [paypalData?.email]);

  async function handleSavePaypal() {
    try {
      setIsSavingPaypal(true);
      await apiRequest("PUT", "/api/admin/settings/paypal_email", { value: paypalEmail });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/paypal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Email supporto salvata con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingPaypal(false);
    }
  }

  const [splashMode, setSplashMode] = useState<"single" | "cycle">("single");
  const [splashMessagesList, setSplashMessagesList] = useState<string[]>([]);
  const splashMessagesListRef = React.useRef<string[]>([]);
  React.useEffect(() => { splashMessagesListRef.current = splashMessagesList; }, [splashMessagesList]);

  React.useEffect(() => {
    if (settings && settings.length > 0) {
      const modeSetting = settings.find(s => s.key === "splash_message_mode");
      if (modeSetting?.value === "cycle") setSplashMode("cycle");
      else setSplashMode("single");

      const listSetting = settings.find(s => s.key === "splash_messages_list");
      try {
        const parsed = JSON.parse(listSetting?.value || "[]");
        if (Array.isArray(parsed)) setSplashMessagesList(parsed);
      } catch {}
    }
  }, [settings]);

  async function handleSaveSplashMode(mode: "single" | "cycle") {
    setSplashMode(mode);
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_message_mode", { value: mode });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/splash"] });
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    }
  }

  async function persistSplashList(list: string[]) {
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_messages_list", { value: JSON.stringify(list) });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/splash"] });
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    }
  }

  async function handleSaveSplashList(list: string[]) {
    setSplashMessagesList(list);
    await persistSplashList(list);
  }

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/settings/${key}`, baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setEditingKey(null);
      setEditValue("");
    },
  });

  async function handleUploadEula() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      setIsUploadingEula(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "eula.txt",
        type: "text/plain",
      } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/eula/upload", baseUrl);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Errore durante l'upload" }));
        Alert.alert("Errore", errorData.message || "Errore durante l'upload");
        return;
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });

      if (editingKey === "eula_text" && data.value) {
        setEditValue(data.value);
      }

      Alert.alert("Successo", "EULA caricato con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante l'upload del file");
    } finally {
      setIsUploadingEula(false);
    }
  }

  function getSettingValue(key: string): string {
    const setting = (settings || []).find((s) => s.key === key);
    return setting?.value ?? "";
  }

  function startEditing(key: string) {
    setEditingKey(key);
    setEditValue(getSettingValue(key));
  }

  function handleSave() {
    if (!editingKey) return;
    updateMutation.mutate({ key: editingKey, value: editValue });
  }

  function renderSettingCard(setting: typeof defaultSettings[number]) {
    return (
      <View key={setting.key} style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingLabel}>{setting.label}</Text>
          <View style={styles.settingActions}>
            {setting.key === "eula_text" && editingKey !== setting.key && (
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={handleUploadEula}
                disabled={isUploadingEula}
              >
                {isUploadingEula ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="cloud-upload" size={20} color={Colors.accent} />
                )}
              </TouchableOpacity>
            )}
            {editingKey !== setting.key && (
              <TouchableOpacity onPress={() => startEditing(setting.key)}>
                <Ionicons name="create" size={20} color={Colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {editingKey === setting.key ? (
          <View>
            <TextInput
              style={styles.input}
              placeholder={setting.placeholder}
              placeholderTextColor={Colors.textSecondary}
              value={editValue}
              onChangeText={setEditValue}
              multiline={setting.key === "eula_text"}
              numberOfLines={setting.key === "eula_text" ? 6 : 1}
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={updateMutation.isPending}
              >
                <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : "Salva"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.settingValue}>
            {getSettingValue(setting.key) || setting.placeholder}
          </Text>
        )}
      </View>
    );
  }

  const sortedMatchingCountries = useMemo(() => {
    const itEntry = EUROPEAN_COUNTRIES.find((c) => c.code === "IT");
    const rest = EUROPEAN_COUNTRIES.filter((c) => c.code !== "IT").sort((a, b) => a.name.localeCompare(b.name));
    return itEntry ? [itEntry, ...rest] : rest;
  }, []);

  const splashSetting = defaultSettings.find(s => s.key === "splash_message")!;
  const maxPhotosSetting = defaultSettings.find(s => s.key === "max_photos_zavorrina")!;
  const maxVotesSetting = defaultSettings.find(s => s.key === "max_daily_votes")!;

  return (
    <>
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      bottomOffset={20}
    >

      <View style={[styles.sectionHeaderRow, { marginTop: 0 }]}>
        <Ionicons name="apps" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Funzionalità App</Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="git-compare" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Match Automatico</Text>
          </View>
          <Switch
            value={autoMatchEnabled}
            onValueChange={(val) => autoMatchMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={autoMatchEnabled ? Colors.text : Colors.textSecondary}
            disabled={autoMatchMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {autoMatchEnabled ? "Il motore di matching automatico è attivo" : "Il matching automatico è disattivato"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="search" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Mostra "Ricerca Match con..."</Text>
          </View>
          <Switch
            value={showSearchPrefEnabled}
            onValueChange={(val) => showSearchPrefMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={showSearchPrefEnabled ? Colors.text : Colors.textSecondary}
            disabled={showSearchPrefMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {showSearchPrefEnabled ? "La sezione 'Ricerca Match con...' è visibile nel profilo utente" : "La sezione 'Ricerca Match con...' è nascosta dal profilo utente"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="people" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Creazione Club da Utenti</Text>
          </View>
          <Switch
            value={motoclubCreationEnabled}
            onValueChange={(val) => motoclubCreationMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={motoclubCreationEnabled ? Colors.text : Colors.textSecondary}
            disabled={motoclubCreationMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {motoclubCreationEnabled ? "Gli utenti possono richiedere la creazione di nuovi motoclub" : "Creazione motoclub da utenti disabilitata"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="bar-chart" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Status Matching</Text>
          </View>
          <TouchableOpacity
            onPress={() => matchingTriggerMutation.mutate()}
            disabled={matchingTriggerMutation.isPending}
            style={[styles.triggerBtn, matchingTriggerMutation.isPending && { opacity: 0.5 }]}
          >
            {matchingTriggerMutation.isPending
              ? <ActivityIndicator size="small" color={Colors.text} />
              : <Text style={styles.triggerBtnText}>Esegui Ora</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.matchingStatsRow}>
          <View style={styles.matchingStatItem}>
            <Text style={styles.matchingStatValue}>{matchingStats?.totalZavarrinaMatches ?? "—"}</Text>
            <Text style={styles.matchingStatLabel}>Match Garage</Text>
          </View>
          <View style={styles.matchingStatDivider} />
          <View style={styles.matchingStatItem}>
            <Text style={styles.matchingStatValue}>{matchingStats?.totalBikerBikerMatches ?? "—"}</Text>
            <Text style={styles.matchingStatLabel}>Match Biker</Text>
          </View>
        </View>
        {matchingStats?.lastCycle ? (
          <View style={styles.lastCycleBox}>
            <Text style={styles.lastCycleTitle}>Ultimo ciclo</Text>
            <Text style={styles.lastCycleText}>
              {new Date(matchingStats.lastCycle.completedAt).toLocaleString("it-IT")}
              {"  ·  "}{Math.round(matchingStats.lastCycle.durationMs / 1000)}s
            </Text>
            <Text style={styles.lastCycleText}>
              +{matchingStats.lastCycle.zavarrinaMatchesNew} garage  ·  +{matchingStats.lastCycle.bikerBikerMatchesNew} biker
            </Text>
          </View>
        ) : (
          <Text style={styles.synecoDesc}>Nessun ciclo eseguito in questa sessione</Text>
        )}
        {matchingTriggerFeedback && (
          <Text style={[styles.synecoDesc, { color: Colors.warning, marginTop: 6 }]}>{matchingTriggerFeedback}</Text>
        )}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="flag" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Paesi Matching</Text>
          </View>
          {matchingCountriesMutation.isPending && <ActivityIndicator size="small" color={Colors.warning} />}
        </View>
        <Text style={styles.synecoDesc}>
          {matchingCountries.length === 0
            ? "Tutti i paesi (nessun filtro)"
            : `${matchingCountries.length} ${matchingCountries.length === 1 ? "paese selezionato" : "paesi selezionati"}`}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 8 }}>
          {sortedMatchingCountries.map((c) => {
            const isSelected = matchingCountries.includes(c.code);
            return (
              <TouchableOpacity
                key={c.code}
                onPress={() => {
                  setMatchingCountries((prev) =>
                    prev.includes(c.code) ? prev.filter((x) => x !== c.code) : [...prev, c.code]
                  );
                }}
                style={[styles.countryChip, isSelected && styles.countryChipSelected]}
              >
                <Text style={styles.countryChipFlag}>{c.flag}</Text>
                <Text style={[styles.countryChipText, isSelected && styles.countryChipTextSelected]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[styles.saveBtn, { alignSelf: "flex-end", marginTop: 4 }]}
          onPress={() => matchingCountriesMutation.mutate(matchingCountries)}
          disabled={matchingCountriesMutation.isPending}
        >
          <Text style={styles.saveBtnText}>Salva Paesi</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="bicycle" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Inviti Club dal Garage</Text>
          </View>
          {reconcileClubInvitesMutation.isPending && <ActivityIndicator size="small" color={Colors.warning} />}
        </View>
        <Text style={styles.synecoDesc}>
          Ricrea inviti ai brand club per le moto nel tuo garage che non hanno ancora un invito o iscrizione.
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, { alignSelf: "flex-start", marginTop: 10 }]}
          onPress={() => {
            setClubInviteFeedback(null);
            reconcileClubInvitesMutation.mutate();
          }}
          disabled={reconcileClubInvitesMutation.isPending}
        >
          <Text style={styles.saveBtnText}>Ricrea inviti club</Text>
        </TouchableOpacity>
        {clubInviteFeedback && (
          <Text style={[styles.synecoDesc, { color: Colors.warning, marginTop: 6 }]}>{clubInviteFeedback}</Text>
        )}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="map" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Percorsi Personalizzati</Text>
          </View>
          <Switch
            value={customRoutesEnabled}
            onValueChange={(val) => customRoutesMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={customRoutesEnabled ? Colors.text : Colors.textSecondary}
            disabled={customRoutesMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {customRoutesEnabled ? "Gli utenti possono creare percorsi personalizzati" : "I percorsi personalizzati sono disattivati"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="people-circle" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Zavorrine nei Club</Text>
          </View>
          <Switch
            value={motoclubZavEnabled}
            onValueChange={(val) => motoclubZavMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={motoclubZavEnabled ? Colors.text : Colors.textSecondary}
            disabled={motoclubZavMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {motoclubZavEnabled
            ? "Le zavorrine ricevono invite ai motoclub in base alle moto nella wishlist"
            : "Le zavorrine non sono incluse nei motoclub (iscrizioni e inviti esistenti rimossi)"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="warning" size={20} color="#FF6600" />
            <Text style={styles.synecoLabel}>SOS Biker</Text>
          </View>
          <Switch
            value={sosEnabled}
            onValueChange={(val) => sosMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FF6600" }}
            thumbColor={sosEnabled ? Colors.text : Colors.textSecondary}
            disabled={sosMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {sosEnabled ? "Gli utenti possono inviare e accogliere richieste SOS" : "La funzione SOS è disattivata per tutti"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="map" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Sistema Mappe</Text>
          </View>
          <Switch
            value={mapsEnabled}
            onValueChange={(val) => mapsEnabledMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={mapsEnabled ? Colors.text : Colors.textSecondary}
            disabled={mapsEnabledMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {mapsEnabled ? "Tile personalizzati attivi sulla mappa" : "Mappa con stile di default (no tile overlay)"}
        </Text>
        {mapsEnabled && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.synecoDesc, { marginBottom: 6 }]}>Provider tile default (globale):</Text>
            {(() => {
              const providerLabels: Record<string, string> = {
                esri_gray: "Base Map",
                carto_light: "Mappa Dettagliata Light & Dark",
                carto_dark: "FullMap",
              };
              return (
                <>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowProviderDropdown(true)}
                    disabled={mapsProviderMutation.isPending}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownButtonText}>
                      {providerLabels[mapsProvider] ?? mapsProvider}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <Modal
                    visible={showProviderDropdown}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowProviderDropdown(false)}
                  >
                    <TouchableOpacity
                      style={styles.dropdownOverlay}
                      activeOpacity={1}
                      onPress={() => setShowProviderDropdown(false)}
                    >
                      <View style={styles.dropdownMenu}>
                        {(["esri_gray", "carto_light", "carto_dark"] as const).map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[
                              styles.dropdownMenuItem,
                              mapsProvider === p && styles.dropdownMenuItemActive,
                            ]}
                            onPress={() => {
                              setShowProviderDropdown(false);
                              mapsProviderMutation.mutate(p);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.dropdownMenuItemText, mapsProvider === p && { color: Colors.accent }]}>
                              {providerLabels[p]}
                            </Text>
                            {mapsProvider === p && (
                              <Ionicons name="checkmark" size={16} color={Colors.accent} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </>
              );
            })()}
          </View>
        )}
        <View style={[styles.synecoHeader, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.border }]}>
          <View style={styles.synecoInfo}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.textSecondary} />
            <Text style={[styles.synecoDesc, { marginBottom: 0 }]}>Scelta stile utente</Text>
          </View>
          <Switch
            value={mapsUserChoiceEnabled}
            onValueChange={(val) => mapsUserChoiceMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={mapsUserChoiceEnabled ? Colors.text : Colors.textSecondary}
            disabled={mapsUserChoiceMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {mapsUserChoiceEnabled
            ? "Gli utenti possono scegliere il proprio stile mappa"
            : "Tutti gli utenti vedono il provider di default"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Messaggio Home</Text>
          </View>
          <Switch
            value={homeMessageEnabled}
            onValueChange={(val) => homeMessageToggleMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={homeMessageEnabled ? Colors.text : Colors.textSecondary}
            disabled={homeMessageToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {homeMessageEnabled
            ? "Il messaggio è attivo: gli utenti lo vedono toccando il logo"
            : "Il messaggio è disattivato: il tocco sul logo non mostra nulla"}
        </Text>
        <View style={{ marginTop: 14 }}>
          <TextInput
            style={[styles.input, { minHeight: 100 }]}
            placeholder="Inserisci il messaggio da mostrare agli utenti..."
            placeholderTextColor={Colors.textSecondary}
            value={homeMessageText}
            onChangeText={setHomeMessageText}
            multiline
            numberOfLines={4}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveHomeMessageText}
              disabled={isSavingHomeMessage}
            >
              <Text style={styles.saveBtnText}>{isSavingHomeMessage ? "..." : "Salva"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="pricetag" size={20} color="#FF9800" />
            <Text style={styles.synecoLabel}>Mercatino Moto</Text>
          </View>
          {marketplaceData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={marketplaceEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "marketplace_enabled", value: val, label: "Mercatino Moto" })}
              trackColor={{ false: Colors.border, true: "#FF9800" }}
              thumbColor={marketplaceEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {marketplaceEnabled
            ? "I biker possono mettere in vendita le moto dal garage. Le moto in vendita appaiono nel profilo e nel motoclub."
            : "Il mercatino moto è disattivato. La funzione 'In Vendita' non è visibile."}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="navigate" size={20} color="#4CAF50" />
            <Text style={styles.synecoLabel}>GPS Obbligatorio</Text>
          </View>
          {gpsRequiredData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={gpsRequired}
              onValueChange={(val) => setProtectedToggle({ key: "gps_required", value: val, label: "GPS Obbligatorio" })}
              trackColor={{ false: Colors.border, true: "#4CAF50" }}
              thumbColor={gpsRequired ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {gpsRequired
            ? "Senza permesso GPS, l'utente vede solo Profilo e Garage. Le altre tab sono nascoste."
            : "GPS non obbligatorio: tutte le tab sono sempre visibili, anche senza permesso di localizzazione."}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="eye-off" size={20} color="#9C27B0" />
            <Text style={styles.synecoLabel}>Ghost Mode</Text>
          </View>
          {ghostModeData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={ghostModeEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "ghost_mode_enabled", value: val, label: "Ghost Mode" })}
              trackColor={{ false: Colors.border, true: "#9C27B0" }}
              thumbColor={ghostModeEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {ghostModeEnabled
            ? "Gli utenti possono attivarsi in modalità invisibile: risultano offline per tutti."
            : "Ghost Mode disabilitato. Gli utenti non possono nascondersi dalla piattaforma."}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="people" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Gestione Utenti</Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="mail" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Verifica Email</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Verifica Email - Info",
                "Quando attiva:\n\n" +
                "1. Ogni nuovo utente riceve un codice di verifica a 6 cifre\n" +
                "2. L'utente deve inserire il codice nella schermata di verifica per completare la registrazione\n" +
                "3. Il codice scade dopo 30 minuti\n" +
                "4. L'utente non potrà fare login finché non verifica l'email\n" +
                "5. L'admin riceve una notifica con il codice generato\n" +
                "6. L'utente può richiedere un nuovo codice dalla schermata di verifica"
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {emailVerifData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={emailVerifEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "email_verification_enabled", value: val, label: "Verifica Email" })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {emailVerifEnabled ? "Attiva la verifica email per le nuove registrazioni" : "La verifica email è disattivata"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="call-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Campo telefono in registrazione</Text>
          </View>
          {phoneFieldData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={phoneFieldEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "phone_field_enabled", value: val, label: "Campo telefono in registrazione" })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={phoneFieldEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {phoneFieldEnabled ? "Il campo telefono è visibile durante la registrazione" : "Il campo telefono è nascosto nella registrazione (default)"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="radio-button-on-outline" size={20} color={Colors.success} />
            <Text style={styles.synecoLabel}>Utente Disponibile all'accesso</Text>
          </View>
          {userAvailableData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={userAvailableOnLogin}
              onValueChange={(val) => setProtectedToggle({ key: "user_available_on_login", value: val, label: "Utente Disponibile all'accesso" })}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={userAvailableOnLogin ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {userAvailableOnLogin ? "Gli utenti risultano disponibili appena effettuato il login" : "Gli utenti risultano non disponibili al login (devono attivarsi manualmente)"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="star" size={20} color="#FFD700" />
            <Text style={styles.synecoLabel}>Primal User</Text>
          </View>
          <Switch
            value={primalEnabled}
            onValueChange={(val) => primalMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FFD700" }}
            thumbColor={primalEnabled ? Colors.text : Colors.textSecondary}
            disabled={primalMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {primalEnabled ? "I nuovi utenti registrati saranno marcati come 'Primal'" : "La marcatura Primal è disattivata"}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="cash" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Monetizzazione</Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="volume-high" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Advertisement</Text>
          </View>
          {adsEnabledData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={adsEnabled}
              onValueChange={(val) => {
                if (!val) {
                  disableFeatureMutation.mutate("ads_enabled");
                } else {
                  setProtectedToggle({ key: "ads_enabled", value: val, label: "Advertisement" });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.syneco }}
              thumbColor={adsEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending || disableFeatureMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {adsEnabled ? "Gli advertisement sono attivi nell'app" : "Gli advertisement sono disattivati"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Branding Syneco</Text>
          </View>
          {synecoData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={synecoVisible}
              onValueChange={(val) => {
                if (!val) {
                  disableFeatureMutation.mutate("syneco_branding_visible");
                } else {
                  setProtectedToggle({ key: "syneco_branding_visible", value: val, label: "Branding Syneco" });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.syneco }}
              thumbColor={synecoVisible ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending || disableFeatureMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {synecoVisible ? "Il branding Syneco è visibile nell'app" : "Il branding Syneco è nascosto"}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="heart" size={20} color="#E91E63" />
            <Text style={styles.synecoLabel}>Supporto economico</Text>
          </View>
          {donationData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={donationEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "donation_enabled", value: val, label: "Supporto economico" })}
              trackColor={{ false: Colors.border, true: "#E91E63" }}
              thumbColor={donationEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {donationEnabled
            ? "Il blocco 'Supporta BikerLink' è visibile nel profilo utente"
            : "Il blocco supporto è nascosto dal profilo utente"}
        </Text>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.settingLabel}>Email supporto</Text>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="email@esempio.com"
            placeholderTextColor={Colors.textSecondary}
            value={paypalEmail}
            onChangeText={setPaypalEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSavePaypal}
              disabled={isSavingPaypal}
            >
              <Text style={styles.saveBtnText}>{isSavingPaypal ? "..." : "Salva"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.settingLabel}>Testo Messaggio Donazione</Text>
          <Text style={[styles.synecoDesc, { marginTop: 2, marginBottom: 8 }]}>
            Se vuoto, viene usato il testo predefinito.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 120 }]}
            placeholder={"Sono un motociclista, non un programmatore professionista.\nSto sviluppando quest'app da solo, per biker e zavorrine, nel mio tempo libero e a titolo gratuito.\nTra sviluppo, debug, server e pubblicazione i costi sono molto più alti del previsto.\nSe l'app ti piace e vuoi che continui a crescere, puoi supportarla con una piccola donazione.\nAnche solo il costo di un caffè fa la differenza.\nOgni utente che contribuirà verrà inserito nella Hall of Fame dei ringraziamenti dell'app.\nSe ognuno mette poco, possiamo fare tanto.\nGrazie davvero.\nCi vediamo su strada."}
            placeholderTextColor={Colors.textSecondary}
            value={donationText}
            onChangeText={setDonationText}
            multiline
            numberOfLines={6}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                setDonationTextPassword("");
                setShowDonationTextPasswordModal(true);
              }}
            >
              <Text style={styles.saveBtnText}>Salva</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="book" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Documenti PDF</Text>
      </View>

      <ManualAdminSection />

      <PdfDocumentAdminSection
        title="EULA"
        fileName="BikerLink-EULA.pdf"
        infoEndpoint="/api/eula/info"
        downloadEndpoint="/api/eula/download"
        uploadEndpoint="/api/admin/eula/upload"
      />

      <PdfDocumentAdminSection
        title="Privacy Policy"
        fileName="BikerLink-PrivacyPolicy.pdf"
        infoEndpoint="/api/privacy-policy/info"
        downloadEndpoint="/api/privacy-policy/download"
        uploadEndpoint="/api/admin/privacy-policy/upload"
      />

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="construct" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Configurazione Tecnica</Text>
      </View>

      <View style={styles.emailSmtpCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="send" size={20} color="#4285F4" />
            <Text style={styles.synecoLabel}>Email SMTP (Gmail)</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Configurazione Email SMTP",
                "Per inviare email dall'app (verifica email, notifiche) serve un account Gmail configurato.\n\n" +
                "Come configurare:\n" +
                "1. Crea un account Gmail dedicato\n" +
                "2. Vai su myaccount.google.com → Sicurezza\n" +
                "3. Attiva la verifica in due passaggi\n" +
                "4. Vai su 'Password per le app'\n" +
                "5. Crea una nuova password per 'Posta'\n" +
                "6. Inserisci qui l'indirizzo Gmail e la password generata\n\n" +
                "La modifica richiede la password admin per sicurezza."
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: emailConfigData?.configured ? "#4CAF50" : "#F44336",
          }} />
          <Text style={styles.synecoDesc}>
            {emailConfigData?.configured
              ? `Configurato: ${emailConfigData.maskedEmail}`
              : "Non configurato — le email non verranno inviate"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }]}
          onPress={() => setEmailConfigModalVisible(true)}
        >
          <Ionicons name="lock-closed" size={16} color={Colors.background} />
          <Text style={styles.saveBtnText}>Modifica</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={emailConfigModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailConfigModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configura Email SMTP</Text>
            <Text style={styles.modalSubtitle}>Inserisci la password admin per sbloccare la modifica</Text>

            <Text style={styles.modalFieldLabel}>Password Admin</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="La tua password admin"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAdminPass}
              onChangeText={setEmailConfigAdminPass}
              secureTextEntry
            />

            <Text style={styles.modalFieldLabel}>Indirizzo Gmail</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={emailConfigData?.maskedEmail || "esempio@gmail.com"}
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigGmail}
              onChangeText={setEmailConfigGmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalFieldLabel}>Password per le App</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="xxxx xxxx xxxx xxxx"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAppPass}
              onChangeText={setEmailConfigAppPass}
              secureTextEntry
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setEmailConfigModalVisible(false);
                  setEmailConfigAdminPass("");
                  setEmailConfigGmail("");
                  setEmailConfigAppPass("");
                }}
              >
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEmailConfig}
                disabled={isSavingEmailConfig}
              >
                <Text style={styles.saveBtnText}>{isSavingEmailConfig ? "..." : "Salva"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="options" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Parametri</Text>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <>
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Messaggio Splash</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.modeBtn, splashMode === "single" && styles.modeBtnActive]}
                onPress={() => handleSaveSplashMode("single")}
              >
                <Text style={[styles.modeBtnText, splashMode === "single" && styles.modeBtnTextActive]}>Singolo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, splashMode === "cycle" && styles.modeBtnActive]}
                onPress={() => handleSaveSplashMode("cycle")}
              >
                <Text style={[styles.modeBtnText, splashMode === "cycle" && styles.modeBtnTextActive]}>Cicla</Text>
              </TouchableOpacity>
            </View>
            {splashMode === "single" ? (
              editingKey === "splash_message" ? (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Messaggio da mostrare nello splash..."
                    placeholderTextColor={Colors.textSecondary}
                    value={editValue}
                    onChangeText={setEditValue}
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                      <Text style={styles.cancelBtnText}>Annulla</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : "Salva"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[styles.settingValue, { flex: 1 }]}>
                    {getSettingValue("splash_message") || "Messaggio da mostrare nello splash..."}
                  </Text>
                  <TouchableOpacity onPress={() => startEditing("splash_message")}>
                    <Ionicons name="create" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View>
                {splashMessagesList.map((msg, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={msg}
                      onChangeText={(text) => {
                        const updated = [...splashMessagesList];
                        updated[idx] = text;
                        setSplashMessagesList(updated);
                        splashMessagesListRef.current = updated;
                      }}
                      onBlur={() => persistSplashList(splashMessagesListRef.current)}
                      placeholder={`Messaggio ${idx + 1}`}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const updated = splashMessagesList.filter((_, i) => i !== idx);
                        handleSaveSplashList(updated);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.error || "#e74c3c"} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.saveBtn, { alignSelf: "flex-start" as const, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }]}
                  onPress={() => handleSaveSplashList([...splashMessagesList, ""])}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Aggiungi messaggio</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {renderSettingCard(maxPhotosSetting)}
          {renderSettingCard(maxVotesSetting)}
        </>
      )}

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="server-outline" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Sistema</Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="timer-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Uptime Counters</Text>
          </View>
          <Switch
            value={uptimeWidgetEnabled}
            onValueChange={handleUptimeToggle}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={uptimeWidgetEnabled ? Colors.text : Colors.textSecondary}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {uptimeWidgetEnabled
            ? "Pannello fluttuante uptime attivo — visibile solo agli admin"
            : "Pannello fluttuante uptime nascosto"}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="terminal" size={20} color="#00cc66" />
        <Text style={[styles.sectionTitle, { color: "#00cc66" }]}>Sviluppo</Text>
      </View>

    </KeyboardAwareScrollViewCompat>

      <Modal
        visible={!!protectedToggle}
        transparent
        animationType="fade"
        onRequestClose={() => { setProtectedToggle(null); setProtectedPassword(""); }}
      >
        <View style={styles.protectedOverlay}>
          <View style={styles.protectedModal}>
            <Text style={styles.protectedTitle}>Conferma Modifica</Text>
            <Text style={styles.protectedSubtitle}>
              {protectedToggle ? `${protectedToggle.value ? "Attivare" : "Disattivare"} "${protectedToggle.label}"` : ""}
            </Text>
            <Text style={styles.protectedDesc}>Inserisci la password admin per confermare</Text>
            <TextInput
              style={styles.protectedInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={protectedPassword}
              onChangeText={setProtectedPassword}
              autoFocus
            />
            <View style={styles.protectedButtons}>
              <TouchableOpacity
                style={styles.protectedCancel}
                onPress={() => { setProtectedToggle(null); setProtectedPassword(""); }}
              >
                <Text style={styles.protectedCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.protectedConfirm, !protectedPassword && { opacity: 0.5 }]}
                disabled={!protectedPassword || protectedToggleMutation.isPending}
                onPress={() => {
                  if (!protectedToggle) return;
                  protectedToggleMutation.mutate({
                    key: protectedToggle.key,
                    value: protectedToggle.value ? "true" : "false",
                    adminPassword: protectedPassword,
                  });
                }}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.protectedConfirmText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDonationTextPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowDonationTextPasswordModal(false); setDonationTextPassword(""); }}
      >
        <View style={styles.protectedOverlay}>
          <View style={styles.protectedModal}>
            <Text style={styles.protectedTitle}>Conferma Modifica</Text>
            <Text style={styles.protectedSubtitle}>Salvare il testo donazione</Text>
            <Text style={styles.protectedDesc}>Inserisci la password admin per confermare</Text>
            <TextInput
              style={styles.protectedInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={donationTextPassword}
              onChangeText={setDonationTextPassword}
              autoFocus
            />
            <View style={styles.protectedButtons}>
              <TouchableOpacity
                style={styles.protectedCancel}
                onPress={() => { setShowDonationTextPasswordModal(false); setDonationTextPassword(""); }}
              >
                <Text style={styles.protectedCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.protectedConfirm, !donationTextPassword && { opacity: 0.5 }]}
                disabled={!donationTextPassword || protectedToggleMutation.isPending}
                onPress={() => {
                  protectedToggleMutation.mutate(
                    { key: "donation_text", value: donationText, adminPassword: donationTextPassword },
                    {
                      onSuccess: () => {
                        setShowDonationTextPasswordModal(false);
                        setDonationTextPassword("");
                        queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
                        Alert.alert("Successo", "Testo donazione salvato");
                      },
                    },
                  );
                }}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.protectedConfirmText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  synecoCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.syneco,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  triggerBtn: {
    backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, minWidth: 90, alignItems: "center",
  },
  triggerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#000" },
  matchingStatsRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  matchingStatItem: { flex: 1, alignItems: "center" },
  matchingStatValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.warning },
  matchingStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  matchingStatDivider: { width: 1, height: 36, backgroundColor: Colors.border, marginHorizontal: 8 },
  lastCycleBox: {
    marginTop: 12, padding: 10, borderRadius: 8,
    backgroundColor: Colors.warning + "15", borderWidth: 1, borderColor: Colors.warning + "40",
  },
  lastCycleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.warning, marginBottom: 4 },
  lastCycleText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emailVerifCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  settingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: { padding: 4 },
  settingLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceLight },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  modeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" as const,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  modeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modeBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.background },
  providerOption: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  providerOptionActive: { borderColor: Colors.accent, backgroundColor: Colors.surfaceLight },
  providerLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  dropdownButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  dropdownButtonText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  dropdownOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  dropdownMenu: {
    backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden",
    width: "100%", maxWidth: 280, borderWidth: 1, borderColor: Colors.border,
  },
  dropdownMenuItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dropdownMenuItemActive: { backgroundColor: Colors.surfaceLight },
  dropdownMenuItemText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  paypalCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: "#003087",
  },
  emailSmtpCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#4285F4",
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 400,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 20,
  },
  modalFieldLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 12,
  },
  modalInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  protectedOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  protectedModal: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
  },
  protectedTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginBottom: 4,
  },
  protectedSubtitle: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginBottom: 12,
  },
  protectedDesc: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 16,
  },
  protectedInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 14,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  protectedButtons: {
    flexDirection: "row", gap: 12,
  },
  protectedCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  protectedCancelText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary,
  },
  protectedConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.accent,
  },
  protectedConfirmText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background,
  },
  countryChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 6,
  },
  countryChipSelected: {
    borderColor: Colors.warning, backgroundColor: Colors.warning + "22",
  },
  countryChipFlag: {
    fontSize: 14,
  },
  countryChipText: {
    fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary,
  },
  countryChipTextSelected: {
    color: Colors.warning, fontFamily: "Inter_600SemiBold",
  },
});
