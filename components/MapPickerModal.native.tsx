import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface ExistingWaypoint {
  latitude: number;
  longitude: number;
  name: string;
  waypointType: string;
}

interface Props {
  coord: { latitude: number; longitude: number } | null;
  onCoordChange: (coord: { latitude: number; longitude: number }) => void;
  onConfirm: () => void;
  onClose: () => void;
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  existingWaypoints?: ExistingWaypoint[];
}

const ITALY_REGION = {
  latitude: 42.5,
  longitude: 12.5,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

const WAYPOINT_TYPE_COLORS: Record<string, string> = {
  start: "#4CAF50",
  stop: "#FF9800",
  poi: "#2196F3",
  end: "#E63946",
};

export default function MapPickerContent({ coord, onCoordChange, onConfirm, onClose, initialRegion, existingWaypoints = [] }: Props) {
  const insets = useSafeAreaInsets();
  const region = initialRegion || ITALY_REGION;

  const existingPolyline = existingWaypoints.length > 1
    ? existingWaypoints.map((wp) => ({ latitude: wp.latitude, longitude: wp.longitude }))
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.mapHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.mapHeaderTitle}>Tocca per posizionare</Text>
        <TouchableOpacity onPress={onConfirm} disabled={!coord}>
          <Text style={[styles.mapConfirmText, !coord && { opacity: 0.4 }]}>Conferma</Text>
        </TouchableOpacity>
      </View>
      <MapView
        key={`map-${region.latitude}-${region.longitude}`}
        style={{ flex: 1 }}
        initialRegion={region}
        provider={undefined}
        onPress={(e: any) => onCoordChange(e.nativeEvent.coordinate)}
      >
        {existingPolyline.length > 1 && (
          <Polyline
            coordinates={existingPolyline}
            strokeColor={Colors.accent}
            strokeWidth={2}
            lineDashPattern={[6, 4]}
          />
        )}
        {existingWaypoints.map((wp, index) => (
          <Marker
            key={`existing-${index}`}
            coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
            title={wp.name}
            pinColor={WAYPOINT_TYPE_COLORS[wp.waypointType] || "#888"}
            opacity={0.7}
          />
        ))}
        {coord && <Marker coordinate={coord} pinColor="#FFD700" />}
      </MapView>
      {coord && (
        <View style={styles.mapCoordsBar}>
          <Text style={styles.mapCoordsText}>
            {coord.latitude.toFixed(6)}, {coord.longitude.toFixed(6)}
          </Text>
        </View>
      )}
      {existingWaypoints.length > 0 && (
        <View style={styles.legendBar}>
          <MaterialCommunityIcons name="map-marker-check" size={14} color={Colors.textSecondary} />
          <Text style={styles.legendText}>
            {existingWaypoints.length} {existingWaypoints.length === 1 ? "tappa inserita" : "tappe inserite"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mapHeaderTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  mapConfirmText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.accent },
  mapCoordsBar: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  mapCoordsText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  legendBar: {
    position: "absolute",
    top: 0,
    right: 16,
    backgroundColor: Colors.surface + "DD",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
});
