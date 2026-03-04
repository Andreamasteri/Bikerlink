import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function AdminReportsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/reports"] });
  const reports = (data as any)?.reports || [];

  const resolveReport = async (id: string) => {
    await apiRequest("PUT", `/api/admin/reports/${id}`, { status: "resolved", adminNotes: "Verificato dall'admin" });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
  };

  const statusColor = (status: string) => {
    if (status === "pending") return Colors.warning;
    if (status === "resolved") return Colors.success;
    return Colors.textSecondary;
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={reports}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.header}>
                <View style={[styles.badge, { backgroundColor: statusColor(item.status) + "30" }]}>
                  <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                </View>
                <Text style={styles.category}>{item.category}</Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.detail}>Da: {item.reporter?.nickname} • {new Date(item.createdAt).toLocaleDateString("it-IT")}</Text>
              {item.status === "pending" && (
                <Pressable style={styles.resolveBtn} onPress={() => resolveReport(item.id)}>
                  <Text style={styles.resolveBtnText}>Risolvi</Text>
                </Pressable>
              )}
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nessuna segnalazione</Text></View>}
          scrollEnabled={reports.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  category: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, marginBottom: 6 },
  detail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  resolveBtn: { backgroundColor: Colors.success, paddingVertical: 8, borderRadius: 8, alignItems: "center", marginTop: 10 },
  resolveBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
