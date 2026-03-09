import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface Props {
  coord: { latitude: number; longitude: number } | null;
  onCoordChange: (coord: { latitude: number; longitude: number }) => void;
  onConfirm: () => void;
  onClose: () => void;
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
}

const ITALY_REGION = {
  latitude: 42.5,
  longitude: 12.5,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

export default function MapPickerContent({ coord, onCoordChange, onConfirm, onClose, initialRegion }: Props) {
  const insets = useSafeAreaInsets();

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
        style={{ flex: 1 }}
        initialRegion={initialRegion || ITALY_REGION}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        onPress={(e: any) => onCoordChange(e.nativeEvent.coordinate)}
      >
        {coord && <Marker coordinate={coord} pinColor="#FFD700" />}
      </MapView>
      {coord && (
        <View style={styles.mapCoordsBar}>
          <Text style={styles.mapCoordsText}>
            {coord.latitude.toFixed(6)}, {coord.longitude.toFixed(6)}
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
});
