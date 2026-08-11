import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type VisibilitySummaryProps = {
  isAvailable: boolean;
  isGhostMode: boolean;
  hideFromMap: boolean;
  positionFuzz: boolean;
};

function getVisibilitySummary(props: VisibilitySummaryProps): {
  label: string;
  icon: "eye-off" | "eye" | "location-outline" | "shuffle-outline";
  color: string;
  bg: string;
} {
  const { isAvailable, isGhostMode, hideFromMap, positionFuzz } = props;

  if (!isAvailable) {
    return {
      label: "Non disponibile · Non visibile",
      icon: "eye-off",
      color: "#fff",
      bg: Colors.accentRed,
    };
  }
  if (isGhostMode) {
    return {
      label: "Ghost mode · Invisibile sulla mappa",
      icon: "eye-off",
      color: "#fff",
      bg: Colors.accentRed,
    };
  }
  if (hideFromMap) {
    return {
      label: "Nascosto dalla mappa",
      icon: "location-outline",
      color: "#fff",
      bg: Colors.accentRed,
    };
  }
  if (positionFuzz) {
    return {
      label: "Visibile · Posizione offuscata",
      icon: "shuffle-outline",
      color: "#fff",
      bg: "#E07B00",
    };
  }
  return {
    label: "Visibile a tutti · Posizione reale",
    icon: "eye",
    color: "#fff",
    bg: Colors.success,
  };
}

export function VisibilitySummary(props: VisibilitySummaryProps) {
  const summary = getVisibilitySummary(props);
  return (
    <View style={[visStyles.badge, { backgroundColor: summary.bg }]}>
      <Ionicons name={summary.icon} size={14} color={summary.color} />
      <Text style={[visStyles.label, { color: summary.color }]}>{summary.label}</Text>
    </View>
  );
}

const visStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 4,
    alignSelf: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
