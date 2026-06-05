import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { MAP_STYLE_PRESETS, type MapStyleId } from "@/lib/maplibre/style-presets";

interface Props {
  currentStyleId: MapStyleId;
  onSelectStyle: (id: MapStyleId) => void;
  bottomOffset?: number;
  leftOffset?: number;
  compact?: boolean;
}

const STYLE_ORDER: MapStyleId[] = ["day", "night", "satellite"];

export function MapStyleToggle({ currentStyleId, onSelectStyle, bottomOffset, leftOffset, compact }: Props) {
  const positionStyle = compact
    ? styles.containerCompact
    : [
        styles.containerNormal,
        bottomOffset != null && { bottom: bottomOffset },
        leftOffset != null && { left: leftOffset },
      ];

  return (
    <View style={[styles.containerBase, positionStyle]}>
      {STYLE_ORDER.map((id) => {
        const preset = MAP_STYLE_PRESETS[id];
        const active = id === currentStyleId;
        return (
          <Pressable
            key={id}
            style={[styles.btn, active && styles.btnActive]}
            onPress={() => onSelectStyle(id)}
            accessibilityLabel={preset.label}
            accessibilityRole="button"
          >
            <Ionicons
              name={preset.icon as React.ComponentProps<typeof Ionicons>["name"]}
              size={18}
              color={active ? Colors.accent : Colors.textSecondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  containerBase: {
    position: "absolute",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  containerNormal: {
    bottom: 84,
    left: 12,
  },
  containerCompact: {
    right: 12,
    top: "50%",
    transform: [{ translateY: -54 }],
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: Colors.surfaceLight,
  },
});
