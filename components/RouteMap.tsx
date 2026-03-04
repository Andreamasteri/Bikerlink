import React from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import Colors from "@/constants/colors";

interface RouteMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  height?: number;
  showMarkers?: boolean;
}

export default function RouteMap({ points, height = 260, showMarkers = true }: RouteMapProps) {
  const hasPoints = points.length > 0;
  const region = hasPoints
    ? {
        latitude: points[Math.floor(points.length / 2)].latitude,
        longitude: points[Math.floor(points.length / 2)].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : { latitude: 41.9, longitude: 12.5, latitudeDelta: 5, longitudeDelta: 5 };

  return (
    <View style={[styles.wrapper, { height }]}>
      <MapView style={styles.map} initialRegion={region}>
        {hasPoints && (
          <>
            <Polyline
              coordinates={points}
              strokeColor={Colors.accent}
              strokeWidth={4}
            />
            {showMarkers && (
              <>
                <Marker coordinate={points[0]} pinColor={Colors.success} title="Partenza" />
                <Marker coordinate={points[points.length - 1]} pinColor={Colors.error} title="Arrivo" />
              </>
            )}
          </>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 0, overflow: "hidden" },
  map: { flex: 1 },
});
