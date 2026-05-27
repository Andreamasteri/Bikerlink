import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface MapControlsProps {
  isAvailable: boolean;
  ghostMode: boolean;
  onCenterOnUser: () => void;
  availabilityBottomOffset?: number;
  locationButtonBottomOffset?: number;
}

export function MapControls({
  isAvailable,
  ghostMode,
  onCenterOnUser,
  availabilityBottomOffset,
  locationButtonBottomOffset,
}: MapControlsProps) {
  return (
    <>
      <View
        style={[
          styles.controlsContainer,
          locationButtonBottomOffset != null && { bottom: locationButtonBottomOffset },
        ]}
      >
        <TouchableOpacity style={styles.locationButton} onPress={onCenterOnUser} activeOpacity={0.7}>
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.availabilityContainer,
          availabilityBottomOffset != null && { bottom: availabilityBottomOffset },
        ]}
      >
        <View style={styles.availabilityIndicator}>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.accentRed }]} />
            <Text style={[styles.availabilityText, { color: isAvailable ? Colors.success : Colors.accentRed }]}>
              {isAvailable ? t("map.available") : t("map.unavailable")}
            </Text>
          </View>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: ghostMode ? "#888888" : Colors.success }]} />
            <Text style={[styles.availabilityText, { color: ghostMode ? "#888888" : Colors.success }]}>
              {ghostMode ? t("map.offline") : t("map.online")}
            </Text>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    position: "absolute",
    bottom: 117,
    right: 12,
    gap: 10,
    alignItems: "flex-end",
  },
  availabilityContainer: {
    position: "absolute",
    bottom: 12,
    left: 12,
    zIndex: 10,
  },
  locationButton: {
    backgroundColor: Colors.surface,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  availabilityIndicator: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
});
