// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SUPERMATCH_COLOR } from "./constants";

export function NuovoBadge({ t }: { t: (k: string) => string }) {
  return (
    <View style={nuovoBadgeStyles.badge}>
      <Ionicons name="sparkles" size={10} color="#FFFFFF" />
      <Text style={nuovoBadgeStyles.text}>{t("match.newBadge")}</Text>
    </View>
  );
}

const nuovoBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: SUPERMATCH_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
