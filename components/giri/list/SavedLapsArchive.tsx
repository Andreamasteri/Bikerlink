import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { IdealLap } from "@/components/profile/types";

function useIdealLaps() {
  return useQuery<IdealLap[]>({
    queryKey: ["/api/telemetry/ideal-laps"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telemetry/ideal-laps");
      const json = await res.json() as { laps: IdealLap[] };
      return json.laps ?? [];
    },
    staleTime: 30_000,
  });
}

export function SavedLapsArchive() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: laps, isLoading, isError } = useIdealLaps();

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest("DELETE", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
    },
  });

  const handleDelete = useCallback((lap: IdealLap) => {
    const name = lap.lapName ?? `Giro ${lap.lapNumber}`;
    Alert.alert(
      `Elimina ${name}`,
      "Vuoi eliminare questo giro ideale salvato?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteMutation.mutate(lap.sessionId),
        },
      ]
    );
  }, [deleteMutation]);

  const s = styles(colors);

  if (isLoading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
          <Text style={s.title}>Giri Ideali Salvati</Text>
        </View>
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.loadingText}>Caricamento...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
          <Text style={s.title}>Giri Ideali Salvati</Text>
        </View>
        <Text style={s.errorText}>Impossibile caricare i giri salvati.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
        <Text style={s.title}>Giri Ideali Salvati ({laps?.length ?? 0})</Text>
      </View>

      {(!laps || laps.length === 0) ? (
        <View style={s.emptyState}>
          <Ionicons name="timer-outline" size={36} color={colors.textSecondary} />
          <Text style={s.emptyTitle}>Nessun giro salvato ancora</Text>
          <Text style={s.emptySubtitle}>
            Usa il Giro Ideale per registrare la tua prima sessione.
          </Text>
        </View>
      ) : (
        laps.map((lap) => {
          const date = new Date(lap.startedAt);
          const dateStr = date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
          const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const name = lap.lapName ?? `Giro ${lap.lapNumber}`;

          return (
            <View key={lap.sessionId} style={s.cardRow}>
              <TouchableOpacity
                style={s.card}
                onPress={() => router.push(`/giro/${encodeURIComponent(lap.sessionId)}` as never)}
                activeOpacity={0.75}
              >
                <View style={s.cardLeft}>
                  <Text style={s.cardName} numberOfLines={1}>{name}</Text>
                  <Text style={s.cardDate}>{dateStr} {timeStr}</Text>
                  <View style={s.statsRow}>
                    {lap.distanceKm != null && (
                      <View style={s.statItem}>
                        <Ionicons name="navigate-outline" size={10} color={colors.textSecondary} />
                        <Text style={s.statVal}>{lap.distanceKm.toFixed(2)} km</Text>
                      </View>
                    )}
                    <View style={s.statItem}>
                      <Ionicons name="speedometer-outline" size={10} color={colors.accent} />
                      <Text style={s.statVal}>{lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh} km/h` : "—"}</Text>
                    </View>
                    <View style={s.statItem}>
                      <MaterialCommunityIcons name="rotate-3d-variant" size={10} color="#f39c12" />
                      <Text style={s.statVal}>{lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}</Text>
                    </View>
                    <View style={s.statItem}>
                      <MaterialCommunityIcons name="gauge" size={10} color="#9b59b6" />
                      <Text style={s.statVal}>{lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}</Text>
                    </View>
                    <Text style={s.samples}>{lap.sampleCount} c.</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ paddingLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => handleDelete(lap)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.accentRed} />
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      marginTop: 16,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 10,
    },
    title: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
    },
    loadingText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.accentRed,
      paddingVertical: 8,
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.textSecondary,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: 16,
    },
    cardRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
      gap: 6,
    },
    card: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardLeft: {
      flex: 1,
      gap: 2,
    },
    cardName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    cardDate: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      marginTop: 1,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
      flexWrap: "wrap",
    },
    statItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    statVal: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.text,
    },
    samples: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    deleteBtn: {
      padding: 4,
    },
  });
