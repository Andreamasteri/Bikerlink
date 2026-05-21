import React from "react";
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { GameId } from "./ArcadeGameCard";

interface LeaderboardEntry {
  userId: string;
  bestScore: number;
  nickname: string;
  avatarUrl: string | null;
}

interface LeaderboardViewProps {
  gameId: GameId;
}

export const ArcadeLeaderboard: React.FC<LeaderboardViewProps> = ({ gameId }) => {
  const t = useT();
  const { data, isLoading, isError } = useQuery<LeaderboardEntry[]>({
    queryKey: [`/api/arcade/leaderboard/${gameId}`],
    refetchInterval: 60_000,
  });

  if (isLoading) return <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />;
  if (isError) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{t("common.loadError")}</Text>
        <Text style={styles.emptySubtext}>{t("common.checkConnectionRetry")}</Text>
      </View>
    );
  }
  if (!data?.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{t("arcade.noScoresYet")}</Text>
        <Text style={styles.emptySubtext}>{t("arcade.beFirstToPlay")}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ paddingVertical: 8 }}
      renderItem={({ item, index }) => (
        <View style={styles.leaderRow}>
          <Text style={[styles.rank, index === 0 && styles.rankGold, index === 1 && styles.rankSilver, index === 2 && styles.rankBronze]}>
            #{index + 1}
          </Text>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={14} color={Colors.textSecondary} />
            </View>
          )}
          <Text style={styles.nickname} numberOfLines={1}>{item.nickname}</Text>
          <Text style={styles.leaderScore}>{item.bestScore}</Text>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  rank: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.textSecondary, width: 32 },
  rankGold: { color: "#FFD700" },
  rankSilver: { color: "#C0C0C0" },
  rankBronze: { color: "#CD7F32" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceLight },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  nickname: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  leaderScore: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.accent },
});
