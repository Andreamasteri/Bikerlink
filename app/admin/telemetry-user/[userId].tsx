import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { type Session } from "@/components/admin/telemetry/SessionMapModal";
import { SessionCard } from "@/components/admin/telemetry-user/SessionCard";
import { CalibrationCard, type MountCalibration } from "@/components/admin/telemetry-user/CalibrationCard";

type UserDetail = {
  mountCalibration: MountCalibration;
};

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function TelemetryUserDetailScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [resettingCalibration, setResettingCalibration] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{ sessions: Session[]; userId: string }>({
    queryKey: ["/api/admin/telemetry/users", userId, "sessions"],
    queryFn: () => adminFetch(`/api/admin/telemetry/users/${userId}/sessions`),
    staleTime: 30_000,
    enabled: !!userId,
  });

  const userDetailKey = ["/api/admin/users", userId];
  const {
    data: userDetail,
    isLoading: userDetailLoading,
    isError: userDetailError,
    refetch: refetchUserDetail,
  } = useQuery<UserDetail>({
    queryKey: userDetailKey,
    queryFn: () => adminFetch(`/api/admin/users/${userId}`),
    staleTime: 30_000,
    enabled: !!userId,
  });

  const calibration = userDetail !== undefined ? (userDetail.mountCalibration ?? null) : null;
  const hasCalibration = calibration !== null && !userDetailError;

  async function handleResetCalibration() {
    Alert.alert(
      "Reset calibrazione moto",
      "Cancella la calibrazione salvata sul server per questo utente. L'utente dovrà ricalibrar la prossima volta che apre l'app.\n\nProcedere?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setResettingCalibration(true);
            try {
              const res = await fetch(
                new URL(`/api/admin/users/${userId}/calibration`, getApiUrl()).toString(),
                {
                  method: "DELETE",
                  headers: { ...(await authFetchHeaders()) },
                  credentials: "include",
                },
              );
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              await queryClient.invalidateQueries({ queryKey: userDetailKey });
              Alert.alert("Fatto", "Calibrazione resettata. L'utente dovrà ricalibrar al prossimo avvio dell'app.");
            } catch (err) {
              console.error("[admin] reset calibration error:", err);
              Alert.alert("Errore", "Reset calibrazione fallito. Riprova.");
            } finally {
              setResettingCalibration(false);
            }
          },
        },
      ],
    );
  }

  const sessions = data?.sessions ?? [];
  const rideKm = sessions
    .filter((s) => s.sessionType !== "ideal_lap")
    .reduce((acc, s) => acc + s.km, 0);
  const trackKm = sessions
    .filter((s) => s.sessionType === "ideal_lap")
    .reduce((acc, s) => acc + s.km, 0);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <MaterialCommunityIcons name="map-marker-distance" size={16} color={Colors.accent} />
          <Text style={styles.summaryValue}>{Math.round(rideKm * 10) / 10}</Text>
          <Text style={styles.summaryLabel}>km giro</Text>
        </View>
        {trackKm > 0 && (
          <View style={[styles.summaryChip, { backgroundColor: "#8b5cf622" }]}>
            <MaterialCommunityIcons name="flag-checkered" size={16} color="#8b5cf6" />
            <Text style={[styles.summaryValue, { color: "#8b5cf6" }]}>{Math.round(trackKm * 10) / 10}</Text>
            <Text style={[styles.summaryLabel, { color: "#8b5cf6" }]}>km pista</Text>
          </View>
        )}
        <View style={[styles.summaryChip, { backgroundColor: Colors.surface }]}>
          <Ionicons name="layers-outline" size={16} color={Colors.textSecondary} />
          <Text style={[styles.summaryValue, { color: Colors.text }]}>{sessions.length}</Text>
          <Text style={styles.summaryLabel}>sessioni</Text>
        </View>
      </View>

      {isLoading && <ActivityIndicator style={{ marginTop: 48 }} color={Colors.accent} />}
      {error && <Text style={styles.errorText}>Errore caricamento sessioni</Text>}

      <View style={styles.sessionsContainer}>
        {sessions.map((session) => (
          <SessionCard key={`${session.userId}:${session.sessionId}`} session={session} />
        ))}
        {!isLoading && sessions.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-marker-off" size={36} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessuna sessione trovata</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()} activeOpacity={0.8}>
        <Ionicons name="refresh" size={16} color={Colors.accent} />
        <Text style={styles.refreshText}>Aggiorna</Text>
      </TouchableOpacity>

      {userDetailLoading ? (
        <ActivityIndicator style={{ marginTop: 16 }} size="small" color={Colors.accent} />
      ) : userDetailError ? (
        <TouchableOpacity
          style={styles.calibrationErrorRow}
          onPress={() => refetchUserDetail()}
          activeOpacity={0.75}
        >
          <Ionicons name="warning-outline" size={15} color="#f59e0b" />
          <Text style={styles.calibrationErrorText}>Errore caricamento calibrazione — Riprova</Text>
        </TouchableOpacity>
      ) : (
        <CalibrationCard calibration={calibration} />
      )}

      {hasCalibration && (
        <>
          <TouchableOpacity
            style={styles.resetCalibrationBtn}
            onPress={handleResetCalibration}
            activeOpacity={0.8}
            disabled={resettingCalibration}
          >
            {resettingCalibration ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <MaterialCommunityIcons name="refresh-circle" size={16} color="#ef4444" />
            )}
            <Text style={styles.resetCalibrationText}>Reset calibrazione moto</Text>
          </TouchableOpacity>
          <Text style={styles.resetCalibrationNote}>
            L'utente dovrà ricalibrar la prossima volta che apre l'app
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 16, flexWrap: "wrap" },
  summaryChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.accent + "18", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  summaryLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.accent },
  sessionsContainer: { gap: 8 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#ef4444", textAlign: "center", marginTop: 32 },
  emptyState: { alignItems: "center", gap: 12, paddingVertical: 48 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20 },
  refreshText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.accent },
  resetCalibrationBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: "#ef444433", backgroundColor: "#ef444412" },
  resetCalibrationText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#ef4444" },
  resetCalibrationNote: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", marginTop: 6, marginBottom: 8, paddingHorizontal: 16 },
  calibrationErrorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#f59e0b18", borderRadius: 10, borderWidth: 1, borderColor: "#f59e0b33" },
  calibrationErrorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#f59e0b", flex: 1 },
});
