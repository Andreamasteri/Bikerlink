import React, { useState, useEffect } from "react";
import { View, Text, Switch, StyleSheet, useWindowDimensions, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors, { ThemeColors } from "@/constants/colors";
import { UseMutationResult } from "@tanstack/react-query";
import {
  startForegroundLocationService,
  stopForegroundLocationService,
  FOREGROUND_SERVICE_DISABLED_KEY,
} from "@/lib/foreground-location-service";

interface PrivacySettingsGroupProps {
  t: (key: string) => string;
  colors: ThemeColors;
  isGhostMode: boolean;
  ghostModeFeatureEnabled: boolean;
  ghostMutation: UseMutationResult<boolean, Error, boolean>;
  hideFromMap: boolean;
  offlineRandomize: boolean;
  privacyMutation: UseMutationResult<void, Error, Record<string, unknown>>;
  fixedPositionEnabled: boolean;
  fixedPositionLat: number | null;
  fixedPositionLng: number | null;
  onSetFixedPositionFromGPS: () => void;
  onChooseFixedPositionOnMap: () => void;
  isSettingFixedPosition?: boolean;
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
  fixedPositionEnabled,
  fixedPositionLat,
  fixedPositionLng,
  onSetFixedPositionFromGPS,
  onChooseFixedPositionOnMap,
  isSettingFixedPosition,
}: PrivacySettingsGroupProps) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;

  const [foregroundServiceEnabled, setForegroundServiceEnabled] = useState(true);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    AsyncStorage.getItem(FOREGROUND_SERVICE_DISABLED_KEY)
      .then((val) => setForegroundServiceEnabled(val !== "true"))
      .catch(() => {});
  }, []);

  const handleForegroundServiceToggle = async (val: boolean) => {
    setForegroundServiceEnabled(val);
    try {
      if (val) {
        await AsyncStorage.removeItem(FOREGROUND_SERVICE_DISABLED_KEY);
        await startForegroundLocationService();
      } else {
        await AsyncStorage.setItem(FOREGROUND_SERVICE_DISABLED_KEY, "true");
        await stopForegroundLocationService();
      }
    } catch {
      // no-op: best-effort toggle
    }
  };
  const hasFixedCoord = fixedPositionLat != null && fixedPositionLng != null;

  return (
    <View style={[styles.settingsGroup, isTablet && { maxWidth: 600, alignSelf: "center", width: "100%" }]}>
      <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
        <View style={styles.privacyRow}>
          <Ionicons
            name="pin"
            size={20}
            color={fixedPositionEnabled ? Colors.accent : Colors.textSecondary}
            style={styles.privacyRowIcon}
          />
          <View style={styles.privacyRowText}>
            <Text style={styles.privacyRowLabel}>{t("ready.privacy.fixedPositionLabel")}</Text>
            <Text style={styles.privacyRowDesc}>
              {fixedPositionEnabled && hasFixedCoord
                ? `${t("ready.privacy.fixedPositionActive")} (${fixedPositionLat!.toFixed(4)}, ${fixedPositionLng!.toFixed(4)})`
                : t("ready.privacy.fixedPositionDesc")}
            </Text>
          </View>
          <Switch
            value={fixedPositionEnabled}
            onValueChange={(val) => privacyMutation.mutate({ fixedPositionEnabled: val })}
            disabled={privacyMutation.isPending}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
        {fixedPositionEnabled && (
          <View style={styles.fixedPositionActions}>
            <TouchableOpacity
              style={[styles.fixedPosBtn, { backgroundColor: Colors.accent }]}
              onPress={onSetFixedPositionFromGPS}
              disabled={isSettingFixedPosition}
            >
              {isSettingFixedPosition ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="locate" size={16} color="#fff" />
              )}
              <Text style={styles.fixedPosBtnText}>{t("ready.privacy.setHere")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fixedPosBtn, { backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border }]}
              onPress={onChooseFixedPositionOnMap}
              disabled={isSettingFixedPosition}
            >
              <Ionicons name="map-outline" size={16} color={Colors.text} />
              <Text style={[styles.fixedPosBtnText, { color: Colors.text }]}>{t("ready.privacy.chooseOnMap")}</Text>
            </TouchableOpacity>
          </View>
        )}
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
            <Text style={[styles.privacyRowLabel, styles.privacyRowLabelUnderline]}>{t("ready.privacy.hideFromMapLabel")}</Text>
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

      {Platform.OS === "android" && (
        <View style={[styles.settingCard, { backgroundColor: colors.surface }]}>
          <View style={styles.privacyRow}>
            <Ionicons
              name="navigate-outline"
              size={20}
              color={foregroundServiceEnabled ? Colors.accent : Colors.textSecondary}
              style={styles.privacyRowIcon}
            />
            <View style={styles.privacyRowText}>
              <Text style={styles.privacyRowLabel}>GPS continuo (Android)</Text>
              <Text style={styles.privacyRowDesc}>
                Mantiene il GPS attivo in background tramite notifica discreta. Disattivalo per risparmiare batteria.
              </Text>
            </View>
            <Switch
              value={foregroundServiceEnabled}
              onValueChange={handleForegroundServiceToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}
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
  privacyRowLabelUnderline: {
    textDecorationLine: "underline",
  },
  privacyRowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  fixedPositionActions: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
    paddingTop: 2,
  },
  fixedPosBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  fixedPosBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
