import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import RouteDetailMapComponent from "@/components/RouteDetailMap";

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

interface RouteDetailMapProps {
  waypoints: Waypoint[];
  waypointTypeLabels: Record<string, string>;
  waypointTypeColors: Record<string, string>;
}

export default function RouteDetailMap({
  waypoints,
  waypointTypeLabels,
  waypointTypeColors,
}: RouteDetailMapProps) {
  return (
    <View>
      <View style={styles.mapContainer}>
        <RouteDetailMapComponent
          waypoints={waypoints}
          waypointTypeLabels={waypointTypeLabels}
          waypointTypeColors={waypointTypeColors}
        />
      </View>

      {waypoints.length >= 2 && (
        <TouchableOpacity
          style={styles.googleMapsBtn}
          onPress={() => {
            const coords = waypoints.map((wp) => `${wp.latitude},${wp.longitude}`).join("/");
            const url = `https://www.google.com/maps/dir/${coords}`;
            Linking.openURL(url);
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="google-maps" size={20} color="#fff" />
          <Text style={styles.googleMapsBtnText}>Apri in Google Maps</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 280,
    overflow: "hidden",
  },
  googleMapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    gap: 8,
  },
  googleMapsBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
