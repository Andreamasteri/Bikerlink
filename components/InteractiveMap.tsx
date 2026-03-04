import React, { useRef, useEffect } from "react";
import { StyleSheet, Pressable, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

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
  onCenterPress?: () => void;
  showCenterButton?: boolean;
}

export default function InteractiveMap({ latitude, longitude, markers = [], style, onCenterPress, showCenterButton }: MapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }, 500);
    }
  }, [latitude, longitude]);

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
        showsUserLocation
        showsMyLocationButton={false}
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
      {showCenterButton && onCenterPress && (
        <Pressable style={styles.centerBtn} onPress={onCenterPress}>
          <Ionicons name="locate" size={22} color={Colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, position: "relative" as const },
  map: { flex: 1 },
  centerBtn: {
    position: "absolute" as const,
    bottom: 12,
    left: 12,
    backgroundColor: Colors.surface + "E6",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});
