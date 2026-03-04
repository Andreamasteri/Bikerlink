import React from "react";
import { View, StyleSheet } from "react-native";

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
}

export default function InteractiveMap({ latitude, longitude, style }: MapProps) {
  const zoom = 13;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.08}%2C${latitude - 0.05}%2C${longitude + 0.08}%2C${latitude + 0.05}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <View style={[styles.container, style]}>
      <iframe
        src={src}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 16 }}
        allowFullScreen
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
});
