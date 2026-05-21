import React from "react";
import { Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface AnalyticsExportProps {
  onExport: () => void;
}

export const AnalyticsExport: React.FC<AnalyticsExportProps> = ({ onExport }) => {
  return (
    <TouchableOpacity style={styles.exportBtn} onPress={onExport}>
      <MaterialIcons name="file-download" size={20} color={Colors.background} />
      <Text style={styles.exportBtnText}>Esporta CSV</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  exportBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});
