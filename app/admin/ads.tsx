import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function AdminAdsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/ads"] });
  const ads = (data as any)?.ads || [];

  const toggleAd = async (id: string, isActive: boolean) => {
    await apiRequest("PUT", `/api/admin/ads/${id}`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ads"] });
  };

  const deleteAd = (id: string) => {
    Alert.alert("Elimina", "Sei sicuro?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: async () => {
        await apiRequest("DELETE", `/api/admin/ads/${id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/ads"] });
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ads}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.success + "30" : Colors.textSecondary + "30" }]}>
                  <Text style={[styles.badgeText, { color: item.isActive ? Colors.success : Colors.textSecondary }]}>{item.isActive ? "Attivo" : "Inattivo"}</Text>
                </View>
              </View>
              <Text style={styles.detail}>Tipo: {item.productType} • Modalità: {item.displayMode}</Text>
              <Text style={styles.detail}>Click: {item.clickCount} • Impressioni: {item.impressionCount}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => toggleAd(item.id, item.isActive)}>
                  <Ionicons name={item.isActive ? "pause" : "play"} size={20} color={Colors.accent} />
                </Pressable>
                <Pressable onPress={() => deleteAd(item.id)}>
                  <Ionicons name="trash" size={20} color={Colors.accentRed} />
                </Pressable>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nessun annuncio</Text></View>}
          scrollEnabled={ads.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  detail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 12 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
