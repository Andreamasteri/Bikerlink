import React from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import Colors from "@/constants/colors";

interface NativeMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function NativeMiniMap({ latitude, longitude, height = 180 }: NativeMiniMapProps) {
  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <MapView
        style={styles.map}
        region={{
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          pinColor={Colors.accent}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1 },
});
