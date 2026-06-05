import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface TelemetryUser {
  userId: number;
  username: string;
  kmRide: number;
  kmTrack: number;
  sessionCount: number;
  lastSample: string | null;
}

interface TelemetryUsersResponse {
  users: TelemetryUser[];
  total: number;
  page: number;
  limit: number;
}

async function fetchTelemetryUsers(page: number): Promise<TelemetryUsersResponse> {
  const url = new URL(`/api/admin/telemetry/users?page=${page}&limit=50`, getApiUrl());
  const res = await fetch(url.toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function UserCard({ item, onPress }: { item: TelemetryUser; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardAvatar}>
        <MaterialCommunityIcons name="account-circle" size={36} color={Colors.textSecondary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardUsername} numberOfLines={1}>{item.username}</Text>
        <View style={styles.cardStats}>
          <View style={styles.statChip}>
            <MaterialCommunityIcons name="map-marker-distance" size={12} color={Colors.accent} />
            <Text style={styles.statChipText}>{item.kmRide.toFixed(1)} km</Text>
          </View>
          {item.kmTrack > 0 && (
            <View style={[styles.statChip, { backgroundColor: "#8b5cf622" }]}>
              <MaterialCommunityIcons name="flag-checkered" size={12} color="#8b5cf6" />
              <Text style={[styles.statChipText, { color: "#8b5cf6" }]}>{item.kmTrack.toFixed(1)} pista</Text>
            </View>
          )}
          <View style={[styles.statChip, { backgroundColor: Colors.surface }]}>
            <Ionicons name="layers-outline" size={12} color={Colors.textSecondary} />
            <Text style={[styles.statChipText, { color: Colors.textSecondary }]}>{item.sessionCount} sess.</Text>
          </View>
        </View>
        <Text style={styles.cardLast}>Ultimo: {formatDate(item.lastSample)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function TelemetryUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [page] = useState(0);

  const { data, isLoading, error, refetch, isRefetching } = useQuery<TelemetryUsersResponse>({
    queryKey: ["/api/admin/telemetry/users", page],
    queryFn: () => fetchTelemetryUsers(page),
    staleTime: 30_000,
  });

  const users = data?.users ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="account-multiple" size={20} color={Colors.accent} />
        <Text style={styles.headerTitle}>Sessioni per utente</Text>
        {data && (
          <Text style={styles.headerCount}>{data.total} utenti</Text>
        )}
      </View>

      {isLoading && (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.accent} />
      )}
      {error && (
        <Text style={styles.errorText}>Errore nel caricamento</Text>
      )}

      <FlatList
        data={users}
        keyExtractor={(item) => String(item.userId)}
        renderItem={({ item }) => (
          <UserCard
            item={item}
            onPress={() => router.push(`/admin/telemetry-user/${item.userId}` as never)}
          />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!users.length}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.accent}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="map-marker-off" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessun utente con dati telemetria</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  headerCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardUsername: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  cardStats: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accent + "22",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
  cardLast: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
    marginTop: 32,
  },
  emptyState: {
    alignItems: "center",
    gap: 12,
    marginTop: 64,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
