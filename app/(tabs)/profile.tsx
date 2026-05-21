import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,

  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Pressable,
  Modal,
  Linking,
  Switch,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { THEMES, THEME_META, ThemeName } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMapConfig } from "@/lib/map-context";
import { useTaskbarStyle, type TaskbarStyle } from "@/lib/taskbar-style-context";
import { useUnits, type TimeFormat, type SpeedUnit, type DistanceUnit } from "@/lib/units-context";
import { convertDistance } from "@/lib/units";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Location from "expo-location";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";
import { PUSH_NOTIFICATIONS_ENABLED_KEY } from "@/lib/push-prefs";
import { MATCH_PREF_ITEMS, DEFAULT_MATCH_PREFS, type MatchPrefsPayload } from "@/lib/match-pref-items";
import { loadIndex, deleteAllOfflineTiles, deleteTilesForRoute, type OfflineTilesIndex } from "@/lib/offline-tiles";
import { useIdealLapRecorder } from "@/hooks/useIdealLapRecorder";

// ─── IdealLapSlot ─────────────────────────────────────────────────────────────
type LapSlotProps = {
  index: number;
  onSaved: () => void;
};

function IdealLapSlot({ index, onSaved }: LapSlotProps) {
  const { lapState, sampleCount, saving, start, stop, save } = useIdealLapRecorder(index);

  const handleSave = async () => {
    try {
      await save();
      onSaved();
    } catch {
      Alert.alert("Errore", "Impossibile salvare il giro. Riprova.");
    }
  };

  const statusLabel =
    lapState === "recording"
      ? `● ${sampleCount} camp.`
      : lapState === "ready_to_save"
      ? `${sampleCount} camp. pronti`
      : lapState === "saved"
      ? "✓ Salvato"
      : "";

  const statusColor =
    lapState === "recording"
      ? "#e74c3c"
      : lapState === "ready_to_save"
      ? Colors.accent
      : lapState === "saved"
      ? "#27ae60"
      : Colors.textSecondary;

  const isRecording = lapState === "recording";
  const isReadyToSave = lapState === "ready_to_save";

  return (
    <View style={lapSlotStyles.container}>
      <View style={lapSlotStyles.header}>
        <Text style={lapSlotStyles.title}>Giro {index + 1}</Text>
        {statusLabel ? (
          <Text style={[lapSlotStyles.status, { color: statusColor }]}>{statusLabel}</Text>
        ) : null}
      </View>
      <View style={lapSlotStyles.buttons}>
        <TouchableOpacity
          style={[lapSlotStyles.btn, (isRecording || isReadyToSave) && lapSlotStyles.btnDisabled]}
          onPress={start}
          disabled={isRecording || isReadyToSave}
        >
          <Ionicons name="play" size={12} color={isRecording || isReadyToSave ? Colors.textSecondary : "#fff"} />
          <Text style={[lapSlotStyles.btnText, (isRecording || isReadyToSave) && lapSlotStyles.btnTextDisabled]}>
            Start
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[lapSlotStyles.btn, lapSlotStyles.btnStop, !isRecording && lapSlotStyles.btnDisabled]}
          onPress={stop}
          disabled={!isRecording}
        >
          <Ionicons name="stop" size={12} color={isRecording ? "#fff" : Colors.textSecondary} />
          <Text style={[lapSlotStyles.btnText, !isRecording && lapSlotStyles.btnTextDisabled]}>Stop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[lapSlotStyles.btn, lapSlotStyles.btnSave, !isReadyToSave && lapSlotStyles.btnDisabled]}
          onPress={handleSave}
          disabled={!isReadyToSave || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={12} color={isReadyToSave ? "#fff" : Colors.textSecondary} />
          )}
          <Text style={[lapSlotStyles.btnText, !isReadyToSave && lapSlotStyles.btnTextDisabled]}>Salva</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const lapSlotStyles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  status: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  buttons: {
    flexDirection: "row",
    gap: 6,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingVertical: 6,
  },
  btnStop: {
    backgroundColor: "#e74c3c",
  },
  btnSave: {
    backgroundColor: "#27ae60",
  },
  btnDisabled: {
    backgroundColor: Colors.border,
  },
  btnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  btnTextDisabled: {
    color: Colors.textSecondary,
  },
});

interface ProfileData {
  id: string;
  nickname: string;
  email: string;
  phone?: string;
  userType: string;
  sex?: string;
  coupleSexConfig?: string;
  birthYear?: number;
  region?: string;
  country?: string;
  avatarUrl?: string;
  role: string;
  status: string;
  isPrimal?: boolean;
  floatingWidgetEnabled?: boolean;
  deletionRequestedAt?: string;
  profile?: {
    isAvailable: boolean;
    bio?: string;
    totalKm: number;
    totalRides: number;
    easterEggsCollected: number;
    maxPickupDistance?: number;
    searchPreference?: string;
    preferredMapStyle?: string | null;
    hideFromMap?: boolean;
    positionFuzz?: boolean;
    positionFuzzKm?: number;
    fakeHomeEnabled?: boolean;
    homeLatitude?: number | null;
    homeLongitude?: number | null;
    fakeHomeLatitude?: number | null;
    fakeHomeLongitude?: number | null;
    fakeHomeRadius?: number;
    notificationPreferences?: {
      matches?: boolean;
      zoneProposals?: boolean;
      chat?: boolean;
      motoclub?: boolean;
      eventi?: boolean;
    } | null;
    pushNotificationsEnabled?: boolean;
  };
  photos?: Array<{
    id: string;
    photoUrl: string;
    sortOrder: number;
    isApproved: boolean;
  }>;
  motorcycles?: Array<{
    id: string;
    brand: string;
    model: string;
    year?: number;
    displacement?: number;
    motorcycleType?: string;
    ridingStyle?: string;
    photoUrl?: string;
  }>;
}

function getUserTypeColor(userType: string, sex?: string, coupleSexConfig?: string): string {
  if (userType === "coppia") {
    return Colors.coupleIcon;
  }
  if (sex === "M") return Colors.maleIcon;
  if (sex === "F") return Colors.femaleIcon;
  if (userType === "zavorrina") return Colors.femaleIcon;
  return Colors.maleIcon;
}

function getUserTypeIcon(userType: string): keyof typeof Ionicons.glyphMap {
  if (userType === "coppia") return "people";
  if (userType === "zavorrina") return "person";
  return "bicycle";
}


