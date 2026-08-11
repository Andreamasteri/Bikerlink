import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import WebView from "react-native-webview";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { buildLeafletGpsTrackHtml, type GpsSample } from "@/lib/leaflet-gps-track-html";

const DEFAULT_TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const DEFAULT_TILE_MAXZOOM = 19;

export interface Session {
  userId: string;
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

export function SessionMapModal({
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
    queryKey: ["/api/admin/telemetry/sessions", session.userId, session.sessionId, "samples"],
    queryFn: () => adminFetch(`/api/admin/telemetry/sessions/${session.sessionId}/samples?userId=${encodeURIComponent(session.userId)}`),
    staleTime: 60_000,
    enabled: visible,
  });

  const samples = useMemo(() => data?.samples ?? [], [data?.samples]);
  const hasSpeed = samples.some((s) => s.speedKmh != null);
  const hasLean = samples.some((s) => s.leanAngle != null);

  const mapHtml = useMemo(() => {
    if (!samples.length) return null;
    return buildLeafletGpsTrackHtml(DEFAULT_TILE_URL, DEFAULT_TILE_MAXZOOM, samples, Colors.accent, colorMode);
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

const styles = StyleSheet.create({
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
