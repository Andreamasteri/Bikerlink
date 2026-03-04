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
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";
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
  const [isAvailable, setIsAvailable] = useState(false);
  const [filterBiker, setFilterBiker] = useState(true);
  const [filterZavorrina, setFilterZavorrina] = useState(true);
  const [filterCoppia, setFilterCoppia] = useState(true);

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
    queryKey: ["/api/easter-eggs/nearby"],
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated,
  });

  const { data: adsData } = useQuery({
    queryKey: ["/api/ads?displayMode=banner"],
    enabled: isAuthenticated,
  });

  const toggleAvailability = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/users/me/availability", {
        isAvailable: !isAvailable,
      });
      return await res.json();
    },
    onSuccess: () => {
      setIsAvailable((prev) => !prev);
      queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
    },
    onError: () => {
      setIsAvailable((prev) => !prev);
    },
  });

  const handleToggleAvailability = useCallback(() => {
    setIsAvailable((prev) => !prev);
    toggleAvailability.mutate();
  }, []);

  const nearbyUsers = (nearbyUsersQuery.data as any) || [];
  const workshops = (workshopsQuery.data as any) || [];
  const ads = (adsData as any)?.ads || [];

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
          onToggleAvailability={handleToggleAvailability}
          filterBiker={filterBiker}
          filterZavorrina={filterZavorrina}
          filterCoppia={filterCoppia}
          onToggleFilterBiker={() => setFilterBiker((p) => !p)}
          onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
          onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
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
            onToggleAvailability={handleToggleAvailability}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            filterCoppia={filterCoppia}
            onToggleFilterBiker={() => setFilterBiker((p) => !p)}
            onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
            onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
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
});
