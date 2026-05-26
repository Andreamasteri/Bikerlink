import React, { Suspense } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";
import { useRendererSelector } from "@/lib/maps/renderer-selector";

const MapLibre3DPlannerMap = React.lazy(() => import("@/components/MapLibre3DPlannerMap"));

interface Props {
  waypoints: Array<{ lat: number; lng: number }>;
  trackPoints: Array<{ lat: number; lng: number }>;
}

export function PlannerMapSection({ waypoints, trackPoints }: Props) {
  const { shouldUseFull3d } = useRendererSelector();

  if (!shouldUseFull3d("planner")) return null;
  if (waypoints.length < 2) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Pianificazione percorso 3D</Text>
      <View style={styles.mapContainer}>
        <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
          <MapLibre3DPlannerMap waypoints={waypoints} trackPoints={trackPoints} height={280} />
        </Suspense>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  mapContainer: {
    height: 280,
    borderRadius: 12,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
