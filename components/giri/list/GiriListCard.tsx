import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface PlannedRoute {
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

interface GiriListCardProps {
  route: PlannedRoute;
  isOffline: boolean;
  isMine: boolean;
  onPress: () => void;
  onDelete: () => void;
}

export function GiriListCard({ route, isOffline, isMine, onPress, onDelete }: GiriListCardProps) {
  const colors = useColors();
  const s = styles(colors);

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

  return (
    <Pressable
      style={s.card}
      onPress={onPress}
    >
      <View style={s.cardHeader}>
        <View style={s.cardTitleRow}>
          <MaterialCommunityIcons
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {isOffline && (
            <MaterialCommunityIcons
              name="cloud-check-outline"
              size={18}
              color="#22c55e"
              testID={`offline-badge-${route.id}`}
            />
          )}
          {isMine && (
            <Pressable
              onPress={onDelete}
              hitSlop={12}
              style={{ padding: 4 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.accentRed} />
            </Pressable>
          )}
        </View>
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
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
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
