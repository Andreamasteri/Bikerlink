import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface TelemetryStats {
  totalSamples: number;
  activeUsers: number;
  kmCollected: number;
  latestSample: string | null;
}

interface TopRider {
  userId: number;
  username: string;
  sampleCount: number;
  km: number;
}

interface TopRidersResponse {
  riders: TopRider[];
}

interface GHStatus {
  mode: "self-hosted" | "cloud" | "disabled";
  profile: string;
  healthy: boolean;
  url: string;
}

const TELEMETRY_STALE_THRESHOLD_HOURS = 24;

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

export function GraphHopperCard() {
  const { data, isLoading, error } = useQuery<GHStatus>({
    queryKey: ["/api/admin/graphhopper-status"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/graphhopper-status", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const modeLabel: Record<string, string> = {
    "self-hosted": "Self-Hosted",
    cloud: "Cloud API",
    disabled: "Disabilitato",
  };
  const modeColor: Record<string, string> = {
    "self-hosted": "#22c55e",
    cloud: "#f59e0b",
    disabled: "#ef4444",
  };
  const color = data ? modeColor[data.mode] ?? "#6b7280" : "#6b7280";

  const [collapsed, setCollapsed] = useState(true);

  return (
    <View style={ghStyles.card}>
      <TouchableOpacity
        style={ghStyles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="graphhopper-card-header"
      >
        <MaterialCommunityIcons name="map-marker-path" size={18} color={color} />
        <Text style={ghStyles.cardTitle}>GraphHopper</Text>
        <View style={ghStyles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={color} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <View style={[ghStyles.healthDot, { backgroundColor: data.healthy ? "#22c55e" : "#ef4444" }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>
      {!collapsed && (
        <>
          <View style={ghStyles.row}>
            <View style={ghStyles.stat}>
              <Text style={[ghStyles.statValue, { color }]}>{data ? modeLabel[data.mode] ?? data.mode : "—"}</Text>
              <Text style={ghStyles.statLabel}>Modalità</Text>
            </View>
            <View style={ghStyles.divider} />
            <View style={ghStyles.stat}>
              <Text style={ghStyles.statValue}>{data ? data.profile : "—"}</Text>
              <Text style={ghStyles.statLabel}>Profilo</Text>
            </View>
            <View style={ghStyles.divider} />
            <View style={ghStyles.stat}>
              <Text style={[ghStyles.statValue, { color: data ? (data.healthy ? "#22c55e" : "#ef4444") : Colors.textSecondary }]}>
                {data ? (data.healthy ? "OK" : "Errore") : "—"}
              </Text>
              <Text style={ghStyles.statLabel}>Health</Text>
            </View>
          </View>
          {!isLoading && !error && data?.mode === "cloud" && (
            <View style={ghStyles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
              <Text style={ghStyles.warningText}>Profilo motorcycle non disponibile su Cloud. Usando 'car'.</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function TelemetryCard() {
  const { data, isLoading, error } = useQuery<TelemetryStats>({
    queryKey: ["/api/admin/telemetry-stats"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/telemetry-stats", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const [collapsed, setCollapsed] = useState(true);

  const { data: topRidersData, isLoading: topRidersLoading, error: topRidersError } = useQuery<TopRidersResponse>({
    queryKey: ["/api/admin/telemetry-top-riders"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/telemetry-top-riders?limit=5", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    enabled: !collapsed,
  });

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

  const [infoVisible, setInfoVisible] = useState(false);

  return (
    <View style={telStyles.card}>
      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <Pressable style={telStyles.modalOverlay} onPress={() => setInfoVisible(false)}>
          <Pressable style={telStyles.modalBox} onPress={() => {}}>
            <Text style={telStyles.modalTitle}>Metriche Telemetria</Text>
            <View style={telStyles.modalRow}>
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={telStyles.modalMetricName}>Campioni</Text>
                <Text style={telStyles.modalMetricDesc}>Punti GPS inviati dall'app durante le sessioni di guida.</Text>
              </View>
            </View>
            <View style={telStyles.modalRow}>
              <MaterialCommunityIcons name="account-multiple" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={telStyles.modalMetricName}>Utenti attivi</Text>
                <Text style={telStyles.modalMetricDesc}>Riders che hanno guidato e trasmesso dati nelle ultime 24h.</Text>
              </View>
            </View>
            <View style={telStyles.modalRow}>
              <MaterialCommunityIcons name="map-marker-distance" size={16} color="#22c55e" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={telStyles.modalMetricName}>Km stimati</Text>
                <Text style={telStyles.modalMetricDesc}>Distanza totale percorsa da tutti gli utenti, calcolata dai tracciati GPS (formula Haversine).</Text>
              </View>
            </View>
            <TouchableOpacity style={telStyles.modalClose} onPress={() => setInfoVisible(false)}>
              <Text style={telStyles.modalCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <TouchableOpacity
        style={telStyles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="telemetry-card-header"
      >
        <MaterialCommunityIcons name="chart-line" size={18} color="#22c55e" />
        <Text style={telStyles.cardTitle}>Telemetria</Text>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); setInfoVisible(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="telemetry-info-btn"
        >
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={telStyles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color="#22c55e" />}
          {error && !isLoading && <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />}
          {!isLoading && !error && isStale && (
            <MaterialCommunityIcons name="alert" size={16} color="#f59e0b" />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>
      {!collapsed && (
        <>
          <View style={telStyles.statsRow}>
            <View style={telStyles.stat}>
              <Text style={telStyles.statValue}>{data ? data.totalSamples.toLocaleString("it-IT") : "—"}</Text>
              <Text style={telStyles.statLabel}>Campioni</Text>
            </View>
            <View style={telStyles.divider} />
            <View style={telStyles.stat}>
              <Text style={telStyles.statValue}>{data ? String(data.activeUsers) : "—"}</Text>
              <Text style={telStyles.statLabel}>Utenti attivi</Text>
            </View>
            <View style={telStyles.divider} />
            <View style={telStyles.stat}>
              <Text style={[telStyles.statValue, { color: "#22c55e" }]}>{data ? `${data.kmCollected.toLocaleString("it-IT")} km` : "—"}</Text>
              <Text style={telStyles.statLabel}>Km stimati</Text>
            </View>
          </View>
          {!isLoading && !error && isStale && (
            <View style={telStyles.staleWarning}>
              <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
              <Text style={telStyles.staleWarningText}>
                Nessun campione nelle ultime {TELEMETRY_STALE_THRESHOLD_HOURS}h
              </Text>
            </View>
          )}
          <View style={telStyles.lastSample}>
            <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
            <Text style={telStyles.lastSampleText}>Ultimo campione: {data ? formatDate(data.latestSample) : "—"}</Text>
          </View>

          <View style={telStyles.topRidersSection}>
            <View style={telStyles.topRidersHeader}>
              <MaterialCommunityIcons name="podium" size={13} color={Colors.textSecondary} />
              <Text style={telStyles.topRidersTitle}>Top rider — ultime 24h</Text>
              {topRidersLoading && <ActivityIndicator size="small" color="#22c55e" style={{ marginLeft: "auto" }} />}
            </View>
            {!topRidersLoading && topRidersError && (
              <View style={telStyles.topRidersErrorRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#ef4444" />
                <Text style={telStyles.topRidersErrorText}>Errore caricamento rider</Text>
              </View>
            )}
            {!topRidersLoading && !topRidersError && (!topRidersData?.riders || topRidersData.riders.length === 0) && (
              <Text style={telStyles.topRidersEmpty}>Nessun rider attivo nelle ultime 24h</Text>
            )}
            {topRidersData?.riders.map((rider, idx) => (
              <View key={rider.userId} style={telStyles.riderRow}>
                <Text style={telStyles.riderRank}>{idx + 1}</Text>
                <MaterialCommunityIcons name="account-circle-outline" size={16} color={Colors.textSecondary} />
                <Text style={telStyles.riderName} numberOfLines={1}>{rider.username}</Text>
                <View style={telStyles.riderStats}>
                  <Text style={telStyles.riderSamples}>{rider.sampleCount.toLocaleString("it-IT")}</Text>
                  <Text style={telStyles.riderStatLabel}>camp.</Text>
                </View>
                <View style={telStyles.riderKmBadge}>
                  <Text style={telStyles.riderKm}>{rider.km} km</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const ghStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
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
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
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
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
  },
  warningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
  },
});

const telStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
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
  topRidersSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  topRidersHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  topRidersTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  topRidersEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  topRidersErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  topRidersErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  riderRank: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    width: 14,
    textAlign: "center",
  },
  riderName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  riderStats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  riderSamples: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  riderStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  riderKmBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  riderKm: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#22c55e",
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
