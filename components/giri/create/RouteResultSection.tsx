import React from "react";
import { View, StyleSheet } from "react-native";
import { RouteResultCard } from "./RouteResultCard";
import ElevationProfile from "@/components/ElevationProfile";

interface RouteResultSectionProps {
  routeResult: any;
  isRoundTrip: boolean;
  isMultiDay: boolean;
  daysCount: number;
  dismissedWarnings: Set<string>;
  setDismissedWarnings: React.Dispatch<React.SetStateAction<Set<string>>>;
  weatherLoading: boolean;
  weatherPreview: any;
  selectedMotoId: string | null;
  fuelStopsNeeded: number;
  bikerScoreAnim: any;
}

export const RouteResultSection: React.FC<RouteResultSectionProps> = ({
  routeResult,
  isMultiDay,
  daysCount,
  dismissedWarnings,
  setDismissedWarnings,
  weatherLoading,
  weatherPreview,
  selectedMotoId,
  fuelStopsNeeded,
  bikerScoreAnim,
}) => {
  if (!routeResult) return null;

  return (
    <View style={styles.container}>
      <RouteResultCard
        routeResult={routeResult}
        dismissedWarnings={dismissedWarnings}
        onDismissWarning={(w) => setDismissedWarnings((prev) => new Set([...prev, w]))}
        bikerScoreAnim={bikerScoreAnim}
        weatherLoading={weatherLoading}
        weatherPreview={weatherPreview}
        isMultiDay={isMultiDay}
        daysCount={daysCount}
        selectedMotoId={selectedMotoId}
        fuelStopsNeeded={fuelStopsNeeded}
      />
      <ElevationProfile profile={(routeResult.elevationProfile || []) as any} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 20 },
});
