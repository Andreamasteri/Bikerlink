import React from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";
import Colors from "@/constants/colors";

export const ProfileVersionSection: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Versione app</Text>
        <Text style={styles.value}>
          {(`v${Application.nativeBuildVersion ?? "?"}  ${Constants.expoConfig?.version ?? ""}`).trim()}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Versione OTA</Text>
        <Text style={styles.value}>{(CURRENT_OTA_NUMBER as number) === 0 ? "APK embed (rv5.0.0)" : `OTA-${CURRENT_OTA_NUMBER}`}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Commit EAS</Text>
        <Text style={styles.value}>
          {Updates.updateId ? Updates.updateId.substring(0, 8) : "embedded"}
        </Text>
      </View>
      <Text style={styles.betaText}>
        Beta
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  value: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  betaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    color: "#FF6600",
  },
});
