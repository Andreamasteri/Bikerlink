import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getQueryFnWithTimeout } from "@/lib/query-client";
import { AdminCardErrorBoundary } from "@/components/admin/AdminCardErrorBoundary";

interface FlatTCMetrics {
  online: true;
  loadAvg1: number;
  loadAvg5: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskMounts?: Array<{ path: string; usedGb: number; totalGb: number; usedPct: number }>;
  uptimeSec: number;
  checkedAt?: number;
}

interface ThinkCentreOffline {
  online: false;
  reason?: string;
}

type MetricsResponse = FlatTCMetrics | ThinkCentreOffline;

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

function ThinkCentreEfficiencyCardInner() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ["/api/admin/thinkcentre-metrics"],
    queryFn: getQueryFnWithTimeout<MetricsResponse>(10_000),
    refetchInterval: 10_000,
    staleTime: 8_000,
    refetchOnMount: true,
  });

  const online = data?.online === true;
  // Secondary guard: if metrics is truthy but loadAvg1 is not a number, treat as offline
  // to avoid future shape mismatch crashes.
  const rawMetrics = online ? (data as FlatTCMetrics) : null;
  const metrics = rawMetrics != null && typeof rawMetrics.loadAvg1 === "number" ? rawMetrics : null;

  const loadAvg1 = metrics?.loadAvg1 ?? 0;
  const loadAvg5 = metrics?.loadAvg5 ?? 0;
  const ramUsedMb = metrics?.ramUsedMb ?? 0;
  const ramTotalMb = metrics?.ramTotalMb ?? 0;
  const usedPercent = ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;
  const freeMb = ramTotalMb - ramUsedMb;
  const firstDisk = metrics?.diskMounts?.[0] ?? null;

  // Load color based on loadAvg1 alone (thresholds 1.5 / 3.0 for a multi-core TC)
  const headerColor = !data
    ? "#6b7280"
    : !online
    ? "#6b7280"
    : loadAvg1 < 1.5
    ? "#22c55e"
    : loadAvg1 < 3.0
    ? "#f59e0b"
    : "#ef4444";

  const memColor = !metrics
    ? Colors.text
    : usedPercent < 75
    ? Colors.text
    : usedPercent < 90
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
          {(!online || !metrics) && (
            <View style={styles.offlineBanner}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>ThinkCentre offline</Text>
            </View>
          )}

          {metrics && (
            <>
              <Text style={styles.sectionLabel}>CPU</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: headerColor }]}>
                    {loadAvg1.toFixed(2)}
                  </Text>
                  <Text style={styles.statLabel}>Load 1m</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{loadAvg5.toFixed(2)}</Text>
                  <Text style={styles.statLabel}>Load 5m</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>RAM</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: memColor }]}>
                    {usedPercent}%
                  </Text>
                  <Text style={styles.statLabel}>Usata</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{ramUsedMb} MB</Text>
                  <Text style={styles.statLabel}>Occupata</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{freeMb} MB</Text>
                  <Text style={styles.statLabel}>Libera · {ramTotalMb} tot</Text>
                </View>
              </View>

              {firstDisk != null && (
                <>
                  <Text style={styles.sectionLabel}>Disco</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={[styles.statValue, { color: firstDisk.usedPct < 80 ? Colors.text : firstDisk.usedPct < 95 ? "#f59e0b" : "#ef4444" }]}>
                        {firstDisk.usedPct}%
                      </Text>
                      <Text style={styles.statLabel}>Usato</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{firstDisk.usedGb} GB</Text>
                      <Text style={styles.statLabel}>Occupato</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{(firstDisk.totalGb - firstDisk.usedGb).toFixed(1)} GB</Text>
                      <Text style={styles.statLabel}>Libero · {firstDisk.totalGb} tot</Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.uptimeRow}>
                <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.uptimeText}>Uptime: {formatUptime(metrics.uptimeSec ?? 0)}</Text>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

export function ThinkCentreEfficiencyCard() {
  return (
    <AdminCardErrorBoundary label="ThinkCentre — dati non disponibili">
      <ThinkCentreEfficiencyCardInner />
    </AdminCardErrorBoundary>
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
  uptimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  uptimeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
