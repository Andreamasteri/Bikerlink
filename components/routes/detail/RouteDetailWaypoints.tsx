import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Waypoint {
  id: string;
  routeId: string;
  orderIndex: number;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  waypointType: string;
  createdAt: string;
}

interface RouteDetailWaypointsProps {
  waypoints: Waypoint[];
  waypointTypeLabels: Record<string, string>;
  waypointTypeIcons: Record<string, string>;
  waypointTypeColors: Record<string, string>;
}

export default function RouteDetailWaypoints({
  waypoints,
  waypointTypeLabels,
  waypointTypeIcons,
  waypointTypeColors,
}: RouteDetailWaypointsProps) {
  return (
    <View style={styles.waypointsSection}>
      <Text style={styles.sectionTitle}>
        Tappe ({waypoints.length})
      </Text>
      {waypoints.length === 0 ? (
        <View style={styles.emptyWaypoints}>
          <MaterialCommunityIcons
            name="map-marker-plus"
            size={40}
            color={Colors.textSecondary}
          />
          <Text style={styles.emptyWaypointsText}>
            Nessuna tappa aggiunta
          </Text>
        </View>
      ) : (
        waypoints.map((wp, index) => (
          <WaypointCard
            key={wp.id}
            waypoint={wp}
            index={index}
            isLast={index === waypoints.length - 1}
            waypointTypeLabels={waypointTypeLabels}
            waypointTypeIcons={waypointTypeIcons}
            waypointTypeColors={waypointTypeColors}
          />
        ))
      )}
    </View>
  );
}

function WaypointCard({
  waypoint,
  index,
  isLast,
  waypointTypeLabels,
  waypointTypeIcons,
  waypointTypeColors,
}: {
  waypoint: Waypoint;
  index: number;
  isLast: boolean;
  waypointTypeLabels: Record<string, string>;
  waypointTypeIcons: Record<string, string>;
  waypointTypeColors: Record<string, string>;
}) {
  const color = waypointTypeColors[waypoint.waypointType] || Colors.accent;
  const iconName = (waypointTypeIcons[waypoint.waypointType] || "map-marker") as React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  const typeLabel = waypointTypeLabels[waypoint.waypointType] || waypoint.waypointType;

  return (
    <View style={styles.waypointRow}>
      <View style={styles.waypointTimeline}>
        <View style={[styles.waypointDot, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={iconName} size={14} color="#fff" />
        </View>
        {!isLast && <View style={styles.waypointLine} />}
      </View>
      <View style={styles.waypointContent}>
        <View style={styles.waypointHeader}>
          <Text style={styles.waypointName}>{waypoint.name}</Text>
          <Text style={[styles.waypointType, { color }]}>{typeLabel}</Text>
        </View>
        {waypoint.description ? (
          <Text style={styles.waypointDescription}>{waypoint.description}</Text>
        ) : null}
        <Text style={styles.waypointCoords}>
          {waypoint.latitude.toFixed(4)}, {waypoint.longitude.toFixed(4)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  waypointsSection: {
    padding: 20,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  emptyWaypoints: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyWaypointsText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  waypointRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  waypointTimeline: {
    width: 36,
    alignItems: "center",
  },
  waypointDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  waypointLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  waypointContent: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginLeft: 8,
    marginBottom: 8,
  },
  waypointHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waypointName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  waypointType: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 8,
  },
  waypointDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  waypointCoords: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    opacity: 0.7,
  },
});
