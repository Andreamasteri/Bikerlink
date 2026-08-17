import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { TelemetryDiagLog } from "./TelemetryDiagLog";
import { TelemetryTopRiders } from "./TelemetryTopRiders";

interface TelemetryStats {
  totalSamples: number;
  activeUsers: number;
  kmCollected: number;
  latestSample: string | null;
}

const TELEMETRY_STALE_THRESHOLD_HOURS = 24;

async function fetchWithCause(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = options.signal;
  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.clone().json();
      detail = body?.detail || body?.message || "";
    } catch (_) {
      // no-op: ignore JSON parse errors when building error message
    }
    const err = new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    (err as Error & { detail?: string }).detail = detail;
    throw err;
  }
  return res;
}

export { fetchWithCause };

export function TelemetryCard() {
  const { data, isLoading, error } = useQuery<TelemetryStats>({
    queryKey: ["/api/admin/telemetry-stats"],
    queryFn: async ({ signal }) => {
      const res = await fetchWithCause(new URL("/api/admin/telemetry-stats", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal,
      });
      return res.json();
    },
    staleTime: 60_000,
  });

  const [collapsed, setCollapsed] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  const isStale = data
    ? !data.latestSample ||
      (() => {
        const ts = new Date(data.latestSample!).getTime();
        return !Number.isFinite(ts) || Date.now() - ts > TELEMETRY_STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
      })()
    : false;

  const statsErrorDetail = (error as (Error & { detail?: string }) | null)?.detail;

  return (
    <View style={styles.card}>
      <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setInfoVisible(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Metriche Telemetria</Text>
            <View style={styles.modalRow}>
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalMetricName}>Campioni</Text>
                <Text style={styles.modalMetricDesc}>Punti GPS inviati dall'app durante le sessioni di guida.</Text>
              </View>
            </View>
            <View style={styles.modalRow}>
              <MaterialCommunityIcons name="account-multiple" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalMetricName}>Utenti attivi</Text>
                <Text style={styles.modalMetricDesc}>Riders che hanno guidato e trasmesso dati nelle ultime 24h.</Text>
              </View>
            </View>
            <View style={styles.modalRow}>
              <MaterialCommunityIcons name="map-marker-distance" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalMetricName}>Km stimati</Text>
                <Text style={styles.modalMetricDesc}>Distanza totale percorsa da tutti gli utenti (formula Haversine).</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setInfoVisible(false)}>
              <Text style={styles.modalCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <TouchableOpacity style={styles.cardHeader} onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7} testID="telemetry-card-header">
        <MaterialCommunityIcons name="chart-line" size={18} color="#22c55e" />
        <Text style={styles.cardTitle}>Telemetria</Text>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); setInfoVisible(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="telemetry-info-btn">
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color="#22c55e" />}
          {error && !isLoading && <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />}
          {!isLoading && !error && isStale && <MaterialCommunityIcons name="alert" size={16} color="#f59e0b" />}
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <>
          {error && !isLoading && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle" size={13} color="#ef4444" />
              <Text style={styles.errorBannerText} numberOfLines={3}>
                {statsErrorDetail || (error as Error).message || "Errore caricamento statistiche"}
              </Text>
            </View>
          )}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data ? data.totalSamples.toLocaleString("it-IT") : "—"}</Text>
              <Text style={styles.statLabel}>Campioni</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data ? String(data.activeUsers) : "—"}</Text>
              <Text style={styles.statLabel}>Utenti attivi</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: "#22c55e" }]}>{data ? `${data.kmCollected.toLocaleString("it-IT")} km` : "—"}</Text>
              <Text style={styles.statLabel}>Km stimati</Text>
            </View>
          </View>
          {!isLoading && !error && isStale && (
            <View style={styles.staleWarning}>
              <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
              <Text style={styles.staleWarningText}>Nessun campione nelle ultime {TELEMETRY_STALE_THRESHOLD_HOURS}h</Text>
            </View>
          )}
          <View style={styles.lastSample}>
            <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.lastSampleText}>Ultimo campione: {data ? formatDate(data.latestSample) : "—"}</Text>
          </View>

          <TelemetryTopRiders collapsed={collapsed} />
          <TelemetryDiagLog collapsed={collapsed} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  headerRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  staleWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  staleWarningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
  },
  lastSample: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lastSampleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.10)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  errorBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
    flex: 1,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  modalMetricName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 2,
  },
  modalMetricDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  modalClose: {
    marginTop: 8,
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#22c55e",
    borderRadius: 8,
  },
  modalCloseText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
