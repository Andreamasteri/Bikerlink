import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function AdminWorkshopsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/workshops"] });
  const workshops = (data as any)?.workshops || [];

  const approve = async (id: string) => {
    await apiRequest("PUT", `/api/admin/workshops/${id}/approve`);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/workshops"] });
    Alert.alert("Approvata", "Officina approvata con successo");
  };

  const remove = (id: string) => {
    Alert.alert("Elimina", "Sei sicuro?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: async () => {
        await apiRequest("DELETE", `/api/admin/workshops/${id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/workshops"] });
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={workshops}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="construct" size={20} color={Colors.accent} />
                <Text style={styles.title}>{item.name}</Text>
                <View style={[styles.badge, { backgroundColor: item.isApproved ? Colors.success + "30" : Colors.warning + "30" }]}>
                  <Text style={[styles.badgeText, { color: item.isApproved ? Colors.success : Colors.warning }]}>{item.isApproved ? "Approvata" : "In Attesa"}</Text>
                </View>
              </View>
              <Text style={styles.detail}>{item.address}</Text>
              <Text style={styles.detail}>Tipo: {item.type} {item.phone ? `• Tel: ${item.phone}` : ""}</Text>
              <View style={styles.actions}>
                {!item.isApproved && (
                  <Pressable style={styles.approveBtn} onPress={() => approve(item.id)}>
                    <Text style={styles.approveBtnText}>Approva</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => remove(item.id)}>
                  <Ionicons name="trash" size={20} color={Colors.accentRed} />
                </Pressable>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nessuna officina</Text></View>}
          scrollEnabled={workshops.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  detail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 12, alignItems: "center" },
  approveBtn: { backgroundColor: Colors.success, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  approveBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
