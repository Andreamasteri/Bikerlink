import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useSynecoVisible } from "@/lib/syneco-context";
import InteractiveMap from "@/components/InteractiveMap";
import { getRegionCoordinates } from "@/constants/regions";

export default function MapScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const synecoVisible = useSynecoVisible();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [filterBiker, setFilterBiker] = useState(true);
  const [filterZavorrina, setFilterZavorrina] = useState(true);
  const [filterCoppia, setFilterCoppia] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [selectedUserProposals, setSelectedUserProposals] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEgg, setSelectedEgg] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome");
    }
  }, [authLoading, isAuthenticated]);

  const getRegionFallback = useCallback(() => {
    if (user?.region) {
      return getRegionCoordinates(user.region);
    }
    return { latitude: 41.9028, longitude: 12.4964 };
  }, [user?.region]);

  const fetchGPSLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      if (Platform.OS === "web") {
        return new Promise((resolve) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve(null),
              { timeout: 5000 }
            );
          } else {
            resolve(null);
          }
        });
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      try {
        await apiRequest("PUT", "/api/users/location", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (e) {}
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const gps = await fetchGPSLocation();
      if (gps) {
        setLocation(gps);
      } else {
        setLocation(getRegionFallback());
      }
      setLocationLoading(false);
    })();
  }, [fetchGPSLocation, getRegionFallback]);

  const handleCenterPosition = useCallback(async () => {
    const gps = await fetchGPSLocation();
    if (gps) {
      setLocation(gps);
    } else {
      setLocation(getRegionFallback());
    }
  }, [fetchGPSLocation, getRegionFallback]);

  const nearbyUsersQuery = useQuery<any[]>({
    queryKey: ["/api/users/nearby"],
    retry: false,
    staleTime: 30000,
    enabled: isAuthenticated,
  });

  const workshopsQuery = useQuery<any[]>({
    queryKey: ["/api/workshops"],
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated,
  });

  const easterEggsQuery = useQuery<any[]>({
    queryKey: ["/api/easter-eggs/nearby", location?.latitude, location?.longitude],
    queryFn: async () => {
      if (!location) return [];
      const url = new URL("/api/easter-eggs/nearby", getApiUrl());
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lng", String(location.longitude));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated && !!location,
  });

  const { data: adsData } = useQuery({
    queryKey: ["/api/ads?displayMode=banner"],
    enabled: isAuthenticated,
  });

  const onlineCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/online-count"],
    staleTime: 30000,
    enabled: isAuthenticated,
  });

  const profileQuery = useQuery({
    queryKey: ["/api/users/profile"],
    enabled: isAuthenticated,
  });
  const isAvailable = (profileQuery.data as any)?.isAvailable || false;

  const collectEggMutation = useMutation({
    mutationFn: async (eggId: string) => {
      const res = await apiRequest("POST", `/api/easter-eggs/${eggId}/collect`);
      return res.json();
    },
    onSuccess: (data: any) => {
      Alert.alert("Easter Egg!", data.message || "Raccolto!");
      queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
      setSelectedEgg(null);
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Impossibile raccogliere");
    },
  });

  const handleUserPress = useCallback(async (mapUser: any) => {
    setSelectedUser(mapUser);
    setDetailLoading(true);
    setSelectedUserDetail(null);
    setSelectedUserProposals([]);
    try {
      const baseUrl = getApiUrl();
      const [detailRes, proposalsRes] = await Promise.all([
        fetch(new URL(`/api/users/${mapUser.id}/public`, baseUrl).toString(), { credentials: "include" }),
        fetch(new URL("/api/proposals", baseUrl).toString(), { credentials: "include" }),
      ]);
      if (detailRes.ok) {
        setSelectedUserDetail(await detailRes.json());
      }
      if (proposalsRes.ok) {
        const allProposals = await proposalsRes.json();
        const userProposals = (Array.isArray(allProposals) ? allProposals : []).filter(
          (p: any) => p.userId === mapUser.id && p.status === "active"
        );
        setSelectedUserProposals(userProposals);
      }
    } catch (e) {}
    setDetailLoading(false);
  }, []);

  const handleEasterEggPress = useCallback((egg: any) => {
    setSelectedEgg(egg);
  }, []);

  const nearbyUsers = (nearbyUsersQuery.data as any) || [];
  const workshops = (workshopsQuery.data as any) || [];
  const ads = (adsData as any)?.ads || [];
  const onlineCount = onlineCountQuery.data?.count ?? 0;

  if (authLoading || locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento mappa...</Text>
      </View>
    );
  }

  const getUserColor = (u: any) => {
    if (u.sex === "male") return Colors.maleIcon;
    return Colors.femaleIcon;
  };

  const getUserTypeLabel = (u: any) => {
    if (u.userType === "biker") return "Biker";
    if (u.userType === "zavorrina") return "Zavorrina/o";
    return "Coppia";
  };

  const getUserIcon = (u: any): keyof typeof Ionicons.glyphMap => {
    if (u.userType === "coppia") return "people";
    if (u.userType === "zavorrina") return "person";
    return "bicycle";
  };

  const nearbyUsersList = Array.isArray(nearbyUsers) ? nearbyUsers : [];
  const workshopsList = Array.isArray(workshops) ? workshops : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: 16 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>BikerLink</Text>
        <Pressable onPress={() => router.push("/chat" as any)}>
          <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
        </Pressable>
      </View>

      <Pressable style={styles.mapContainer} onPress={() => setMapFullscreen(true)}>
        <InteractiveMap
          users={nearbyUsersQuery.data ?? []}
          workshops={workshopsQuery.data ?? []}
          easterEggs={easterEggsQuery.data ?? []}
          isAvailable={isAvailable}
          filterBiker={filterBiker}
          filterZavorrina={filterZavorrina}
          filterCoppia={filterCoppia}
          onToggleFilterBiker={() => setFilterBiker((p) => !p)}
          onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
          onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
          onUserPress={handleUserPress}
          onEasterEggPress={handleEasterEggPress}
        />
        <View style={styles.expandHint}>
          <Ionicons name="expand" size={16} color={Colors.text} />
        </View>
      </Pressable>

      <Modal visible={mapFullscreen} animationType="fade" onRequestClose={() => setMapFullscreen(false)}>
        <View style={styles.fullscreenContainer}>
          <InteractiveMap
            users={nearbyUsersQuery.data ?? []}
            workshops={workshopsQuery.data ?? []}
            easterEggs={easterEggsQuery.data ?? []}
            isAvailable={isAvailable}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            filterCoppia={filterCoppia}
            onToggleFilterBiker={() => setFilterBiker((p) => !p)}
            onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
            onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
            onUserPress={handleUserPress}
            onEasterEggPress={handleEasterEggPress}
          />
          <Pressable style={[styles.closeBtn, { top: Platform.OS === "web" ? 20 : insets.top + 8 }]} onPress={() => setMapFullscreen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View style={[styles.fullscreenOverlay, { top: Platform.OS === "web" ? 20 : insets.top + 8 }]}>
            <View style={styles.statsChip}>
              <Ionicons name="people" size={14} color={Colors.maleIcon} />
              <Text style={styles.statsChipText}>{nearbyUsersList.length} vicini</Text>
            </View>
            {workshopsList.length > 0 && (
              <View style={styles.statsChip}>
                <Ionicons name="construct" size={14} color={synecoVisible ? Colors.syneco : Colors.textSecondary} />
                <Text style={styles.statsChipText}>{workshopsList.length} officine</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="radio-button-on" size={20} color={Colors.success} />
          <Text style={styles.statNumber}>{onlineCount}</Text>
          <Text style={styles.statLabel}>Online</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="people" size={20} color={Colors.maleIcon} />
          <Text style={styles.statNumber}>{nearbyUsersList.length}</Text>
          <Text style={styles.statLabel}>Vicini</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="construct" size={20} color={synecoVisible ? Colors.syneco : Colors.textSecondary} />
          <Text style={styles.statNumber}>{workshopsList.length}</Text>
          <Text style={styles.statLabel}>Officine</Text>
        </View>
      </View>

      {nearbyUsersList.length > 0 && (
        <View style={styles.nearbySection}>
          <Text style={styles.sectionTitle}>Utenti Disponibili</Text>
          {nearbyUsersList.slice(0, 10).map((item: any) => {
            const u = item.user || item;
            return (
              <Pressable
                key={u.id}
                style={styles.userCard}
                onPress={() => router.push(`/profile/${u.id}` as any)}
              >
                <Ionicons name={getUserIcon(u)} size={24} color={getUserColor(u)} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{u.nickname}</Text>
                  <Text style={styles.userType}>
                    {getUserTypeLabel(u)}
                    {item.profile?.ridingStyle ? ` · ${item.profile.ridingStyle}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      )}

      {nearbyUsersList.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun utente nelle vicinanze</Text>
        </View>
      )}

      {synecoVisible && ads.length > 0 && (
        <View style={styles.adBanner}>
          <Text style={styles.adText}>{ads[0].title}</Text>
        </View>
      )}

      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelectedUser(null)}>
          <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            {detailLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <View style={styles.detailHeader}>
                  <Ionicons
                    name={getUserIcon(selectedUser || {})}
                    size={32}
                    color={getUserColor(selectedUser || {})}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{selectedUser?.nickname}</Text>
                    <Text style={styles.detailType}>{getUserTypeLabel(selectedUser || {})}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedUser(null)}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </Pressable>
                </View>

                {selectedUserDetail?.bio && (
                  <Text style={styles.detailBio}>{selectedUserDetail.bio}</Text>
                )}

                {selectedUserDetail?.motorcycles && selectedUserDetail.motorcycles.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Garage</Text>
                    {selectedUserDetail.motorcycles.map((m: any) => (
                      <View key={m.id} style={styles.detailMotoCard}>
                        <Ionicons name="bicycle" size={18} color={Colors.accent} />
                        <Text style={styles.detailMotoText}>
                          {m.brand} {m.model}
                          {m.motorcycleType ? ` · ${m.motorcycleType}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Proposte Giri</Text>
                    {selectedUserProposals.map((p: any) => (
                      <Pressable
                        key={p.id}
                        style={styles.detailProposalCard}
                        onPress={() => { setSelectedUser(null); router.push(`/proposals/${p.id}` as any); }}
                      >
                        <Ionicons name="navigate" size={16} color={Colors.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailProposalTitle}>{p.title}</Text>
                          {p.location && <Text style={styles.detailProposalSub}>{p.location}</Text>}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length === 0 && !detailLoading && (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <Text style={styles.detailType}>Nessuna proposta attiva</Text>
                  </View>
                )}

                <View style={styles.detailBtnRow}>
                  <Pressable
                    style={styles.detailChatBtn}
                    onPress={async () => {
                      try {
                        const res = await apiRequest("POST", "/api/chat/conversations", {
                          conversationType: "private",
                          participantIds: [selectedUser?.id],
                        });
                        const conv = await res.json();
                        setSelectedUser(null);
                        router.push(`/chat/${conv.id}` as any);
                      } catch (e: any) {
                        Alert.alert("Errore", e.message || "Impossibile aprire la chat");
                      }
                    }}
                  >
                    <Ionicons name="chatbubble" size={20} color={Colors.background} />
                    <Text style={styles.detailChatBtnText}>Messaggio</Text>
                  </Pressable>
                  <Pressable
                    style={styles.detailProfileBtn}
                    onPress={() => { setSelectedUser(null); router.push(`/profile/${selectedUser?.id}` as any); }}
                  >
                    <Text style={styles.detailProfileBtnText}>Vai al Profilo</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedEgg} transparent animationType="fade" onRequestClose={() => setSelectedEgg(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelectedEgg(null)}>
          <Pressable style={styles.eggSheet} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="gift" size={48} color="#FFD700" style={{ alignSelf: "center" }} />
            <Text style={styles.eggTitle}>{selectedEgg?.name}</Text>
            {selectedEgg?.description && (
              <Text style={styles.eggDescription}>{selectedEgg.description}</Text>
            )}
            {selectedEgg?.points && (
              <Text style={styles.eggPoints}>{selectedEgg.points} punti</Text>
            )}
            {selectedEgg?.collected ? (
              <View style={styles.eggCollectedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={[styles.eggPoints, { color: Colors.success }]}>Già raccolto</Text>
              </View>
            ) : (
              <Pressable
                style={styles.eggCollectBtn}
                onPress={() => selectedEgg && collectEggMutation.mutate(selectedEgg.id)}
                disabled={collectEggMutation.isPending}
              >
                {collectEggMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.eggCollectBtnText}>Raccogli!</Text>
                )}
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  loadingText: { color: Colors.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.accent },
  mapContainer: {
    height: 280,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  expandHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: Colors.surface + "CC",
    borderRadius: 8,
    padding: 6,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  fullscreenOverlay: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 8,
  },
  statsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface + "E6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statsChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginTop: 16 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  statNumber: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  nearbySection: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 8 },
  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  userType: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyState: { alignItems: "center", padding: 24, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  adBanner: {
    backgroundColor: Colors.accent + "20",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  adText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.accent },
  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  detailType: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailBio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
  detailSection: { marginBottom: 12 },
  detailSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  detailMotoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  detailMotoText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  detailProposalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  detailProposalTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  detailProposalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  detailChatBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  detailChatBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
  detailProfileBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailProfileBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  eggSheet: {
    backgroundColor: Colors.surface,
    marginHorizontal: 32,
    borderRadius: 20,
    padding: 24,
    alignSelf: "center",
    width: "85%",
    maxWidth: 340,
    position: "absolute",
    top: "30%",
  },
  eggTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginTop: 12 },
  eggDescription: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  eggPoints: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginTop: 8 },
  eggCollectedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  eggCollectBtn: {
    backgroundColor: "#FFD700",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  eggCollectBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.background },
});
