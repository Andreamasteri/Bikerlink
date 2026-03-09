import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface WaypointData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  waypointType: string;
}

interface RouteDetailMapProps {
  waypoints: WaypointData[];
  waypointTypeLabels: Record<string, string>;
  waypointTypeColors: Record<string, string>;
}

export default function RouteDetailMap({ waypoints, waypointTypeLabels, waypointTypeColors }: RouteDetailMapProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="map-marker-path" size={48} color={Colors.accent} />
      <Text style={styles.text}>Mappa disponibile su dispositivo mobile</Text>
      {waypoints.length > 0 && (
        <View style={styles.waypointList}>
          {waypoints.map((wp, i) => (
            <View key={wp.id} style={styles.waypointItem}>
              <View style={[styles.dot, { backgroundColor: waypointTypeColors[wp.waypointType] || Colors.accent }]} />
              <Text style={styles.waypointName}>{wp.name}</Text>
              <Text style={styles.waypointType}>{waypointTypeLabels[wp.waypointType] || wp.waypointType}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: 16,
  },
  text: {
    color: Colors.textSecondary,
    marginTop: 8,
    fontSize: 14,
  },
  waypointList: {
    marginTop: 12,
    width: "100%",
  },
  waypointItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  waypointName: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
  },
  waypointType: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
});
