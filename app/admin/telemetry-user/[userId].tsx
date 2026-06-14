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
import { type GpsSample } from "@/lib/leaflet-gps-track-html";
import { SessionMapModal, type Session } from "@/components/admin/telemetry/SessionMapModal";

type MountCalibration = {
  longAxis: "x" | "y" | "z";
  latAxis: "x" | "y" | "z";
  vertAxis: "x" | "y" | "z";
  longSign: 1 | -1;
  timestamp: number;
} | null;

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

const SESSION_TYPE_COLORS: Record<string, string> = {
  ride: Colors.accent,
  trip: "#22c55e",
  free: "#f59e0b",
  ideal_lap: "#8b5cf6",
};

function SessionTypeBadge({ type }: { type: string }) {
  const color = SESSION_TYPE_COLORS[type] ?? Colors.textSecondary;
  const label = type === "ideal_lap" ? "pista" : type;
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return String(ms);
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SamplesPreview({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery<{ samples: GpsSample[]; total: number }>({
    queryKey: ["/api/admin/telemetry/sessions", sessionId, "samples"],
    queryFn: () => adminFetch(`/api/admin/telemetry/sessions/${sessionId}/samples`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 8 }} />;
  }

  const samples = data?.samples ?? [];
  if (!samples.length) {
    return <Text style={styles.noSamples}>Nessun campione trovato</Text>;
  }

  const preview = [samples[0], ...samples.slice(-Math.min(4, samples.length - 1))];

  return (
    <View style={styles.samplesContainer}>
      <Text style={styles.samplesInfo}>
        {data?.total} campioni totali · preview {samples.length} (subsampleati)
      </Text>
      <View style={styles.sampleTable}>
        <View style={[styles.sampleRow, styles.sampleHeader]}>
          <Text style={[styles.sampleCell, styles.sampleHeaderText, { flex: 2 }]}>Timestamp</Text>
          <Text style={[styles.sampleCell, styles.sampleHeaderText]}>Lat</Text>
          <Text style={[styles.sampleCell, styles.sampleHeaderText]}>Lon</Text>
          <Text style={[styles.sampleCell, styles.sampleHeaderText]}>km/h</Text>
          <Text style={[styles.sampleCell, styles.sampleHeaderText]}>Lean°</Text>
        </View>
        {preview.map((s, i) => (
          <View key={i} style={[styles.sampleRow, i % 2 === 0 ? styles.sampleRowEven : {}]}>
            <Text style={[styles.sampleCell, { flex: 2, fontSize: 10 }]}>{formatTs(s.ts)}</Text>
            <Text style={styles.sampleCell}>{s.lat.toFixed(4)}</Text>
            <Text style={styles.sampleCell}>{s.lon.toFixed(4)}</Text>
            <Text style={styles.sampleCell}>{s.speedKmh ?? "—"}</Text>
            <Text style={styles.sampleCell}>{s.leanAngle ?? "—"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CalibrationCard({ calibration }: { calibration: MountCalibration }) {
  if (calibration === null) {
    return (
      <View style={styles.calibrationCard}>
        <View style={styles.calibrationHeader}>
          <MaterialCommunityIcons name="bike" size={16} color={Colors.textSecondary} />
          <Text style={styles.calibrationTitle}>Calibrazione moto</Text>
          <View style={styles.calibrationBadgeNone}>
            <Text style={styles.calibrationBadgeNoneText}>Nessuna calibrazione</Text>
          </View>
        </View>
      </View>
    );
  }

  const ts = new Date(calibration.timestamp).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <View style={styles.calibrationCard}>
      <View style={styles.calibrationHeader}>
        <MaterialCommunityIcons name="bike" size={16} color={Colors.accent} />
        <Text style={styles.calibrationTitle}>Calibrazione moto</Text>
        <View style={styles.calibrationBadgeOk}>
          <Text style={styles.calibrationBadgeOkText}>Presente</Text>
        </View>
      </View>
      <Text style={styles.calibrationTs}>{ts}</Text>
      <View style={styles.calibrationAxes}>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>longAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.longAxis.toUpperCase()}</Text>
          <Text style={styles.calibrationAxisSign}>{calibration.longSign === 1 ? "+" : "−"}</Text>
        </View>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>latAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.latAxis.toUpperCase()}</Text>
        </View>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>vertAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.vertAxis.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function SessionCard({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <TouchableOpacity
          style={styles.sessionHeaderMain}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.75}
        >
          <SessionTypeBadge type={session.sessionType} />
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionDate}>{formatDate(session.startedAt)}</Text>
            {session.lapName && (
              <Text style={styles.sessionLapName} numberOfLines={1}>{session.lapName}</Text>
            )}
            <View style={styles.sessionMeta}>
              <Text style={styles.sessionMetaText}>
                {session.km > 0 ? `${session.km} km · ` : ""}{session.sampleCount} campioni
              </Text>
            </View>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => setMapVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="map-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {expanded && <SamplesPreview sessionId={session.sessionId} />}

      {mapVisible && (
        <SessionMapModal
          session={session}
          visible={mapVisible}
          onClose={() => setMapVisible(false)}
        />
      )}
    </View>
  );
}

export default function TelemetryUserDetailScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [resettingCalibration, setResettingCalibration] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{ sessions: Session[]; userId: number }>({
    queryKey: ["/api/admin/telemetry/users", userId, "sessions"],
    queryFn: () => adminFetch(`/api/admin/telemetry/users/${userId}/sessions`),
    staleTime: 30_000,
    enabled: !!userId,
  });

  const userDetailKey = ["/api/admin/users", userId];
  const { data: userDetail, isLoading: userDetailLoading, isError: userDetailError, refetch: refetchUserDetail } = useQuery<UserDetail>({
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

      {isLoading && (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.accent} />
      )}
      {error && (
        <Text style={styles.errorText}>Errore caricamento sessioni</Text>
      )}

      <View style={styles.sessionsContainer}>
        {sessions.map((session) => (
          <SessionCard key={session.sessionId} session={session} />
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent + "18",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.accent,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.accent,
  },
  sessionsContainer: {
    gap: 8,
  },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sessionHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    paddingRight: 4,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionDate: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  sessionLapName: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  sessionMeta: {
    flexDirection: "row",
    gap: 6,
  },
  sessionMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  mapBtn: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  samplesContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  samplesInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 6,
  },
  sampleTable: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sampleRow: {
    flexDirection: "row",
  },
  sampleRowEven: {
    backgroundColor: Colors.background,
  },
  sampleHeader: {
    backgroundColor: Colors.accent + "18",
  },
  sampleCell: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.text,
    paddingHorizontal: 4,
    paddingVertical: 4,
    textAlign: "center",
  },
  sampleHeaderText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.accent,
  },
  noSamples: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
    marginTop: 32,
  },
  emptyState: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 48,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
  },
  refreshText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.accent,
  },
  resetCalibrationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef444433",
    backgroundColor: "#ef444412",
  },
  resetCalibrationText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#ef4444",
  },
  resetCalibrationNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  calibrationCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calibrationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calibrationTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  calibrationBadgeNone: {
    backgroundColor: Colors.textSecondary + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  calibrationBadgeNoneText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  calibrationBadgeOk: {
    backgroundColor: "#22c55e22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  calibrationBadgeOkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#22c55e",
  },
  calibrationTs: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 10,
  },
  calibrationAxes: {
    flexDirection: "row",
    gap: 8,
  },
  calibrationAxisItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
  calibrationAxisLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  calibrationAxisValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.accent,
  },
  calibrationAxisSign: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  calibrationErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#f59e0b18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f59e0b33",
  },
  calibrationErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#f59e0b",
    flex: 1,
  },
});
