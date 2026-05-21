import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type GameId = "endless_biker" | "traffic_racer" | "wheelie" | "tetris" | "space_invaders";

export interface GameInfo {
  id: GameId;
  title: string;
  emoji: string;
  desc: string;
  scoreLabel: string;
}

interface ArcadeGameCardProps {
  game: GameInfo;
  personal: number;
  hofEntry?: {
    score: number;
  };
  onPress: (id: GameId) => void;
}

export const ArcadeGameCard: React.FC<ArcadeGameCardProps> = ({
  game,
  personal,
  hofEntry,
  onPress,
}) => {
  return (
    <Pressable style={styles.gameCard} onPress={() => onPress(game.id)}>
      <Text style={styles.gameCardEmoji}>{game.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.gameCardTitle}>{game.title}</Text>
        <Text style={styles.gameCardDesc}>{game.desc}</Text>
        <View style={styles.gameCardStats}>
          <Text style={styles.gameCardStat}>👤 {personal}{game.scoreLabel}</Text>
          {hofEntry && <Text style={styles.gameCardStat}>🏆 {hofEntry.score}{game.scoreLabel}</Text>}
        </View>
      </View>
      <Ionicons name="play-circle" size={28} color={Colors.accent} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
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
});
