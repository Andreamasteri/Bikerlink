import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GameInfo } from "./ArcadeGameCard";

interface ArcadeHeaderProps {
  activeGameInfo: GameInfo;
  activePersonal: number;
  activeCommunityRecord: number;
  onExit: () => void;
  topInset: number;
}

export const ArcadeHeader: React.FC<ArcadeHeaderProps> = ({
  activeGameInfo,
  activePersonal,
  activeCommunityRecord,
  onExit,
  topInset,
}) => {
  return (
    <View style={[styles.gameHeader, { paddingTop: topInset + 8 }]}>
      <Pressable onPress={onExit} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </Pressable>
      <Text style={styles.gameHeaderTitle}>{activeGameInfo.title}</Text>
      <View style={styles.gameHeaderStats}>
        <Text style={styles.gameHeaderStat}>
          Best: {activePersonal}{activeGameInfo.scoreLabel}
        </Text>
        <Text style={styles.gameHeaderStat}>
          Record: {activeCommunityRecord}{activeGameInfo.scoreLabel}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
});
