import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function EasterEggsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/easter-eggs/collection"],
  });

  const collection = (data as any)?.collection || [];

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={collection}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.eggCard}>
            <Ionicons name="gift" size={36} color={Colors.accent} />
            <Text style={styles.eggName} numberOfLines={2}>{item.easterEgg?.name || "Easter Egg"}</Text>
            <Text style={styles.eggDate}>
              {new Date(item.collectedAt).toLocaleDateString("it-IT")}
            </Text>
          </View>
        )}
        keyExtractor={(item) => item.id || item.easterEggId}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="gift-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun easter egg collezionato</Text>
            <Text style={styles.emptySubtext}>Esplora la mappa per trovarli!</Text>
          </View>
        }
        scrollEnabled={collection.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  list: { padding: 16 },
  row: { gap: 12, marginBottom: 12 },
  eggCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: "center", gap: 6 },
  eggName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  eggDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
