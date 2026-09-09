import React from "react";
import { View, StyleSheet } from "react-native";
import { RouteResultCard } from "./RouteResultCard";
import type { Waypoint } from "./types";

interface RouteResultSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route result from API
  routeResult: any;
  isRoundTrip: boolean;
  isMultiDay: boolean;
  daysCount: number;
  dismissedWarnings: Set<string>;
  setDismissedWarnings: React.Dispatch<React.SetStateAction<Set<string>>>;
  weatherLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- weather preview from API
  weatherPreview: any;
  selectedMotoId: string | null;
  fuelStopsNeeded: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Animated.Value
  bikerScoreAnim: any;
  waypoints: Waypoint[];
}

export const RouteResultSection: React.FC<RouteResultSectionProps> = ({
  routeResult,
  isRoundTrip,
  isMultiDay,
  daysCount,
  dismissedWarnings,
  setDismissedWarnings,
  weatherLoading,
  weatherPreview,
  selectedMotoId,
  fuelStopsNeeded,
  bikerScoreAnim,
  waypoints,
}) => {
  if (!routeResult) return null;

  const resolvedWaypoints = waypoints.filter((waypoint) => waypoint.lat !== 0 || waypoint.lng !== 0);
  const segmentLabels = (routeResult.segmentResults ?? []).map((_: unknown, index: number) => {
    const from = resolvedWaypoints[index]?.name || (index === 0 ? "Partenza" : `Ancora ${index}`);
    const toWaypoint = resolvedWaypoints[index + 1];
    const to = toWaypoint?.name || (index + 1 >= resolvedWaypoints.length
      ? (isRoundTrip ? resolvedWaypoints[0]?.name || "Partenza" : "Arrivo")
      : `Ancora ${index + 1}`);
    return `${from} → ${to}`;
  });

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
        segmentLabels={segmentLabels}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 20 },
});
