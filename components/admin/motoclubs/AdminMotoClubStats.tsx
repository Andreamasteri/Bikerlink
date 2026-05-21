import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface AdminMotoClubStatsProps {
  clubsCount: number;
  pendingCount: number;
  totalMembers: number;
}

export function AdminMotoClubStats({ clubsCount, pendingCount, totalMembers }: AdminMotoClubStatsProps) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{clubsCount}</Text>
        <Text style={styles.statLabel}>Club attivi</Text>
      </View>
      <View style={[styles.statBox, styles.statBoxMiddle]}>
        <Text style={[styles.statValue, pendingCount > 0 && { color: "#F59E0B" }]}>{pendingCount}</Text>
        <Text style={styles.statLabel}>In attesa</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statValue}>{totalMembers}</Text>
        <Text style={styles.statLabel}>Membri totali</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statBoxMiddle: {},
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
});
