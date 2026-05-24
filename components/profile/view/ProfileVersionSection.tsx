import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  RELEASE_NUMBER,
  OTA_BUNDLED_COUNT,
  APPLIED_OTA_NUMBER,
} from "@/constants/buildInfo";

export const ProfileVersionSection: React.FC = () => {
  const colors = useColors();

  const buildString = `V${RELEASE_NUMBER}-${OTA_BUNDLED_COUNT}`;
  const otaString =
    APPLIED_OTA_NUMBER != null ? `OTA-${APPLIED_OTA_NUMBER}` : "OTA-\u2014";

  return (
    <View style={styles.container}>
      <Text style={[styles.badge, { color: colors.textSecondary }]}>
        {buildString}{"   "}{otaString}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  badge: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
});
