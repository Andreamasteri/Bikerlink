import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import {
  Card,
  Row,
  BadgeCount,
  Legend,
  MiniChart,
  widgetStyles,
  type ResourceSample,
} from "@/components/admin/ResourceMonitorWidgets";

interface BackendInfo {
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  nodeVersion: string;
  onlineUsers: number;
}

interface DeviceSession {
  userIdAnon: string;
  platform: string;
  memoryUsedMb: number;
  batteryPct: number | null;
  recordedAt: string;
}

interface DeviceAgg {
  sampleCount: number;
  avgRamPct: number | null;
  avgBatteryPct: number | null;
  chargingCount: number;
  iosCount: number;
  androidCount: number;
  topSessions: DeviceSession[];
}

interface CrashCounts { last7d: number; last30d: number; restartLoops7d: number; }
interface LogTableRow { name: string; rowCount: number; sizeMb: number; }
interface GraphData { enabled: boolean; samples: ResourceSample[]; dbSizeMb: number | null; }

interface ResourceMonitorData {
  backend: BackendInfo;
  devices: DeviceAgg;
  crashes: CrashCounts;
  logTables: LogTableRow[];
  graph: GraphData;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}g ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const QUERY_KEY = ["/api/admin/resource-monitor"];

export default function ResourceMonitorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [localUptime, setLocalUptime] = useState(0);
  const [showTopSessions, setShowTopSessions] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<ResourceMonitorData>({
    queryKey: QUERY_KEY,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (data?.backend?.uptimeSeconds != null) setLocalUptime(data.backend.uptimeSeconds);
  }, [data?.backend?.uptimeSeconds]);

  useEffect(() => {
    const interval = setInterval(() => setLocalUptime((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/resource-monitor/toggle-graph", { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleExportCsv = useCallback(async () => {
    try {
      const url = new URL("/api/admin/resource-monitor/samples/csv", getApiUrl());
      const headers = authFetchHeaders();
      const res = await fetch(url.toString(), { headers, credentials: "include" });
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `resource_samples_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { /* no-op on mobile */ }
  }, []);

  if (isLoading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Errore caricamento dati</Text>
        <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const d = data!;
  const isGraphEnabled = d?.graph?.enabled ?? false;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <Card colors={colors} title="Backend" icon="server">
        <Row label="Uptime" value={formatUptime(localUptime)} />
        <Row label="RAM (RSS)" value={`${d?.backend?.rssMb ?? "—"} MB`} />
        <Row label="Heap" value={`${d?.backend?.heapUsedMb ?? "—"} / ${d?.backend?.heapTotalMb ?? "—"} MB`} />
        <Row label="Node.js" value={d?.backend?.nodeVersion ?? "—"} />
        <Row label="Utenti online" value={String(d?.backend?.onlineUsers ?? 0)} accent />
      </Card>

      <Card colors={colors} title="Dispositivi (ultime 2h)" icon="cellphone-check">
        {(d?.devices?.sampleCount ?? 0) === 0 ? (
          <Text style={[widgetStyles.rowLabel, { color: colors.textSecondary, textAlign: "center", paddingVertical: 8 }]}>
            Nessun dato — l'app deve inviare metriche
          </Text>
        ) : (
          <>
            <Row label="Campioni" value={String(d.devices.sampleCount)} />
            <Row label="RAM app media" value={d.devices.avgRamPct != null ? `${d.devices.avgRamPct}%` : "—"} />
            <Row label="Batteria media" value={d.devices.avgBatteryPct != null ? `${d.devices.avgBatteryPct}%` : "—"} />
            <Row label="In carica" value={`${d.devices.chargingCount} dispositivi`} />
            <Row label="iOS / Android" value={`${d.devices.iosCount} / ${d.devices.androidCount}`} />

            {(d.devices.topSessions ?? []).length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowTopSessions((v) => !v)}
                  style={[styles.sessionToggle, { borderTopColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sessionToggleLabel, { color: colors.accent }]}>
                    Top sessioni per memoria ({d.devices.topSessions.length})
                  </Text>
                  <MaterialCommunityIcons
                    name={showTopSessions ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.accent}
                  />
                </TouchableOpacity>

                {showTopSessions && (
                  <View style={styles.sessionTable}>
                    <View style={[styles.sessionHeaderRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.sessionHeaderCell, styles.sessionCellId, { color: colors.textSecondary }]}>User</Text>
                      <Text style={[styles.sessionHeaderCell, styles.sessionCellPlatform, { color: colors.textSecondary }]}>OS</Text>
                      <Text style={[styles.sessionHeaderCell, styles.sessionCellMb, { color: colors.textSecondary }]}>Heap MB</Text>
                      <Text style={[styles.sessionHeaderCell, styles.sessionCellBattery, { color: colors.textSecondary }]}>Batt%</Text>
                      <Text style={[styles.sessionHeaderCell, styles.sessionCellTime, { color: colors.textSecondary }]}>Ora</Text>
                    </View>
                    {d.devices.topSessions.map((s, idx) => {
                      const time = new Date(s.recordedAt).toLocaleTimeString("it", { hour: "2-digit", minute: "2-digit" });
                      const isHigh = s.memoryUsedMb > 500;
                      const isMid = s.memoryUsedMb > 300;
                      const mbColor = isHigh ? "#FF4444" : isMid ? "#FF9500" : colors.text;
                      return (
                        <View
                          key={idx}
                          style={[styles.sessionDataRow, { borderBottomColor: colors.border }]}
                        >
                          <Text style={[styles.sessionCell, styles.sessionCellId, { color: colors.text }]} numberOfLines={1}>
                            {s.userIdAnon}…
                          </Text>
                          <Text style={[styles.sessionCell, styles.sessionCellPlatform, { color: colors.textSecondary }]} numberOfLines={1}>
                            {s.platform}
                          </Text>
                          <Text style={[styles.sessionCell, styles.sessionCellMb, { color: mbColor, fontFamily: "Inter_600SemiBold" }]}>
                            {s.memoryUsedMb}
                          </Text>
                          <Text style={[styles.sessionCell, styles.sessionCellBattery, { color: colors.textSecondary }]}>
                            {s.batteryPct != null ? `${s.batteryPct}%` : "—"}
                          </Text>
                          <Text style={[styles.sessionCell, styles.sessionCellTime, { color: colors.textSecondary }]}>
                            {time}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </Card>

      <Card colors={colors} title="Crash & Riavvii" icon="phone-alert">
        <View style={styles.badgeRow}>
          <BadgeCount label="7 giorni" count={d?.crashes?.last7d ?? 0} />
          <BadgeCount label="30 giorni" count={d?.crashes?.last30d ?? 0} />
        </View>
        {(d?.crashes?.restartLoops7d ?? 0) > 0 && (
          <View style={[styles.restartLoopAlert, { backgroundColor: "#FF4444" + "22", borderColor: "#FF4444" }]}>
            <MaterialCommunityIcons name="restart-alert" size={16} color="#FF4444" />
            <Text style={[styles.restartLoopText, { color: "#FF4444" }]}>
              {d.crashes.restartLoops7d} restart-loop{d.crashes.restartLoops7d !== 1 ? " rilevati" : " rilevato"} negli ultimi 7 giorni
            </Text>
          </View>
        )}
      </Card>

      <Card colors={colors} title="Peso Tabelle Logging" icon="database-clock">
        {(d?.logTables ?? []).map((t) => (
          <View key={t.name} style={styles.tableRow}>
            <Text style={[styles.tableName, { color: colors.text }]} numberOfLines={1}>{t.name}</Text>
            <View style={styles.tableStats}>
              <Text style={[styles.tableCount, { color: colors.textSecondary }]}>
                {t.rowCount.toLocaleString("it")} righe
              </Text>
              <Text style={[styles.tableMb, { color: t.sizeMb > 50 ? "#FF4444" : t.sizeMb > 10 ? "#FF9500" : colors.accent }]}>
                {t.sizeMb.toFixed(2)} MB
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Card colors={colors} title="Grafico Tempo Reale" icon="chart-line">
        <View style={styles.graphToggleRow}>
          <View>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Logging attivo</Text>
            <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>Campiona ogni 10s (overhead minimo)</Text>
          </View>
          <Switch
            value={isGraphEnabled}
            onValueChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {isGraphEnabled && (d?.graph?.samples ?? []).length > 0 && (
          <>
            <View style={styles.legendRow}>
              <Legend color="#FF6B35" label="RAM%" />
              <Legend color="#22C55E" label="Batteria%" />
              <Legend color="#6366F1" label="Online (--)" />
            </View>
            <View style={[styles.chartContainer, { borderColor: colors.border }]}>
              <MiniChart samples={d.graph.samples} width={300} height={140} />
            </View>
            {Platform.OS === "web" && (
              <TouchableOpacity onPress={handleExportCsv} style={[styles.csvBtn, { borderColor: colors.border }]}>
                <MaterialCommunityIcons name="download" size={16} color={colors.accent} />
                <Text style={[styles.csvBtnText, { color: colors.accent }]}>Esporta CSV</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.graphInfo, { color: colors.textSecondary }]}>
              {d.graph.samples.length} campioni — DB: {d.graph.dbSizeMb ?? "—"} MB
            </Text>
          </>
        )}
        {isGraphEnabled && (d?.graph?.samples ?? []).length === 0 && (
          <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>In attesa del primo campione (max 10s)…</Text>
        )}
        {!isGraphEnabled && (
          <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>Abilita il toggle per avviare il campionamento</Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 15 },
  retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  badgeRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 8 },
  tableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 3, gap: 8 },
  tableName: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  tableStats: { flexDirection: "row", alignItems: "center", gap: 10 },
  tableCount: { fontFamily: "Inter_400Regular", fontSize: 11 },
  tableMb: { fontFamily: "Inter_600SemiBold", fontSize: 12, minWidth: 60, textAlign: "right" },
  graphToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  toggleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  toggleSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  legendRow: { flexDirection: "row", gap: 12, paddingTop: 4 },
  chartContainer: { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginTop: 4, alignSelf: "stretch", minHeight: 140 },
  csvBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start", marginTop: 8 },
  csvBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  graphInfo: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 },
  emptyNote: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 8 },
  restartLoopAlert: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  restartLoopText: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1 },
  sessionToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  sessionToggleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sessionTable: { marginTop: 6 },
  sessionHeaderRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  sessionDataRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  sessionHeaderCell: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  sessionCell: { fontFamily: "Inter_400Regular", fontSize: 11 },
  sessionCellId: { flex: 2 },
  sessionCellPlatform: { flex: 1.2 },
  sessionCellMb: { flex: 1.2, textAlign: "right" },
  sessionCellBattery: { flex: 1, textAlign: "right" },
  sessionCellTime: { flex: 1.4, textAlign: "right" },
});
