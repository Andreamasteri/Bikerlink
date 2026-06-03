import React from "react";
import { View, Text, Switch, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors, { ThemeColors } from "@/constants/colors";
import { UseMutationResult } from "@tanstack/react-query";

interface PrivacySettingsGroupProps {
  t: (key: string) => string;
  colors: ThemeColors;
  isGhostMode: boolean;
  ghostModeFeatureEnabled: boolean;
  ghostMutation: UseMutationResult<boolean, Error, boolean>;
  hideFromMap: boolean;
  offlineRandomize: boolean;
  privacyMutation: UseMutationResult<void, Error, Record<string, unknown>>;
}

export function PrivacySettingsGroup({
  t,
  colors,
  isGhostMode,
  ghostModeFeatureEnabled,
  ghostMutation,
  hideFromMap,
  offlineRandomize,
  privacyMutation,
}: PrivacySettingsGroupProps) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  return (
    <View style={[styles.settingsGroup, isTablet && { maxWidth: 600, alignSelf: "center", width: "100%" }]}>
      <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.privacyRow, !ghostModeFeatureEnabled && { opacity: 0.5 }]}>
          <Ionicons
            name={isGhostMode ? "eye-off" : "eye"}
            size={20}
            color={isGhostMode && ghostModeFeatureEnabled ? Colors.accent : Colors.textSecondary}
            style={styles.privacyRowIcon}
          />
          <View style={styles.privacyRowText}>
            <Text style={styles.privacyRowLabel}>{t("ride.ghostMode")}</Text>
            <Text style={styles.privacyRowDesc}>
              {!ghostModeFeatureEnabled
                ? t("ride.ghostModeNotAvailable")
                : isGhostMode
                  ? t("ride.ghostModeDesc")
                  : t("ready.privacy.visibleOnMap")}
            </Text>
          </View>
          <Switch
            value={ghostModeFeatureEnabled ? isGhostMode : false}
            onValueChange={(val) => ghostMutation.mutate(val)}
            disabled={!ghostModeFeatureEnabled || ghostMutation.isPending}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
        <View style={styles.privacyRow}>
          <Ionicons
            name="eye-off-outline"
            size={20}
            color={hideFromMap ? Colors.accent : Colors.textSecondary}
            style={styles.privacyRowIcon}
          />
          <View style={styles.privacyRowText}>
            <Text style={styles.privacyRowLabel}>{t("ready.privacy.hideFromMapLabel")}</Text>
            <Text style={styles.privacyRowDesc}>
              {t("ready.privacy.hideFromMapDesc")}
            </Text>
          </View>
          <Switch
            value={hideFromMap}
            onValueChange={(val) => privacyMutation.mutate({ hideFromMap: val })}
            disabled={privacyMutation.isPending}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
        <View style={styles.privacyRow}>
          <Ionicons
            name="shuffle-outline"
            size={20}
            color={offlineRandomize ? Colors.accent : Colors.textSecondary}
            style={styles.privacyRowIcon}
          />
          <View style={styles.privacyRowText}>
            <Text style={styles.privacyRowLabel}>{t("ready.privacy.offlineRandomizeLabel")}</Text>
            <Text style={styles.privacyRowDesc}>
              {t("ready.privacy.offlineRandomizeDesc")}
            </Text>
          </View>
          <Switch
            value={offlineRandomize}
            onValueChange={(val) => privacyMutation.mutate({ offlinePositionRandomize: val })}
            disabled={privacyMutation.isPending}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsGroup: {
    width: "100%",
    maxWidth: 420,
    marginTop: 16,
    gap: 6,
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  settingCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    width: "100%",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  privacyRowIcon: {
    marginRight: 10,
  },
  privacyRowText: {
    flex: 1,
    paddingRight: 8,
  },
  privacyRowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  privacyRowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
