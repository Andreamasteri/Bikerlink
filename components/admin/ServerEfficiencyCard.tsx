import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

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

export function ServerEfficiencyCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<ServerMetrics>({
    queryKey: ["/api/admin/server-metrics"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/server-metrics", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
    refetchOnMount: true,
  });

  const { data: logs } = useQuery<ServerLogs>({
    queryKey: ["/api/admin/server-logs"],
    queryFn: async ({ signal }) => {
      const res = await fetch(new URL("/api/admin/server-logs?lines=12", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchOnMount: true,
  });

  // Guard: data.cpu / data.memory can be undefined if the API returns a partial
  // or cached response with a different shape. Use optional chaining throughout
  // so no property access on undefined crashes the admin screen.
  const cpu = data?.cpu ?? null;
  const memory = data?.memory ?? null;
  const network = data?.network ?? null;
  const loadPerCore = cpu?.loadPerCore ?? 0;
  const healthColor = !cpu
    ? "#6b7280"
    : loadPerCore < 0.7
    ? "#22c55e"
    : loadPerCore < 1
    ? "#f59e0b"
    : "#ef4444";
  const memColor = !memory
    ? Colors.text
    : memory.usedPercent < 75
    ? Colors.text
    : memory.usedPercent < 90
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
        <Text style={srvStyles.cardTitle}>Efficienza Server Replit (Cloud)</Text>
        <View style={srvStyles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={healthColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && cpu && (
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
                {cpu ? `${cpu.loadAvg1.toFixed(2)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Load 1m</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>
                {cpu ? `${cpu.loadAvg5.toFixed(2)} / ${cpu.loadAvg15.toFixed(2)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Load 5m / 15m</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: healthColor }]}>
                {cpu ? `${(loadPerCore * 100).toFixed(0)}%` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>
                {cpu ? `${cpu.cores} core · Node ${cpu.processCpuPercent.toFixed(0)}%` : "Carico"}
              </Text>
            </View>
          </View>

          <Text style={srvStyles.sectionLabel}>RAM</Text>
          <View style={srvStyles.statsRow}>
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: memColor }]}>
                {memory ? `${memory.usedPercent.toFixed(0)}%` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>
                {memory
                  ? `${formatBytes(memory.used)} usata · ${formatBytes(memory.free)} libera · ${formatBytes(memory.total)} tot`
                  : "Usata · Libera · Totale"}
              </Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>{memory ? formatBytes(memory.processRss) : "—"}</Text>
              <Text style={srvStyles.statLabel}>Node RSS</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={srvStyles.statValue}>
                {memory ? `${formatBytes(memory.processHeapUsed)} / ${formatBytes(memory.processHeapTotal)}` : "—"}
              </Text>
              <Text style={srvStyles.statLabel}>Heap</Text>
            </View>
          </View>

          <Text style={srvStyles.sectionLabel}>Rete</Text>
          <View style={srvStyles.statsRow}>
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: "#22c55e" }]}>{network ? `↓ ${formatRate(network.rxRate)}` : "—"}</Text>
              <Text style={srvStyles.statLabel}>{network ? `Tot ${formatBytes(network.rxBytes)}` : "Download"}</Text>
            </View>
            <View style={srvStyles.divider} />
            <View style={srvStyles.stat}>
              <Text style={[srvStyles.statValue, { color: "#0ea5e9" }]}>{network ? `↑ ${formatRate(network.txRate)}` : "—"}</Text>
              <Text style={srvStyles.statLabel}>{network ? `Tot ${formatBytes(network.txBytes)}` : "Upload"}</Text>
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

const srvStyles = StyleSheet.create({
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 12,
    color: Colors.textSecondary,
  },
  logEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});
