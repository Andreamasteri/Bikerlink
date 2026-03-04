import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({ queryKey: [`/api/routes/${id}`] });

  const route = (data as any)?.route;
  const points = (data as any)?.points || [];
  const likeCount = (data as any)?.likeCount || 0;
  const hasLiked = (data as any)?.hasLiked || false;

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (hasLiked) {
        await apiRequest("DELETE", `/api/routes/${id}/like`);
      } else {
        await apiRequest("POST", `/api/routes/${id}/like`);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/routes/${id}`] }),
  });

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  if (!route) {
    return <View style={styles.loading}><Text style={styles.errorText}>Percorso non trovato</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}>
      <Text style={styles.title}>{route.title || "Percorso"}</Text>
      <Text style={styles.date}>{new Date(route.startTime).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.totalDistanceKm?.toFixed(1) || "0"}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.maxSpeedKmh?.toFixed(0) || "0"}</Text>
          <Text style={styles.statLabel}>km/h max</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.totalDurationMinutes || "0"}</Text>
          <Text style={styles.statLabel}>minuti</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{route.maxAltitudeM?.toFixed(0) || "-"}</Text>
          <Text style={styles.statLabel}>m alt. max</Text>
        </View>
      </View>

      <View style={styles.routeMapPlaceholder}>
        <Ionicons name="map" size={48} color={Colors.textSecondary} />
        <Text style={styles.pointsCount}>{points.length} punti registrati</Text>
      </View>

      <View style={styles.likeRow}>
        <Pressable style={styles.likeBtn} onPress={() => likeMutation.mutate()}>
          <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={24} color={hasLiked ? Colors.accentRed : Colors.text} />
          <Text style={styles.likeCount}>{likeCount}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, paddingHorizontal: 24, paddingTop: 16 },
  date: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, paddingHorizontal: 24, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 24 },
  statCard: { flex: 1, minWidth: "40%", backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: "center" },
  statValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.accent },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  routeMapPlaceholder: { backgroundColor: Colors.surface, margin: 24, marginTop: 0, borderRadius: 12, padding: 40, alignItems: "center" },
  pointsCount: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 8 },
  likeRow: { paddingHorizontal: 24 },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  likeCount: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
});
