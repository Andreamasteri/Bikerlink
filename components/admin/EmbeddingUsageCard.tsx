import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getQueryFnWithTimeout } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface DayEntry {
  date: string;
  apiCalls: number;
  cacheHits: number;
  localFallback: number;
}

interface DailyReport {
  generatedAt: string;
  today: {
    apiCalls: number;
    cacheHits: number;
    localFallback: number;
    total: number;
    capReached: boolean;
  };
  byField: Array<{ field: string; apiCalls: number; cacheHits: number; localFallback: number }>;
  weeklyAvgApiCalls: number;
  anomaly: boolean;
  anomalyReason: string | null;
}

interface StatsResponse {
  lastReport: DailyReport | null;
  last7Days: DayEntry[];
  cap: number;
  todayApiCalls: number;
}

export function EmbeddingUsageCard() {
  const { data, isLoading, error } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/embeddings/stats"],
    queryFn: getQueryFnWithTimeout<StatsResponse>(10_000),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Embedding Usage</Text>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Embedding Usage</Text>
        <Text style={styles.errorText}>Impossibile caricare i dati</Text>
      </View>
    );
  }

  const { lastReport, last7Days, cap, todayApiCalls } = data;
  const capPct = cap > 0 ? Math.min(100, Math.round((todayApiCalls / cap) * 100)) : 0;
  const barColor = capPct >= 90 ? "#e74c3c" : capPct >= 70 ? "#f39c12" : Colors.primary ?? "#3498db";

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Embedding Usage</Text>
        {lastReport?.anomaly && (
          <View style={styles.anomalyBadge}>
            <Text style={styles.anomalyBadgeText}>⚠ ANOMALIA</Text>
          </View>
        )}
      </View>

      {/* Today cap bar */}
      <View style={styles.section}>
        <View style={styles.capRow}>
          <Text style={styles.label}>API calls oggi</Text>
          <Text style={[styles.capValue, capPct >= 90 && styles.capValueDanger]}>
            {todayApiCalls} / {cap} ({capPct}%)
          </Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${capPct}%` as `${number}%`, backgroundColor: barColor }]} />
        </View>
      </View>

      {/* Today snapshot from last report */}
      {lastReport && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report ieri (08:15)</Text>
          <View style={styles.statRow}>
            <StatBox label="API calls" value={lastReport.today.apiCalls} color="#3498db" />
            <StatBox label="Cache hit" value={lastReport.today.cacheHits} color="#2ecc71" />
            <StatBox label="Local" value={lastReport.today.localFallback} color="#95a5a6" />
          </View>
          {lastReport.anomaly && lastReport.anomalyReason && (
            <Text style={styles.anomalyText}>{lastReport.anomalyReason}</Text>
          )}
          <Text style={styles.meta}>Media 7gg: {lastReport.weeklyAvgApiCalls} API calls/giorno</Text>
          {lastReport.today.capReached && (
            <Text style={styles.capReachedText}>⚠ Cap raggiunto — fallback locale attivato</Text>
          )}
        </View>
      )}

      {/* 7-day trend table */}
      {last7Days.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ultimi 7 giorni</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellDate]}>Data</Text>
            <Text style={styles.tableCell}>API</Text>
            <Text style={styles.tableCell}>Cache</Text>
            <Text style={styles.tableCell}>Local</Text>
          </View>
          {last7Days.slice(-7).reverse().map((row) => (
            <View key={row.date} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableCellDate]}>{row.date.slice(5)}</Text>
              <Text style={styles.tableCell}>{row.apiCalls}</Text>
              <Text style={styles.tableCell}>{row.cacheHits}</Text>
              <Text style={styles.tableCell}>{row.localFallback}</Text>
            </View>
          ))}
        </View>
      )}

      {lastReport && (
        <Text style={styles.meta}>
          Generato: {new Date(lastReport.generatedAt).toLocaleString("it-IT")}
        </Text>
      )}
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1c1c1e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  anomalyBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  anomalyBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#8e8e93",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  capRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    color: "#aeaeb2",
  },
  capValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#aeaeb2",
  },
  capValueDanger: {
    color: "#e74c3c",
  },
  barBg: {
    height: 6,
    backgroundColor: "#2c2c2e",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  statRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#2c2c2e",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderTopWidth: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    color: "#8e8e93",
    marginTop: 2,
  },
  anomalyText: {
    color: "#e74c3c",
    fontSize: 12,
    marginBottom: 4,
  },
  capReachedText: {
    color: "#f39c12",
    fontSize: 12,
    marginTop: 4,
  },
  meta: {
    fontSize: 11,
    color: "#636366",
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2e",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: "#aeaeb2",
    textAlign: "right",
  },
  tableCellDate: {
    textAlign: "left",
    flex: 1.5,
    color: "#8e8e93",
  },
  errorText: {
    color: "#8e8e93",
    fontSize: 13,
    marginTop: 8,
  },
});
