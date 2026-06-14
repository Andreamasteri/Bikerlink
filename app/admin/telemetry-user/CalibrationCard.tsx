import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type MountCalibration = {
  longAxis: "x" | "y" | "z";
  latAxis: "x" | "y" | "z";
  vertAxis: "x" | "y" | "z";
  longSign: 1 | -1;
  timestamp: number;
} | null;

export function CalibrationCard({ calibration }: { calibration: MountCalibration }) {
  if (calibration === null) {
    return (
      <View style={styles.calibrationCard}>
        <View style={styles.calibrationHeader}>
          <MaterialCommunityIcons name="bike" size={16} color={Colors.textSecondary} />
          <Text style={styles.calibrationTitle}>Calibrazione moto</Text>
          <View style={styles.calibrationBadgeNone}>
            <Text style={styles.calibrationBadgeNoneText}>Nessuna calibrazione</Text>
          </View>
        </View>
      </View>
    );
  }

  const ts = new Date(calibration.timestamp).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <View style={styles.calibrationCard}>
      <View style={styles.calibrationHeader}>
        <MaterialCommunityIcons name="bike" size={16} color={Colors.accent} />
        <Text style={styles.calibrationTitle}>Calibrazione moto</Text>
        <View style={styles.calibrationBadgeOk}>
          <Text style={styles.calibrationBadgeOkText}>Presente</Text>
        </View>
      </View>
      <Text style={styles.calibrationTs}>{ts}</Text>
      <View style={styles.calibrationAxes}>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>longAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.longAxis.toUpperCase()}</Text>
          <Text style={styles.calibrationAxisSign}>{calibration.longSign === 1 ? "+" : "−"}</Text>
        </View>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>latAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.latAxis.toUpperCase()}</Text>
        </View>
        <View style={styles.calibrationAxisItem}>
          <Text style={styles.calibrationAxisLabel}>vertAxis</Text>
          <Text style={styles.calibrationAxisValue}>{calibration.vertAxis.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calibrationCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: Colors.border },
  calibrationHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  calibrationTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
  calibrationBadgeNone: { backgroundColor: Colors.textSecondary + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  calibrationBadgeNoneText: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  calibrationBadgeOk: { backgroundColor: "#22c55e22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  calibrationBadgeOkText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#22c55e" },
  calibrationTs: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, marginBottom: 10 },
  calibrationAxes: { flexDirection: "row", gap: 8 },
  calibrationAxisItem: { flex: 1, alignItems: "center", backgroundColor: Colors.background, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  calibrationAxisLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  calibrationAxisValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  calibrationAxisSign: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary },
});
