import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

import EndlessBiker from "@/components/arcade/EndlessBiker";
import TrafficRacer from "@/components/arcade/TrafficRacer";
import WheelieChallenge from "@/components/arcade/WheelieChallenge";
import Tetris from "@/components/arcade/Tetris";
import SpaceInvaders from "@/components/arcade/SpaceInvaders";

const { width: W } = Dimensions.get("window");

type GameId = "endless_biker" | "traffic_racer" | "wheelie" | "tetris" | "space_invaders";
type HubTab = "games" | "leaderboard" | "hof";

const GAMES: { id: GameId; title: string; emoji: string; desc: string; scoreLabel: string }[] = [
  { id: "endless_biker", title: "Endless Biker", emoji: "🏍️", desc: "Corri e salta gli ostacoli!", scoreLabel: "m" },
  { id: "traffic_racer", title: "Traffic Racer", emoji: "🚦", desc: "Sorpassa il traffico!", scoreLabel: "pt" },
  { id: "wheelie", title: "Wheelie Challenge", emoji: "🤸", desc: "Tieni l'impennata!", scoreLabel: "s" },
  { id: "tetris", title: "Tetris", emoji: "🧩", desc: "Il classico senza tempo!", scoreLabel: "pt" },
  { id: "space_invaders", title: "Space Invaders", emoji: "👾", desc: "Elimina gli alieni!", scoreLabel: "pt" },
];

const GAME_LABEL: Record<GameId, string> = {
  endless_biker: "Endless Biker",
  traffic_racer: "Traffic Racer",
  wheelie: "Wheelie Challenge",
  tetris: "Tetris",
  space_invaders: "Space Invaders",
};

interface LeaderboardEntry {
  userId: string;
  bestScore: number;
  nickname: string;
  avatarUrl: string | null;
}

interface HallOfFameEntry {
  game: GameId;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  score: number;
  date: string;
}

interface GameOverModalProps {
  score: number;
  personalBest: number;
  isNewRecord: boolean;
  onReplay: () => void;
  onClose: () => void;
  onRetrySave?: () => void;
  scoreLabel: string;
  isSaving: boolean;
  isSaveError: boolean;
}

