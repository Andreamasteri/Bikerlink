import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import ElevationProfile from "@/components/ElevationProfile";

interface RouteDetailStatsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- elevation data from API
  elevation: any | null;
  elevationLoading: boolean;
  elevationError: boolean;
  onLoadElevation: () => void;
}

export default function RouteDetailStats({
  elevation,
  elevationLoading,
  elevationError,
  onLoadElevation,
}: RouteDetailStatsProps) {
  return (
    <View style={styles.elevationSection}>
      <View style={styles.elevationHeader}>
        <MaterialCommunityIcons name="elevation-rise" size={18} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Profilo altimetrico</Text>
      </View>

      {!elevation && !elevationLoading && !elevationError && (
        <TouchableOpacity
          style={styles.elevationButton}
          onPress={onLoadElevation}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="chart-bell-curve" size={18} color={Colors.accent} />
          <Text style={styles.elevationButtonText}>Mostra profilo altimetrico</Text>
        </TouchableOpacity>
      )}

      {elevationLoading && (
        <View style={styles.elevationLoading}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.elevationLoadingText}>Caricamento dati altimetrici…</Text>
        </View>
      )}

      {elevationError && !elevationLoading && (
        <View style={styles.elevationError}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.elevationErrorText}>Dati non disponibili al momento</Text>
          <TouchableOpacity onPress={onLoadElevation} activeOpacity={0.7}>
            <Text style={styles.elevationRetry}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {elevation && !elevationLoading && (() => {
        const profile = (elevation.elevations as number[]).map((alt: number, i: number) => ({
          distanceKm: elevation.distanceKm[i] ?? 0,
          altitudeM: alt,
        }));
        return (
          <ElevationProfile
            profile={profile}
            gainM={elevation.totalGain}
            lossM={elevation.totalLoss}
            minM={elevation.minEle}
            maxM={elevation.maxEle}
            height={140}
          />
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  elevationSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  elevationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  elevationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  elevationButtonText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  elevationLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  elevationLoadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  elevationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    flexWrap: "wrap",
  },
  elevationErrorText: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  elevationRetry: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
});
