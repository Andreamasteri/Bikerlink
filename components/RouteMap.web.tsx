import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

interface RouteMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  height?: number;
  showMarkers?: boolean;
}

export default function RouteMap({ points, height = 260 }: RouteMapProps) {
  return (
    <View style={[styles.wrapper, { height }]}>
      <MaterialCommunityIcons name="map-marker-path" size={48} color={Colors.dark.textSecondary} />
      <Text style={styles.text}>Mappa del percorso disponibile su dispositivo mobile</Text>
      <Text style={styles.count}>{points.length} punti GPS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.surface,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  text: { color: Colors.dark.textSecondary, fontSize: 14, marginTop: 12 },
  count: { color: Colors.dark.accent, fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 8 },
});
