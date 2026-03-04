import React, { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import { Colors } from "@/constants/colors";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function TrackingMap({ points, currentLocation }: TrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...currentLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [currentLocation]);

  const region = currentLocation
    ? { ...currentLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: 41.9, longitude: 12.5, latitudeDelta: 5, longitudeDelta: 5 };

  return (
    <View style={styles.wrapper}>
      <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation>
        {points.length > 1 && (
          <Polyline coordinates={points} strokeColor={Colors.dark.accent} strokeWidth={4} />
        )}
        {currentLocation && (
          <Marker coordinate={currentLocation} pinColor={Colors.dark.success} />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1 },
});
