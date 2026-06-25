import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

const RECAP_SCREEN_OPTIONS = { headerShown: false } as const;

interface RecapTopMatch {
  matchId: string;
  otherUserId: string;
  otherNickname: string | null;
  otherAvatar: string | null;
  motorcycleBrand: string;
  isSupermatch: boolean;
  score: number;
  createdAt: string;
}

interface RecapStats {
  totalKm: number;
  totalHours: number;
  totalRoutes: number;
  totalMatches: number;
}

interface RecapRow {
  id: string;
  weekStart: string;
  topMatches: RecapTopMatch[];
  stats: RecapStats;
  createdAt: string;
  openedAt: string | null;
  matchClickedAt: string | null;
  pushSentAt: string | null;
}

interface CurrentRecapResponse {
  recap: RecapRow | null;
  weekStart: string;
}

interface HistoryResponse {
  recaps: RecapRow[];
}

function formatWeekRange(weekStartIso: string): string {
  const d = new Date(weekStartIso);
  const end = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (x: Date) =>
    x.toLocaleDateString("it-IT", { day: "2-digit", month: "short", timeZone: "Europe/Rome" });
  return `${fmt(d)} – ${fmt(end)}`;
}

export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currentQuery = useQuery<CurrentRecapResponse>({
    queryKey: ["/api/recap/current"],
    refetchOnMount: true,
  });
  const historyQuery = useQuery<HistoryResponse>({
    queryKey: ["/api/recap/history"],
  });

  const trackClick = useMutation({
    mutationFn: (recapId: string) =>
      apiRequest("POST", "/api/recap/track-click", { recapId }),
  });

  const onOpenMatch = useCallback(
    (recap: RecapRow, m: RecapTopMatch) => {
      if (!recap.matchClickedAt) {
        trackClick.mutate(recap.id, {
          onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/recap/current"] }),
        });
      }
      router.push(`/profile/${m.otherUserId}` as never);
    },
    [router, trackClick],
  );

  const recap = currentQuery.data?.recap;
  const weekStart = currentQuery.data?.weekStart;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={RECAP_SCREEN_OPTIONS} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="recap-back">
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>La tua settimana</Text>
          <Text style={styles.headerSub}>
            {weekStart ? formatWeekRange(weekStart) : "Recap settimanale"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={currentQuery.isFetching}
            onRefresh={() => {
              currentQuery.refetch();
              historyQuery.refetch();
            }}
          />
        }
      >
        {currentQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : !recap ? (
          <View style={styles.empty}>
            <Ionicons name="newspaper-outline" size={56} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nessun recap questa settimana</Text>
            <Text style={styles.emptyBody}>
              Il prossimo recap arriva lunedì alle 9:00. Continua a guidare per averlo più ricco!
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard label="Km" value={String(recap.stats.totalKm)} />
              <StatCard label="Ore in sella" value={String(recap.stats.totalHours)} />
              <StatCard label="Tracce" value={String(recap.stats.totalRoutes)} />
              <StatCard label="Match" value={String(recap.stats.totalMatches)} />
            </View>

            <Text style={styles.sectionTitle}>I tuoi top {recap.topMatches.length} match</Text>
            {recap.topMatches.length === 0 ? (
              <Text style={styles.emptyBody}>Nessun match di rilievo questa settimana.</Text>
            ) : (
              <FlatList
                data={recap.topMatches}
                keyExtractor={(m) => m.matchId}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.matchCard}
                    onPress={() => onOpenMatch(recap, item)}
                    testID={`recap-match-${item.matchId}`}
                  >
                    {item.otherAvatar ? (
                      <Image source={{ uri: item.otherAvatar }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Ionicons name="person" size={36} color={Colors.textSecondary} />
                      </View>
                    )}
                    <Text style={styles.nickname} numberOfLines={1}>
                      {item.otherNickname ?? "Biker"}
                    </Text>
                    {item.isSupermatch && (
                      <View style={styles.badge}>
                        <Ionicons name="star" size={12} color="#fff" />
                        <Text style={styles.badgeText}>Supermatch</Text>
                      </View>
                    )}
                    <Text style={styles.scoreText}>
                      Score {(item.score * 100).toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}

            <Text style={styles.sectionTitle}>Storico recenti</Text>
            {historyQuery.data?.recaps?.length ? (
              <View style={styles.historyList}>
                {historyQuery.data.recaps.map((h) => (
                  <View key={h.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{formatWeekRange(h.weekStart)}</Text>
                    <Text style={styles.historyMeta}>
                      {h.topMatches.length} match · {h.stats.totalKm} km
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyBody}>Nessun recap nello storico.</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, marginRight: 6 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  loading: { paddingVertical: 48, alignItems: "center" },
  empty: { paddingVertical: 64, alignItems: "center", paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 8 },
  emptyBody: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 16, marginTop: 6 },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  matchCard: {
    width: 160,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" },
  nickname: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, maxWidth: 140 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  scoreText: { fontSize: 11, color: Colors.textSecondary },
  historyList: { paddingHorizontal: 12, gap: 6 },
  historyRow: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyDate: { fontSize: 13, color: Colors.text, fontFamily: "Inter_500Medium" },
  historyMeta: { fontSize: 12, color: Colors.textSecondary },
});
