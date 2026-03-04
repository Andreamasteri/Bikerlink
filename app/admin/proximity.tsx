import React from "react";
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProximityStatsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/proximity-stats"] });
  const pairs = (data as any)?.pairs || [];
  const totalPairs = pairs.length;
  const totalEncounters = pairs.reduce((sum: number, p: any) => sum + p.pairCount, 0);
  const totalMinutes = pairs.reduce((sum: number, p: any) => sum + p.totalDurationMinutes, 0);

  const getUserTypeLabel = (type: string) => {
    if (type === "biker") return "Biker";
    if (type === "zavorrina") return "Zavorrina/o";
    return "Coppia";
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
      <Text style={styles.title}>Statistiche Prossimità</Text>
      <Text style={styles.subtitle}>Coppie che hanno condiviso un giro (&lt;100m per &gt;1h)</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={24} color={Colors.accent} />
          <Text style={styles.statNumber}>{totalPairs}</Text>
          <Text style={styles.statLabel}>Coppie</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="repeat" size={24} color={Colors.success} />
          <Text style={styles.statNumber}>{totalEncounters}</Text>
          <Text style={styles.statLabel}>Incontri</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="time" size={24} color={Colors.maleIcon} />
          <Text style={styles.statNumber}>{Math.round(totalMinutes / 60)}h</Text>
          <Text style={styles.statLabel}>Totale</Text>
        </View>
      </View>

      {pairs.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessuna coppia di prossimità registrata</Text>
        </View>
      )}

      {pairs.map((pair: any, index: number) => (
        <View key={pair.id || index} style={styles.pairCard}>
          <View style={styles.pairHeader}>
            <Text style={styles.pairRank}>#{index + 1}</Text>
            <View style={styles.pairUsers}>
              <Text style={styles.pairNickname}>{pair.user1Nickname}</Text>
              <Text style={styles.pairType}>{getUserTypeLabel(pair.user1Type)}</Text>
            </View>
            <Ionicons name="swap-horizontal" size={20} color={Colors.accent} />
            <View style={styles.pairUsers}>
              <Text style={styles.pairNickname}>{pair.user2Nickname}</Text>
              <Text style={styles.pairType}>{getUserTypeLabel(pair.user2Type)}</Text>
            </View>
          </View>
          <View style={styles.pairStats}>
            <View style={styles.pairStat}>
              <Ionicons name="repeat" size={14} color={Colors.success} />
              <Text style={styles.pairStatText}>{pair.pairCount} incontri</Text>
            </View>
            <View style={styles.pairStat}>
              <Ionicons name="time" size={14} color={Colors.maleIcon} />
              <Text style={styles.pairStatText}>{Math.round(pair.totalDurationMinutes / 60)}h {pair.totalDurationMinutes % 60}m</Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.accent },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4, marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: "center", gap: 4 },
  statNumber: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyState: { alignItems: "center", padding: 32, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  pairCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 10, gap: 10 },
  pairHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  pairRank: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.accent, width: 30 },
  pairUsers: { flex: 1 },
  pairNickname: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  pairType: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  pairStats: { flexDirection: "row", gap: 16, paddingLeft: 30 },
  pairStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  pairStatText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
