import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getQueryFnWithTimeout } from "@/lib/query-client";

interface IdleLeakInfo {
  count: number;
  killed: number;
  failedKills: number;
  detectedAt: number;
}

interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  max: number;
  activePct: number;
  idleLeak: IdleLeakInfo | null;
}

function poolColor(pct: number, waiting: number): string {
  if (waiting > 0) return "#ef4444";
  if (pct >= 80) return "#f59e0b";
  return "#22c55e";
}

export function DbPoolCard() {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, error } = useQuery<PoolStats>({
    queryKey: ["/api/admin/db-pool-stats"],
    queryFn: getQueryFnWithTimeout<PoolStats>(4_000),
    refetchInterval: 5_000,
    staleTime: 4_000,
    refetchOnMount: true,
  });

  const active = data ? data.total - data.idle : 0;
  const pct = data?.activePct ?? 0;
  const waiting = data?.waiting ?? 0;
  const max = data?.max ?? 10;
  const color = data ? poolColor(pct, waiting) : "#6b7280";

  const statusLabel =
    !data
      ? "—"
      : waiting > 0
      ? `SATURO (${waiting} in coda)`
      : pct >= 80
      ? "PRESSIONE"
      : "OK";

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="db-pool-card-header"
      >
        <MaterialCommunityIcons name="database-outline" size={18} color={color} />
        <Text style={styles.title}>DB Pool (Replit Cloud)</Text>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={color} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <Text style={[styles.badge, { color }]}>{statusLabel}</Text>
          )}
          <Ionicons
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={18}
            color={Colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <>
          <Text style={styles.sectionLabel}>Saturazione connessioni</Text>

          <View style={styles.gaugeRow}>
            <View style={styles.gaugeTrack}>
              <View
                style={[
                  styles.gaugeFill,
                  {
                    width: `${Math.min(pct, 100)}%` as `${number}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.gaugeLabel, { color }]}>{pct}%</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color }]}>{data ? active : "—"}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data ? data.idle : "—"}</Text>
              <Text style={styles.statLabel}>Idle</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text
                style={[
                  styles.statValue,
                  waiting > 0 ? { color: "#ef4444" } : undefined,
                ]}
              >
                {data ? waiting : "—"}
              </Text>
              <Text style={styles.statLabel}>Waiting</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data ? max : "—"}</Text>
              <Text style={styles.statLabel}>Max</Text>
            </View>
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
              <Text style={styles.legendText}>{"< 80% — normale"}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#f59e0b" }]} />
              <Text style={styles.legendText}>{"≥ 80% — pressione"}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
              <Text style={styles.legendText}>waiting &gt; 0 — saturo</Text>
            </View>
          </View>

          {data?.idleLeak && (
            <View style={[
              styles.idleLeakRow,
              data.idleLeak.failedKills > 0 ? styles.idleLeakRowWarn : styles.idleLeakRowHigh,
            ]}>
              <MaterialCommunityIcons
                name={data.idleLeak.failedKills > 0 ? "alert" : "connection"}
                size={15}
                color={data.idleLeak.failedKills > 0 ? "#f59e0b" : "#ef4444"}
                style={{ marginRight: 6 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  styles.idleLeakTitle,
                  { color: data.idleLeak.failedKills > 0 ? "#f59e0b" : "#ef4444" },
                ]}>
                  {`Idle leak: ${data.idleLeak.count} conn anomale`}
                </Text>
                <Text style={styles.idleLeakDetail}>
                  {`Terminati: ${data.idleLeak.killed}`}
                  {data.idleLeak.failedKills > 0
                    ? `  ·  ⚠️ Falliti: ${data.idleLeak.failedKills}`
                    : ""}
                </Text>
              </View>
              {data.idleLeak.failedKills > 0 && (
                <View style={styles.failBadge}>
                  <Text style={styles.failBadgeText}>
                    {`${data.idleLeak.failedKills} falliti`}
                  </Text>
                </View>
              )}
            </View>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: {
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
  badge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  gaugeTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 6,
    minWidth: 4,
  },
  gaugeLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    width: 40,
    textAlign: "right",
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
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  legend: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  idleLeakRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 2,
  },
  idleLeakRowHigh: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  idleLeakRowWarn: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  idleLeakTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 2,
  },
  idleLeakDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  failBadge: {
    backgroundColor: "#f59e0b",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginLeft: 6,
  },
  failBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
  },
});
