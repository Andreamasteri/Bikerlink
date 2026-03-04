import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function AdminModeratorLogsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/moderator-logs"] });
  const logs = (data as any)?.logs || [];

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={logs}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Ionicons name="document-text" size={20} color={Colors.textSecondary} />
              <View style={styles.info}>
                <Text style={styles.action}>{item.action}</Text>
                <Text style={styles.detail}>Moderatore: {item.moderator?.nickname} • {item.targetType}</Text>
                {item.details && <Text style={styles.details}>{item.details}</Text>}
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("it-IT")}</Text>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nessun log</Text></View>}
          scrollEnabled={logs.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16 },
  card: { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  info: { flex: 1 },
  action: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  detail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  details: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, marginTop: 4 },
  date: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
