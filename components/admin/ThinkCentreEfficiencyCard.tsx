import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface ThinkCentreMetrics {
  online: true;
  cpu: { loadAvg1: number; loadAvg5: number; loadAvg15: number; cores: number };
  memory: { totalMb: number; usedMb: number; usedPercent: number };
  uptimeSec: number;
}

interface ThinkCentreOffline {
  online: false;
  reason?: string;
}

type MetricsResponse = ThinkCentreMetrics | ThinkCentreOffline;

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}g ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ThinkCentreEfficiencyCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/thinkcentre-metrics"],
    queryFn: async () => {
      const res = await fetch(
        new URL("/api/admin/thinkcentre-metrics", getApiUrl()).toString(),
        { headers: { ...(await authFetchHeaders()) }, credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const online = data?.online === true;
  const metrics = online ? (data as ThinkCentreMetrics) : null;

  const loadPerCore = metrics ? metrics.cpu.loadAvg1 / metrics.cpu.cores : 0;
  const headerColor = !data
    ? "#6b7280"
    : !online
    ? "#6b7280"
    : loadPerCore < 0.7
    ? "#22c55e"
    : loadPerCore < 1
    ? "#f59e0b"
    : "#ef4444";

  const memColor = !metrics
    ? Colors.text
    : metrics.memory.usedPercent < 75
    ? Colors.text
    : metrics.memory.usedPercent < 90
    ? "#f59e0b"
    : "#ef4444";

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="thinkcentre-efficiency-card-header"
      >
        <MaterialCommunityIcons name="home-assistant" size={18} color={headerColor} />
        <Text style={styles.cardTitle}>Efficienza ThinkCentre (Casa)</Text>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={headerColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <View style={[styles.healthDot, { backgroundColor: headerColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <>
          {(!online) && (
            <View style={styles.offlineBanner}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>Server di casa offline</Text>
            </View>
          )}

          {metrics && (
            <>
              <Text style={styles.sectionLabel}>CPU</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{metrics.cpu.loadAvg1.toFixed(2)}</Text>
                  <Text style={styles.statLabel}>Load 1m</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {metrics.cpu.loadAvg5.toFixed(2)} / {metrics.cpu.loadAvg15.toFixed(2)}
                  </Text>
                  <Text style={styles.statLabel}>5m / 15m</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: headerColor }]}>
                    {(loadPerCore * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.statLabel}>{metrics.cpu.cores} core</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>RAM</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: memColor }]}>
                    {metrics.memory.usedPercent}%
                  </Text>
                  <Text style={styles.statLabel}>Usata</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{metrics.memory.usedMb} MB</Text>
                  <Text style={styles.statLabel}>
                    su {metrics.memory.totalMb} MB
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatUptime(metrics.uptimeSec)}</Text>
                  <Text style={styles.statLabel}>Uptime</Text>
                </View>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  offlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#6b7280",
  },
  offlineText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
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
});
