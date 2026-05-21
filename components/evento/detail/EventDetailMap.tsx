import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import LeafletMiniMap from "@/components/LeafletMiniMap";
import Colors from "@/constants/colors";

interface EventDetailMapProps {
  latitude: number;
  longitude: number;
  handleOpenMap: () => void;
}

export default function EventDetailMap({
  latitude,
  longitude,
  handleOpenMap,
}: EventDetailMapProps) {
  return (
    <Pressable style={styles.miniMapWrapper} onPress={handleOpenMap}>
      <LeafletMiniMap
        latitude={latitude}
        longitude={longitude}
        height={160}
      />
      <View style={styles.miniMapOverlay}>
        <Ionicons name="expand-outline" size={16} color="#fff" />
        <Text style={styles.miniMapOverlayText}>Apri mappa</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  miniMapWrapper: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    height: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  miniMapOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniMapOverlayText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#fff",
  },
});
