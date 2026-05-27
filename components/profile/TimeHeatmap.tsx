import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface TimeProfileResponse {
  userId: string;
  histogram: number[] | null;
  totalRides: number;
  label: string | null;
  coldStart: boolean;
  updatedAt: string | null;
}

const DAY_LABELS_KEYS = [
  "timeProfile.day.mon",
  "timeProfile.day.tue",
  "timeProfile.day.wed",
  "timeProfile.day.thu",
  "timeProfile.day.fri",
  "timeProfile.day.sat",
  "timeProfile.day.sun",
];

const LABEL_KEY_PREFIX: Record<string, string> = {
  "weekend-warrior": "timeProfile.label.weekendWarrior",
  "early-morning": "timeProfile.label.earlyMorning",
  "after-work": "timeProfile.label.afterWork",
  "sunday-rider": "timeProfile.label.sundayRider",
  "all-rounder": "timeProfile.label.allRounder",
  "night-owl": "timeProfile.label.nightOwl",
  "lunch-break": "timeProfile.label.lunchBreak",
};

interface Props {
  userId: string;
}

export const TimeHeatmap: React.FC<Props> = ({ userId }) => {
  const colors = useColors();
  const t = useT();
  const { data, isLoading } = useQuery<TimeProfileResponse>({
    queryKey: ["/api/users", userId, "time-profile"],
    enabled: !!userId,
  });

  const styles = makeStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!data || data.coldStart || !data.histogram) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>{t("timeProfile.title")}</Text>
        <Text style={styles.empty}>{t("timeProfile.coldStart")}</Text>
      </View>
    );
  }

  const hist = data.histogram;
  const max = Math.max(...hist, 0.0001);
  const labelText = data.label
    ? t(LABEL_KEY_PREFIX[data.label] || "timeProfile.label.allRounder")
    : "";

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t("timeProfile.title")}</Text>
      {!!labelText && <Text style={styles.labelChip}>{labelText}</Text>}

      <View style={styles.headerRow}>
        <View style={styles.dayHeader} />
        {Array.from({ length: 24 }).map((_, h) => (
          <Text key={h} style={styles.hourHeader}>
            {h % 6 === 0 ? h : ""}
          </Text>
        ))}
      </View>

      {Array.from({ length: 7 }).map((_, d) => (
        <View key={d} style={styles.row}>
          <Text style={styles.dayHeader}>{t(DAY_LABELS_KEYS[d])}</Text>
          {Array.from({ length: 24 }).map((_, h) => {
            const v = hist[d * 24 + h] || 0;
            const intensity = max > 0 ? v / max : 0;
            return (
              <View
                key={h}
                style={[
                  styles.cell,
                  {
                    backgroundColor: colors.primary,
                    opacity: 0.08 + intensity * 0.92,
                  },
                ]}
              />
            );
          })}
        </View>
      ))}

      <Text style={styles.footer}>
        {t("timeProfile.totalRides")}: {data.totalRides}
      </Text>
    </View>
  );
};

const makeStyles = (colors: { text: string; muted?: string; card?: string; border?: string; primary: string }) =>
  StyleSheet.create({
    section: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginVertical: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: colors.text,
      marginBottom: 4,
    },
    labelChip: {
      fontSize: 13,
      color: colors.primary,
      marginBottom: 8,
    },
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginBottom: 2,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginVertical: 1,
    },
    dayHeader: {
      width: 28,
      fontSize: 10,
      color: colors.text,
      opacity: 0.7,
    },
    hourHeader: {
      flex: 1,
      fontSize: 9,
      textAlign: "center" as const,
      color: colors.text,
      opacity: 0.5,
    },
    cell: {
      flex: 1,
      aspectRatio: 1,
      marginHorizontal: 0.5,
      borderRadius: 2,
    },
    empty: {
      fontSize: 13,
      color: colors.text,
      opacity: 0.6,
    },
    footer: {
      marginTop: 8,
      fontSize: 12,
      color: colors.text,
      opacity: 0.6,
    },
  });

export default TimeHeatmap;