function GameOverModal({ score, personalBest, isNewRecord, onReplay, onClose, onRetrySave, scoreLabel, isSaving, isSaveError }: GameOverModalProps) {
  const bounceAnim = useRef(new Animated.Value(isNewRecord ? 0 : 1)).current;

  useEffect(() => {
    if (isNewRecord) {
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isNewRecord]);

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {isNewRecord && (
            <Animated.View style={[styles.newRecordBadge, { transform: [{ scale: bounceAnim }] }]}>
              <Text style={styles.newRecordText}>🏆 NUOVO RECORD!</Text>
            </Animated.View>
          )}
          <Text style={styles.gameOverTitle}>Game Over</Text>
          <Text style={styles.gameOverScore}>{score} {scoreLabel}</Text>
          {isNewRecord && personalBest > 0 ? (
            <Text style={styles.gameOverBest}>
              {personalBest} → <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold" }}>{score}</Text> {scoreLabel} 🎉
            </Text>
          ) : (
            <Text style={styles.gameOverBest}>Personale: {personalBest > 0 ? personalBest : score} {scoreLabel}</Text>
          )}
          {isSaving && <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 8 }} />}
          {isSaveError && (
            <View style={styles.saveErrorRow}>
              <Text style={styles.saveErrorText}>Errore salvataggio</Text>
              {onRetrySave && (
                <Pressable onPress={onRetrySave} style={styles.retryBtn}>
                  <Ionicons name="refresh-circle" size={18} color={Colors.accent} />
                  <Text style={styles.retryBtnText}>Riprova</Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.modalBtns}>
            <Pressable style={styles.replayBtn} onPress={onReplay}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.replayBtnText}>Rigioca</Text>
            </Pressable>
            <Pressable style={styles.exitBtn} onPress={onClose}>
              <Text style={styles.exitBtnText}>Esci</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LeaderboardView({ gameId }: { gameId: GameId }) {
  const { data, isLoading, isError } = useQuery<LeaderboardEntry[]>({
    queryKey: [`/api/arcade/leaderboard/${gameId}`],
    refetchInterval: 60_000,
  });

  if (isLoading) return <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />;
  if (isError) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Errore di caricamento.</Text>
        <Text style={styles.emptySubtext}>Controlla la connessione e riprova.</Text>
      </View>
    );
  }
  if (!data?.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Nessun punteggio ancora.</Text>
        <Text style={styles.emptySubtext}>Sii il primo a giocare!</Text>
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
}

function HallOfFameView() {
  const { data, isLoading, isError } = useQuery<Record<GameId, HallOfFameEntry>>({
    queryKey: ["/api/arcade/hall-of-fame"],
    refetchInterval: 120_000,
  });

  if (isLoading) return <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />;
  if (isError) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Errore di caricamento.</Text>
        <Text style={styles.emptySubtext}>Controlla la connessione e riprova.</Text>
      </View>
    );
  }

  const entries = data ? Object.values(data) : [];

  if (!entries.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Hall of Fame vuota.</Text>
        <Text style={styles.emptySubtext}>Gioca per entrare nella storia!</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
      {GAMES.map((g) => {
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
}

export default function ArcadeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; game?: string }>();
  const [hubTab, setHubTab] = useState<HubTab>(
    params.tab === "leaderboard" ? "leaderboard" : params.tab === "hof" ? "hof" : "games"
  );
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [leaderboardGame, setLeaderboardGame] = useState<GameId>(
    (params.game as GameId | undefined) && GAMES.some((g) => g.id === params.game)
      ? (params.game as GameId)
      : "endless_biker"
  );
  const [gameKey, setGameKey] = useState(0);
  const [gameOver, setGameOver] = useState<{ score: number; prevBest: number } | null>(null);

  useEffect(() => {
    if (params.tab === "leaderboard") {
      setHubTab("leaderboard");
      if (params.game && GAMES.some((g) => g.id === params.game)) {
        setLeaderboardGame(params.game as GameId);
      }
    } else if (params.tab === "hof") {
      setHubTab("hof");
    }
  }, [params.tab, params.game]);

  const { data: myScores } = useQuery<Record<string, number>>({
    queryKey: ["/api/arcade/my-scores"],
    refetchInterval: 120_000,
  });

  const { data: hofData } = useQuery<Record<GameId, HallOfFameEntry>>({
    queryKey: ["/api/arcade/hall-of-fame"],
    refetchInterval: 120_000,
  });

  const scoreMutation = useMutation({
    mutationFn: async ({ game, score }: { game: GameId; score: number }) => {
      await apiRequest("POST", "/api/arcade/score", { game, score });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arcade/my-scores"] });
      queryClient.invalidateQueries({ queryKey: [`/api/arcade/leaderboard/${vars.game}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/arcade/hall-of-fame"] });
    },
  });

  const handleGameOver = useCallback((score: number) => {
    if (!activeGame) return;
    const personal = myScores?.[activeGame] ?? 0;
    setGameOver({ score, prevBest: personal });
    if (score > personal) {
      scoreMutation.mutate({ game: activeGame, score });
    }
  }, [activeGame, myScores, scoreMutation]);

  const handleReplay = useCallback(() => {
    setGameOver(null);
    scoreMutation.reset();
    setGameKey((k) => k + 1);
  }, [scoreMutation]);

  const handleExitGame = useCallback(() => {
    setGameOver(null);
    scoreMutation.reset();
    setActiveGame(null);
  }, [scoreMutation]);

  const renderGame = () => {
    if (!activeGame) return null;
    const props = { onGameOver: handleGameOver };
    switch (activeGame) {
      case "endless_biker": return <EndlessBiker key={gameKey} {...props} />;
      case "traffic_racer": return <TrafficRacer key={gameKey} {...props} />;
      case "wheelie": return <WheelieChallenge key={gameKey} {...props} />;
      case "tetris": return <Tetris key={gameKey} {...props} />;
      case "space_invaders": return <SpaceInvaders key={gameKey} {...props} />;
    }
  };

  if (activeGame) {
    const gameInfo = GAMES.find((g) => g.id === activeGame)!;
    const personal = myScores?.[activeGame] ?? 0;
    const hofEntry = hofData?.[activeGame];
    const communityRecord = hofEntry?.score ?? 0;

    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.gameHeader, { paddingTop: Platform.OS === "web" ? 67 + 8 : insets.top + 8 }]}>
          <Pressable onPress={handleExitGame} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.gameHeaderTitle}>{gameInfo.title}</Text>
          <View style={styles.gameHeaderStats}>
            <Text style={styles.gameHeaderStat}>Best: {personal}{gameInfo.scoreLabel}</Text>
            <Text style={styles.gameHeaderStat}>Record: {communityRecord}{gameInfo.scoreLabel}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {renderGame()}
        </View>
        {gameOver && (
          <GameOverModal
            score={gameOver.score}
            personalBest={gameOver.prevBest}
            isNewRecord={gameOver.score > gameOver.prevBest}
            onReplay={handleReplay}
            onClose={handleExitGame}
            scoreLabel={gameInfo.scoreLabel}
            isSaving={scoreMutation.isPending}
            isSaveError={scoreMutation.isError}
            onRetrySave={
              scoreMutation.isError && activeGame
                ? () => scoreMutation.mutate({ game: activeGame, score: gameOver.score })
                : undefined
            }
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }]}>
      <View style={styles.tabSwitcher}>
        {([["games", "🕹️ Giochi"], ["leaderboard", "🏅 Classifiche"], ["hof", "🏆 Hall of Fame"]] as const).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, hubTab === key && styles.tabBtnActive]}
            onPress={() => setHubTab(key)}
          >
            <Text style={[styles.tabBtnText, hubTab === key && styles.tabBtnTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {hubTab === "games" && (
        <ScrollView contentContainerStyle={styles.gameGrid} showsVerticalScrollIndicator={false}>
          {GAMES.map((g) => {
            const personal = myScores?.[g.id] ?? 0;
            const hofEntry = hofData?.[g.id];
            return (
              <Pressable key={g.id} style={styles.gameCard} onPress={() => setActiveGame(g.id)}>
                <Text style={styles.gameCardEmoji}>{g.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameCardTitle}>{g.title}</Text>
                  <Text style={styles.gameCardDesc}>{g.desc}</Text>
                  <View style={styles.gameCardStats}>
                    <Text style={styles.gameCardStat}>👤 {personal}{g.scoreLabel}</Text>
                    {hofEntry && <Text style={styles.gameCardStat}>🏆 {hofEntry.score}{g.scoreLabel}</Text>}
                  </View>
                </View>
                <Ionicons name="play-circle" size={28} color={Colors.accent} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {hubTab === "leaderboard" && (
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gameSelector}
          >
            {GAMES.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.gameSelectorBtn, leaderboardGame === g.id && styles.gameSelectorBtnActive]}
                onPress={() => setLeaderboardGame(g.id)}
              >
                <Text style={styles.gameSelectorEmoji}>{g.emoji}</Text>
                <Text style={[styles.gameSelectorText, leaderboardGame === g.id && styles.gameSelectorTextActive]}>
                  {g.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <LeaderboardView gameId={leaderboardGame} />
        </View>
      )}

      {hubTab === "hof" && <HallOfFameView />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  tabSwitcher: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  tabBtnText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.accent,
  },

  gameGrid: {
    padding: 12,
    gap: 10,
  },
  gameCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gameCardEmoji: { fontSize: 32 },
  gameCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  gameCardDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  gameCardStats: { flexDirection: "row", gap: 12 },
  gameCardStat: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },

  gameSelector: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  gameSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gameSelectorBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "20",
  },
  gameSelectorEmoji: { fontSize: 16 },
  gameSelectorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  gameSelectorTextActive: { color: Colors.accent },

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
  hofNickname: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  hofDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  hofScore: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.accent },
  hofEmpty: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },

  gameHeader: {
    backgroundColor: "#0a0a1a",
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  gameHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  gameHeaderStats: {
    alignItems: "flex-end",
    gap: 2,
  },
  gameHeaderStat: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newRecordBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 12,
  },
  newRecordText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  gameOverTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 8 },
  gameOverScore: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.accent, marginBottom: 4 },
  gameOverBest: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 12 },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  replayBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  exitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exitBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  saveErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(244,67,54,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(244,67,54,0.3)",
  },
  saveErrorText: { fontSize: 13, color: "#F44336", fontFamily: "Inter_500Medium", flex: 1 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.accent },
});
