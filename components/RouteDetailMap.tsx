import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
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

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#2D2D2D" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#aaaaaa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#2D2D2D" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#333333" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#4a4a4a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2D2D2D" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#5a5a5a" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1a3a5c" }] },
];

export default function RouteDetailMap({ waypoints, waypointTypeLabels, waypointTypeColors }: RouteDetailMapProps) {
  const hasWaypoints = waypoints.length > 0;

  const mapRegion = hasWaypoints
    ? (() => {
        const lats = waypoints.map((w) => w.latitude);
        const lngs = waypoints.map((w) => w.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const latDelta = Math.max((maxLat - minLat) * 1.5, 0.02);
        const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.02);
        return {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        };
      })()
    : { latitude: 41.9, longitude: 12.5, latitudeDelta: 5, longitudeDelta: 5 };

  const polylineCoords = waypoints.map((w) => ({
    latitude: w.latitude,
    longitude: w.longitude,
  }));

  return (
    <MapView
      style={styles.map}
      initialRegion={mapRegion}
      customMapStyle={darkMapStyle}
      provider={Platform.OS === "android" ? "google" : undefined}
    >
      {hasWaypoints && waypoints.length > 1 && (
        <Polyline
          coordinates={polylineCoords}
          strokeColor={Colors.accent}
          strokeWidth={3}
          lineDashPattern={[6, 3]}
        />
      )}
      {waypoints.map((wp) => (
        <Marker
          key={wp.id}
          coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
          title={wp.name}
          description={waypointTypeLabels[wp.waypointType] || wp.waypointType}
          pinColor={waypointTypeColors[wp.waypointType] || Colors.accent}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
