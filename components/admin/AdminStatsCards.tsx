import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
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

interface GHStatus {
  mode: "self-hosted" | "cloud" | "disabled";
  profile: string;
  healthy: boolean;
  url: string;
}

interface ServerMetrics {
  cpu: {
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
    cores: number;
    loadPerCore: number;
    processCpuPercent: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
    processRss: number;
    processHeapUsed: number;
    processHeapTotal: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    rxRate: number;
    txRate: number;
  };
  uptimeSec: number;
  serverNow: number;
}

interface ServerLogs {
  lines: string[];
  count: number;
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

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}g ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function GraphHopperCard() {
  const { data, isLoading, error } = useQuery<GHStatus>({
    queryKey: ["/api/admin/graphhopper-status"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/graphhopper-status", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
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

  const [collapsed, setCollapsed] = useState(false);

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
    queryKey: ["/api/admin/telemetry/stats"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/telemetry/stats", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
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

  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={telStyles.card}>
      <TouchableOpacity
        style={telStyles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="telemetry-card-header"
      >
        <MaterialCommunityIcons name="chart-line" size={18} color="#22c55e" />
        <Text style={telStyles.cardTitle}>Telemetria</Text>
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
        </>
      )}
    </View>
  );
}

export function ServerEfficiencyCard() {
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading, error } = useQuery<ServerMetrics>({
    queryKey: ["/api/admin/server-metrics"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/server-metrics", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const { data: logs } = useQuery<ServerLogs>({
    queryKey: ["/api/admin/server-logs"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/server-logs?lines=12", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const loadPerCore = data?.cpu.loadPerCore ?? 0;
  const healthColor = !data
    ? "#6b7280"
    : loadPerCore < 0.7
    ? "#22c55e"
    : loadPerCore < 1
    ? "#f59e0b"
    : "#ef4444";
  const memColor = !data
    ? Colors.text
    : data.memory.usedPercent < 75
    ? Colors.text
    : data.memory.usedPercent < 90
    ? "#f59e0b"
    : "#ef4444";

  return (
    <View style={srvStyles.card}>
      <TouchableOpacity
        style={srvStyles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="server-efficiency-card-header"
      >
        <MaterialCommunityIcons name="server" size={18} color={healthColor} />
        <Text style={srvStyles.cardTitle}>Monitor Efficienza Server</Text>
        <View style={srvStyles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={healthColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <View style={[srvStyles.healthDot, { backgroundColor: healthColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>
      {!collapsed && (
        <>
          <Text style={srvStyles.sectionLabel}>CPU</Text>
          <View style={srvStyles.statsRow}>
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>
                {data ? `${data.cpu.loadAvg1.toFixed(2)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Load 1m</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>
                {data ? `${data.cpu.loadAvg5.toFixed(2)} / ${data.cpu.loadAvg15.toFixed(2)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Load 5m / 15m</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: healthColor }]}>
                {data ? `${(loadPerCore * 100).toFixed(0)}%` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>
                {data ? `${data.cpu.cores} core · Node ${data.cpu.processCpuPercent.toFixed(0)}%` : "Carico"}
              </Text>
            </View>
          </View>

          <Text style={srvStyles.sectionLabel}>RAM</Text>
          <View style={srvStyles.statsRow}>
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: memColor }]}>
                {data ? `${data.memory.usedPercent.toFixed(0)}%` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>
                {data
                  ? `${formatBytes(data.memory.used)} usata · ${formatBytes(data.memory.free)} libera · ${formatBytes(data.memory.total)} tot`
                  : "Usata · Libera · Totale"}
              </Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>{data ? formatBytes(data.memory.processRss) : "—"}</Text>
              <Text style={srvStyles.statLabel}>Node RSS</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>
                {data ? `${formatBytes(data.memory.processHeapUsed)} / ${formatBytes(data.memory.processHeapTotal)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Heap</Text>
            </View>
          </View>

          <Text style={srvStyles.sectionLabel}>Rete</Text>
          <View style={srvStyles.statsRow}>
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: "#22c55e" }]}>{data ? `↓ ${formatRate(data.network.rxRate)}` : "—"}</Text>
              <Text style={srvStyles.statLabel}>{data ? `Tot ${formatBytes(data.network.rxBytes)}` : "Download"}</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: "#0ea5e9" }]}>{data ? `↑ ${formatRate(data.network.txRate)}` : "—"}</Text>
              <Text style={srvStyles.statLabel}>{data ? `Tot ${formatBytes(data.network.txBytes)}` : "Upload"}</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>{data ? formatUptime(data.uptimeSec) : "—"}</Text>
              <Text style={srvStyles.statLabel}>Uptime</Text>
            </View>
          </View>

          <Text style={srvStyles.sectionLabel}>Log recenti</Text>
          <View style={srvStyles.logBox}>
            {logs && logs.lines.length > 0 ? (
              logs.lines.map((line, i) => (
                <Text key={i} style={srvStyles.logLine} numberOfLines={1}>
                  {line}
                </Text>
              ))
            ) : (
              <Text style={srvStyles.logEmpty}>Nessun log disponibile</Text>
            )}
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
});

const srvStyles = StyleSheet.create({
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
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    textAlign: "center",
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  logBox: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  logLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  logEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});
