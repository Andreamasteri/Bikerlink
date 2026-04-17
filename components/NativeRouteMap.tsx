import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import Colors from "@/constants/colors";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";

interface NativeRouteMapProps {
  waypoints: RouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number }>;
}

export default function NativeRouteMap({
  waypoints,
  height,
  typeColors,
  showMarkers = true,
  trackPoints,
}: NativeRouteMapProps) {
  const coordinates = useMemo(
    () => waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng })),
    [waypoints]
  );

  const trackCoordinates = useMemo(
    () => (trackPoints ?? []).map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [trackPoints]
  );

  const region = useMemo(() => {
    const allLats = coordinates.map((c) => c.latitude);
    const allLngs = coordinates.map((c) => c.longitude);
    if (allLats.length === 0) {
      return { latitude: 41.9, longitude: 12.5, latitudeDelta: 5, longitudeDelta: 5 };
    }
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    const pad = 0.02;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(maxLat - minLat + pad, 0.05),
      longitudeDelta: Math.max(maxLng - minLng + pad, 0.05),
    };
  }, [coordinates]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <MapView style={styles.map} region={region} scrollEnabled zoomEnabled>
        {trackCoordinates.length > 1 && (
          <Polyline
            coordinates={trackCoordinates}
            strokeColor={Colors.accent}
            strokeWidth={3}
          />
        )}
        {coordinates.length > 1 && (
          <Polyline
            coordinates={coordinates}
            strokeColor={Colors.accent + "99"}
            strokeWidth={2}
            lineDashPattern={[8, 4]}
          />
        )}
        {showMarkers &&
          waypoints.map((w, i) => (
            <Marker
              key={i}
              coordinate={{ latitude: w.lat, longitude: w.lng }}
              title={w.name}
              pinColor={typeColors?.[w.waypointType] ?? Colors.accent}
            />
          ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 12 },
  fill: { flex: 1 },
  map: { flex: 1 },
});
