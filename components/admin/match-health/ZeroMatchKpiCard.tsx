import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  zeroMatchCount: number;
  total: number;
}

export function ZeroMatchKpiCard({ zeroMatchCount, total }: Props) {
  const router = useRouter();
  const accent = zeroMatchCount > 0 ? Colors.warning : Colors.success;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/admin/match-inspector", params: { zeroOnly: "true" } })}
      activeOpacity={0.75}
    >
      <View style={styles.left}>
        <MaterialCommunityIcons name="account-alert" size={28} color={accent} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.title}>Utenti senza match</Text>
          <View style={styles.countRow}>
            <Text style={[styles.count, { color: accent }]}>{zeroMatchCount}</Text>
            <Text style={styles.sep}> / </Text>
            <Text style={styles.total}>{total} utenti reali</Text>
          </View>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.pct, { color: accent }]}>
          {total > 0 ? Math.round((zeroMatchCount / total) * 100) : 0}%
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  count: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  sep: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  total: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pct: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
});