export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, logoutMutation } = useAuth();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const { enabled: mapsEnabled } = useMapConfig();
  const { currentTheme, setTheme, userSwitchingEnabled } = useTheme();
  const { taskbarStyle, setTaskbarStyle } = useTaskbarStyle();
  const { timeFormat, speedUnit, distanceUnit, setTimeFormat, setSpeedUnit, setDistanceUnit, applyCountryDefault } = useUnits();
  const [unitsExpanded, setUnitsExpanded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);
  const [isDownloadingEula, setIsDownloadingEula] = useState(false);
  const [isDownloadingPrivacy, setIsDownloadingPrivacy] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [localFloatingWidget, setLocalFloatingWidget] = useState<boolean>(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState<boolean>(true);
  const [pushTogglePending, setPushTogglePending] = useState<boolean>(false);

  useEffect(() => {
    // Seed local state from AsyncStorage immediately for instant UI,
    // then override with the authoritative server value once the profile loads.
    AsyncStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY).then((val) => {
      setPushNotificationsEnabled(val === null ? true : val === "true");
    }).catch(() => {});
  }, []);

  const togglePushNotifications = useCallback(async (next: boolean) => {
    setPushTogglePending(true);
    setPushNotificationsEnabled(next);
    const getMessage = (e: unknown): string =>
      e instanceof Error ? e.message : typeof e === "string" ? e : "Operazione non riuscita";
    try {
      await AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, next ? "true" : "false");
      // Persist master toggle server-side so it survives reinstalls
      await apiRequest("PUT", "/api/users/profile/dynamic", { pushNotificationsEnabled: next });
      if (next) {
        const Notifications = require("expo-notifications");
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          Alert.alert(
            "Permesso richiesto",
            "Abilita le notifiche dalle impostazioni del telefono per ricevere gli avvisi di match.",
          );
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData?.data;
        if (!token) {
          throw new Error("Impossibile ottenere il token di notifica");
        }
        await apiRequest("PUT", "/api/users/me/push-token", { token });
      } else {
        await apiRequest("PUT", "/api/users/me/push-token", { token: null });
      }
    } catch (e: unknown) {
      Alert.alert("Errore", getMessage(e));
      setPushNotificationsEnabled(!next);
      try {
        await AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, !next ? "true" : "false");
      } catch {}
    } finally {
      setPushTogglePending(false);
    }
  }, []);

  const { data: allSettingsData } = useQuery<{ unitsPrefEnabled?: boolean }>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
    retry: false,
  });

  const { data: adminWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
    enabled: !!user,
  });
  const adminWidgetEnabled = adminWidgetData?.enabled !== false;

  const floatingWidgetMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/users/me", { floatingWidgetEnabled: enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const unitsPrefEnabled = allSettingsData?.unitsPrefEnabled === true;

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });

  const profile = profileQuery.data;
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());

  // Clear failed photo state when query is refetched so transient errors don't persist
  useEffect(() => {
    setFailedPhotos(new Set());
  }, [profileQuery.dataUpdatedAt]);

  // Sync master push toggle from server (survives reinstalls — server is authoritative)
  const profilePushEnabled = profile?.profile?.pushNotificationsEnabled;
  useEffect(() => {
    if (profilePushEnabled !== undefined) {
      setPushNotificationsEnabled(profilePushEnabled);
      AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, profilePushEnabled ? "true" : "false").catch(() => {});
    }
  }, [profilePushEnabled]);

  // Apply country-based unit defaults (only once, only if no stored preference)
  useEffect(() => {
    if (profile?.country) {
      applyCountryDefault(profile.country);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.country, applyCountryDefault]);

  useEffect(() => {
    if (profile) {
      setLocalFloatingWidget(profile.floatingWidgetEnabled !== false);
    }
  }, [profile?.floatingWidgetEnabled]);

  const currentUserType = profile?.userType ?? user?.userType ?? "biker";
  const currentSex = profile?.sex ?? (user as any)?.sex;
  const currentCoupleSexConfig = profile?.coupleSexConfig ?? (user as any)?.coupleSexConfig;
  const typeColor = getUserTypeColor(currentUserType, currentSex, currentCoupleSexConfig);

  const uploadPhotoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "photo.jpg";
      const ext = /\.(\w+)$/.exec(filename);
      const mimeType = ext ? `image/${ext[1]}` : "image/jpeg";

      formData.append("photo", { uri, name: filename, type: mimeType } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/users/me/photos", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.message) msg = parsed.message;
      } catch {}
      Alert.alert("Errore caricamento foto", msg);
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/users/me/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const { data: showSearchPrefData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/show-search-preference"],
  });
  const showSearchPref = showSearchPrefData?.enabled === true;

  const { data: searchPrefLockedData } = useQuery<{ locked: boolean }>({
    queryKey: ["/api/settings/search-preference-locked"],
  });
  const searchPrefLocked = searchPrefLockedData?.locked === true;

  const { data: matchPrefGateData, refetch: refetchMatchPrefGate } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/match-preferences/gate"],
    staleTime: 120_000,
    enabled: !!user,
  });
  const matchPrefGateVisible = matchPrefGateData?.visible === true;

  useFocusEffect(
    useCallback(() => {
      if (user) refetchMatchPrefGate();
    }, [user, refetchMatchPrefGate])
  );

  const { data: matchPrefsData } = useQuery<{ preferences: MatchPrefsPayload }>({
    queryKey: ["/api/match-preferences"],
    staleTime: 120_000,
    enabled: !!user && matchPrefGateVisible,
  });
  const matchPrefs = matchPrefsData?.preferences ?? DEFAULT_MATCH_PREFS;

  const [matchPrefsExpanded, setMatchPrefsExpanded] = useState(false);
  const [notifPrefsExpanded, setNotifPrefsExpanded] = useState(false);

  const saveMatchPrefMutation = useMutation({
    mutationFn: async (updates: Partial<MatchPrefsPayload>) => {
      const res = await apiRequest("PUT", "/api/match-preferences", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match-preferences"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const toggleMatchPref = (key: keyof MatchPrefsPayload, value: boolean) => {
    saveMatchPrefMutation.mutate({ [key]: value });
  };

  const [notifPrefs, setNotifPrefs] = useState<{
    matches: boolean;
    zoneProposals: boolean;
    chat: boolean;
    motoclub: boolean;
    eventi: boolean;
  }>({
    matches: true,
    zoneProposals: true,
    chat: true,
    motoclub: true,
    eventi: true,
  });

  // Seed per-category toggles from server on load (survives reinstalls — server is authoritative)
  const serverNotifPrefs = profile?.profile?.notificationPreferences;
  useEffect(() => {
    if (serverNotifPrefs != null) {
      setNotifPrefs({
        matches: serverNotifPrefs.matches ?? true,
        zoneProposals: serverNotifPrefs.zoneProposals ?? true,
        chat: serverNotifPrefs.chat ?? true,
        motoclub: serverNotifPrefs.motoclub ?? true,
        eventi: serverNotifPrefs.eventi ?? true,
      });
    }
  }, [serverNotifPrefs]);

  const notifPrefsMutation = useMutation({
    mutationFn: async (updates: Partial<{ matches: boolean; zoneProposals: boolean; chat: boolean; motoclub: boolean; eventi: boolean }>) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { notificationPreferences: updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const toggleNotifPref = (key: "matches" | "zoneProposals" | "chat" | "motoclub" | "eventi", value: boolean) => {
    const previous = notifPrefs;
    setNotifPrefs(prev => ({ ...prev, [key]: value }));
    notifPrefsMutation.mutate({ [key]: value }, { onError: () => setNotifPrefs(previous) });
  };

  const { data: donationData } = useQuery<{ enabled: boolean; text: string; paypalEmail: string }>({
    queryKey: ["/api/settings/donation"],
  });


  const searchPreference = profile?.profile?.searchPreference ?? "both";

  const searchPreferenceMutation = useMutation({
    mutationFn: async (value: "bikers" | "zavorrine" | "both") => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { searchPreference: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/cancel-deletion");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const [hideFromMap, setHideFromMap] = useState(false);
  const [positionFuzz, setPositionFuzz] = useState(false);
  const [positionFuzzKm, setPositionFuzzKm] = useState(1);
  const [fakeHomeEnabled, setFakeHomeEnabled] = useState(false);
  const [homeLatitude, setHomeLatitude] = useState<number | null>(null);
  const [homeLongitude, setHomeLongitude] = useState<number | null>(null);
  const [fakeHomeLatitude, setFakeHomeLatitude] = useState<number | null>(null);
  const [fakeHomeLongitude, setFakeHomeLongitude] = useState<number | null>(null);
  const [fakeHomeRadius, setFakeHomeRadius] = useState(2);
  const [gpsPrecision, setGpsPrecision] = useState("balanced");
  const [gpsPrecisionExpanded, setGpsPrecisionExpanded] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [offlineMapsExpanded, setOfflineMapsExpanded] = useState(false);
  const [offlineMapsIndex, setOfflineMapsIndex] = useState<OfflineTilesIndex>({});
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [idealLapResetKey, setIdealLapResetKey] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedLaps, setSelectedLaps] = useState<string[]>([]);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<"home" | "fake" | null>(null);
  const [mapPickerCoord, setMapPickerCoord] = useState<{ latitude: number; longitude: number }>({ latitude: 41.9, longitude: 12.5 });

  useEffect(() => {
    if (profile?.profile) {
      setHideFromMap(profile.profile.hideFromMap ?? false);
      setPositionFuzz(profile.profile.positionFuzz ?? false);
      setPositionFuzzKm(profile.profile.positionFuzzKm ?? 1);
      setFakeHomeEnabled(profile.profile.fakeHomeEnabled ?? false);
      setHomeLatitude(profile.profile.homeLatitude ?? null);
      setHomeLongitude(profile.profile.homeLongitude ?? null);
      setFakeHomeLatitude(profile.profile.fakeHomeLatitude ?? null);
      setFakeHomeLongitude(profile.profile.fakeHomeLongitude ?? null);
      setFakeHomeRadius(profile.profile.fakeHomeRadius ?? 2);
      setGpsPrecision(profile.profile.gpsPrecision ?? "balanced");
    }
  }, [profile?.profile]);

  const repushLocationForPrivacy = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (loc) {
        await apiRequest("PUT", "/api/users/location", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch {
    }
  }, []);

  const privacyMutation = useMutation({
    mutationFn: async (data: {
      hideFromMap?: boolean;
      positionFuzz?: boolean;
      positionFuzzKm?: number;
      fakeHomeEnabled?: boolean;
      homeLatitude?: number | null;
      homeLongitude?: number | null;
      fakeHomeLatitude?: number | null;
      fakeHomeLongitude?: number | null;
      fakeHomeRadius?: number;
      gpsPrecision?: string;
    }) => {
      await apiRequest("PUT", "/api/users/me/privacy", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      if (variables.positionFuzz === true || variables.fakeHomeEnabled === true) {
        repushLocationForPrivacy();
      }
    },
    onError: (_err, variables) => {
      if (variables.hideFromMap !== undefined) setHideFromMap(!variables.hideFromMap);
      if (variables.positionFuzz !== undefined) setPositionFuzz(!variables.positionFuzz);
      if (variables.fakeHomeEnabled !== undefined) setFakeHomeEnabled(!variables.fakeHomeEnabled);
      Alert.alert("Errore", "Errore nel salvataggio delle impostazioni privacy. Riprova.");
    },
  });

  const [replacingSlot, setReplacingSlot] = useState<string | null>(null);

  const pickImageForSlot = useCallback((existingPhotoId?: string) => {
    showImagePickerMenu(
      async (uri) => {
        if (existingPhotoId) {
          setReplacingSlot(existingPhotoId);
          try {
            await apiRequest("DELETE", `/api/users/me/photos/${existingPhotoId}`);
          } catch {}
        }
        uploadPhotoMutation.mutate(uri, {
          onSettled: () => setReplacingSlot(null),
        });
      },
      { aspect: [1, 1], quality: 0.8 }
    );
  }, []);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert(t("profile.deletePhoto"), t("profile.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deletePhotoMutation.mutate(photoId),
      },
    ]);
  }, []);

  const doLogout = () => {
    logoutMutation.mutate(undefined);
  };

  const handleClearCache = useCallback(() => {
    const doClear = async () => {
      try {
        await AsyncStorage.clear();
        queryClient.clear();
        Alert.alert(t("profile.cacheClearedTitle"), t("profile.cacheClearedMsg"));
      } catch {
        Alert.alert(t("common.error"), t("profile.cacheError"));
      }
    };
    Alert.alert(t("profile.clearCacheTitle"), t("profile.clearCacheMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.clearCacheConfirm"), style: "destructive", onPress: doClear },
    ]);
  }, []);

  const handleDownloadManual = useCallback(async () => {
    if (isDownloadingManual) return;
    setIsDownloadingManual(true);
    try {
      const url = new URL("/api/manual/download", getApiUrl()).toString();
        const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-Manual.pdf";
        const result = await FileSystem.downloadAsync(url, fileUri);
        if (result.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
          } else {
            Alert.alert("Download", t("profile.downloadManual") + " ✓");
          }
        } else {
          Alert.alert(t("common.error"), t("profile.downloadFailed"));
        }
    } catch (e) {
      console.error("Manual download error:", e);
      Alert.alert("Errore", "Impossibile scaricare il manuale. Controlla la connessione.");
    } finally {
      setIsDownloadingManual(false);
    }
  }, [isDownloadingManual, t]);

  const handleDownloadEula = useCallback(async () => {
    if (isDownloadingEula) return;
    setIsDownloadingEula(true);
    try {
      const url = new URL("/api/eula/download", getApiUrl()).toString();
        const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-EULA.pdf";
        const result = await FileSystem.downloadAsync(url, fileUri);
        if (result.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
          } else {
            Alert.alert("Download", t("profile.downloadEula") + " ✓");
          }
        } else if (result.status === 404) {
          Alert.alert("Info", t("profile.eulaNotAvailable"));
        } else {
          Alert.alert(t("common.error"), t("profile.downloadFailed"));
        }
    } catch (e) {
      console.error("EULA download error:", e);
      Alert.alert("Errore", t("profile.eulaNotAvailable"));
    } finally {
      setIsDownloadingEula(false);
    }
  }, [isDownloadingEula, t]);

  const handleDownloadPrivacyPolicy = useCallback(async () => {
    if (isDownloadingPrivacy) return;
    setIsDownloadingPrivacy(true);
    try {
      const url = new URL("/api/privacy-policy/download", getApiUrl()).toString();
        const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-PrivacyPolicy.pdf";
        const result = await FileSystem.downloadAsync(url, fileUri);
        if (result.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
          } else {
            Alert.alert("Download", t("profile.downloadPrivacyPolicy") + " ✓");
          }
        } else if (result.status === 404) {
          Alert.alert("Info", t("profile.privacyNotAvailable"));
        } else {
          Alert.alert(t("common.error"), t("profile.downloadFailed"));
        }
    } catch (e) {
      console.error("Privacy Policy download error:", e);
      Alert.alert("Errore", t("profile.privacyNotAvailable"));
    } finally {
      setIsDownloadingPrivacy(false);
    }
  }, [isDownloadingPrivacy, t]);

  const handleExportUserData = useCallback(async () => {
    if (isExportingData) return;
    setIsExportingData(true);
    try {
      const url = new URL("/api/user/export-data", getApiUrl()).toString();
        const response = await globalThis.fetch(url, { credentials: "include" });
        if (!response.ok) {
          Alert.alert("Errore", t("profile.exportDataError"));
          return;
        }
        const json = await response.text();
        const nickname = profile?.nickname || "user";
        const date = new Date().toISOString().split("T")[0];
        const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + `BikerLink-UserData-${nickname}-${date}.json`;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: "application/json" });
        } else {
          Alert.alert("Export", t("profile.exportUserData") + " ✓");
        }
    } catch (e) {
      console.error("User data export error:", e);
      Alert.alert("Errore", t("profile.exportDataError"));
    } finally {
      setIsExportingData(false);
    }
  }, [isExportingData, t, profile?.nickname]);

  const handleLogout = useCallback(() => {
    Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmDesc"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.logout"),
        style: "destructive",
        onPress: doLogout,
      },
    ]);
  }, []);

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;

  const { data: telemetryStats } = useQuery<{
    km_collected: number;
    sample_count: number;
    session_count: number;
    progress_pct: number;
    target_km: number;
    track_km: number;
  }>({
    queryKey: ["/api/telemetry/stats"],
    enabled: !!user,
    staleTime: 60_000,
  });

  type IdealLap = {
    sessionId: string;
    startedAt: string;
    sampleCount: number;
    maxSpeedKmh: number | null;
    maxLeanDeg: number | null;
    maxGforce: number | null;
    lapNumber: number;
  };

  const { data: idealLapsData } = useQuery<{ laps: IdealLap[] }>({
    queryKey: ["/api/telemetry/ideal-laps"],
    enabled: !!user && telemetryExpanded,
    staleTime: 30_000,
  });

  const isAdmin = profile?.role === "admin" || (user as any)?.role === "admin";

  // Task #1886: OTA pending-approval polling (solo admin, ogni 30s)
  interface PendingOtaRelease {
    id: string;
    version: string;
    runtime_version: string | null;
    status: string;
    slot: string | null;
    published_at: string | null;
  }
  const { data: pendingOtaData, refetch: refetchPendingOta } = useQuery<PendingOtaRelease[]>({
    queryKey: ["/api/admin/ota/pending"],
    enabled: isAdmin,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const pendingOtaReleases = pendingOtaData ?? [];
  const [approvingOtaId, setApprovingOtaId] = useState<string | null>(null);

  const handleApproveOta = useCallback(async (releaseId: string, version: string) => {
    Alert.alert(
      "Approva OTA",
      `Distribuisci la versione ${version} a tutti gli utenti?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Sì, distribuisci",
          style: "default",
          onPress: async () => {
            setApprovingOtaId(releaseId);
            try {
              await apiRequest("POST", `/api/admin/ota/${releaseId}/approve`);
              await refetchPendingOta();
              Alert.alert("✓ Approvata", `OTA ${version} ora in distribuzione su slot stable.`);
            } catch (err: unknown) {
              Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile approvare la release.");
            } finally {
              setApprovingOtaId(null);
            }
          },
        },
      ],
    );
  }, [refetchPendingOta]);

  const isBikerOrCoppia = currentUserType === "biker" || currentUserType === "coppia";

  const pickCoordFromGPS = async (target: "home" | "fake") => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Concedi l'accesso alla posizione nelle impostazioni dell'app.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      if (target === "home") {
        setHomeLatitude(lat);
        setHomeLongitude(lng);
        privacyMutation.mutate({ homeLatitude: lat, homeLongitude: lng });
      } else {
        setFakeHomeLatitude(lat);
        setFakeHomeLongitude(lng);
        privacyMutation.mutate({ fakeHomeLatitude: lat, fakeHomeLongitude: lng });
      }
    } catch (err) {
      Alert.alert("Errore GPS", "Impossibile ottenere la posizione attuale. Riprova.");
    }
  };

  const openMapPicker = (target: "home" | "fake") => {
    setMapPickerTarget(target);
    if (target === "home" && homeLatitude != null && homeLongitude != null) {
      setMapPickerCoord({ latitude: homeLatitude, longitude: homeLongitude });
    } else if (target === "fake" && fakeHomeLatitude != null && fakeHomeLongitude != null) {
      setMapPickerCoord({ latitude: fakeHomeLatitude, longitude: fakeHomeLongitude });
    } else {
      setMapPickerCoord({ latitude: 41.9, longitude: 12.5 });
    }
    setMapPickerVisible(true);
  };

  const confirmMapPicker = () => {
    if (mapPickerTarget === "home") {
      setHomeLatitude(mapPickerCoord.latitude);
      setHomeLongitude(mapPickerCoord.longitude);
      privacyMutation.mutate({ homeLatitude: mapPickerCoord.latitude, homeLongitude: mapPickerCoord.longitude });
    } else if (mapPickerTarget === "fake") {
      setFakeHomeLatitude(mapPickerCoord.latitude);
      setFakeHomeLongitude(mapPickerCoord.longitude);
      privacyMutation.mutate({ fakeHomeLatitude: mapPickerCoord.latitude, fakeHomeLongitude: mapPickerCoord.longitude });
    }
    setMapPickerVisible(false);
  };

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InlineMiniPlayer />
      <ScrollView
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching}
            onRefresh={() => { profileQuery.refetch(); refetchMatchPrefGate(); }}
            tintColor={colors.accent}
          />
      }
    >
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={() => pickImageForSlot()} activeOpacity={0.8}>
          <View style={[styles.avatar, { borderColor: typeColor }]}>
            {avatarSource ? (
              <Image source={avatarSource} style={styles.avatarImage} />
            ) : (
              <Ionicons name={getUserTypeIcon(currentUserType)} size={48} color={typeColor} />
            )}
          </View>
        </TouchableOpacity>
        {uploadPhotoMutation.isPending && (
          <ActivityIndicator
            size="small"
            color={Colors.accent}
            style={{ marginTop: 8 }}
          />
        )}
        <Text style={styles.nickname}>
          {profile?.nickname ?? user?.nickname ?? ""}
        </Text>
        {profile?.isPrimal === true && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <Ionicons name="star" size={14} color="#FF3B30" />
            <Text style={{ fontSize: 12, fontWeight: "bold" as const, color: "#FF3B30", fontFamily: "Inter_700Bold" }}>Primal</Text>
          </View>
        )}
        {(!!profile?.region || !!profile?.country) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>
              {[
                profile?.region || null,
                profile?.country ? `${getCountryFlag(profile.country)} ${getCountryName(profile.country)}` : null,
              ].filter(Boolean).join(", ")}
            </Text>
          </View>
        )}
        {!!profile?.profile?.bio && (
          <Text style={{ fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, marginBottom: 4, paddingHorizontal: 16 }}>
            {profile.profile.bio}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalRides}</Text>
            <Text style={styles.statLabel}>{t("profile.rides")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {(() => {
                const { value, label } = convertDistance(totalKm, distanceUnit);
                return value >= 1000
                  ? `${(value / 1000).toFixed(1)}k ${label}`
                  : `${Math.round(value)} ${label}`;
              })()}
            </Text>
            <Text style={styles.statLabel}>{t("profile.totalKm")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{easterEggs}</Text>
            <Text style={styles.statLabel}>{t("profile.easterEggs")}</Text>
          </View>
        </View>
      </View>

      {telemetryStats != null && (
        <View style={styles.section}>
          <View style={styles.telemetryCard}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setTelemetryExpanded((v) => !v)}
              style={styles.telemetryHeader}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="speedometer-outline" size={16} color={Colors.accent} />
                <Text style={styles.telemetryTitle}>Telemetria raccolta</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.telemetryPct}>{telemetryStats.progress_pct}%</Text>
                <Ionicons
                  name={telemetryExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
            <View style={styles.telemetryBarBg}>
              <View
                style={[
                  styles.telemetryBarFill,
                  { width: (`${Math.max(0, Math.min(100, telemetryStats.progress_pct))}%`) as `${number}%` },
                ]}
              />
            </View>
            <View style={styles.telemetryFooter}>
              <Text style={styles.telemetryKm}>
                {telemetryStats.km_collected.toFixed(1)} km
                <Text style={styles.telemetryTarget}> / {telemetryStats.target_km} km</Text>
              </Text>
              <Text style={styles.telemetrySessions}>
                {telemetryStats.session_count} {telemetryStats.session_count === 1 ? "sessione" : "sessioni"}
              </Text>
            </View>
            {telemetryStats.track_km > 0 && (
              <View style={styles.trackKmRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Ionicons name="flag-outline" size={13} color="#e67e22" />
                  <Text style={styles.trackKmLabel}>Km in pista</Text>
                </View>
                <Text style={styles.trackKmValue}>{telemetryStats.track_km.toFixed(1)} km</Text>
              </View>
            )}
            {telemetryExpanded && (
              <View style={styles.telemetryExpanded}>
                <View style={styles.telemetryExpandedHeader}>
                  <Text style={styles.telemetryExpandedTitle}>Giri Ideali</Text>
                  <TouchableOpacity
                    style={styles.telemetryResetBtn}
                    onPress={() => {
                      Alert.alert(
                        "Azzera telemetria",
                        "Sei sicuro di voler cancellare tutti i km raccolti verso il target 1000 km? I Giri Ideali salvati non verranno eliminati.",
                        [
                          { text: "Annulla", style: "cancel" },
                          {
                            text: "Azzera",
                            style: "destructive",
                            onPress: async () => {
                              try {
                                await apiRequest("DELETE", "/api/telemetry/reset");
                                queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
                                setIdealLapResetKey((k) => k + 1);
                              } catch {
                                Alert.alert("Errore", "Impossibile azzerare la telemetria.");
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                    <Text style={styles.telemetryResetBtnText}>Reset km</Text>
                  </TouchableOpacity>
                </View>
                {[0, 1, 2, 3].map((i) => (
                  <IdealLapSlot
                    key={`${idealLapResetKey}-${i}`}
                    index={i}
                    onSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
                    }}
                  />
                ))}

                {/* ── Giri Salvati ───────────────────────────────────── */}
                {idealLapsData && idealLapsData.laps.length > 0 && (
                  <View style={styles.savedLapsSection}>
                    <View style={styles.savedLapsHeader}>
                      <Text style={styles.savedLapsTitle}>
                        Giri Salvati ({idealLapsData.laps.length})
                      </Text>
                      <TouchableOpacity
                        style={[styles.compareModeBtn, compareMode && styles.compareModeBtnActive]}
                        onPress={() => {
                          setCompareMode((v) => !v);
                          setSelectedLaps([]);
                        }}
                      >
                        <Ionicons
                          name="git-compare-outline"
                          size={12}
                          color={compareMode ? "#fff" : Colors.accent}
                        />
                        <Text style={[styles.compareModeBtnText, compareMode && styles.compareModeBtnTextActive]}>
                          {compareMode ? "Fine" : "Confronta"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {compareMode && selectedLaps.length === 2 && (() => {
                      const lapA = idealLapsData.laps.find((l) => l.sessionId === selectedLaps[0]);
                      const lapB = idealLapsData.laps.find((l) => l.sessionId === selectedLaps[1]);
                      if (!lapA || !lapB) return null;
                      const better = (a: number | null, b: number | null) => {
                        if (a == null && b == null) return null;
                        if (a == null) return "b";
                        if (b == null) return "a";
                        return a > b ? "a" : a < b ? "b" : "tie";
                      };
                      const speedWinner = better(lapA.maxSpeedKmh, lapB.maxSpeedKmh);
                      const leanWinner = better(lapA.maxLeanDeg, lapB.maxLeanDeg);
                      const gWinner = better(lapA.maxGforce, lapB.maxGforce);
                      const statRow = (
                        label: string,
                        aVal: string,
                        bVal: string,
                        winner: string | null
                      ) => (
                        <View style={styles.compareRow} key={label}>
                          <Text style={[styles.compareCell, winner === "a" && styles.compareCellWinner]}>{aVal}</Text>
                          <Text style={styles.compareLabel}>{label}</Text>
                          <Text style={[styles.compareCell, styles.compareCellRight, winner === "b" && styles.compareCellWinner]}>{bVal}</Text>
                        </View>
                      );
                      return (
                        <View style={styles.comparePanel}>
                          <View style={styles.compareHeaderRow}>
                            <Text style={styles.compareHeaderCell}>Giro {lapA.lapNumber}</Text>
                            <Text style={styles.compareHeaderMid}>VS</Text>
                            <Text style={[styles.compareHeaderCell, styles.compareHeaderRight]}>Giro {lapB.lapNumber}</Text>
                          </View>
                          {statRow(
                            "Vel. max",
                            lapA.maxSpeedKmh != null ? `${lapA.maxSpeedKmh} km/h` : "—",
                            lapB.maxSpeedKmh != null ? `${lapB.maxSpeedKmh} km/h` : "—",
                            speedWinner
                          )}
                          {statRow(
                            "Piega max",
                            lapA.maxLeanDeg != null ? `${lapA.maxLeanDeg}°` : "—",
                            lapB.maxLeanDeg != null ? `${lapB.maxLeanDeg}°` : "—",
                            leanWinner
                          )}
                          {statRow(
                            "G-force max",
                            lapA.maxGforce != null ? `${lapA.maxGforce} g` : "—",
                            lapB.maxGforce != null ? `${lapB.maxGforce} g` : "—",
                            gWinner
                          )}
                          {statRow(
                            "Campioni",
                            String(lapA.sampleCount),
                            String(lapB.sampleCount),
                            null
                          )}
                        </View>
                      );
                    })()}

                    {compareMode && selectedLaps.length < 2 && (
                      <Text style={styles.compareHint}>
                        {selectedLaps.length === 0 ? "Seleziona 2 giri per confrontarli" : "Seleziona un altro giro"}
                      </Text>
                    )}

                    {idealLapsData.laps.map((lap) => {
                      const isSelected = selectedLaps.includes(lap.sessionId);
                      const date = new Date(lap.startedAt);
                      const dateStr = date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
                      const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <TouchableOpacity
                          key={lap.sessionId}
                          style={[styles.savedLapCard, isSelected && styles.savedLapCardSelected]}
                          activeOpacity={compareMode ? 0.7 : 1}
                          onPress={compareMode ? () => {
                            setSelectedLaps((prev) => {
                              if (prev.includes(lap.sessionId)) return prev.filter((id) => id !== lap.sessionId);
                              if (prev.length >= 2) return [prev[1], lap.sessionId];
                              return [...prev, lap.sessionId];
                            });
                          } : undefined}
                          onLongPress={!compareMode ? () => {
                            Alert.alert(
                              `Elimina Giro ${lap.lapNumber}`,
                              "Vuoi eliminare questo giro ideale salvato?",
                              [
                                { text: "Annulla", style: "cancel" },
                                {
                                  text: "Elimina",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await apiRequest("DELETE", `/api/telemetry/ideal-laps/${encodeURIComponent(lap.sessionId)}`);
                                      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
                                    } catch {
                                      Alert.alert("Errore", "Impossibile eliminare il giro.");
                                    }
                                  },
                                },
                              ]
                            );
                          } : undefined}
                        >
                          <View style={styles.savedLapCardLeft}>
                            {compareMode && (
                              <View style={[styles.lapCheckbox, isSelected && styles.lapCheckboxSelected]}>
                                {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                              </View>
                            )}
                            <View>
                              <Text style={styles.savedLapNum}>Giro {lap.lapNumber}</Text>
                              <Text style={styles.savedLapDate}>{dateStr} {timeStr}</Text>
                            </View>
                          </View>
                          <View style={styles.savedLapStats}>
                            <View style={styles.savedLapStatItem}>
                              <Ionicons name="speedometer-outline" size={11} color={Colors.accent} />
                              <Text style={styles.savedLapStatVal}>
                                {lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh}` : "—"}
                              </Text>
                              <Text style={styles.savedLapStatUnit}>km/h</Text>
                            </View>
                            <View style={styles.savedLapStatItem}>
                              <MaterialCommunityIcons name="rotate-3d-variant" size={11} color="#f39c12" />
                              <Text style={styles.savedLapStatVal}>
                                {lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}
                              </Text>
                            </View>
                            <View style={styles.savedLapStatItem}>
                              <MaterialCommunityIcons name="gauge" size={11} color="#9b59b6" />
                              <Text style={styles.savedLapStatVal}>
                                {lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}
                              </Text>
                            </View>
                            <Text style={styles.savedLapSamples}>{lap.sampleCount} c.</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {profile?.deletionRequestedAt && (
        <View style={styles.deletionBanner}>
          <Ionicons name="warning" size={20} color="#000" />
          <Text style={styles.deletionBannerText}>
            {t("profile.deletionScheduled")} {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}.
          </Text>
          <Pressable
            style={styles.deletionCancelBtn}
            onPress={() => cancelDeletionMutation.mutate()}
          >
            <Text style={styles.deletionCancelBtnText}>{t("profile.cancelDeletion")}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("profile.photos")}</Text>
          </View>
          <View style={styles.photoGrid}>
            {[0, 1, 2].map((slotIndex) => {
              const photo = profile?.photos?.[slotIndex];
              const isUploading = uploadPhotoMutation.isPending && !photo;
              const isReplacing = photo && replacingSlot === photo.id;
              if (photo) {
                const photoUri = photo.photoUrl.startsWith("http")
                  ? photo.photoUrl
                  : `${getApiUrl()}${photo.photoUrl}`;
                return (
                  <View key={photo.id} style={styles.photoItem}>
                    {failedPhotos.has(photo.id) ? (
                      <View style={styles.photoBroken}>
                        <Ionicons name="image-outline" size={28} color={Colors.textSecondary} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: photoUri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                        onError={() => setFailedPhotos(prev => new Set(prev).add(photo.id))}
                      />
                    )}
                    {isReplacing && (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.photoActions}>
                      <TouchableOpacity
                        style={styles.photoActionBtn}
                        onPress={() => pickImageForSlot(photo.id)}
                      >
                        <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoActionBtn, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                        onPress={() => handleDeletePhoto(photo.id)}
                      >
                        <Ionicons name="trash" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                    {!photo.isApproved && (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>In attesa</Text>
                      </View>
                    )}
                    <View style={styles.slotLabel}>
                      <Text style={styles.slotLabelText}>Foto {slotIndex + 1}</Text>
                    </View>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={`empty-${slotIndex}`}
                  style={styles.addPhotoSlot}
                  onPress={() => pickImageForSlot()}
                  activeOpacity={0.7}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="add" size={28} color={Colors.textSecondary} />
                      <Text style={styles.addPhotoText}>Foto {slotIndex + 1}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      <View style={styles.section}>
        <Pressable style={styles.garageCard} onPress={() => router.push("/garage" as any)}>
          {isBikerOrCoppia ? (
            <MaterialCommunityIcons name="motorbike" size={36} color={Colors.accent} />
          ) : (
            <Ionicons name="heart" size={36} color={Colors.accent} />
          )}
          <Text style={styles.garageCardLabel}>
            {isBikerOrCoppia ? "Il Mio Garage" : "La Mia Wishlist"}
          </Text>
        </Pressable>
      </View>


      {currentUserType === "biker" && showSearchPref && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ricerca Match con ...</Text>
          <View style={styles.searchPrefRow}>
            {([
              { value: "bikers" as const, label: "Solo Biker", icon: "bicycle" as keyof typeof Ionicons.glyphMap },
              { value: "zavorrine" as const, label: "Solo Zavorrine", icon: "person" as keyof typeof Ionicons.glyphMap },
              { value: "both" as const, label: "Entrambi", icon: "people" as keyof typeof Ionicons.glyphMap },
            ]).map((opt) => {
              const effectivePreference = searchPrefLocked ? "both" : searchPreference;
              const isSelected = effectivePreference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.searchPrefBtn,
                    isSelected && styles.searchPrefBtnActive,
                    searchPrefLocked && { opacity: opt.value === "both" ? 1 : 0.4 },
                  ]}
                  onPress={() => !searchPrefLocked && searchPreferenceMutation.mutate(opt.value)}
                  disabled={searchPrefLocked}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={isSelected ? Colors.background : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.searchPrefLabel,
                      isSelected && styles.searchPrefLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Pressable style={styles.accordionHeader} onPress={() => setNotifPrefsExpanded(v => !v)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="notifications-outline" size={20} color={Colors.accent} />
            <Text style={[styles.sectionTitle, { marginBottom: 0, color: Colors.text }]}>Notifiche</Text>
          </View>
          <Ionicons name={notifPrefsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {notifPrefsExpanded && (
          <View style={{ paddingTop: 8, gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 10,
                borderBottomWidth: 1.5,
                borderBottomColor: Colors.accent + "40",
                marginBottom: 6,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
                <Ionicons name="notifications" size={18} color={Colors.accent} style={{ marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                  Abilita notifiche push
                </Text>
              </View>
              <Switch
                testID="push-notifications-toggle"
                value={pushNotificationsEnabled}
                onValueChange={togglePushNotifications}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
                disabled={pushTogglePending}
              />
            </View>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
              Scegli quali notifiche push vuoi ricevere. Le notifiche disattivate non ti arriveranno sul telefono.
            </Text>
            {([
              { key: "matches" as const, label: "Match (nuovi abbinamenti)" },
              { key: "zoneProposals" as const, label: "Proposte nella tua zona" },
              { key: "chat" as const, label: "Messaggi in chat" },
              { key: "motoclub" as const, label: "MotoClub (inviti e aggiornamenti)" },
              { key: "eventi" as const, label: "Eventi in programma" },
            ]).map((item) => (
              <View
                key={item.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                }}
              >
                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, marginRight: 12 }}>
                  {item.label}
                </Text>
                <Switch
                  value={notifPrefs[item.key]}
                  onValueChange={(val) => toggleNotifPref(item.key, val)}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#fff"
                  disabled={notifPrefsMutation.isPending}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {matchPrefGateVisible && (
        <View style={styles.section}>
          <Pressable style={styles.accordionHeader} onPress={() => setMatchPrefsExpanded(v => !v)}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Preferenze Matching</Text>
            <Ionicons name={matchPrefsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
          </Pressable>
          {matchPrefsExpanded && (
            <View style={{ paddingTop: 8, gap: 2 }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
                Scegli i criteri con cui vuoi essere abbinato/a. Disabilitando un tipo di match non comparirai nei risultati di quella categoria.
              </Text>
              {MATCH_PREF_ITEMS.map((item) => (
                <View
                  key={item.key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.border,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, marginRight: 12 }}>
                    {item.label}
                  </Text>
                  <Switch
                    value={matchPrefs[item.key]}
                    onValueChange={(val) => toggleMatchPref(item.key, val)}
                    trackColor={{ false: Colors.border, true: Colors.accent }}
                    thumbColor="#fff"
                    disabled={saveMatchPrefMutation.isPending}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      )}


      <View style={styles.section}>
        <Pressable
          style={styles.accordionHeader}
          onPress={async () => {
            const next = !offlineMapsExpanded;
            setOfflineMapsExpanded(next);
            if (next) {
              const idx = await loadIndex();
              setOfflineMapsIndex(idx);
            }
          }}
        >
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Mappe offline</Text>
          <Ionicons name={offlineMapsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {offlineMapsExpanded && (
          <View style={{ paddingTop: 12, gap: 10 }}>
            {Object.keys(offlineMapsIndex).length === 0 ? (
              <View style={{ paddingVertical: 8, alignItems: "center", gap: 6 }}>
                <Ionicons name="cloud-offline-outline" size={28} color={Colors.textSecondary} />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" }}>
                  Nessun percorso salvato offline
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", opacity: 0.7 }}>
                  Apri un giro pianificato e tocca "Scarica mappa offline"
                </Text>
              </View>
            ) : (
              <>
                {Object.values(offlineMapsIndex).map((entry) => (
                  <View
                    key={entry.routeId}
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, gap: 10 }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent + "22", justifyContent: "center", alignItems: "center" }}>
                      <Ionicons name="cloud-done-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text }} numberOfLines={1}>
                        {entry.title}
                      </Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                        {(entry.bytesEstimated / 1_000_000).toFixed(1)} MB · {entry.tileCount} tile
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={10}
                      onPress={() =>
                        Alert.alert(
                          "Elimina mappa",
                          `Rimuovere la mappa offline per "${entry.title}"?`,
                          [
                            { text: "Annulla", style: "cancel" },
                            {
                              text: "Elimina",
                              style: "destructive",
                              onPress: async () => {
                                await deleteTilesForRoute(entry.routeId);
                                const updated = await loadIndex();
                                setOfflineMapsIndex(updated);
                              },
                            },
                          ]
                        )
                      }
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
                    </Pressable>
                  </View>
                ))}

                {Object.keys(offlineMapsIndex).length > 1 && (
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.accentRed + "18", borderRadius: 10, paddingVertical: 10 }}
                    onPress={() =>
                      Alert.alert(
                        "Elimina tutto",
                        "Eliminare tutte le mappe offline scaricate?",
                        [
                          { text: "Annulla", style: "cancel" },
                          {
                            text: "Elimina tutto",
                            style: "destructive",
                            onPress: async () => {
                              await deleteAllOfflineTiles();
                              setOfflineMapsIndex({});
                            },
                          },
                        ]
                      )
                    }
                  >
                    <Ionicons name="trash-bin-outline" size={16} color={Colors.accentRed} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accentRed }}>
                      Elimina tutto ({Object.keys(offlineMapsIndex).length} mappe)
                    </Text>
                  </Pressable>
                )}

                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", opacity: 0.7 }}>
                  Totale:{" "}
                  {(
                    Object.values(offlineMapsIndex).reduce((sum, e) => sum + e.bytesEstimated, 0) /
                    1_000_000
                  ).toFixed(1)}{" "}
                  MB
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {userSwitchingEnabled && (
        <View style={styles.section}>
          <Pressable style={styles.accordionHeader} onPress={() => setThemeExpanded(v => !v)}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Stile Visivo</Text>
            <Ionicons name={themeExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
          </Pressable>
          {themeExpanded && (
            <View style={{ paddingTop: 12, gap: 8 }}>
              {(["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).map((name) => {
                const theme = THEMES[name];
                const meta = THEME_META[name];
                const isActive = currentTheme === name;
                return (
                  <Pressable
                    key={name}
                    style={[
                      styles.mapStyleOption,
                      isActive && styles.mapStyleOptionActive,
                    ]}
                    onPress={() => setTheme(name)}
                  >
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: Colors.border }} />
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.accent, borderWidth: 1, borderColor: Colors.border }} />
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: Colors.border }} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.mapStyleName, isActive && { color: Colors.accent }]}>{meta.label}</Text>
                      <Text style={styles.mapStyleDesc} numberOfLines={1}>{meta.description}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {unitsPrefEnabled && (
      <View style={styles.section}>
        <Pressable style={styles.accordionHeader} onPress={() => setUnitsExpanded(v => !v)}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.unitsPreferences")}</Text>
          <Ionicons name={unitsExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
        </Pressable>
        {unitsExpanded && (
          <View style={{ paddingTop: 12, gap: 16 }}>
            <View>
              <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>Formato orario</Text>
              <View style={{ gap: 8 }}>
                {([
                  { value: "24h" as TimeFormat, label: "24 ore", desc: "es. 14:30" },
                  { value: "12h" as TimeFormat, label: "12 ore (AM/PM)", desc: "es. 2:30 PM" },
                ] as { value: TimeFormat; label: string; desc: string }[]).map((opt) => {
                  const isSelected = timeFormat === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                      onPress={() => setTimeFormat(opt.value)}
                    >
                      <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                        {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                        <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>{t("profile.speed")}</Text>
              <View style={{ gap: 8 }}>
                {([
                  { value: "kmh" as SpeedUnit, label: "km/h", desc: "Chilometri all'ora" },
                  { value: "mph" as SpeedUnit, label: "mph", desc: "Miglia all'ora" },
                  { value: "knots" as SpeedUnit, label: "nodi (kn)", desc: "Miglia nautiche all'ora" },
                ] as { value: SpeedUnit; label: string; desc: string }[]).map((opt) => {
                  const isSelected = speedUnit === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                      onPress={() => setSpeedUnit(opt.value)}
                    >
                      <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                        {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                        <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.unitsGroupLabel, { color: colors.textSecondary }]}>Distanza</Text>
              <View style={{ gap: 8 }}>
                {([
                  { value: "km_m" as DistanceUnit, label: "km / m", desc: "Chilometri e metri" },
                  { value: "mi_ft" as DistanceUnit, label: "mi / ft", desc: "Miglia e piedi" },
                  { value: "mi_yd" as DistanceUnit, label: "mi / yd", desc: "Miglia e iarde" },
                  { value: "nmi_ftm" as DistanceUnit, label: "nmi / ftm", desc: "Miglia nautiche e braccia" },
                ] as { value: DistanceUnit; label: string; desc: string }[]).map((opt) => {
                  const isSelected = distanceUnit === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.unitsOption, isSelected && { backgroundColor: colors.accent + "14", borderColor: colors.accent }]}
                      onPress={() => setDistanceUnit(opt.value)}
                    >
                      <View style={[styles.unitsRadio, { borderColor: isSelected ? colors.accent : colors.border }]}>
                        {isSelected && <View style={[styles.unitsRadioDot, { backgroundColor: colors.accent }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.unitsOptionLabel, isSelected && { color: colors.accent }]}>{opt.label}</Text>
                        <Text style={[styles.unitsOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </View>
      )}


      <View style={styles.section}>
        <Pressable
          style={[styles.menuItem, { justifyContent: "space-between" }]}
          onPress={() => router.push("/profile/edit" as any)}
        >
          <Text style={[styles.menuLabel, { fontSize: 20 }]}>{t("profile.editProfile")}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>


      <View style={styles.section}>
        <View style={taskbarStyles.inlineRow}>
          <Text style={taskbarStyles.inlineLabel}>Taskbar</Text>
          <View style={taskbarStyles.inlinePills}>
            {([
              { value: "raggruppa" as TaskbarStyle, label: "Raggruppa" },
              { value: "scorri" as TaskbarStyle, label: "Scorri" },
            ]).map((opt) => {
              const isSelected = taskbarStyle === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[taskbarStyles.pill, isSelected && taskbarStyles.pillSelected]}
                  onPress={() => setTaskbarStyle(opt.value)}
                >
                  <Text style={[taskbarStyles.pillLabel, isSelected && { color: Colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {adminWidgetEnabled && (
          <View style={taskbarStyles.inlineRow}>
            <Text style={taskbarStyles.inlineLabel}>Widget</Text>
            <Switch
              value={localFloatingWidget}
              onValueChange={(val) => {
                setLocalFloatingWidget(val);
                floatingWidgetMutation.mutate(val);
              }}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
        )}
      </View>

      {donationData?.enabled && !!donationData?.paypalEmail && (
        <View style={styles.donationSection}>
          <Image
            source={require("@/assets/images/support-banner.png")}
            style={styles.supportBannerImage}
            resizeMode="cover"
          />
          <Text style={styles.donationTitle}>{t("profile.supportTitle")}</Text>
          <Text selectable style={styles.supportEmail}>{donationData.paypalEmail}</Text>
        </View>
      )}

      <View style={styles.section}>
        <MenuItem icon="bug" label={t("profile.reportBug")} onPress={() => router.push("/feedback/bug" as any)} color={Colors.accentRed} />
        <MenuItem icon="bulb" label={t("profile.requestFeature")} onPress={() => router.push("/feedback/feature" as any)} color={Colors.accent} />

        {isAdmin && (
          <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as any)} color={Colors.accent} />
        )}

        {/* Task #1886: OTA approval widget — visibile solo all'admin quando ci sono release pending */}
        {isAdmin && pendingOtaReleases.length > 0 && (
          <View style={styles.otaApprovalWidget}>
            <View style={styles.otaApprovalHeader}>
              <Ionicons name="cloud-upload-outline" size={18} color="#FF9500" />
              <Text style={styles.otaApprovalTitle}>
                {pendingOtaReleases.length === 1 ? "1 OTA in attesa" : `${pendingOtaReleases.length} OTA in attesa`}
              </Text>
            </View>
            {pendingOtaReleases.map((rel) => (
              <View key={rel.id} style={styles.otaApprovalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.otaApprovalVersion}>v{rel.version}</Text>
                  {rel.runtime_version ? (
                    <Text style={styles.otaApprovalMeta}>rv {rel.runtime_version}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.otaApprovalBtn, approvingOtaId === rel.id && { opacity: 0.6 }]}
                  onPress={() => handleApproveOta(rel.id, rel.version)}
                  disabled={approvingOtaId !== null}
                >
                  {approvingOtaId === rel.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.otaApprovalBtnText}>Distribuisci</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {((profile?.role === "moderator" || (user as any)?.role === "moderator") || (profile?.role === "admin" || (user as any)?.role === "admin")) && (
          <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as any)} color={Colors.warning} />
        )}

      </View>

      <View style={styles.section}>
        <Pressable style={styles.accordionHeader} onPress={() => setDocsExpanded(v => !v)}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.documentation")}</Text>
          <Ionicons name={docsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {docsExpanded && (
          <>
            <MenuItem
              icon="document-text"
              label={isDownloadingManual ? t("profile.downloading") : t("profile.downloadManual")}
              onPress={handleDownloadManual}
              color={Colors.accent}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label={isDownloadingEula ? t("profile.downloading") : t("profile.downloadEula")}
              onPress={handleDownloadEula}
              color={Colors.accent}
            />
            <MenuItem
              icon="document-text-outline"
              label={isDownloadingPrivacy ? t("profile.downloading") : t("profile.downloadPrivacyPolicy")}
              onPress={handleDownloadPrivacyPolicy}
              color={Colors.accent}
            />
            <MenuItem
              icon="cloud-download-outline"
              label={isExportingData ? t("profile.downloading") : t("profile.exportUserData")}
              onPress={handleExportUserData}
              color={Colors.accent}
            />
          </>
        )}
      </View>

      <View style={[styles.section, { marginTop: 32, gap: 10 }]}>
        <Pressable style={styles.clearCacheBtn} onPress={handleClearCache}>
          <Ionicons name="trash-bin-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.clearCacheBtnText}>Cancella cache locale</Text>
        </Pressable>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out" size={22} color="#fff" />
          <Text style={styles.logoutBtnText}>{t("auth.logout")}</Text>
        </Pressable>
      </View>

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}>
          <View style={styles.modalContent}>
            <Ionicons name="log-out" size={32} color={Colors.accentRed} />
            <Text style={styles.modalTitle}>{t("profile.logoutConfirmDesc")}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable style={styles.modalBtnConfirm} onPress={() => { setShowLogoutModal(false); doLogout(); }}>
                <Text style={styles.modalBtnConfirmText}>{t("profile.logout")}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={mapPickerVisible} transparent={false} animationType="slide" onRequestClose={() => setMapPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, paddingTop: insets.top + 8, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <Pressable onPress={() => setMapPickerVisible(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: Colors.text }}>
              {mapPickerTarget === "home" ? "Posizione Casa" : "Posizione Fittizia"}
            </Text>
            <Pressable
              onPress={confirmMapPicker}
              style={{ backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Conferma</Text>
            </Pressable>
          </View>
          <LeafletPickerMap
            initialLat={mapPickerCoord.latitude}
            initialLng={mapPickerCoord.longitude}
            initialZoom={12}
            selectedCoord={{ lat: mapPickerCoord.latitude, lng: mapPickerCoord.longitude }}
            onCoordPicked={(coord) => setMapPickerCoord(coord)}
          />
          <View style={{ padding: 12, paddingBottom: insets.bottom + 8, backgroundColor: Colors.card }}>
            <Text style={{ textAlign: "center", color: Colors.textSecondary, fontSize: 13 }}>
              {t("profile.tapToMovePin")}
            </Text>
            <Text style={{ textAlign: "center", color: Colors.text, fontSize: 13, marginTop: 4 }}>
              {`${mapPickerCoord.latitude.toFixed(5)}, ${mapPickerCoord.longitude.toFixed(5)}`}
            </Text>
          </View>
        </View>
      </Modal>

      <View style={{ alignItems: "center", marginTop: 16, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Text style={styles.versionLabel}>Versione app</Text>
          <Text style={styles.versionValue}>
            {(`v${Application.nativeBuildVersion ?? "?"}  ${Constants.expoConfig?.version ?? ""}`).trim()}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Text style={styles.versionLabel}>Versione OTA</Text>
          <Text style={styles.versionValue}>{CURRENT_OTA_NUMBER === 0 ? "APK embed (rv5.0.0)" : `OTA-${CURRENT_OTA_NUMBER}`}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Text style={styles.versionLabel}>Commit EAS</Text>
          <Text style={styles.versionValue}>
            {Updates.updateId ? Updates.updateId.substring(0, 8) : "embedded"}
          </Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", color: "#FF6600" }}>
          Beta
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={Colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const screenWidth = Dimensions.get("window").width;
const photoSize = (screenWidth - 32 - 16) / 3;

const styles = StyleSheet.create({
  // Task #1886: OTA approval widget styles
  otaApprovalWidget: {
    marginHorizontal: 0,
    marginVertical: 8,
    backgroundColor: "rgba(255,149,0,0.10)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,149,0,0.35)",
    padding: 12,
    gap: 8,
  },
  otaApprovalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  otaApprovalTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9500",
  },
  otaApprovalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  otaApprovalVersion: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  otaApprovalMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  otaApprovalBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: "center",
  },
  otaApprovalBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  // end OTA approval widget styles
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileHeader: {
    alignItems: "center",
    padding: 16,
    paddingTop: 6,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  nickname: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 12,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  garageCard: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    paddingVertical: 4,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  garageCardLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  telemetryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "33",
  },
  telemetryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  telemetryPct: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  telemetryBarBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  telemetryBarFill: {
    height: 6,
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  telemetryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryKm: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  telemetryTarget: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  telemetrySessions: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  telemetryExpanded: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    gap: 10,
  },
  telemetryExpandedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryExpandedTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  telemetryResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e74c3c44",
    backgroundColor: "#e74c3c11",
  },
  trackKmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  trackKmLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#e67e22",
  },
  trackKmValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#e67e22",
  },
  telemetryResetBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#e74c3c",
  },
  savedLapsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    gap: 8,
  },
  savedLapsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  savedLapsTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  compareModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  compareModeBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  compareModeBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  compareModeBtnTextActive: {
    color: "#fff",
  },
  compareHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 4,
  },
  comparePanel: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  compareHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  compareHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  compareHeaderMid: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    marginHorizontal: 4,
  },
  compareHeaderRight: {
    textAlign: "right",
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  compareCell: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  compareCellRight: {
    textAlign: "right",
  },
  compareCellWinner: {
    color: "#27ae60",
  },
  compareLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginHorizontal: 6,
    textAlign: "center",
    minWidth: 60,
  },
  savedLapCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedLapCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "11",
  },
  savedLapCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lapCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  lapCheckboxSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  savedLapNum: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  savedLapDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  savedLapStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  savedLapStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  savedLapStatVal: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  savedLapStatUnit: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  savedLapSamples: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  bioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bioText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  emptySection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    fontSize: 14,
  },
  emptySubtext: {
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    fontSize: 12,
  },
  motoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  motoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  motoInfo: {
    flex: 1,
  },
  motoName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  motoDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  motoDetail: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  motoTag: {
    backgroundColor: Colors.accent + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  motoTagText: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  motoRidingStyle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
    fontStyle: "italic" as const,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoItem: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoBroken: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 6,
  },
  photoActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  slotLabelText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
  },
  photoDeleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 4,
    alignItems: "center",
  },
  pendingText: {
    fontSize: 10,
    color: Colors.warning,
    fontFamily: "Inter_600SemiBold",
  },
  addPhotoSlot: {
    width: photoSize,
    height: photoSize,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
    gap: 10,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    textAlign: "right",
  },
  versionLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  versionValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  privacyRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    marginRight: 12,
  },
  privacyLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  privacyDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  privacyWarning: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#F59E0B",
    lineHeight: 17,
  },
  privacyKmRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  privacyKmLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginRight: 6,
  },
  privacyKmInput: {
    minWidth: 64,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginRight: 6,
    paddingVertical: 0,
  },
  fakeHomeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeSection: {
    gap: 6,
  },
  fakeHomeSectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fakeHomeCoords: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    opacity: 0.7,
  },
  fakeHomeBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  fakeHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeHomeBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  mapStyleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mapStyleOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mapStyleOptionActive: {
    backgroundColor: Colors.accent + "14",
  },
  mapStyleName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  mapStyleDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  searchPrefRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchPrefBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  searchPrefBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  searchPrefLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  searchPrefLabelActive: {
    color: Colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: 300,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: Colors.accentRed,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  deletionBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.warning,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  deletionBannerText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#000",
    textAlign: "center",
  },
  deletionCancelBtn: {
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  deletionCancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  donationSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
  },
  supportBannerImage: {
    width: "100%",
    height: 80,
  },
  donationTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  supportEmail: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  langDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  langDropdownFlag: {
    fontSize: 22,
  },
  langDropdownLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  langDropdownList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  langDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  langDropdownItemActive: {
    backgroundColor: Colors.accent + "12",
  },
  langDropdownItemFlag: {
    fontSize: 20,
  },
  langDropdownItemLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  langDropdownItemLabelActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  unitsGroupLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  unitsOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitsRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  unitsRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unitsOptionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 1,
  },
  unitsOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  clearCacheBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearCacheBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accentRed,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  logoutBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

const taskbarStyles = StyleSheet.create({
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  inlineLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  inlinePills: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  pillSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "14",
  },
  pillLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
