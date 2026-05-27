import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface Props {
  bearing: number;
  onResetBearing: () => void;
  topOffset?: number;
  rightOffset?: number;
  leftOffset?: number;
  disabled?: boolean;
}

export function MapNorthCompass({
  bearing,
  onResetBearing,
  topOffset,
  rightOffset,
  leftOffset,
  disabled,
}: Props) {
  const positionStyle =
    leftOffset != null
      ? { top: topOffset ?? 16, left: leftOffset }
      : { top: topOffset ?? 16, right: rightOffset ?? 12 };
  const containerStyle = [styles.container, positionStyle];
  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={disabled ? undefined : onResetBearing}
      activeOpacity={disabled ? 1 : 0.7}
      accessibilityLabel="Riallinea mappa verso nord"
      accessibilityRole="button"
    >
      <View
        style={[
          styles.inner,
          { transform: [{ rotate: `${-bearing}deg` }] },
        ]}
      >
        <Text style={styles.nLabel}>N</Text>
        <View style={styles.arrowUp} />
        <View style={styles.arrowDown} />
      </View>
    </TouchableOpacity>
  );
}

const SIZE = 44;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  inner: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  nLabel: {
    position: "absolute",
    top: 1,
    color: Colors.accentRed,
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 0.5,
  },
  arrowUp: {
    position: "absolute",
    top: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: Colors.accentRed,
  },
  arrowDown: {
    position: "absolute",
    bottom: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#888",
  },
});
