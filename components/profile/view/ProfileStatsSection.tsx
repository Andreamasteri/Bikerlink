import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { convertDistance } from "@/lib/units";
import type { DistanceUnit } from "@/lib/units-context";

interface ProfileStatsSectionProps {
  totalRides: number;
  totalKm: number;
  easterEggs: number;
  distanceUnit: DistanceUnit;
  t: (key: string) => string;
}

export const ProfileStatsSection: React.FC<ProfileStatsSectionProps> = ({
  totalRides,
  totalKm,
  easterEggs,
  distanceUnit,
  t,
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalRides}</Text>
          <Text style={styles.statLabel}>{t("profile.rides")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {(() => {
              const { value, label } = convertDistance(totalKm, distanceUnit);
              return value >= 1000 ? `${(value / 1000).toFixed(1)}k ${label}` : `${Math.round(value)} ${label}`;
            })()}
          </Text>
          <Text style={styles.statLabel}>{t("profile.totalKm")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{easterEggs}</Text>
          <Text style={styles.statLabel}>{t("profile.easterEggs")}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
});
