import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useFloatingWidget } from "@/lib/floating-widget-context";

import EndlessBiker from "@/components/arcade/EndlessBiker";
import TrafficRacer from "@/components/arcade/TrafficRacer";
import WheelieChallenge from "@/components/arcade/WheelieChallenge";
import Tetris from "@/components/arcade/Tetris";
import SpaceInvaders from "@/components/arcade/SpaceInvaders";
import { useT } from "@/lib/language-context";

import { ArcadeGameCard, GameId, GameInfo } from "@/components/arcade/ArcadeGameCard";
import { ArcadeHeader } from "@/components/arcade/ArcadeHeader";
import { ArcadeLeaderboard } from "@/components/arcade/ArcadeLeaderboard";
import { ArcadeHallOfFame, HallOfFameEntry } from "@/components/arcade/ArcadeHallOfFame";
import { GameOverModal } from "@/components/arcade/GameOverModal";

type HubTab = "games" | "leaderboard" | "hof";

function getGames(t: (key: string) => string): GameInfo[] {
  return [
    { id: "endless_biker", title: "Endless Biker", emoji: "🏍️", desc: t("arcade.corriSalta"), scoreLabel: "m" },
    { id: "traffic_racer", title: "Traffic Racer", emoji: "🚦", desc: t("arcade.sorpassaTraffico"), scoreLabel: "pt" },
    { id: "wheelie", title: "Wheelie Challenge", emoji: "🤸", desc: t("arcade.tieniImpennata"), scoreLabel: "s" },
    { id: "tetris", title: "Tetris", emoji: "🧩", desc: t("arcade.classicoSenzaTempo"), scoreLabel: "pt" },
    { id: "space_invaders", title: "Space Invaders", emoji: "👾", desc: t("arcade.eliminaGlialieni"), scoreLabel: "pt" },
  ];
}

export default function ArcadeScreen() {
  const t = useT();
  const GAMES = getGames(t);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; game?: string }>();
  const { suppressWidget } = useFloatingWidget();
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
    suppressWidget(!!activeGame);
    return () => { suppressWidget(false); };
  }, [activeGame, suppressWidget]);

  useEffect(() => {
    if (params.tab === "leaderboard") {
      setHubTab("leaderboard");
      if (params.game && GAMES.some((g) => g.id === params.game)) {
        setLeaderboardGame(params.game as GameId);
      }
    } else if (params.tab === "hof") {
      setHubTab("hof");
    }
  }, [params.tab, params.game, GAMES]);

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

  const scoreMutationRef = useRef(scoreMutation);
  scoreMutationRef.current = scoreMutation;

  const handleGameOver = useCallback((score: number) => {
    if (!activeGame) return;
    const personal = myScores?.[activeGame] ?? 0;
    setGameOver({ score, prevBest: personal });
    if (score > personal) {
      scoreMutationRef.current.mutate({ game: activeGame, score });
    }
  }, [activeGame, myScores]);

  const handleReplay = useCallback(() => {
    setGameOver(null);
    scoreMutationRef.current.reset();
    setGameKey((k) => k + 1);
  }, []);

  const handleExitGame = useCallback(() => {
    setGameOver(null);
    scoreMutationRef.current.reset();
    setActiveGame(null);
  }, []);

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

  const activeGameInfo = activeGame ? GAMES.find((g) => g.id === activeGame) ?? null : null;
  const activePersonal = activeGame ? (myScores?.[activeGame] ?? 0) : 0;
  const activeHofEntry = activeGame ? hofData?.[activeGame] : undefined;
  const activeCommunityRecord = activeHofEntry?.score ?? 0;

  return (
    <>
      <Modal
        visible={!!activeGame}
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleExitGame}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          {activeGameInfo && (
            <ArcadeHeader
              activeGameInfo={activeGameInfo}
              activePersonal={activePersonal}
              activeCommunityRecord={activeCommunityRecord}
              onExit={handleExitGame}
              topInset={insets.top}
            />
          )}
          <View style={{ flex: 1 }}>
            {renderGame()}
          </View>
          {gameOver && activeGameInfo && (
            <GameOverModal
              score={gameOver.score}
              personalBest={gameOver.prevBest}
              isNewRecord={gameOver.score > gameOver.prevBest}
              onReplay={handleReplay}
              onClose={handleExitGame}
              scoreLabel={activeGameInfo.scoreLabel}
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
      </Modal>

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
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
            {GAMES.map((g) => (
              <ArcadeGameCard
                key={g.id}
                game={g}
                personal={myScores?.[g.id] ?? 0}
                hofEntry={hofData?.[g.id]}
                onPress={setActiveGame}
              />
            ))}
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
            <ArcadeLeaderboard gameId={leaderboardGame} />
          </View>
        )}

        {hubTab === "hof" && <ArcadeHallOfFame games={GAMES} />}
      </View>
    </>
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
});
