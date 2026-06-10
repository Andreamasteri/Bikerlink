import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

type Reason = { key: string; label: string };
type MatchSummary = { reasons: Reason[] };

const KEY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  tipo_moto: "bicycle",
  garage: "heart",
  propProfile: "map",
  proposal: "map",
  musica: "musical-notes",
  stile_guida: "speedometer",
  routeAffinity: "trail-sign",
  telemetryAffinity: "pulse",
  supermatch: "flash",
};

interface Props {
  userId: string;
}

export function MatchReasonChips({ userId }: Props) {
  const { data } = useQuery<MatchSummary | null>({
    queryKey: [`/api/users/${userId}/match-summary`],
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });

  const reasons = data?.reasons ?? [];
  if (reasons.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {reasons.map((r) => {
          const iconName = KEY_ICON[r.key] ?? "star";
          return (
            <View key={r.key} style={styles.chip}>
              <Ionicons name={iconName} size={13} color={Colors.accent} />
              <Text style={styles.chipLabel}>{r.label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "35",
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
});
