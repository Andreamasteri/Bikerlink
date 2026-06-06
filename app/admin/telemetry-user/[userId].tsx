import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import WebView from "react-native-webview";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { buildLeafletGpsTrackHtml, type GpsSample } from "@/lib/leaflet-gps-track-html";

const DEFAULT_TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const DEFAULT_TILE_MAXZOOM = 19;

interface Session {
  sessionId: string;
  sessionType: string;
  lapName: string | null;
  sampleCount: number;
  startedAt: string;
  endedAt: string;
  km: number;
}

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

function SessionMapModal({
  session,
  visible,
  onClose,
}: {
  session: Session;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [colorMode, setColorMode] = useState<"speed" | "lean" | "flat">("speed");

  const { data, isLoading, error } = useQuery<{ samples: GpsSample[]; total: number }>({
    queryKey: ["/api/admin/telemetry/sessions", session.sessionId, "samples"],
    queryFn: () => adminFetch(`/api/admin/telemetry/sessions/${session.sessionId}/samples`),
    staleTime: 60_000,
    enabled: visible,
  });

  const samples = data?.samples ?? [];

  const hasSpeed = samples.some((s) => s.speedKmh != null);
  const hasLean = samples.some((s) => s.leanAngle != null);

  const mapHtml = useMemo(() => {
    if (!samples.length) return null;
    return buildLeafletGpsTrackHtml(
      DEFAULT_TILE_URL,
      DEFAULT_TILE_MAXZOOM,
      samples,
      Colors.accent,
      colorMode
    );
  }, [samples, colorMode]);

  const mapBaseUrl = getApiUrl();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <MaterialCommunityIcons name="map-marker-path" size={18} color={Colors.accent} />
            <Text style={styles.modalTitle} numberOfLines={1}>
              {formatDate(session.startedAt)} · {session.sessionType}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {(hasSpeed || hasLean) && (
          <View style={styles.colorModeRow}>
            {(["speed", "lean", "flat"] as const)
              .filter((m) => m === "flat" || (m === "speed" && hasSpeed) || (m === "lean" && hasLean))
              .map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeChip, colorMode === m && styles.modeChipActive]}
                  onPress={() => setColorMode(m)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.modeChipText, colorMode === m && styles.modeChipTextActive]}>
                    {m === "speed" ? "Velocità" : m === "lean" ? "Lean" : "Monocromo"}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        )}

        <View style={styles.mapContainer}>
          {isLoading && (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.mapLoadingText}>Caricamento campioni…</Text>
            </View>
          )}
          {error && (
            <View style={styles.mapLoading}>
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#ef4444" />
              <Text style={[styles.mapLoadingText, { color: "#ef4444" }]}>Errore caricamento dati</Text>
            </View>
          )}
          {!isLoading && !error && samples.length === 0 && (
            <View style={styles.mapLoading}>
              <MaterialCommunityIcons name="map-marker-off" size={36} color={Colors.textSecondary} />
              <Text style={styles.mapLoadingText}>Nessun punto GPS disponibile</Text>
            </View>
          )}
          {mapHtml && (
            <WebView
              source={{ html: mapHtml, baseUrl: mapBaseUrl }}
              style={styles.mapWebView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={["https://*", "http://*", "about:*"]}
              scrollEnabled={false}
              bounces={false}
              overScrollMode="never"
              cacheEnabled={false}
              onError={(e) =>
                console.warn("[SessionMapModal] WebView error:", e.nativeEvent.description)
              }
            />
          )}
        </View>

        <View style={[styles.mapFooter, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.mapFooterText}>
            {data?.total != null ? `${data.total} campioni totali` : ""}
            {samples.length > 0 && data?.total != null && data.total !== samples.length
              ? ` · ${samples.length} mostrati`
              : ""}
            {session.km > 0 ? ` · ${session.km} km` : ""}
          </Text>
          <View style={styles.mapLegendRow}>
            <View style={[styles.mapLegendDot, { backgroundColor: "#22c55e" }]} />
            <Text style={styles.mapLegendLabel}>Partenza</Text>
            <View style={[styles.mapLegendDot, { backgroundColor: "#ef4444", marginLeft: 10 }]} />
            <Text style={styles.mapLegendLabel}>Arrivo</Text>
          </View>
        </View>
      </View>
    </Modal>
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

  const { data, isLoading, error, refetch } = useQuery<{ sessions: Session[]; userId: number }>({
    queryKey: ["/api/admin/telemetry/users", userId, "sessions"],
    queryFn: () => adminFetch(`/api/admin/telemetry/users/${userId}/sessions`),
    staleTime: 30_000,
    enabled: !!userId,
  });

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
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  colorModeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeChipActive: {
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent + "88",
  },
  modeChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modeChipTextActive: {
    color: Colors.accent,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  mapWebView: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Colors.background,
  },
  mapLoadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  mapFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  mapFooterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  mapLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  mapLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  mapLegendLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
