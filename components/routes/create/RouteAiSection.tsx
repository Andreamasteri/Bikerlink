import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface RouteAiSectionProps {
  t: (key: string) => string;
}

export const RouteAiSection: React.FC<RouteAiSectionProps> = ({ t }) => {
  return (
    <View style={styles.betaWarning}>
      <MaterialCommunityIcons name="alert" size={22} color="#FF6600" />
      <Text style={styles.betaWarningText}>
        {t("routes.betaWarning")}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  betaWarning: {
    flexDirection: "row" as const,
    backgroundColor: "#FF660018",
    borderWidth: 1,
    borderColor: "#FF6600",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
    alignItems: "flex-start" as const,
  },
  betaWarningText: {
    flex: 1,
    color: "#FF6600",
    fontSize: 12,
    fontWeight: "700" as const,
    lineHeight: 18,
  },
});
