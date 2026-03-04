import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { apiRequest } from "@/lib/query-client";

export default function MapScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
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
          setLocation({ latitude: 45.4642, longitude: 9.19 });
          setLocationLoading(false);
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
    queryKey: ["/api/users/nearby", `?lat=${location?.latitude || 45.4642}&lng=${location?.longitude || 9.19}&radius=50`],
    enabled: !!location && isAuthenticated,
  });

  const { data: workshopsData } = useQuery({
    queryKey: ["/api/workshops"],
    enabled: isAuthenticated,
  });

  const { data: adsData } = useQuery({
    queryKey: ["/api/ads", "?displayMode=banner"],
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

  const getUserIcon = (u: any): keyof typeof Ionicons.glyphMap => {
    if (u.userType === "coppia") return "people";
    if (u.userType === "zavorrina") return "person";
    return "bicycle";
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>BikerLink</Text>
        <Pressable onPress={() => router.push("/chat" as any)}>
          <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
        </Pressable>
      </View>

      <View style={styles.mapPlaceholder}>
        <Ionicons name="map" size={64} color={Colors.textSecondary} />
        <Text style={styles.mapText}>Mappa Interattiva</Text>
        <Text style={styles.mapSubtext}>
          {nearbyUsers.length} utenti nelle vicinanze
        </Text>
        {location && (
          <Text style={styles.coordText}>
            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={20} color={Colors.maleIcon} />
          <Text style={styles.statNumber}>{nearbyUsers.length}</Text>
          <Text style={styles.statLabel}>Vicini</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="construct" size={20} color={Colors.syneco} />
          <Text style={styles.statNumber}>{workshops.length}</Text>
          <Text style={styles.statLabel}>Officine</Text>
        </View>
      </View>

      {nearbyUsers.length > 0 && (
        <View style={styles.nearbySection}>
          <Text style={styles.sectionTitle}>Utenti Disponibili</Text>
          {nearbyUsers.slice(0, 5).map((item: any) => (
            <Pressable
              key={item.user.id}
              style={styles.userCard}
              onPress={() => router.push(`/profile/${item.user.id}` as any)}
            >
              <Ionicons name={getUserIcon(item.user)} size={24} color={getUserColor(item.user)} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.user.nickname}</Text>
                <Text style={styles.userType}>
                  {item.user.userType === "biker" ? "Biker" : item.user.userType === "zavorrina" ? "Zavorrina/o" : "Coppia"}
                  {item.profile?.ridingStyle ? ` • ${item.profile.ridingStyle}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      {ads.length > 0 && (
        <View style={styles.adBanner}>
          <Text style={styles.adText}>Syneco: {ads[0].title}</Text>
        </View>
      )}
    </View>
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
  mapPlaceholder: {
    backgroundColor: Colors.surface,
    margin: 16,
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  mapText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 12 },
  mapSubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  coordText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 8 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12 },
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
  adBanner: {
    backgroundColor: Colors.accent + "20",
    padding: 12,
    margin: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  adText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.accent },
});
