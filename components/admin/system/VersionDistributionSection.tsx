import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface VersionDistributionRow {
  platform: string;
  version: string;
  count: number;
}

interface VersionDistribution {
  totalTracked: number;
  underMin: number;
  underLatest: number;
  config: {
    android: { latestVersion: string; minVersion: string };
    ios: { latestVersion: string; minVersion: string };
  };
  byPlatformVersion: VersionDistributionRow[];
  windowDays: number;
  generatedAt: string;
}

interface VersionDistributionSectionProps {
  versionDist?: VersionDistribution;
  isFetchingDist: boolean;
  refetchDist: () => void;
  platformLabel: (p: string) => string;
}

export const VersionDistributionSection: React.FC<VersionDistributionSectionProps> = ({
  versionDist,
  isFetchingDist,
  refetchDist,
  platformLabel,
}) => {
  if (!versionDist) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="pie-chart-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Diffusione Versioni</Text>
        <TouchableOpacity onPress={refetchDist} disabled={isFetchingDist}>
          {isFetchingDist ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="refresh" size={16} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{versionDist.totalTracked}</Text>
          <Text style={styles.statLabel}>Utenti Attivi (30g)</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#FF4444" }]}>{versionDist.underMin}</Text>
          <Text style={styles.statLabel}>Bloccati (Vecchi)</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#FFAA00" }]}>{versionDist.underLatest}</Text>
          <Text style={styles.statLabel}>Da Aggiornare</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Distribuzione per Piattaforma</Text>
      {versionDist.byPlatformVersion.map((row, idx) => {
        const platform = row.platform;
        const cfg = platform === "android" ? versionDist.config.android : versionDist.config.ios;
        const isMin = row.version < (cfg?.minVersion ?? "0.0.0");
        const isOld = row.version < (cfg?.latestVersion ?? "0.0.0");

        return (
          <View key={`${row.platform}-${row.version}-${idx}`} style={styles.distRow}>
            <Ionicons
              name={platform === "android" ? "logo-android" : platform === "ios" ? "logo-apple" : "globe-outline"}
              size={14}
              color={Colors.textMuted ?? "#888"}
            />
            <Text style={styles.distVersion}>
              {platformLabel(platform)} {row.version}
            </Text>
            {isMin ? (
              <View style={[styles.distBadge, { backgroundColor: "#CC0000" }]}>
                <Text style={styles.distBadgeText}>BLOCKED</Text>
              </View>
            ) : isOld ? (
              <View style={[styles.distBadge, { backgroundColor: "#FFAA00" }]}>
                <Text style={styles.distBadgeText}>UPDATE</Text>
              </View>
            ) : (
              <View style={[styles.distBadge, { backgroundColor: "#44AA44" }]}>
                <Text style={styles.distBadgeText}>LATEST</Text>
              </View>
            )}
            <Text style={styles.distCount}>{row.count}</Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  statValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  statLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
  },
  sectionTitle: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 12,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  distVersion: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  distBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  distBadgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  distCount: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
