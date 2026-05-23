import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useTaskbarStyle } from "@/lib/taskbar-style-context";
import { useUnits } from "@/lib/units-context";

import type { ProfileData } from "@/components/profile/types";
import TelemetryPanel from "@/components/profile/TelemetryPanel";
import PhotoGrid from "@/components/profile/PhotoGrid";
import NotificationsPanel from "@/components/profile/NotificationsPanel";
import MatchPrefsPanel from "@/components/profile/MatchPrefsPanel";
import OfflineMapsPanel from "@/components/profile/OfflineMapsPanel";
import ThemePanel from "@/components/profile/ThemePanel";
import UnitsPanel from "@/components/profile/UnitsPanel";
import PrivacyPanel from "@/components/profile/PrivacyPanel";

// New sub-components
import { ProfileHeader } from "@/components/profile/view/ProfileHeader";
import { ProfileStatsSection } from "@/components/profile/view/ProfileStatsSection";
import { ProfileMotoSection } from "@/components/profile/view/ProfileMotoSection";
import { ProfileActionsBar } from "@/components/profile/view/ProfileActionsBar";
import { ProfileDocsSection } from "@/components/profile/view/ProfileDocsSection";
import { ProfileFooter } from "@/components/profile/view/ProfileFooter";
import { ProfileSearchSection } from "@/components/profile/view/ProfileSearchSection";
import { ProfileDonationSection } from "@/components/profile/view/ProfileDonationSection";
import { ProfileVersionSection } from "@/components/profile/view/ProfileVersionSection";
import { ProfileDeletionBanner } from "@/components/profile/view/ProfileDeletionBanner";
import { ProfileLogoutModal } from "@/components/profile/view/ProfileLogoutModal";

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
      } catch {
        // no-op: msg is already set as fallback
      }
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
          try { await apiRequest("DELETE", `/api/users/me/photos/${existingPhotoId}`); } catch {
            // no-op: slot replacement proceeds even if delete fails
          }
        }
        uploadPhotoMutation.mutate(uri, { onSettled: () => setReplacingSlot(null) });
      },
      { aspect: [1, 1], quality: 0.8 }
    );
  }, [uploadPhotoMutation]);

  const handleDeletePhoto = useCallback((photoId: string) => {
    Alert.alert(t("profile.deletePhoto"), t("profile.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deletePhotoMutation.mutate(photoId) },
    ]);
  }, [deletePhotoMutation, t]);

  const doLogout = () => logoutMutation.mutate(undefined);

  const handleLogout = useCallback(() => {
    Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmDesc"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.logout"), style: "destructive", onPress: doLogout },
    ]);
  }, [t]);

  const currentUserType = profile?.userType ?? user?.userType ?? "biker";
  const currentSex = profile?.sex ?? (user as any)?.sex;
  const typeColor = getUserTypeColor(currentUserType, currentSex);
  const isBikerOrCoppia = currentUserType === "biker" || currentUserType === "coppia";
  const isAdmin = profile?.role === "admin" || (user as any)?.role === "admin";
  const isModerator = profile?.role === "moderator" || (user as any)?.role === "moderator";

  const avatarSource = profile?.avatarUrl
    ? { uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${getApiUrl()}${profile.avatarUrl}` }
    : profile?.photos && profile.photos.length > 0
    ? { uri: profile.photos[0].photoUrl.startsWith("http") ? profile.photos[0].photoUrl : `${getApiUrl()}${profile.photos[0].photoUrl}` }
    : null;

  const totalRides = profile?.profile?.totalRides ?? 0;
  const totalKm = profile?.profile?.totalKm ?? 0;
  const easterEggs = profile?.profile?.easterEggsCollected ?? 0;

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
        <ProfileHeader
          profile={profile}
          user={user}
          typeColor={typeColor}
          avatarSource={avatarSource}
          isUploading={uploadPhotoMutation.isPending}
          onPickImage={pickImageForSlot}
          getUserTypeIcon={getUserTypeIcon}
          currentUserType={currentUserType}
        />

        <ProfileStatsSection
          totalRides={totalRides}
          totalKm={totalKm}
          easterEggs={easterEggs}
          distanceUnit={distanceUnit}
          t={t}
        />

        {telemetryStats != null && <TelemetryPanel telemetryStats={telemetryStats} />}

        <ProfileDeletionBanner
          deletionRequestedAt={profile?.deletionRequestedAt}
          locale={locale}
          onCancelDeletion={() => cancelDeletionMutation.mutate()}
          t={t}
        />

        <PhotoGrid
          photos={profile?.photos}
          failedPhotos={failedPhotos}
          setFailedPhotos={setFailedPhotos}
          replacingSlot={replacingSlot}
          isUploading={uploadPhotoMutation.isPending}
          onPickImage={pickImageForSlot}
          onDeletePhoto={handleDeletePhoto}
        />

        <ProfileMotoSection isBikerOrCoppia={isBikerOrCoppia} />

        <ProfileSearchSection
          showSearchPref={showSearchPref}
          searchPrefLocked={searchPrefLocked}
          searchPreference={searchPreference as "bikers" | "zavorrine" | "both"}
          onPreferenceChange={(val) => searchPreferenceMutation.mutate(val)}
          currentUserType={currentUserType}
        />

        <NotificationsPanel
          serverPushEnabled={profile?.profile?.pushNotificationsEnabled}
          serverNotifPrefs={profile?.profile?.notificationPreferences}
        />

        <MatchPrefsPanel />
        <OfflineMapsPanel />
        <ThemePanel />
        <UnitsPanel />
        <PrivacyPanel profileData={profile} />

        <ProfileActionsBar
          isAdmin={isAdmin}
          isModerator={isModerator}
          adminWidgetEnabled={adminWidgetEnabled}
          localFloatingWidget={localFloatingWidget}
          setLocalFloatingWidget={setLocalFloatingWidget}
          onFloatingWidgetChange={(val) => floatingWidgetMutation.mutate(val)}
          taskbarStyle={taskbarStyle}
          setTaskbarStyle={setTaskbarStyle}
          t={t}
        />

        <ProfileDonationSection donationData={donationData} t={t} />

        <ProfileDocsSection nickname={profile?.nickname} t={t} />

        <ProfileFooter
          handleLogout={handleLogout}
          t={t}
        />

        <ProfileLogoutModal
          visible={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onConfirm={doLogout}
          t={t}
        />

        <ProfileVersionSection />

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
});
