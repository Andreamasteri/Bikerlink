import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

interface PlannedRoute {
  id: string;
  title: string;
  description?: string | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  style: "curvy" | "balanced" | "fast";
  visibility: "public" | "private";
  isMultiDay: boolean;
  waypoints: Array<{ lat: number; lng: number; name?: string }>;
  createdAt: string;
  metadata?: {
    weatherSummary?: { icon: string; avgTemp: number; hasRain: boolean };
    bikerCount?: number;
    realCurvatureScore?: number;
  } | null;
}

type FilterTab = "mine" | "public";

export default function GiriScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("mine");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: routes = [], isLoading, refetch } = useQuery<PlannedRoute[]>({
    queryKey: ["/api/planned-routes", filter],
    queryFn: async () => {
      const url = filter === "public"
        ? "/api/planned-routes?filter=public"
        : "/api/planned-routes";
      return apiRequest("GET", url).then((r) => r.json());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/planned-routes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planned-routes"] }); },
  });

  const styleIcon = (style: string) => {
    if (style === "curvy") return "road-variant";
    if (style === "fast") return "rocket-launch-outline";
    return "scale-balance";
  };

  const styleLabel = (style: string) => {
    if (style === "curvy") return "Curve";
    if (style === "fast") return "Veloce";
    return "Bilanciato";
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}min`;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const bikerScoreColor = (score: number) => {
    if (score >= 0.7) return "#22c55e";
    if (score >= 0.4) return colors.accent;
    return colors.textSecondary;
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Giri</Text>
          <Text style={s.headerSub}>I tuoi percorsi in moto</Text>
        </View>
        <Pressable
          style={s.planBtn}
          onPress={() => router.push("/giri/create" as any)}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={20} color="#000" />
          <Text style={s.planBtnText}>Pianifica</Text>
        </Pressable>
      </View>

      <View style={s.filterRow}>
        {(["mine", "public"] as FilterTab[]).map((f) => (
          <Pressable
            key={f}
            style={[s.filterChip, filter === f && { backgroundColor: colors.accent }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterChipText, filter === f && { color: "#000" }]}>
              {f === "mine" ? "I miei" : "Pubblici"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: botPad + 80, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="loading" size={40} color={colors.textSecondary} />
            <Text style={s.emptyText}>Caricamento...</Text>
          </View>
        ) : routes.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="map-marker-path" size={60} color={colors.textSecondary} />
            <Text style={s.emptyTitle}>
              {filter === "mine" ? "Nessun giro pianificato" : "Nessun giro pubblico"}
            </Text>
            <Text style={s.emptyText}>
              {filter === "mine"
                ? "Premi \"Pianifica\" per creare il tuo primo giro in moto"
                : "Non ci sono ancora giri condivisi dalla community"}
            </Text>
            {filter === "mine" && (
              <Pressable
                style={[s.planBtn, { marginTop: 16 }]}
                onPress={() => router.push("/giri/create" as any)}
              >
                <MaterialCommunityIcons name="map-marker-plus" size={18} color="#000" />
                <Text style={s.planBtnText}>Pianifica ora</Text>
              </Pressable>
            )}
          </View>
        ) : (
          routes.map((route) => (
            <Pressable
              key={route.id}
              style={s.card}
              onPress={() => router.push(`/giri/${route.id}` as any)}
            >
              <View style={s.cardHeader}>
                <View style={s.cardTitleRow}>
                  <MaterialCommunityIcons
                    name={styleIcon(route.style) as any}
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={s.cardTitle} numberOfLines={1}>{route.title}</Text>
                  {route.isMultiDay && (
                    <View style={s.multiDayBadge}>
                      <Text style={s.multiDayText}>Multi-giorno</Text>
                    </View>
                  )}
                </View>
                {filter === "mine" && (
                  <Pressable
                    onPress={() => deleteMutation.mutate(route.id)}
                    hitSlop={12}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.accentRed} />
                  </Pressable>
                )}
              </View>

              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Ionicons name="navigate-outline" size={14} color={colors.textSecondary} />
                  <Text style={s.statText}>{route.distanceKm} km</Text>
                </View>
                <View style={s.stat}>
                  <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                  <Text style={s.statText}>{formatDuration(route.durationMinutes)}</Text>
                </View>
                <View style={s.stat}>
                  <MaterialCommunityIcons name="steering" size={14} color={colors.textSecondary} />
                  <Text style={s.statText}>{styleLabel(route.style)}</Text>
                </View>
              </View>

              <View style={s.bikerScoreRow}>
                <Text style={s.bikerScoreLabel}>BikerScore</Text>
                <View style={s.bikerScoreBar}>
                  <View
                    style={[
                      s.bikerScoreFill,
                      {
                        width: `${Math.round(route.bikerScore * 100)}%`,
                        backgroundColor: bikerScoreColor(route.bikerScore),
                      },
                    ]}
                  />
                </View>
                <Text style={[s.bikerScoreValue, { color: bikerScoreColor(route.bikerScore) }]}>
                  {Math.round(route.bikerScore * 100)}
                </Text>
              </View>

              {route.waypoints && route.waypoints.length > 0 && (
                <Text style={s.waypointsText} numberOfLines={1}>
                  {route.waypoints.map((wp, i) => wp.name ?? `Tappa ${i + 1}`).join(" → ")}
                </Text>
              )}

              {(route.metadata?.weatherSummary || (route.metadata?.bikerCount != null && route.metadata.bikerCount > 0)) && (
                <View style={s.cardMetaRow}>
                  {route.metadata?.weatherSummary && (
                    <View style={s.cardMetaBadge}>
                      <Ionicons
                        name={route.metadata.weatherSummary.icon === "rainy" ? "rainy-outline" : route.metadata.weatherSummary.icon === "cloudy" ? "cloudy-outline" : "sunny-outline"}
                        size={12}
                        color={route.metadata.weatherSummary.hasRain ? colors.accentRed : "#f59e0b"}
                      />
                      <Text style={[s.cardMetaText, route.metadata.weatherSummary.hasRain && { color: colors.accentRed }]}>
                        {route.metadata.weatherSummary.avgTemp}°C
                      </Text>
                    </View>
                  )}
                  {route.metadata?.bikerCount != null && route.metadata.bikerCount > 0 && (
                    <View style={s.cardMetaBadge}>
                      <MaterialCommunityIcons name="account-group-outline" size={12} color={colors.accent} />
                      <Text style={[s.cardMetaText, { color: colors.accent }]}>
                        {route.metadata.bikerCount} biker{route.metadata.bikerCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 26,
      color: colors.text,
    },
    headerSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    planBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
    },
    planBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: "#000",
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    filterChipText: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: colors.text,
    },
    emptyState: {
      alignItems: "center",
      paddingTop: 60,
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 18,
      color: colors.text,
      textAlign: "center",
    },
    emptyText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      gap: 8,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
    },
    cardTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.text,
      flex: 1,
    },
    multiDayBadge: {
      backgroundColor: "#7c3aed22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    multiDayText: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: "#a78bfa",
    },
    statsRow: {
      flexDirection: "row",
      gap: 16,
    },
    stat: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statText: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    bikerScoreRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    bikerScoreLabel: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      color: colors.textSecondary,
      width: 72,
    },
    bikerScoreBar: {
      flex: 1,
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    bikerScoreFill: {
      height: "100%",
      borderRadius: 3,
    },
    bikerScoreValue: {
      fontFamily: "Inter_700Bold",
      fontSize: 13,
      width: 28,
      textAlign: "right",
    },
    waypointsText: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
    },
    cardMetaRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    cardMetaBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    cardMetaText: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: colors.textSecondary,
    },
  });
