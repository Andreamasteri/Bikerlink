import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
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

interface SprintCardProps {
  item: SprintResult;
  index: number;
  targetLabel: string;
  locale: string;
  timeFormat: "12h" | "24h";
  onPublish: (item: SprintResult) => void;
}

export function getMedalIcon(index: number) {
  if (index === 0) return { name: "trophy" as const, color: "#FFD700" };
  if (index === 1) return { name: "medal-outline" as const, color: "#C0C0C0" };
  if (index === 2) return { name: "medal-outline" as const, color: "#CD7F32" };
  return null;
}

export const SprintCard: React.FC<SprintCardProps> = ({
  item,
  index,
  targetLabel,
  locale,
  timeFormat,
  onPublish,
}) => {
  const isRecord = index === 0;
  const medal = getMedalIcon(index);
  const timeMs = item.sprint0to100Ms ?? 0;

  return (
    <View style={[styles.sprintItem, isRecord && styles.sprintItemRecord]}>
      <View style={styles.sprintRank}>
        {medal ? (
          <Ionicons name={medal.name} size={20} color={medal.color} />
        ) : (
          <Text style={styles.rankNumber}>#{index + 1}</Text>
        )}
      </View>

      <View style={styles.sprintMain}>
        <Text style={[styles.sprintTime, isRecord && styles.sprintTimeRecord]}>
          {formatSprintTime(timeMs)}
        </Text>
        <Text style={styles.sprintLabel}>0→{targetLabel}</Text>
      </View>

      <View style={styles.sprintStats}>
        {(item.maxAccelerationG ?? 0) > 0 && (
          <Text style={styles.statChip}>
            <Ionicons name="pulse-outline" size={11} color={Colors.accentRed} />
            {" "}
            {(item.maxAccelerationG ?? 0).toFixed(2)}G
          </Text>
        )}
        {(item.maxTiltDeg ?? 0) > 0 && (
          <Text style={styles.statChip}>
            <Ionicons name="compass-outline" size={11} color={Colors.accent} />
            {" "}
            {(item.maxTiltDeg ?? 0).toFixed(1)}°
          </Text>
        )}
      </View>

      <View style={styles.sprintDate}>
        <Text style={styles.dateText} numberOfLines={2}>
          {formatDateTime(item.createdAt, locale, timeFormat)}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.publishBtn}
        onPress={() => onPublish(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
        testID={`publish-sprint-${item.id}`}
      >
        <Ionicons name="share-outline" size={18} color={Colors.accent} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sprintItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  sprintItemRecord: {
    borderWidth: 1,
    borderColor: "#FFD70060",
    backgroundColor: Colors.surface,
  },
  sprintRank: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  sprintMain: {
    flex: 1,
    minWidth: 80,
  },
  sprintTime: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  sprintTimeRecord: {
    color: "#FFD700",
  },
  sprintLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sprintStats: {
    alignItems: "flex-end",
    gap: 3,
  },
  statChip: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sprintDate: {
    alignItems: "flex-end",
    maxWidth: 80,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 15,
  },
  publishBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
});
