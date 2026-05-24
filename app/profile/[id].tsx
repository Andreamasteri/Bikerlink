import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProfileDetailHeader } from "@/components/profile/detail/ProfileDetailHeader";
import { ProfileDetailMoto } from "@/components/profile/detail/ProfileDetailMoto";
import { ProfileDetailGallery } from "@/components/profile/detail/ProfileDetailGallery";
import { ProfileDetailActions } from "@/components/profile/detail/ProfileDetailActions";
import { ProfileReportModal } from "@/components/profile/detail/ProfileReportModal";

function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mo}/'${yy} - ${hh}.${mm}`;
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const baseUrl = getApiUrl();
  const loggedViewIds = React.useRef<Set<string>>(new Set());
  const isSelf = user?.id === id;

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"]
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: sprintRankData } = useQuery<{ rank: number | null; sprint0to100Ms: number | null }>({
    queryKey: ["/api/sprints/leaderboard/rank", id],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/sprints/leaderboard/rank/${id}`, baseUrl).toString(), {
        credentials: "include"
      });
      if (!res.ok) return { rank: null, sprint0to100Ms: null };
      return res.json();
    },
    enabled: !!id
  });

  const { data: routesData } = useQuery<{ routes: { id: string }[] }>({
    queryKey: ["/api/users", id, "custom-routes"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${id}/custom-routes`, baseUrl).toString(), {
        credentials: "include"
      });
      if (!res.ok) return { routes: [] };
      return res.json();
    },
    enabled: !!id
  });
  const publicRoutesCount = routesData?.routes?.length ?? 0;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/users", id, "public"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${id}/public`, baseUrl).toString(), {
        credentials: "include"
      });
      if (!res.ok) throw new Error(t("profile.loadError"));
      return res.json();
    },
    enabled: !!id
  });

  React.useEffect(() => {
    if (!profile || !user || !id) return;
    if (user.id === id) return;
    const role = user.role;
    if (role !== "moderator" && role !== "admin") return;
    if (loggedViewIds.current.has(id)) return;
    loggedViewIds.current.add(id);
    apiRequest("POST", "/api/moderator/log-profile-view", { targetUserId: id }).catch(() => {});
  }, [profile, user, id]);

  const getUserColor = (userType: string) => {
    if (userType === "biker") return Colors.maleIcon;
    if (userType === "zavorrina") return Colors.femaleIcon;
    return Colors.accent;
  };

  const getUserTypeLabel = (userType: string) => {
    if (userType === "biker") return "Biker";
    if (userType === "zavorrina") return "Zavorrina/o";
    return "Coppia";
  };

  const [blockedOverride, setBlockedOverride] = useState<boolean | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const isBlocked = blockedOverride !== null ? blockedOverride : (profile?.isBlockedByMe ?? false);

  const { data: friendStatus, refetch: refetchFriendStatus } = useQuery<{
    status: "none" | "pending_sent" | "pending_received" | "friends" | "self";
    requestId?: string;
  }>({
    queryKey: ["/api/friends/status", id],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/friends/status/${id}`, baseUrl).toString(), {
        credentials: "include"
      });
      if (!res.ok) return { status: "none" };
      return res.json();
    },
    enabled: !!id && !!user && !isSelf
  });

  const sendMatchRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/friends/request/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchFriendStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", id] });
    },
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile inviare la richiesta");
    }
  });

  const cancelMatchRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/friends/request/${id}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      refetchFriendStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", id] });
    },
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile annullare la richiesta");
    }
  });

  const handleCancelMatchRequest = () => {
    Alert.alert(
      "Annulla richiesta",
      "Vuoi annullare la richiesta di match inviata?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Annulla richiesta",
          style: "destructive",
          onPress: () => cancelMatchRequestMutation.mutate()
        },
      ]
    );
  };

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSent, setReportSent] = useState(false);

  const blockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${id}/block`, {});
      return res.json();
    },
    onSuccess: () => {
      setBlockedOverride(true);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
      router.back();
    },
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile bloccare l'utente");
    }
  });

  const unblockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/users/${id}/block`);
      return res.json();
    },
    onSuccess: () => {
      setBlockedOverride(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users", id, "public"] });
    },
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile sbloccare l'utente");
    }
  });

  const reportMutation = useMutation({
    mutationFn: async ({ reason, description }: { reason: string; description: string }) => {
      const res = await apiRequest("POST", `/api/users/${id}/report`, { reason, description: description || undefined });
      return res.json();
    },
    onSuccess: () => {
      setReportSent(true);
    },
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile inviare la segnalazione");
    }
  });

  const handleBlockUser = () => {
    setMenuVisible(false);
    Alert.alert(
      "Blocca utente",
      t("profile.blockConfirm").replace("{name}", profile?.nickname ?? t("common.thisUser")),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Blocca",
          style: "destructive",
          onPress: () => blockMutation.mutate()
        },
      ]
    );
  };

  const handleUnblockUser = () => {
    setMenuVisible(false);
    Alert.alert(
      "Sblocca utente",
      `Sbloccare ${profile?.nickname ?? "questo utente"}? Potrete tornare a vedervi nei match e nella chat.`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Sblocca",
          onPress: () => unblockMutation.mutate()
        },
      ]
    );
  };

  const handleOpenReport = () => {
    setMenuVisible(false);
    setSelectedReason("");
    setReportDescription("");
    setReportSent(false);
    setReportVisible(true);
  };

  const handleSubmitReport = () => {
    if (!selectedReason) {
      Alert.alert("Attenzione", "Seleziona un motivo per la segnalazione");
      return;
    }
    reportMutation.mutate({ reason: selectedReason, description: reportDescription });
  };

  const handleStartChat = async () => {
    try {
      const res = await apiRequest("POST", "/api/chat/conversations", {
        conversationType: "private",
        participantIds: [id]
      });
      const conv = await res.json();
      router.push(`/chat/${conv.id}` as any);
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Impossibile aprire la chat");
    }
  };

  const webTopInset = 0;

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <Ionicons name="person-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Utente non trovato</Text>
        </View>
      </>
    );
  }

  const color = getUserColor(profile.userType);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile.nickname,
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerRight: !isSelf ? () => (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={{ marginRight: 4, padding: 6 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={Colors.text} />
            </TouchableOpacity>
          ) : undefined
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: webTopInset, paddingBottom: 40 }}
      >
        <ProfileDetailHeader
          profile={profile}
          id={id}
          isSelf={isSelf}
          color={color}
          baseUrl={baseUrl}
          formatLastSeen={formatLastSeen}
          getUserTypeLabel={getUserTypeLabel}
          sprintRankData={sprintRankData}
          onSprintRankPress={() => {
            const href = `/sprint-history?tab=leaderboard&focusUserId=${encodeURIComponent(id ?? "")}`;
            router.push(href as Parameters<typeof router.push>[0]);
          }}
        />

        <ProfileDetailMoto
          profile={profile}
          marketplaceEnabled={marketplaceEnabled}
        />

        <ProfileDetailGallery
          profile={profile}
          baseUrl={baseUrl}
          onPhotoPress={(uri) => setSelectedPhoto(uri)}
        />

        <ProfileDetailActions
          id={id}
          isSelf={isSelf}
          isBlocked={isBlocked}
          publicRoutesCount={publicRoutesCount}
          profile={profile}
          friendStatus={friendStatus}
          onViewRoutes={() => router.push(`/routes/user/${id}` as any)}
          onGeoLocate={async () => {
            try {
              await AsyncStorage.setItem(
                "pending_focus_coords",
                JSON.stringify({
                  lat: profile.latitude,
                  lng: profile.longitude,
                  ts: Date.now(),
                  userId: id,
                  nickname: profile.nickname
                })
              );
            } catch {
              // no-op: last profile cache is best-effort
            }
            router.navigate({ pathname: "/(tabs)/index" } as any);
          }}
          onStartChat={handleStartChat}
          onCancelMatchRequest={handleCancelMatchRequest}
          onSendMatchRequest={() => sendMatchRequestMutation.mutate()}
          onUnblockUser={handleUnblockUser}
          onBlockUser={handleBlockUser}
          isSendMatchPending={sendMatchRequestMutation.isPending}
          isCancelMatchPending={cancelMatchRequestMutation.isPending}
          isUnblockPending={unblockMutation.isPending}
          isBlockPending={blockMutation.isPending}
        />
      </ScrollView>


      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <Pressable style={styles.photoModal} onPress={() => setSelectedPhoto(null)}>
          {selectedPhoto && (
            <Image source={{ uri: selectedPhoto }} style={styles.photoModalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.photoModalClose} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.menuHandle} />
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenReport}>
              <Ionicons name="flag-outline" size={22} color={Colors.warning} />
              <Text style={[styles.menuItemText, { color: Colors.warning }]}>Segnala utente</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            {isBlocked ? (
              <TouchableOpacity style={styles.menuItem} onPress={handleUnblockUser}>
                <Ionicons name="checkmark-circle-outline" size={22} color={Colors.textSecondary} />
                <Text style={[styles.menuItemText, { color: Colors.textSecondary }]}>Sblocca utente</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                <Ionicons name="ban" size={22} color={Colors.error} />
                <Text style={[styles.menuItemText, { color: Colors.error }]}>Blocca utente</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      <ProfileReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        profileName={profile?.nickname}
        reportSent={reportSent}
        selectedReason={selectedReason}
        onReasonSelect={setSelectedReason}
        reportDescription={reportDescription}
        onDescriptionChange={setReportDescription}
        onSubmit={handleSubmitReport}
        isPending={reportMutation.isPending}
        insets={insets}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 12 },
  avatarSection: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  nicknameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 0 },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row" as const, gap: 6, marginTop: 8, marginBottom: 2 },
  statusBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeenText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  userType: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sprintRankBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentRed + "50"
  },
  sprintRankText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text
  },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  bioText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },
  motoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  motoInfo: { flex: 1 },
  motoName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  motoDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  routesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.accent
  },
  routesButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.accent },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 16
  },
  chatButtonText: { fontSize: 16, fontWeight: "700" as const, color: Colors.background },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error
  },
  unblockButton: {
    borderColor: Colors.textSecondary
  },
  blockButtonDisabled: {
    opacity: 0.5
  },
  blockButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.error },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, marginRight: 8, backgroundColor: Colors.surfaceLight },
  photoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center"
  },
  photoModalImage: { width: "100%", height: "80%" },
  photoModalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 6
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  menuSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 0
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 24
  },
  menuItemText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 }
});
