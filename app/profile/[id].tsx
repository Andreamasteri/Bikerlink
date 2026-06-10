import React, { useState } from "react";
import {
  View,
  Text,
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
import { MatchReasonChips } from "@/components/profile/detail/MatchReasonChips";
import { styles } from "@/components/profile/[id].styles";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
    onError: (e: any) => {
      Alert.alert("Errore", e.message || "Impossibile sbloccare l'utente");
    }
  });

  const reportMutation = useMutation({
    mutationFn: async ({ reason, description }: { reason: string; description: string }) => {
      // Task #2530 — risali alla categoria standard dalla label scelta; se
      // l'utente ha selezionato una vecchia label custom, category resta
      // undefined e il backend salva il report come "uncategorized" (severity
      // low).
      const { reasonToCategory } = await import("@/components/profile/detail/ProfileReportModal");
      const category = reasonToCategory(reason);
      const res = await apiRequest("POST", `/api/users/${id}/report`, {
        reason,
        description: description || undefined,
        category,
        context: "profile",
        contextId: id,
      });
      return res.json();
    },
    onSuccess: () => {
      setReportSent(true);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation error shape
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
      router.push(`/chat/${conv.id}` as never);
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
          <Text style={styles.emptyText}>Questo profilo non è più disponibile</Text>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as never)}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Torna indietro</Text>
          </TouchableOpacity>
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

        {!isSelf && id && <MatchReasonChips userId={id} />}

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
          onViewRoutes={() => router.push(`/routes/user/${id}` as never)}
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
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
