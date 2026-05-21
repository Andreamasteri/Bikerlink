import React from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { GameId, GameInfo } from "./ArcadeGameCard";

export interface HallOfFameEntry {
  game: GameId;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  date: string;
}

interface HallOfFameViewProps {
  games: GameInfo[];
}

export const ArcadeHallOfFame: React.FC<HallOfFameViewProps> = ({ games }) => {
  const t = useT();
  const { data, isLoading, isError } = useQuery<Record<GameId, HallOfFameEntry>>({
    queryKey: ["/api/arcade/hall-of-fame"],
    refetchInterval: 120_000,
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

  const entries = data ? Object.values(data) : [];

  if (!entries.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{t("arcade.hofEmpty")}</Text>
        <Text style={styles.emptySubtext}>{t("arcade.hofEmptySubtext")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
      {games.map((g) => {
        const entry = data?.[g.id];
        return (
          <View key={g.id} style={styles.hofCard}>
            <View style={styles.hofHeader}>
              <Text style={styles.hofEmoji}>{g.emoji}</Text>
              <Text style={styles.hofGameTitle}>{g.title}</Text>
            </View>
            {entry ? (
              <View style={styles.hofChampion}>
                {entry.avatarUrl ? (
                  <Image source={{ uri: entry.avatarUrl }} style={styles.hofAvatar} />
                ) : (
                  <View style={[styles.hofAvatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={16} color={Colors.textSecondary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.hofNickname}>{entry.nickname}</Text>
                  <Text style={styles.hofDate}>
                    {new Date(entry.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={styles.hofScore}>{entry.score} {g.scoreLabel}</Text>
              </View>
            ) : (
              <Text style={styles.hofEmpty}>Nessun record</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  hofCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hofHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  hofEmoji: { fontSize: 22 },
  hofGameTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  hofChampion: { flexDirection: "row", alignItems: "center", gap: 10 },
  hofAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceLight },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  hofNickname: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  hofDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  hofScore: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.accent },
  hofEmpty: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic" },
});
