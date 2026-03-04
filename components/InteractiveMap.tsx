import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";

interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  color?: string;
  onPress?: () => void;
}

interface MapProps {
  latitude: number;
  longitude: number;
  markers?: MarkerData[];
  style?: any;
}

export default function InteractiveMap({ latitude, longitude, markers = [], style }: MapProps) {
  const mapRef = useRef<MapView>(null);

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }}
      showsUserLocation
      showsMyLocationButton
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          pinColor={m.color}
          title={m.title}
          description={m.description}
          onCalloutPress={m.onPress}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
