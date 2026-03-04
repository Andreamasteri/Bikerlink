import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/query-client";

type FilterType = "all" | "proposta" | "richiesta";

export default function ProposalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/proposals"],
  });

  const proposals = ((data as any)?.proposals || []).filter((p: any) => {
    if (filter === "all") return true;
    return p.type === filter;
  });

  const getUserColor = (u: any) => u.sex === "male" ? Colors.maleIcon : Colors.femaleIcon;

  const renderProposal = ({ item }: { item: any }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/profile/${item.userId}` as any)}
    >
      <View style={styles.cardHeader}>
        <Ionicons
          name={item.user?.userType === "biker" ? "bicycle" : item.user?.userType === "coppia" ? "people" : "person"}
          size={24}
          color={getUserColor(item.user || {})}
        />
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.nickname}>{item.user?.nickname || "Utente"}</Text>
          <Text style={styles.type}>
            {item.type === "proposta" ? "Propone un giro" : "Cerca un passaggio"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: item.type === "proposta" ? Colors.maleIcon + "30" : Colors.femaleIcon + "30" }]}>
          <Text style={[styles.badgeText, { color: item.type === "proposta" ? Colors.maleIcon : Colors.femaleIcon }]}>
            {item.type === "proposta" ? "Proposta" : "Richiesta"}
          </Text>
        </View>
      </View>
      <Text style={styles.description}>{item.description}</Text>
      {item.departureLocation && (
        <View style={styles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{item.departureLocation}</Text>
        </View>
      )}
      {item.departureTime && (
        <View style={styles.infoRow}>
          <Ionicons name="time" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            {new Date(item.departureTime).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(["all", "proposta", "richiesta"] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "Tutti" : f === "proposta" ? "Proposte" : "Richieste"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={proposals}
          renderItem={renderProposal}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna proposta attiva</Text>
            </View>
          }
          scrollEnabled={proposals.length > 0}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push("/create-proposal" as any)}
      >
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: "row", padding: 16, gap: 8 },
  filterBtn: { backgroundColor: Colors.surface, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent },
  filterText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 80 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  cardHeaderInfo: { flex: 1 },
  nickname: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  description: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 50 : 16,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
