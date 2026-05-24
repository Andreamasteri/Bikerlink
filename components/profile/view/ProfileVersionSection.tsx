import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  RELEASE_NUMBER,
  OTA_BUNDLED_COUNT,
  APPLIED_OTA_NUMBER,
} from "@/constants/buildInfo";
import { loadAppliedOtaNumber, saveAppliedOtaNumber } from "@/lib/otaStorage";

export const ProfileVersionSection: React.FC = () => {
  const colors = useColors();

  const [appliedOta, setAppliedOta] = useState<number | null>(
    APPLIED_OTA_NUMBER
  );

  useEffect(() => {
    const syncOtaNumber = async () => {
      try {
        const stored = await loadAppliedOtaNumber();
        const bundled = APPLIED_OTA_NUMBER;

        if (bundled !== null && (stored === null || bundled > stored)) {
          await saveAppliedOtaNumber(bundled);
          setAppliedOta(bundled);
        } else if (stored !== null) {
          setAppliedOta(stored);
        }
      } catch {
        // Fallback silenzioso: badge rimane al valore iniziale (costante bundled o null)
      }
    };
    syncOtaNumber();
  }, []);

  const buildString = `V${RELEASE_NUMBER}-${OTA_BUNDLED_COUNT}`;
  const otaString =
    appliedOta != null ? `OTA-${appliedOta}` : "OTA-\u2014";

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
