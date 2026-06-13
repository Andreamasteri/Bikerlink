/**
 * Task #2527 — StatsTable.
 * Tabella per-tipo: utenti attivi + numero match + flag anomalia.
 */
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface MatchStat {
  typeKey: string;
  typeName: string;
  usersActive: number;
  totalMatches: number;
  isAnomaly: boolean;
  isBzBase?: boolean;
}

interface Props {
  stats: MatchStat[];
  isLoading: boolean;
}

export function StatsTable({ stats, isLoading }: Props) {
  if (isLoading) {
    return <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />;
  }
  return (
    <View style={styles.table}>
      <View style={styles.header}>
        <Text style={[styles.cell, { flex: 3 }]}>Tipo</Text>
        <Text style={[styles.cell, styles.cellCenter, { flex: 1.2 }]}>Utenti attivi</Text>
        <Text style={[styles.cell, styles.cellCenter, { flex: 1 }]}>Match</Text>
        <Text style={[styles.cell, styles.cellCenter, { flex: 0.8 }]}>Stato</Text>
      </View>
      {stats.map((stat, idx) => (
        <View
          key={stat.typeKey}
          style={[
            styles.row,
            idx % 2 === 0 && { backgroundColor: Colors.surfaceLight + "44" },
            stat.isAnomaly && styles.anomalyRow,
            stat.isBzBase && styles.bzBaseRow,
          ]}
        >
          <View style={[{ flex: 3, flexDirection: "row", alignItems: "center", gap: 6 }]}>
            <Text style={[styles.cell, styles.typeName]} numberOfLines={2}>
              {stat.typeName}
            </Text>
            {stat.isBzBase && (
              <View style={styles.bzBadge}>
                <Text style={styles.bzBadgeText}>BZ</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cell, styles.cellCenter, { flex: 1.2 }]}>{stat.usersActive}</Text>
          <Text
            style={[
              styles.cell,
              styles.cellCenter,
              { flex: 1 },
              stat.isAnomaly && { color: Colors.warning },
            ]}
          >
            {stat.totalMatches}
          </Text>
          <View style={[styles.cellCenterView, { flex: 0.8, paddingHorizontal: 4 }]}>
            {stat.isAnomaly ? (
              <Ionicons name="warning" size={14} color={Colors.warning} />
            ) : (
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  header: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 44,
  },
  anomalyRow: { backgroundColor: Colors.warning + "11" },
  bzBaseRow: { backgroundColor: Colors.accent + "11" },
  bzBadge: {
    backgroundColor: Colors.accent + "33",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  bzBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  cell: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  cellCenter: { textAlign: "center" },
  cellCenterView: { alignItems: "center", justifyContent: "center" },
  typeName: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
