import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { type GpsSample } from "@/lib/leaflet-gps-track-html";
import { SessionMapModal, type Session } from "@/components/admin/telemetry/SessionMapModal";

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

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return String(ms); }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function SessionTypeBadge({ type }: { type: string }) {
  const color = SESSION_TYPE_COLORS[type] ?? Colors.textSecondary;
  const label = type === "ideal_lap" ? "pista" : type;
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function SamplesPreview({ userId, sessionId }: { userId: string; sessionId: string }) {
  const { data, isLoading } = useQuery<{ samples: GpsSample[]; total: number }>({
    queryKey: ["/api/admin/telemetry/sessions", userId, sessionId, "samples"],
    queryFn: () => adminFetch(`/api/admin/telemetry/sessions/${sessionId}/samples?userId=${encodeURIComponent(userId)}`),
    staleTime: 60_000,
  });

  if (isLoading) return <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 8 }} />;

  const samples = data?.samples ?? [];
  if (!samples.length) return <Text style={styles.noSamples}>Nessun campione trovato</Text>;

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

export function SessionCard({ session }: { session: Session }) {
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
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
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

      {expanded && <SamplesPreview userId={session.userId} sessionId={session.sessionId} />}
      {mapVisible && (
        <SessionMapModal session={session} visible={mapVisible} onClose={() => setMapVisible(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase" },
  sessionCard: { backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden" },
  sessionHeader: { flexDirection: "row", alignItems: "center" },
  sessionHeaderMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingRight: 4 },
  sessionInfo: { flex: 1, gap: 2 },
  sessionDate: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  sessionLapName: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  sessionMeta: { flexDirection: "row", gap: 6 },
  sessionMetaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  mapBtn: { paddingHorizontal: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  samplesContainer: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  samplesInfo: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 8, marginBottom: 6 },
  sampleTable: { borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  sampleRow: { flexDirection: "row" },
  sampleRowEven: { backgroundColor: Colors.background },
  sampleHeader: { backgroundColor: Colors.accent + "18" },
  sampleCell: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text, paddingHorizontal: 4, paddingVertical: 4, textAlign: "center" },
  sampleHeaderText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.accent },
  noSamples: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", paddingVertical: 8 },
});
