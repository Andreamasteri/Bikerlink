import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { useColors } from "@/hooks/useColors";
import { APPLIED_OTA_NUMBER } from "@/constants/buildInfo";
import { loadAppliedOtaNumber, saveAppliedOtaNumber } from "@/lib/otaStorage";

function parseAppVersion(): { releaseNumber: string; otaBundled: string } {
  const version = Constants.expoConfig?.version ?? "";
  const parts = version.split(".");
  if (parts.length >= 2) {
    return { releaseNumber: parts[0], otaBundled: parts[1] };
  }
  return { releaseNumber: "—", otaBundled: "—" };
}

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

  const { releaseNumber, otaBundled } = parseAppVersion();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.item}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Build</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            V{releaseNumber}.{otaBundled}
          </Text>
        </View>
        <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
        <View style={styles.item}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>OTA applicata</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {appliedOta != null ? `#${appliedOta}` : "—"}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  item: {
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  value: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  dot: {
    fontSize: 14,
    marginHorizontal: 2,
  },
});
