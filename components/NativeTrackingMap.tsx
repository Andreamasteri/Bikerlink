import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import Colors from "@/constants/colors";

interface NativeTrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function NativeTrackingMap({ points, currentLocation }: NativeTrackingMapProps) {
  const center = currentLocation ??
    (points.length > 0 ? points[points.length - 1] : { latitude: 41.9, longitude: 12.5 });

  return (
    <MapView
      style={styles.map}
      region={{
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
      showsUserLocation={false}
      scrollEnabled
      zoomEnabled
    >
      {points.length > 1 && (
        <Polyline
          coordinates={points}
          strokeColor={Colors.accent}
          strokeWidth={4}
        />
      )}
      {currentLocation && (
        <Marker
          coordinate={currentLocation}
          pinColor={Colors.accent}
          title="Posizione attuale"
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
