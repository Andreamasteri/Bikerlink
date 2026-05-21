import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { formatDateTime } from "@/lib/units";

function formatSprintTime(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

interface SprintResult {
  id: string;
  sprint0to100Ms: number;
  maxAccelerationG: number | null;
  maxDecelerationG: number | null;
  maxTiltDeg: number | null;
  routeId: string | null;
  createdAt: string;
}

interface SprintStatsProps {
  personalBest: SprintResult | null;
  locale: string;
  timeFormat: string;
}

export const SprintStats: React.FC<SprintStatsProps> = ({
  personalBest,
  locale,
  timeFormat,
}) => {
  if (!personalBest) return null;

  return (
    <View style={styles.pbBanner}>
      <Ionicons name="trophy" size={22} color="#FFD700" />
      <View style={styles.pbInfo}>
        <Text style={styles.pbLabel}>Record personale</Text>
        <Text style={styles.pbTime}>
          {formatSprintTime(personalBest.sprint0to100Ms ?? 0)}
        </Text>
      </View>
      <Text style={styles.pbSince}>
        {formatDateTime(personalBest.createdAt, locale, timeFormat)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pbBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#FFD70050",
    gap: 12,
  },
  pbInfo: {
    flex: 1,
  },
  pbLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  pbTime: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: -0.5,
  },
  pbSince: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    maxWidth: 90,
  },
});
