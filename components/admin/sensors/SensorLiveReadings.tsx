import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface SensorLiveReadingsProps {
  isRunning: boolean;
  liveData: string | null;
}

export const SensorLiveReadings: React.FC<SensorLiveReadingsProps> = ({ isRunning, liveData }) => {
  return (
    <>
      {isRunning && (
        <View style={ss.statusRow}>
          <View style={ss.runningDot} />
          <Text style={ss.statusText}>In ascolto…</Text>
        </View>
      )}

      {liveData !== null && (
        <View style={ss.dataBox}>
          <Text style={ss.dataLabel}>Dati live</Text>
          <Text style={ss.dataValue}>{liveData}</Text>
        </View>
      )}
    </>
  );
};

const ss = StyleSheet.create({
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.success,
  },
  dataBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  dataLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dataValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 20,
  },
});
