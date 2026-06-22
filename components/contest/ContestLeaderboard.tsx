import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const GAME_INFO: Record<string, { title: string; emoji: string; scoreLabel: string }> = {
  endless_biker: { title: "Endless Biker", emoji: "🏍️", scoreLabel: "m" },
  traffic_racer: { title: "Traffic Racer", emoji: "🚦", scoreLabel: "pt" },
  wheelie: { title: "Wheelie Challenge", emoji: "🤸", scoreLabel: "s" },
  tetris: { title: "Tetris", emoji: "🧩", scoreLabel: "pt" },
  space_invaders: { title: "Space Invaders", emoji: "👾", scoreLabel: "pt" },
};

const ARCADE_GAME_IDS = Object.keys(GAME_INFO) as Array<keyof typeof GAME_INFO>;

export function ContestLeaderboard() {
  const t = useT();
  const router = useRouter();
  const { data: hofData } = useQuery<Record<string, {
    game: string; userId: string; nickname: string; avatarUrl: string | null; score: number; date: string;
  }>>({
    queryKey: ["/api/arcade/hall-of-fame"],
    refetchInterval: 120_000,
  });

  return (
    <View style={arcadeStyles.section}>
      <Text style={arcadeStyles.sectionTitle}>🕹️ Campioni Arcade</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {ARCADE_GAME_IDS.map((gameId) => {
          const info = GAME_INFO[gameId];
          const entry = hofData?.[gameId] ?? null;
          return (
            <Pressable
              key={gameId}
              style={arcadeStyles.card}
              onPress={() => router.push({ pathname: "/(tabs)/arcade", params: { tab: "leaderboard", game: gameId } } as unknown as Href)}
            >
              <Text style={arcadeStyles.cardEmoji}>{info.emoji}</Text>
              <Text style={arcadeStyles.cardGame}>{info.title}</Text>
              <View style={arcadeStyles.cardChampion}>
                {entry ? (
                  <>
                    {entry.avatarUrl ? (
                      <Image source={{ uri: entry.avatarUrl }} style={arcadeStyles.cardAvatar} />
                    ) : (
                      <View style={[arcadeStyles.cardAvatar, { backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="person" size={12} color={Colors.textSecondary} />
                      </View>
                    )}
                    <Text style={arcadeStyles.cardNickname} numberOfLines={1}>{entry.nickname}</Text>
                  </>
                ) : (
                  <>
                    <View style={[arcadeStyles.cardAvatar, { backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="trophy-outline" size={12} color={Colors.textSecondary} />
                    </View>
                    <Text style={[arcadeStyles.cardNickname, { color: Colors.textSecondary }]}>—</Text>
                  </>
                )}
              </View>
              {entry ? (
                <>
                  <Text style={arcadeStyles.cardScore}>{entry.score} {info.scoreLabel}</Text>
                  <Text style={arcadeStyles.cardDate}>
                    {new Date(entry.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                  </Text>
                </>
              ) : (
                <Text style={[arcadeStyles.cardScore, { color: Colors.textSecondary, fontSize: 11 }]}>{t("contest.noRecord")}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const arcadeStyles = StyleSheet.create({
  section: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  card: {
    width: 130,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  cardEmoji: { fontSize: 28 },
  cardGame: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  cardChampion: { flexDirection: "row", alignItems: "center", gap: 6, width: "100%" },
  cardAvatar: { width: 20, height: 20, borderRadius: 10 },
  cardNickname: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  cardScore: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.accent },
  cardDate: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
