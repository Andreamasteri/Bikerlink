import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface ContestHeaderProps {
  votesRemaining: number;
}

export function ContestHeader({ votesRemaining }: ContestHeaderProps) {
  const t = useT();
  const router = useRouter();

  return (
    <View style={styles.votesBar}>
      <Text style={styles.votesBarText}>
        {t("contest.votesLeft")}: {votesRemaining}/10
      </Text>
      <Pressable
        style={styles.winnersBtn}
        onPress={() => router.push("/contest/winners" as never)}
      >
        <Ionicons name="trophy" size={16} color={Colors.accent} />
        <Text style={styles.winnersText}>Hall of Fame</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  votesBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  votesBarText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  winnersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  winnersText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
});
