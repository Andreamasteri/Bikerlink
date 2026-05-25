import React, { useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  buildEnableTerrainCmd, buildDisableTerrainCmd,
  buildToggleHillshadeCmd, buildToggleSatelliteCmd,
} from "@/lib/maplibre/layer-controls";

interface Props { onCommand: (cmd: string) => void }

function LayerBtn({ icon, label, active, onPress }: {
  icon: string; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.btn, active && styles.btnActive]} onPress={onPress} activeOpacity={0.7}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={16}
        color={active ? "#fff" : "#aaa"}
      />
      {Platform.OS === "web" && (
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function MapLibre3DLayerControls({ onCommand }: Props) {
  const [terrain, setTerrain] = useState(true);
  const [hillshade, setHillshade] = useState(true);
  const [satellite, setSatellite] = useState(false);

  const toggleTerrain = () => {
    const next = !terrain; setTerrain(next);
    onCommand(next ? buildEnableTerrainCmd() : buildDisableTerrainCmd());
  };
  const toggleHillshade = () => {
    const next = !hillshade; setHillshade(next);
    onCommand(buildToggleHillshadeCmd(next));
  };
  const toggleSatellite = () => {
    const next = !satellite; setSatellite(next);
    onCommand(buildToggleSatelliteCmd(next));
  };

  return (
    <View style={styles.container}>
      <LayerBtn icon="terrain" label="3D" active={terrain} onPress={toggleTerrain} />
      <LayerBtn icon="image-filter-hdr" label="Ombra" active={hillshade} onPress={toggleHillshade} />
      <LayerBtn icon="satellite-variant" label="Satellite" active={satellite} onPress={toggleSatellite} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", top: 12, right: 12, gap: 6, zIndex: 10 },
  btn: {
    backgroundColor: "rgba(30,30,30,0.85)", borderRadius: 8, padding: 8,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  btnActive: { backgroundColor: "rgba(255,102,0,0.85)", borderColor: "rgba(255,102,0,0.5)" },
  label: { color: "#aaa", fontSize: 11, fontWeight: "600" },
  labelActive: { color: "#fff" },
});
