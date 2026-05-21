import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export type StatsPerCode = {
  code: string;
  label: string;
  count: number;
  isActive: boolean;
  currentUses: number;
  maxUses: number;
};

export type Stats = {
  totalUsers: number;
  usersWithCode: number;
  perCode: StatsPerCode[];
};

interface InviteCodeStatsProps {
  stats?: Stats;
  loading: boolean;
  activeCount: number;
  codesLoading: boolean;
}

export function InviteCodeStats({ stats, loading, activeCount, codesLoading }: InviteCodeStatsProps) {
  return (
    <View style={styles.container}>
      {/* Counters */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {loading ? "–" : stats?.totalUsers ?? 0}
          </Text>
          <Text style={styles.statLabel}>Utenti totali</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.accent }]}>
            {loading ? "–" : stats?.usersWithCode ?? 0}
          </Text>
          <Text style={styles.statLabel}>Con codice</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#4CAF50" }]}>
            {codesLoading ? "–" : activeCount}
          </Text>
          <Text style={styles.statLabel}>Codici attivi</Text>
        </View>
      </View>

      {/* Per-code counters */}
      {stats && stats.perCode.length > 0 && (
        <View style={styles.perCodeSection}>
          <Text style={styles.sectionTitle}>Utilizzi per codice</Text>
          {stats.perCode.map((pc) => (
            <View key={pc.code} style={styles.perCodeRow}>
              <View style={styles.perCodeInfo}>
                <Text style={styles.perCodeName}>{pc.label || pc.code}</Text>
                <Text style={styles.perCodeCode}>{pc.code}</Text>
              </View>
              <View style={styles.perCodeRight}>
                <Text style={[styles.perCodeCount, { color: pc.isActive ? Colors.accent : Colors.textSecondary }]}>
                  {pc.count}
                </Text>
                <Text style={styles.perCodeUses}>{pc.currentUses}/{pc.maxUses} usi</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  perCodeSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  perCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  perCodeInfo: {
    flex: 1,
  },
  perCodeName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  perCodeCode: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  perCodeRight: {
    alignItems: "flex-end",
  },
  perCodeCount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  perCodeUses: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
