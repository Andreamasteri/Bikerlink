import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface PerformanceRecord {
  id: string;
  userId: string;
  nickname: string;
  title?: string;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxAltitude?: number;
  durationSeconds?: number;
  status: string;
  createdAt: string;
}

export default function AdminPerformance() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: records = [], isLoading } = useQuery<PerformanceRecord[]>({
    queryKey: ["/api/admin/performance-records"],
  });

  const completedRecords = records.filter((r: PerformanceRecord) => r.status === "completed");
  const filtered = search.trim()
    ? completedRecords.filter((r: PerformanceRecord) => r.nickname.toLowerCase().includes(search.toLowerCase()))
    : completedRecords;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const renderItem = ({ item }: { item: PerformanceRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <Ionicons name="person-circle" size={20} color={Colors.accent} />
          <Text style={styles.nickname}>{item.nickname}</Text>
        </View>
        <Text style={styles.date}>
          {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{(item.totalDistanceKm || 0).toFixed(1)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{(item.maxSpeedKmh || 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>km/h max</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{(item.maxAltitude || 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>quota max</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.durationSeconds ? formatTime(item.durationSeconds) : "--"}</Text>
          <Text style={styles.statLabel}>durata</Text>
        </View>
      </View>
      {item.avgSpeedKmh ? (
        <Text style={styles.avgSpeed}>Media: {item.avgSpeedKmh.toFixed(1)} km/h</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca per nickname..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <Text style={styles.count}>{filtered.length} record trovati</Text>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="analytics" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessun record di performance</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface,
    margin: 16, marginBottom: 8, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  searchInput: {
    flex: 1, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
  },
  count: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 16, marginBottom: 8 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  date: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.accent },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  avgSpeed: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
});
