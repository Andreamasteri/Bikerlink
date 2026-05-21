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
  RefreshControl,
  Pressable,
  Modal,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTaskbarStyle, type TaskbarStyle } from "@/lib/taskbar-style-context";
import { useUnits } from "@/lib/units-context";
import { convertDistance } from "@/lib/units";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";

import type { ProfileData } from "@/components/profile/types";
import TelemetryPanel from "@/components/profile/TelemetryPanel";
import PhotoGrid from "@/components/profile/PhotoGrid";
import NotificationsPanel from "@/components/profile/NotificationsPanel";
import MatchPrefsPanel from "@/components/profile/MatchPrefsPanel";
import OfflineMapsPanel from "@/components/profile/OfflineMapsPanel";
import ThemePanel from "@/components/profile/ThemePanel";
import UnitsPanel from "@/components/profile/UnitsPanel";
import OtaPanel from "@/components/profile/OtaPanel";
import PrivacyPanel from "@/components/profile/PrivacyPanel";

function getUserTypeColor(userType: string, sex?: string): string {
  if (userType === "coppia") return Colors.coupleIcon;
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
  const { taskbarStyle, setTaskbarStyle } = useTaskbarStyle();
  const { distanceUnit, applyCountryDefault } = useUnits();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);
  const [isDownloadingEula, setIsDownloadingEula] = useState(false);
  const [isDownloadingPrivacy, setIsDownloadingPrivacy] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [localFloatingWidget, setLocalFloatingWidget] = useState<boolean>(true);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [replacingSlot, setReplacingSlot] = useState<string | null>(null);

  const profileQuery = useQuery<ProfileData>({
    queryKey: ["/api/users/me"],
    enabled: !!user,
  });
  const profile = profileQuery.data;

  const { data: adminWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
    enabled: !!user,
  });
  const adminWidgetEnabled = adminWidgetData?.enabled !== false;

  const { data: donationData } = useQuery<{ enabled: boolean; text: string; paypalEmail: string }>({
    queryKey: ["/api/settings/donation"],
  });

  const { data: showSearchPrefData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/show-search-preference"],
  });
  const showSearchPref = showSearchPrefData?.enabled === true;

  const { data: searchPrefLockedData } = useQuery<{ locked: boolean }>({
    queryKey: ["/api/settings/search-preference-locked"],
  });
  const searchPrefLocked = searchPrefLockedData?.locked === true;

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

  const searchPreference = profile?.profile?.searchPreference ?? "both";

  useEffect(() => {
    setFailedPhotos(new Set());
  }, [profileQuery.dataUpdatedAt]);

  useEffect(() => {
    if (profile?.country) applyCountryDefault(profile.country);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.country, applyCountryDefault]);

  useEffect(() => {
    if (profile) setLocalFloatingWidget(profile.floatingWidgetEnabled !== false);
  }, [profile?.floatingWidgetEnabled]);

  const floatingWidgetMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/users/me", { floatingWidgetEnabled: enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => Alert.alert("Errore", error.message),
  });

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }),
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/users/me/cancel-deletion"); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }),
  });

  const searchPreferenceMutation = useMutation({
    mutationFn: async (value: "bikers" | "zavorrine" | "both") => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { searchPreference: value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }),
  });

  const pickImageForSlot = useCallback((existingPhotoId?: string) => {
    showImagePickerMenu(
      async (uri) => {
        if (existingPhotoId) {
          setReplacingSlot(existingPhotoId);
          try { await apiRequest("DELETE", `/api/users/me/photos/${existingPhotoId}`); } catch {}
        }
        uploadPhotoMutation.mutate(uri, { onSettled: () => setReplacingSlot(null) });
      },
      { aspect: [1, 1], quality: 0.8 }
    );
  }, []);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert(t("profile.deletePhoto"), t("profile.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deletePhotoMutation.mutate(photoId) },
    ]);
  }, []);

  const doLogout = () => logoutMutation.mutate(undefined);

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
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadManual") + " ✓");
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", "Impossibile scaricare il manuale. Controlla la connessione."); }
    finally { setIsDownloadingManual(false); }
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
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadEula") + " ✓");
      } else if (result.status === 404) {
        Alert.alert("Info", t("profile.eulaNotAvailable"));
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", t("profile.eulaNotAvailable")); }
    finally { setIsDownloadingEula(false); }
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
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadPrivacyPolicy") + " ✓");
      } else if (result.status === 404) {
        Alert.alert("Info", t("profile.privacyNotAvailable"));
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", t("profile.privacyNotAvailable")); }
    finally { setIsDownloadingPrivacy(false); }
  }, [isDownloadingPrivacy, t]);

  const handleExportUserData = useCallback(async () => {
    if (isExportingData) return;
    setIsExportingData(true);
    try {
      const url = new URL("/api/user/export-data", getApiUrl()).toString();
      const response = await globalThis.fetch(url, { credentials: "include" });
      if (!response.ok) { Alert.alert("Errore", t("profile.exportDataError")); return; }
      const json = await response.text();
      const nickname = profile?.nickname || "user";
      const date = new Date().toISOString().split("T")[0];
      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + `BikerLink-UserData-${nickname}-${date}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/json" });
      else Alert.alert("Export", t("profile.exportUserData") + " ✓");
    } catch { Alert.alert("Errore", t("profile.exportDataError")); }
    finally { setIsExportingData(false); }
  }, [isExportingData, t, profile?.nickname]);

  const handleLogout = useCallback(() => {
    Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmDesc"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.logout"), style: "destructive", onPress: doLogout },
    ]);
  }, []);

  const currentUserType = profile?.userType ?? user?.userType ?? "biker";
  const currentSex = profile?.sex ?? (user as any)?.sex;
  const typeColor = getUserTypeColor(currentUserType, currentSex);
  const isBikerOrCoppia = currentUserType === "biker" || currentUserType === "coppia";
  const isAdmin = profile?.role === "admin" || (user as any)?.role === "admin";

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  const [docsExpanded, setDocsExpanded] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InlineMiniPlayer />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching}
            onRefresh={() => profileQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        {/* ── Profile Header ─────────────────────────────── */}
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
            <ActivityIndicator size="small" color={Colors.accent} style={{ marginTop: 8 }} />
          )}
          <Text style={styles.nickname}>{profile?.nickname ?? user?.nickname ?? ""}</Text>
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

        {/* ── Stats ──────────────────────────────────────── */}
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
                  return value >= 1000 ? `${(value / 1000).toFixed(1)}k ${label}` : `${Math.round(value)} ${label}`;
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

        {/* ── Telemetry ──────────────────────────────────── */}
        {telemetryStats != null && <TelemetryPanel telemetryStats={telemetryStats} />}

        {/* ── Deletion Banner ────────────────────────────── */}
        {profile?.deletionRequestedAt && (
          <View style={styles.deletionBanner}>
            <Ionicons name="warning" size={20} color="#000" />
            <Text style={styles.deletionBannerText}>
              {t("profile.deletionScheduled")} {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}.
            </Text>
            <Pressable style={styles.deletionCancelBtn} onPress={() => cancelDeletionMutation.mutate()}>
              <Text style={styles.deletionCancelBtnText}>{t("profile.cancelDeletion")}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Photos ─────────────────────────────────────── */}
        <PhotoGrid
          photos={profile?.photos}
          failedPhotos={failedPhotos}
          setFailedPhotos={setFailedPhotos}
          replacingSlot={replacingSlot}
          isUploading={uploadPhotoMutation.isPending}
          onPickImage={pickImageForSlot}
          onDeletePhoto={handleDeletePhoto}
        />

        {/* ── Garage ─────────────────────────────────────── */}
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

        {/* ── Search Preference ──────────────────────────── */}
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
                    <Ionicons name={opt.icon} size={20} color={isSelected ? Colors.background : Colors.textSecondary} />
                    <Text style={[styles.searchPrefLabel, isSelected && styles.searchPrefLabelActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Notifications ──────────────────────────────── */}
        <NotificationsPanel
          serverPushEnabled={profile?.profile?.pushNotificationsEnabled}
          serverNotifPrefs={profile?.profile?.notificationPreferences}
        />

        {/* ── Match Preferences ──────────────────────────── */}
        <MatchPrefsPanel />

        {/* ── Offline Maps ───────────────────────────────── */}
        <OfflineMapsPanel />

        {/* ── Visual Theme ───────────────────────────────── */}
        <ThemePanel />

        {/* ── Units ──────────────────────────────────────── */}
        <UnitsPanel />

        {/* ── Privacy & Location ─────────────────────────── */}
        <PrivacyPanel profileData={profile} />

        {/* ── Edit Profile ───────────────────────────────── */}
        <View style={styles.section}>
          <Pressable style={[styles.menuItem, { justifyContent: "space-between" }]} onPress={() => router.push("/profile/edit" as any)}>
            <Text style={[styles.menuLabel, { fontSize: 20 }]}>{t("profile.editProfile")}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* ── Taskbar & Widget ───────────────────────────── */}
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

        {/* ── Donation ───────────────────────────────────── */}
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

        {/* ── Feedback / Admin ───────────────────────────── */}
        <View style={styles.section}>
          <MenuItem icon="bug" label={t("profile.reportBug")} onPress={() => router.push("/feedback/bug" as any)} color={Colors.accentRed} />
          <MenuItem icon="bulb" label={t("profile.requestFeature")} onPress={() => router.push("/feedback/feature" as any)} color={Colors.accent} />
          {isAdmin && (
            <MenuItem icon="shield" label="Pannello Admin" onPress={() => router.push("/admin" as any)} color={Colors.accent} />
          )}
          <OtaPanel isAdmin={isAdmin} />
          {((profile?.role === "moderator" || (user as any)?.role === "moderator") || isAdmin) && (
            <MenuItem icon="eye" label="Pannello Moderatore" onPress={() => router.push("/moderator" as any)} color={Colors.warning} />
          )}
        </View>

        {/* ── Documentation ──────────────────────────────── */}
        <View style={styles.section}>
          <Pressable style={styles.accordionHeader} onPress={() => setDocsExpanded(v => !v)}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.documentation")}</Text>
            <Ionicons name={docsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
          </Pressable>
          {docsExpanded && (
            <>
              <MenuItem icon="document-text" label={isDownloadingManual ? t("profile.downloading") : t("profile.downloadManual")} onPress={handleDownloadManual} color={Colors.accent} />
              <MenuItem icon="shield-checkmark-outline" label={isDownloadingEula ? t("profile.downloading") : t("profile.downloadEula")} onPress={handleDownloadEula} color={Colors.accent} />
              <MenuItem icon="document-text-outline" label={isDownloadingPrivacy ? t("profile.downloading") : t("profile.downloadPrivacyPolicy")} onPress={handleDownloadPrivacyPolicy} color={Colors.accent} />
              <MenuItem icon="cloud-download-outline" label={isExportingData ? t("profile.downloading") : t("profile.exportUserData")} onPress={handleExportUserData} color={Colors.accent} />
            </>
          )}
        </View>

        {/* ── Logout ─────────────────────────────────────── */}
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

        {/* ── Modals ─────────────────────────────────────── */}
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

        {/* ── Version Info ───────────────────────────────── */}
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

const styles = StyleSheet.create({
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
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
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
