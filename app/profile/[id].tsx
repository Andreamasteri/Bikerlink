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
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import FavoriteStar from "@/components/FavoriteStar";
import { t } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

const REPORT_REASONS = [
  "Spam",
  "Comportamento inappropriato",
  "Profilo falso/bot",
  "Molestia",
  "Contenuto offensivo",
  "Altro",
];

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const baseUrl = getApiUrl();
  const loggedViewIds = React.useRef<Set<string>>(new Set());
  const isSelf = user?.id === id;

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: sprintRankData } = useQuery<{ rank: number | null; sprint0to100Ms: number | null }>({
    queryKey: ["/api/sprints/leaderboard/rank", id],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/sprints/leaderboard/rank/${id}`, baseUrl).toString(), {
        credentials: "include",
      });
      if (!res.ok) return { rank: null, sprint0to100Ms: null };
      return res.json();
    },
    enabled: !!id,
  });

  const { data: routesData } = useQuery<{ routes: { id: string }[] }>({
    queryKey: ["/api/users", id, "custom-routes"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${id}/custom-routes`, baseUrl).toString(), {
        credentials: "include",
      });
      if (!res.ok) return { routes: [] };
      return res.json();
    },
    enabled: !!id,
  });
  const publicRoutesCount = routesData?.routes?.length ?? 0;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/users", id, "public"],
    queryFn: async () => {
      const res = await fetch(new URL(`/api/users/${id}/public`, baseUrl).toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("profile.loadError"));
      return res.json();
    },
    enabled: !!id,
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
        credentials: "include",
      });
      if (!res.ok) return { status: "none" };
      return res.json();
    },
    enabled: !!id && !!user && !isSelf,
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
    },
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
    },
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
          onPress: () => cancelMatchRequestMutation.mutate(),
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
    },
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
    },
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
    },
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
          onPress: () => blockMutation.mutate(),
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
          onPress: () => unblockMutation.mutate(),
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
        participantIds: [id],
      });
      const conv = await res.json();
      router.push(`/chat/${conv.id}` as any);
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Impossibile aprire la chat");
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
          ) : undefined,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: webTopInset, paddingBottom: 40 }}
      >
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: color + "33" }]}>
            {profile.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${baseUrl}${profile.avatarUrl}` }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons
                name={profile.userType === "coppia" ? "people" : profile.userType === "zavorrina" ? "person" : "bicycle"}
                size={48}
                color={color}
              />
            )}
          </View>
          <View style={styles.nicknameRow}>
            <Text style={[styles.nickname, { color }]}>{profile.nickname}</Text>
            {!isSelf && <FavoriteStar targetUserId={id} size={22} />}
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: profile.isOnline ? "#4CAF5022" : "#66666622" }]}>
              <View style={[styles.statusDot, { backgroundColor: profile.isOnline ? "#4CAF50" : "#888" }]} />
              <Text style={[styles.statusBadgeText, { color: profile.isOnline ? "#4CAF50" : "#888" }]}>
                {profile.isOnline ? "Online" : "Offline"}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: profile.isAvailable ? "#4CAF5022" : "#66666622" }]}>
              <View style={[styles.statusDot, { backgroundColor: profile.isAvailable ? Colors.success : "#888" }]} />
              <Text style={[styles.statusBadgeText, { color: profile.isAvailable ? Colors.success : "#888" }]}>
                {profile.isAvailable ? "Disponibile" : "Non disponibile"}
              </Text>
            </View>
          </View>
          {!profile.isOnline && profile.lastLoginAt && (
            <Text style={styles.lastSeenText}>
              {"Last seen: " + formatLastSeen(profile.lastLoginAt)}
            </Text>
          )}
          <Text style={styles.userType}>
            {getUserTypeLabel(profile.userType)}
            {profile.sex ? ` · ${profile.sex === "M" ? "Maschio" : "Femmina"}` : ""}
          </Text>
          {(!!profile.country || !!profile.region) && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={Colors.textSecondary} />
              <Text style={styles.locationText}>
                {[
                  profile.region || null,
                  profile.city || null,
                  profile.country ? getCountryFlag(profile.country) + " " + getCountryName(profile.country) : null,
                ].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
        </View>

        {sprintRankData?.rank != null && (
          <TouchableOpacity
            style={styles.sprintRankBadge}
            onPress={() => {
              const href = `/sprint-history?tab=leaderboard&focusUserId=${encodeURIComponent(id ?? "")}`;
              router.push(href as Parameters<typeof router.push>[0]);
            }}
            activeOpacity={0.8}
            testID="sprint-rank-badge"
          >
            <Ionicons name="trophy-outline" size={16} color={Colors.accentRed} />
            <Text style={styles.sprintRankText}>Sprint rank: #{sprintRankData.rank}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}

        {!!profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {profile.motorcycles && profile.motorcycles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Moto</Text>
            {profile.motorcycles.map((m: any) => (
              <View key={m.id} style={styles.motoCard}>
                <MaterialCommunityIcons name="motorbike" size={24} color={Colors.accent} />
                <View style={styles.motoInfo}>
                  <Text style={styles.motoName}>{m.brand} {m.model}</Text>
                  {!!m.year && <Text style={styles.motoDetail}>Anno: {m.year}</Text>}
                  {!!m.engineSize && <Text style={styles.motoDetail}>{m.engineSize}cc</Text>}
                  {!!m.ridingStyle && <Text style={styles.motoDetail}>Stile: {m.ridingStyle}</Text>}
                  {marketplaceEnabled && m.isForSale && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, backgroundColor: "#FF980015", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" }}>
                      <Ionicons name="pricetag" size={12} color="#FF9800" />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FF9800" }}>In Vendita</Text>
                    </View>
                  )}
                  {marketplaceEnabled && m.isForSale && !!m.saleDescription && (
                    <Text style={[styles.motoDetail, { fontStyle: "italic", marginTop: 4 }]}>{m.saleDescription}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {profile.photos && profile.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Foto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              {profile.photos.map((p: any) => {
                const uri = p.photoUrl?.startsWith("http") ? p.photoUrl : `${baseUrl}${p.photoUrl}`;
                return (
                  <TouchableOpacity key={p.id} onPress={() => setSelectedPhoto(uri)} activeOpacity={0.8}>
                    <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {publicRoutesCount > 0 && (
          <TouchableOpacity
            style={styles.routesButton}
            onPress={() => router.push(`/routes/user/${id}` as any)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="map-marker-path" size={20} color={Colors.accent} />
            <Text style={styles.routesButtonText}>
              Visualizza percorsi ({publicRoutesCount})
            </Text>
          </TouchableOpacity>
        )}

        {!isSelf && profile.latitude != null && profile.longitude != null && (() => {
          let ageLabel: string | null = null;
          if (profile.coordinatesUpdatedAt) {
            const updatedAt = new Date(profile.coordinatesUpdatedAt).getTime();
            const diffMs = Date.now() - updatedAt;
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin >= 30) {
              if (diffMin < 60) {
                ageLabel = `posizione di ${diffMin}min fa`;
              } else {
                const diffH = Math.floor(diffMin / 60);
                if (diffH < 24) {
                  ageLabel = `posizione di ${diffH}h fa`;
                } else {
                  const diffD = Math.floor(diffH / 24);
                  ageLabel = `posizione di ${diffD}g fa`;
                }
              }
            }
          }
          return (
            <TouchableOpacity
              style={styles.geoButton}
              onPress={async () => {
                try {
                  await AsyncStorage.setItem(
                    "pending_focus_coords",
                    JSON.stringify({ lat: profile.latitude, lng: profile.longitude, ts: Date.now() })
                  );
                } catch {}
                router.navigate({ pathname: "/(tabs)/index" });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={20} color="#4CAF50" />
              <View style={{ alignItems: "center" }}>
                <Text style={styles.geoButtonText}>Geolocalizza sulla mappa</Text>
                {ageLabel && <Text style={styles.geoButtonSubtext}>{ageLabel}</Text>}
              </View>
            </TouchableOpacity>
          );
        })()}

        {!isSelf && !isBlocked && (
          <TouchableOpacity style={styles.chatButton} onPress={handleStartChat} activeOpacity={0.8}>
            <Ionicons name="chatbubbles" size={22} color={Colors.background} />
            <Text style={styles.chatButtonText}>Scrivi un messaggio</Text>
          </TouchableOpacity>
        )}

        {!isSelf && !isBlocked && friendStatus && friendStatus.status !== "self" && (
          <>
            {friendStatus.status === "friends" && (
              <View style={styles.matchStatusButton}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={[styles.matchStatusText, { color: Colors.success }]}>Siete Match ✓</Text>
              </View>
            )}
            {friendStatus.status === "pending_sent" && (
              <TouchableOpacity
                style={[styles.matchStatusButton, { borderColor: Colors.textSecondary }]}
                onPress={handleCancelMatchRequest}
                disabled={cancelMatchRequestMutation.isPending}
              >
                <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
                <Text style={[styles.matchStatusText, { color: Colors.textSecondary }]}>Richiesta inviata</Text>
              </TouchableOpacity>
            )}
            {friendStatus.status === "pending_received" && (
              <View style={[styles.matchStatusButton, { borderColor: Colors.accent }]}>
                <Ionicons name="person-add-outline" size={20} color={Colors.accent} />
                <Text style={[styles.matchStatusText, { color: Colors.accent }]}>Richiesta ricevuta</Text>
              </View>
            )}
            {friendStatus.status === "none" && (
              <TouchableOpacity
                style={[styles.matchRequestButton, sendMatchRequestMutation.isPending && { opacity: 0.5 }]}
                onPress={() => sendMatchRequestMutation.mutate()}
                disabled={sendMatchRequestMutation.isPending}
                activeOpacity={0.8}
              >
                {sendMatchRequestMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <>
                    <Ionicons name="person-add" size={20} color={Colors.background} />
                    <Text style={styles.matchRequestText}>Richiedi Match</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
        {!isSelf && isBlocked && (
          <TouchableOpacity
            style={[styles.blockButton, styles.unblockButton, unblockMutation.isPending && styles.blockButtonDisabled]}
            onPress={handleUnblockUser}
            activeOpacity={0.8}
            disabled={unblockMutation.isPending}
          >
            {unblockMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textSecondary} />
                <Text style={[styles.blockButtonText, { color: Colors.textSecondary }]}>Sblocca utente</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {!isSelf && !isBlocked && (
          <TouchableOpacity
            style={[styles.blockButton, blockMutation.isPending && styles.blockButtonDisabled]}
            onPress={handleBlockUser}
            activeOpacity={0.8}
            disabled={blockMutation.isPending}
          >
            {blockMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Ionicons name="ban" size={20} color={Colors.error} />
                <Text style={styles.blockButtonText}>Blocca utente</Text>
              </>
            )}
          </TouchableOpacity>
        )}
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

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setReportVisible(false)}>
          <Pressable style={[styles.reportSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.menuHandle} />
            {reportSent ? (
              <View style={styles.reportSuccess}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                <Text style={styles.reportSuccessTitle}>Segnalazione inviata</Text>
                <Text style={styles.reportSuccessText}>{t("profile.reportSuccess")}</Text>
                <TouchableOpacity style={styles.reportCloseBtn} onPress={() => setReportVisible(false)}>
                  <Text style={styles.reportCloseBtnText}>Chiudi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.reportTitle}>Segnala {profile?.nickname}</Text>
                <Text style={styles.reportSubtitle}>Seleziona il motivo della segnalazione</Text>
                <View style={styles.reasonList}>
                  {REPORT_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.reasonItem, selectedReason === r && styles.reasonItemSelected]}
                      onPress={() => setSelectedReason(r)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reasonRadio, selectedReason === r && styles.reasonRadioSelected]}>
                        {selectedReason === r && <View style={styles.reasonRadioDot} />}
                      </View>
                      <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextSelected]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reportInput}
                  placeholder="Descrizione opzionale..."
                  placeholderTextColor={Colors.textSecondary}
                  value={reportDescription}
                  onChangeText={setReportDescription}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.reportSubmitBtn, (!selectedReason || reportMutation.isPending) && styles.reportSubmitBtnDisabled]}
                  onPress={handleSubmitReport}
                  disabled={!selectedReason || reportMutation.isPending}
                  activeOpacity={0.8}
                >
                  {reportMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.background} />
                  ) : (
                    <Text style={styles.reportSubmitBtnText}>Invia segnalazione</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    borderColor: Colors.accentRed + "50",
  },
  sprintRankText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
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
    borderColor: Colors.accent,
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
    marginTop: 16,
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
    borderColor: Colors.error,
  },
  unblockButton: {
    borderColor: Colors.textSecondary,
  },
  blockButtonDisabled: {
    opacity: 0.5,
  },
  blockButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.error },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, marginRight: 8, backgroundColor: Colors.surfaceLight },
  photoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalImage: { width: "100%", height: "80%" },
  photoModalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 6,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 0,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  reportSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 4 },
  reportSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 16 },
  reasonList: { gap: 4, marginBottom: 14 },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonItemSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonRadioSelected: { borderColor: Colors.accent },
  reasonRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  reasonText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  reasonTextSelected: { fontFamily: "Inter_500Medium", color: Colors.accent },
  reportInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  reportSubmitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  reportSuccess: { alignItems: "center", paddingVertical: 24, gap: 12 },
  reportSuccessTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  reportSuccessText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  reportCloseBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  reportCloseBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  matchRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
  },
  matchRequestText: { fontSize: 15, fontWeight: "600" as const, color: Colors.background },
  matchStatusButton: {
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
    borderColor: Colors.success,
  },
  matchStatusText: { fontSize: 15, fontWeight: "600" as const },
  geoButton: {
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
    borderColor: "#4CAF50",
  },
  geoButtonText: { fontSize: 15, fontWeight: "600" as const, color: "#4CAF50" },
  geoButtonSubtext: { fontSize: 12, fontWeight: "400" as const, color: Colors.textSecondary, marginTop: 2 },
});
