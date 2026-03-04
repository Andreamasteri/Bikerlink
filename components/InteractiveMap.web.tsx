import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MapProps {
  latitude: number;
  longitude: number;
  markers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    color?: string;
  }>;
  style?: any;
  onCenterPress?: () => void;
  showCenterButton?: boolean;
}

export default function InteractiveMap({ latitude, longitude, style, onCenterPress, showCenterButton }: MapProps) {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.08}%2C${latitude - 0.05}%2C${longitude + 0.08}%2C${latitude + 0.05}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <View style={[styles.container, style]}>
      <iframe
        src={src}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 16 }}
        allowFullScreen
      />
      {showCenterButton && onCenterPress && (
        <Pressable style={styles.centerBtn} onPress={onCenterPress}>
          <Ionicons name="locate" size={22} color={Colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden", position: "relative" as const },
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
