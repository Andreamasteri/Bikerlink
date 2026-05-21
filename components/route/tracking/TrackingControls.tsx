import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  isTracking: boolean;
  frequency: number;
  options: { label: string; value: number }[];
  onFrequencyChange: (freq: number) => void;
  maxSpeed: number;
  onActionPress: () => void;
  isPending: boolean;
  t: (key: string) => string;
}

export const TrackingControls = ({
  isTracking,
  frequency,
  options,
  onFrequencyChange,
  maxSpeed,
  onActionPress,
  isPending,
  t,
}: Props) => {
  return (
    <>
      {!isTracking && (
        <View style={styles.frequencyRow}>
          <Text style={styles.frequencyLabel}>{t("tracking.frequency")}:</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.freqChip,
                frequency === opt.value && styles.freqChipActive,
              ]}
              onPress={() => onFrequencyChange(opt.value)}
            >
              <Text
                style={[
                  styles.freqChipText,
                  frequency === opt.value && styles.freqChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isTracking && (
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            MAX: {maxSpeed.toFixed(0)} km/h
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.actionButton,
          isTracking ? styles.stopButton : styles.startButton,
        ]}
        onPress={onActionPress}
        disabled={isPending}
      >
        <MaterialCommunityIcons
          name={isTracking ? "stop-circle" : "play-circle"}
          size={28}
          color="#FFFFFF"
        />
        <Text style={styles.actionButtonText}>
          {isTracking ? t("tracking.stop") : t("tracking.start")}
        </Text>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  frequencyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 4,
  },
  frequencyLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginRight: 12,
  },
  freqChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
    marginRight: 8,
  },
  freqChipActive: {
    backgroundColor: Colors.accent,
  },
  freqChipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  freqChipTextActive: {
    color: "#FFFFFF",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    marginRight: 8,
  },
  liveText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  startButton: {
    backgroundColor: Colors.success,
  },
  stopButton: {
    backgroundColor: Colors.error,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
