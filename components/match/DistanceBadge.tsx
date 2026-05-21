import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const DistanceBadge = ({ distanceKm, distanceFlag }: { distanceKm: number | null, distanceFlag?: string | null }) => {
  const styles = {
    distanceBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      backgroundColor: Colors.background,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    distanceBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: Colors.textSecondary,
    },
  };

  if (distanceFlag === "old_psn") {
    return (
      <View style={styles.distanceBadge}>
        <Ionicons name="location" size={12} color={Colors.warning} />
        <Text style={[styles.distanceBadgeText, { color: Colors.warning }]}>Old Psn</Text>
      </View>
    );
  }
  if (distanceKm != null) {
    return (
      <View style={styles.distanceBadge}>
        <Ionicons name="location" size={12} color={Colors.textSecondary} />
        <Text style={styles.distanceBadgeText}>{distanceKm} km</Text>
      </View>
    );
  }
  return null;
};
