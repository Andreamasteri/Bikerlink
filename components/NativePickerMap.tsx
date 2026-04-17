import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import Colors from "@/constants/colors";

interface NativePickerMapProps {
  initialLat: number;
  initialLng: number;
  initialZoom: number;
  selectedCoord: { lat: number; lng: number } | null;
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
}

export default function NativePickerMap({
  initialLat,
  initialLng,
  selectedCoord,
  onCoordPicked,
}: NativePickerMapProps) {
  return (
    <MapView
      style={styles.map}
      initialRegion={{
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 5,
        longitudeDelta: 5,
      }}
      onPress={(e) => onCoordPicked(e.nativeEvent.coordinate)}
      scrollEnabled
      zoomEnabled
    >
      {selectedCoord && (
        <Marker
          coordinate={{ latitude: selectedCoord.lat, longitude: selectedCoord.lng }}
          pinColor={Colors.accent}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
