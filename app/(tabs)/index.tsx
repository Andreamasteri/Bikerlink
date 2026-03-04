import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { apiRequest } from "@/lib/query-client";
import { useSynecoVisible } from "@/lib/syneco-context";
import InteractiveMap from "@/components/InteractiveMap";

export default function MapScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const synecoVisible = useSynecoVisible();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome");
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                setLocationLoading(false);
              },
              () => {
                setLocation({ latitude: 45.4642, longitude: 9.19 });
                setLocationLoading(false);
              },
              { timeout: 5000 }
            );
          } else {
            setLocation({ latitude: 45.4642, longitude: 9.19 });
            setLocationLoading(false);
          }
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocation({ latitude: 45.4642, longitude: 9.19 });
          setLocationLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

        try {
          await apiRequest("PUT", "/api/users/location", {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        } catch (e) {}
      } catch (e) {
        setLocation({ latitude: 45.4642, longitude: 9.19 });
      } finally {
        setLocationLoading(false);
      }
    })();
  }, []);

  const { data: nearbyData } = useQuery({
    queryKey: [`/api/users/nearby?lat=${location?.latitude || 45.4642}&lng=${location?.longitude || 9.19}&radius=50`],
    enabled: !!location && isAuthenticated,
  });

  const { data: workshopsData } = useQuery({
    queryKey: ["/api/workshops"],
    enabled: isAuthenticated,
  });

  const { data: adsData } = useQuery({
    queryKey: ["/api/ads?displayMode=banner"],
    enabled: isAuthenticated,
  });

  const nearbyUsers = (nearbyData as any)?.users || [];
  const workshops = (workshopsData as any)?.workshops || [];
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

  const getMarkerColor = (u: any) => {
    if (u.userType === "biker") return Colors.maleIcon;
    if (u.userType === "zavorrina") return Colors.femaleIcon;
    return Colors.accent;
  };

  const lat = location?.latitude || 45.4642;
  const lng = location?.longitude || 9.19;

  const markers = [
    ...nearbyUsers.map((item: any) => ({
      id: item.user.id,
      latitude: item.latitude || lat + (Math.random() - 0.5) * 0.05,
      longitude: item.longitude || lng + (Math.random() - 0.5) * 0.05,
      title: item.user.nickname,
      description: getUserTypeLabel(item.user),
      color: getMarkerColor(item.user),
      onPress: () => router.push(`/profile/${item.user.id}` as any),
    })),
    ...workshops.map((w: any) => ({
      id: w.id,
      latitude: w.latitude || lat,
      longitude: w.longitude || lng,
      title: w.name,
      description: w.address || "Officina autorizzata",
      color: synecoVisible ? Colors.syneco : Colors.textSecondary,
    })),
  ];

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

      <View style={styles.mapContainer}>
        <InteractiveMap
          latitude={lat}
          longitude={lng}
          markers={markers}
        />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={20} color={Colors.maleIcon} />
          <Text style={styles.statNumber}>{nearbyUsers.length}</Text>
          <Text style={styles.statLabel}>Vicini</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="construct" size={20} color={synecoVisible ? Colors.syneco : Colors.textSecondary} />
          <Text style={styles.statNumber}>{workshops.length}</Text>
          <Text style={styles.statLabel}>Officine</Text>
        </View>
      </View>

      {nearbyUsers.length > 0 && (
        <View style={styles.nearbySection}>
          <Text style={styles.sectionTitle}>Utenti Disponibili</Text>
          {nearbyUsers.slice(0, 10).map((item: any) => (
            <Pressable
              key={item.user.id}
              style={styles.userCard}
              onPress={() => router.push(`/profile/${item.user.id}` as any)}
            >
              <Ionicons name={getUserIcon(item.user)} size={24} color={getUserColor(item.user)} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.user.nickname}</Text>
                <Text style={styles.userType}>
                  {getUserTypeLabel(item.user)}
                  {item.profile?.ridingStyle ? ` · ${item.profile.ridingStyle}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      {nearbyUsers.length === 0 && (
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
  },
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
