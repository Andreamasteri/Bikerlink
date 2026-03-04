import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function TrackingMap({ points }: TrackingMapProps) {
  return (
    <View style={styles.wrapper}>
      <MaterialCommunityIcons name="map-marker-path" size={48} color={Colors.textSecondary} />
      <Text style={styles.text}>Mappa live disponibile su dispositivo mobile</Text>
      <Text style={styles.count}>{points.length} punti GPS registrati</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    minHeight: 200,
  },
  text: { color: Colors.textSecondary, fontSize: 14, marginTop: 12 },
  count: { color: Colors.accent, fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 8 },
});
