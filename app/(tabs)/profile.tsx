import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
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
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { THEMES, THEME_META, ThemeName } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/lib/theme-context";
import { type AppLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT, useLocale } from "@/lib/language-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMapConfig } from "@/lib/map-context";
import { MAP_PROVIDER_LABELS, MAP_PROVIDER_DESCRIPTIONS, type MapProvider } from "@/lib/map-tiles";
import { useTaskbarStyle, type TaskbarStyle } from "@/lib/taskbar-style-context";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== "web") {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
}


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
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const locale = useLocale();
  const { enabled: mapsEnabled, userChoiceEnabled } = useMapConfig();
  const { currentTheme, setTheme, userSwitchingEnabled } = useTheme();
  const { taskbarStyle, setTaskbarStyle } = useTaskbarStyle();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showRevokeConsentModal, setShowRevokeConsentModal] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);
  const [isDownloadingEula, setIsDownloadingEula] = useState(false);
  const [isDownloadingPrivacy, setIsDownloadingPrivacy] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);

  // ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
  // Ciclo 4.0.0 — APK v10 — OTA-10: linea arancione tab Musica a contatto col testo (paddingBottom 0)
  const CURRENT_OTA_NUMBER = 17;

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

      if (Platform.OS === "web") {
        const response = await globalThis.fetch(uri);
        const blob = await response.blob();
        formData.append("photo", blob, filename);
      } else {
        formData.append("photo", { uri, name: filename, type: mimeType } as any);
      }

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

  const mapStyleMutation = useMutation({
    mutationFn: async (value: MapProvider) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { preferredMapStyle: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/request-deletion");
    },
    onSuccess: () => {
      Alert.alert(t("profile.accountScheduledDeletion"));
      logoutMutation.mutate(undefined, {
        onSuccess: () => {
          router.replace("/welcome");
        },
      });
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
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [mapStyleExpanded, setMapStyleExpanded] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
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
    }
  }, [profile?.profile]);

  const repushLocationForPrivacy = useCallback(async () => {
    try {
      if (Platform.OS === "web") return;
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

  const doLogout = async () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        router.replace("/welcome");
      },
    });
  };

  const handleClearCache = useCallback(() => {
    const doClear = async () => {
      try {
        await AsyncStorage.clear();
        queryClient.clear();
        Alert.alert("Cache pulita", "Tutti i dati locali sono stati cancellati. L'app si ricarica.");
      } catch {
        Alert.alert("Errore", "Impossibile pulire la cache.");
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        try { window.localStorage.clear(); } catch {}
        try { window.sessionStorage.clear(); } catch {}
      }
      queryClient.clear();
      Alert.alert("Cache pulita", "Tutti i dati locali sono stati cancellati. Ricarica la pagina.");
    } else {
      Alert.alert("Pulisci cache", "Cancella tutti i dati locali salvati?", [
        { text: "Annulla", style: "cancel" },
        { text: "Pulisci", style: "destructive", onPress: doClear },
      ]);
    }
  }, []);

  const handleRequestDeletion = useCallback(() => {
    requestDeletionMutation.mutate();
  }, []);

  const handleDownloadManual = useCallback(async () => {
    if (isDownloadingManual) return;
    setIsDownloadingManual(true);
    try {
      if (Platform.OS === "web") {
        const url = new URL("/api/manual/download", getApiUrl()).toString();
        Linking.openURL(url);
      } else {
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
          Alert.alert("Errore", "Download non riuscito. Riprova più tardi.");
        }
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
      if (Platform.OS === "web") {
        const url = new URL("/api/eula/download", getApiUrl()).toString();
        Linking.openURL(url);
      } else {
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
          Alert.alert("Errore", "Download non riuscito. Riprova più tardi.");
        }
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
      if (Platform.OS === "web") {
        const url = new URL("/api/privacy-policy/download", getApiUrl()).toString();
        Linking.openURL(url);
      } else {
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
          Alert.alert("Errore", "Download non riuscito. Riprova più tardi.");
        }
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
      if (Platform.OS === "web") {
        const url = new URL("/api/user/export-data", getApiUrl()).toString();
        Linking.openURL(url);
      } else {
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
      }
    } catch (e) {
      console.error("User data export error:", e);
      Alert.alert("Errore", t("profile.exportDataError"));
    } finally {
      setIsExportingData(false);
    }
  }, [isExportingData, t, profile?.nickname]);

  const handleDeleteAccount = useCallback(() => {
    if (Platform.OS === "web") {
      if (confirm(t("profile.deleteAccountDesc"))) {
        handleRequestDeletion();
      }
    } else {
      Alert.alert(
        t("profile.deleteAccount"),
        t("profile.deleteAccountDesc"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: handleRequestDeletion,
          },
        ]
      );
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (Platform.OS === "web") {
      setShowLogoutModal(true);
    } else {
      Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmDesc"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profile.logout"),
          style: "destructive",
          onPress: doLogout,
        },
      ]);
    }
  }, []);

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;
  const isZavorrina = currentUserType === "zavorrina";
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
    <ScrollView
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top, backgroundColor: colors.background },
      ]}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isRefetching}
          onRefresh={() => profileQuery.refetch()}
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
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={{ fontSize: 12, fontWeight: "bold" as const, color: "#FFD700", fontFamily: "Inter_700Bold" }}>Primal</Text>
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
              {totalKm >= 1000 ? `${(totalKm / 1000).toFixed(1)}k` : Math.round(totalKm)}
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

      {profile?.profile?.bio ? (
        <View style={styles.section}>
          <View style={styles.bioCard}>
            <Text style={styles.bioText}>{profile.profile.bio}</Text>
          </View>
        </View>
      ) : null}

      {isZavorrina && (
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
      )}

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

      <View style={styles.section}>
        <Pressable style={styles.accordionHeader} onPress={() => setPrivacyExpanded((v) => !v)}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>La mia privacy - Altera Posizione</Text>
          <Ionicons
            name={privacyExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textSecondary}
          />
        </Pressable>

        {privacyExpanded && (
        <>
        <View style={styles.privacyRow}>
          <View style={styles.privacyRowLeft}>
            <Ionicons name="eye-off-outline" size={20} color={Colors.accent} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyLabel}>Non mostrarmi sulla mappa</Text>
              <Text style={styles.privacyDesc}>
                Il tuo segnaposto non sarà visibile sulla mappa degli altri utenti. Continui comunque ad essere conteggiato come online.
              </Text>
            </View>
          </View>
          <Switch
            value={hideFromMap}
            onValueChange={(val) => {
              setHideFromMap(val);
              privacyMutation.mutate({ hideFromMap: val });
            }}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={hideFromMap ? Colors.text : Colors.textSecondary}
          />
        </View>

        <View style={styles.privacyRow}>
          <View style={styles.privacyRowLeft}>
            <Ionicons name="locate-outline" size={20} color={Colors.accent} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyLabel}>Altera Posizione</Text>
              {positionFuzz && (
                <Text style={styles.privacyWarning}>
                  {"⚠️ Attenzione! Se non volete far sapere precisamente dove siete, potete attivare questa opzione. Ricordatevi di disattivarla prima di un giro in compagnia!!"}
                </Text>
              )}
              {!positionFuzz && (
                <Text style={styles.privacyDesc}>
                  Sposta randomicamente la tua posizione visibile di alcuni km dalla posizione reale.
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={positionFuzz}
            onValueChange={(val) => {
              setPositionFuzz(val);
              privacyMutation.mutate({ positionFuzz: val });
            }}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={positionFuzz ? Colors.text : Colors.textSecondary}
          />
        </View>

        {positionFuzz && (
          <View style={styles.privacyKmRow}>
            <Ionicons name="resize-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
            <Text style={styles.privacyKmLabel}>Raggio d'incertezza:</Text>
            <TextInput
              style={styles.privacyKmInput}
              keyboardType="number-pad"
              value={String(positionFuzzKm)}
              onChangeText={(v) => {
                const n = parseInt(v, 10);
                if (!isNaN(n) && n >= 1 && n <= 50) {
                  setPositionFuzzKm(n);
                  privacyMutation.mutate({ positionFuzzKm: n });
                } else if (v === "" || v === "0") {
                  setPositionFuzzKm(1);
                  privacyMutation.mutate({ positionFuzzKm: 1 });
                }
              }}
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={styles.privacyKmLabel}>km</Text>
            <Text style={[styles.privacyDesc, { marginLeft: 8 }]}>(max 50)</Text>
          </View>
        )}

        <View style={styles.privacyRow}>
          <View style={styles.privacyRowLeft}>
            <Ionicons name="home-outline" size={20} color={Colors.accent} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyLabel}>Fake Home Position</Text>
              <Text style={styles.privacyDesc}>
                Quando sei vicino a casa, la tua posizione visibile viene sostituita con una posizione fittizia.
              </Text>
            </View>
          </View>
          <Switch
            value={fakeHomeEnabled}
            onValueChange={(val) => {
              setFakeHomeEnabled(val);
              privacyMutation.mutate({ fakeHomeEnabled: val });
            }}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={fakeHomeEnabled ? Colors.text : Colors.textSecondary}
          />
        </View>

        {fakeHomeEnabled && (
          <View style={styles.fakeHomeCard}>
            <View style={styles.fakeHomeSection}>
              <Text style={styles.fakeHomeSectionLabel}>Posizione Casa</Text>
              <Text style={styles.fakeHomeCoords}>
                {homeLatitude != null && homeLongitude != null
                  ? `${homeLatitude.toFixed(5)}, ${homeLongitude.toFixed(5)}`
                  : "Non impostata"}
              </Text>
              <View style={styles.fakeHomeBtnRow}>
                <Pressable
                  style={styles.fakeHomeBtn}
                  onPress={() => pickCoordFromGPS("home")}
                >
                  <Ionicons name="locate" size={15} color={Colors.text} />
                  <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable
                    style={styles.fakeHomeBtn}
                    onPress={() => openMapPicker("home")}
                  >
                    <Ionicons name="map-outline" size={15} color={Colors.text} />
                    <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={[styles.fakeHomeSection, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 12, paddingTop: 12 }]}>
              <Text style={styles.fakeHomeSectionLabel}>Posizione Fittizia</Text>
              <Text style={styles.fakeHomeCoords}>
                {fakeHomeLatitude != null && fakeHomeLongitude != null
                  ? `${fakeHomeLatitude.toFixed(5)}, ${fakeHomeLongitude.toFixed(5)}`
                  : "Non impostata"}
              </Text>
              <View style={styles.fakeHomeBtnRow}>
                <Pressable
                  style={styles.fakeHomeBtn}
                  onPress={() => pickCoordFromGPS("fake")}
                >
                  <Ionicons name="locate" size={15} color={Colors.text} />
                  <Text style={styles.fakeHomeBtnLabel}>GPS</Text>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable
                    style={styles.fakeHomeBtn}
                    onPress={() => openMapPicker("fake")}
                  >
                    <Ionicons name="map-outline" size={15} color={Colors.text} />
                    <Text style={styles.fakeHomeBtnLabel}>Mappa</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={[styles.privacyKmRow, { marginTop: 12 }]}>
              <Text style={styles.privacyKmLabel}>Ampiezza raggio attivazione:</Text>
              <TextInput
                style={styles.privacyKmInput}
                keyboardType="number-pad"
                value={String(fakeHomeRadius)}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 100) {
                    setFakeHomeRadius(n);
                    privacyMutation.mutate({ fakeHomeRadius: n });
                  } else if (v === "" || v === "0") {
                    setFakeHomeRadius(1);
                    privacyMutation.mutate({ fakeHomeRadius: 1 });
                  }
                }}
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={styles.privacyKmLabel}>km</Text>
              <Text style={[styles.privacyDesc, { marginLeft: 8 }]}>(max 100)</Text>
            </View>
          </View>
        )}
        </>)}
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
              const isSelected = searchPreference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.searchPrefBtn,
                    isSelected && styles.searchPrefBtnActive,
                  ]}
                  onPress={() => searchPreferenceMutation.mutate(opt.value)}
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

      {mapsEnabled && userChoiceEnabled && (
        <View style={styles.section}>
          <Pressable style={styles.accordionHeader} onPress={() => setMapStyleExpanded(v => !v)}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Stile Mappa</Text>
            <Ionicons name={mapStyleExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
          </Pressable>
          {mapStyleExpanded && (
            <View style={styles.mapStyleCard}>
              {(["esri_gray", "carto_light"] as MapProvider[]).map((p) => {
                const rawStyle = profile?.profile?.preferredMapStyle as MapProvider | null | undefined;
                const currentStyle: MapProvider = (!rawStyle || rawStyle === "carto_dark") ? "carto_light" : rawStyle;
                const isSelected = currentStyle === p;
                return (
                  <Pressable
                    key={p}
                    style={[styles.mapStyleOption, isSelected && styles.mapStyleOptionActive]}
                    onPress={() => mapStyleMutation.mutate(p)}
                    disabled={mapStyleMutation.isPending}
                  >
                    <Ionicons
                      name={p === "carto_dark" ? "moon" : p === "esri_gray" ? "map-outline" : "sunny"}
                      size={20}
                      color={isSelected ? Colors.accent : Colors.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.mapStyleName, isSelected && { color: Colors.accent }]}>
                        {MAP_PROVIDER_LABELS[p]}
                      </Text>
                      <Text style={styles.mapStyleDesc} numberOfLines={2}>
                        {MAP_PROVIDER_DESCRIPTIONS[p]}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { textAlign: "center" }]}>Pulsanti Taskbar</Text>
        <View style={taskbarStyles.row}>
          {([
            { value: "tutti" as TaskbarStyle, label: "Tutti" },
            { value: "scorri" as TaskbarStyle, label: "Scorri" },
            { value: "altro" as TaskbarStyle, label: "Altro..." },
            { value: "raggruppa" as TaskbarStyle, label: "Raggruppa" },
          ]).map((opt) => {
            const isSelected = taskbarStyle === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={taskbarStyles.optionCol}
                onPress={() => setTaskbarStyle(opt.value)}
              >
                <View
                  style={[
                    taskbarStyles.dot,
                    isSelected
                      ? taskbarStyles.dotSelected
                      : taskbarStyles.dotUnselected,
                  ]}
                />
                <Text
                  style={[
                    taskbarStyles.dotLabel,
                    isSelected && { color: Colors.accent },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
        <MenuItem icon="create" label="Modifica Profilo" onPress={() => router.push("/profile/edit" as any)} />
        <MenuItem icon="bug" label="Segnala un Bug" onPress={() => router.push("/feedback/bug" as any)} color={Colors.accentRed} />
        <MenuItem icon="bulb" label="Richiedi Funzione" onPress={() => router.push("/feedback/feature" as any)} color={Colors.accent} />

        {(profile?.role === "admin" || (user as any)?.role === "admin") && (
          <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as any)} color={Colors.accent} />
        )}
        {((profile?.role === "moderator" || (user as any)?.role === "moderator") || (profile?.role === "admin" || (user as any)?.role === "admin")) && (
          <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as any)} color={Colors.warning} />
        )}

      </View>

      <View style={[styles.section, { marginTop: 16 }]}>
        <Pressable
          style={styles.langDropdownTrigger}
          onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
        >
          <Text style={styles.langDropdownFlag}>
            {({ it: "🇮🇹", en: "🇬🇧", de: "🇩🇪", es: "🇪🇸", fr: "🇫🇷" } as Record<string, string>)[language]}
          </Text>
          <Text style={styles.langDropdownLabel}>
            {({ it: "Italiano", en: "English", de: "Deutsch", es: "Español", fr: "Français" } as Record<string, string>)[language]}
          </Text>
          <Ionicons
            name={showLanguageDropdown ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.textSecondary}
          />
        </Pressable>
        {showLanguageDropdown && (
          <View style={styles.langDropdownList}>
            {([
              { code: "it" as AppLanguage, flag: "🇮🇹", label: "Italiano" },
              { code: "en" as AppLanguage, flag: "🇬🇧", label: "English" },
              { code: "de" as AppLanguage, flag: "🇩🇪", label: "Deutsch" },
              { code: "es" as AppLanguage, flag: "🇪🇸", label: "Español" },
              { code: "fr" as AppLanguage, flag: "🇫🇷", label: "Français" },
            ]).map((lang) => {
              const isActive = language === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  style={[styles.langDropdownItem, isActive && styles.langDropdownItemActive]}
                  onPress={() => {
                    setLanguage(lang.code);
                    setShowLanguageDropdown(false);
                  }}
                >
                  <Text style={styles.langDropdownItemFlag}>{lang.flag}</Text>
                  <Text style={[styles.langDropdownItemLabel, isActive && styles.langDropdownItemLabelActive]}>
                    {lang.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={20} color={Colors.accent} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <MenuItem icon="shield-checkmark-outline" label={t("profile.revokeConsent")} onPress={() => setShowRevokeConsentModal(true)} color={Colors.accentRed} />
        <MenuItem icon="trash-outline" label={t("profile.deleteAccount")} onPress={handleDeleteAccount} color={Colors.accentRed} />
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

      <Modal visible={showRevokeConsentModal} transparent animationType="fade" onRequestClose={() => setShowRevokeConsentModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRevokeConsentModal(false)}>
          <View style={[styles.modalContent, { maxHeight: "80%" }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={Colors.accentRed} />
            <Text style={[styles.modalTitle, { fontSize: 16, fontWeight: "700", marginBottom: 8 }]}>{t("profile.revokeConsentTitle")}</Text>
            <Text style={[styles.modalTitle, { fontSize: 13, fontWeight: "400", lineHeight: 20, textAlign: "left" }]}>{t("profile.revokeConsentDesc")}</Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setShowRevokeConsentModal(false)}>
                <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable style={styles.modalBtnConfirm} onPress={() => { setShowRevokeConsentModal(false); handleRequestDeletion(); }}>
                <Text style={styles.modalBtnConfirmText}>{t("common.confirm")}</Text>
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
          {Platform.OS !== "web" && MapView ? (
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: mapPickerCoord.latitude,
                longitude: mapPickerCoord.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              onPress={(e: any) => setMapPickerCoord(e.nativeEvent.coordinate)}
            >
              {Marker && (
                <Marker coordinate={mapPickerCoord} />
              )}
            </MapView>
          ) : (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ color: Colors.textSecondary }}>Mappa non disponibile su web</Text>
            </View>
          )}
          <View style={{ padding: 12, paddingBottom: insets.bottom + 8, backgroundColor: Colors.card }}>
            <Text style={{ textAlign: "center", color: Colors.textSecondary, fontSize: 13 }}>
              Tocca sulla mappa per spostare il pin
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
            {`v${Constants.expoConfig?.android?.versionCode ?? "?"}`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Text style={styles.versionLabel}>Versione OTA</Text>
          <Text style={styles.versionValue}>{CURRENT_OTA_NUMBER === 0 ? "APK embed (rv4.0.0)" : `OTA-${CURRENT_OTA_NUMBER}`}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Text style={styles.versionLabel}>Commit EAS</Text>
          <Text style={styles.versionValue}>
            {Updates.updateId ? Updates.updateId.substring(0, 8) : "embedded"}
          </Text>
        </View>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileHeader: {
    alignItems: "center",
    padding: 24,
    paddingTop: 12,
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
    marginTop: 8,
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
    paddingVertical: 6,
    paddingHorizontal: 16,
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
  bioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 8,
  },
  optionCol: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  dotSelected: {
    backgroundColor: Colors.accent,
  },
  dotUnselected: {
    backgroundColor: "transparent",
  },
  dotLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
