import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function WinnersScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/contest/winners"],
  });

  const winners = (data as any)?.winners || [];

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={winners}
        renderItem={({ item, index }) => (
          <View style={styles.winnerCard}>
            <View style={styles.rank}>
              <Ionicons name="trophy" size={24} color={index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : "#CD7F32"} />
            </View>
            <View style={styles.winnerInfo}>
              <Text style={styles.winnerName}>{item.user?.nickname}</Text>
              <Text style={styles.weekLabel}>Settimana {item.weekNumber}, {item.yearNumber}</Text>
            </View>
            <View style={styles.votes}>
              <Ionicons name="heart" size={16} color={Colors.accentRed} />
              <Text style={styles.voteCount}>{item.voteCount}</Text>
            </View>
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun vincitore ancora</Text>
          </View>
        }
        scrollEnabled={winners.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  list: { padding: 16 },
  winnerCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  rank: { width: 40, alignItems: "center" },
  winnerInfo: { flex: 1 },
  winnerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  weekLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  votes: { flexDirection: "row", alignItems: "center", gap: 4 },
  voteCount: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accentRed },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
});
