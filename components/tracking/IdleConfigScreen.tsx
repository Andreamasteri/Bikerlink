import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { UpdateProfile, getMeasuredDrainPerHour, getStaticBatteryDrainPerHour, BatteryDrainStats } from "./tracking-utils";
import { CalibrationBanner } from "@/components/CalibrationBanner";

interface IdleConfigScreenProps {
  insets: { bottom: number };
  profile: UpdateProfile;
  setProfile: (p: UpdateProfile) => void;
  is0100Enabled: boolean;
  setIs0100Enabled: (v: boolean) => void;
  sensorsEnabled: boolean;
  handsOffEnabled: boolean;
  setHandsOffEnabled: (v: boolean) => void;
  countdownEnabled: boolean;
  setCountdownEnabled: (v: boolean) => void;
  startMode: "manual" | "automatic";
  setStartMode: (v: "manual" | "automatic") => void;
  batteryDrainStats: BatteryDrainStats;
  showBatteryStats: boolean;
  setShowBatteryStats: (v: boolean) => void;
  handleDebugTap: () => void;
  handleStart: () => void;
  handleOpenMountCalib: () => void;
  isCalibrated: boolean;
  calibrationTimestamp?: number | null;
  t: (key: string) => string;
  renderHistory: () => React.ReactNode;
}

export function IdleConfigScreen({
  insets,
  profile,
  setProfile,
  is0100Enabled,
  setIs0100Enabled,
  sensorsEnabled,
  handsOffEnabled,
  setHandsOffEnabled,
  countdownEnabled,
  setCountdownEnabled,
  startMode,
  setStartMode,
  batteryDrainStats,
  showBatteryStats,
  setShowBatteryStats,
  handleDebugTap,
  handleStart,
  handleOpenMountCalib,
  isCalibrated,
  calibrationTimestamp,
  t,
  renderHistory,
}: IdleConfigScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.idleScroll,
        {
          paddingBottom: insets.bottom + 20,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Calibration banner — always shown at top */}
      <CalibrationBanner
        isCalibrated={isCalibrated}
        calibrationTimestamp={calibrationTimestamp}
        onCalibrate={handleOpenMountCalib}
      />

      {/* GPS Profile */}
      <View style={styles.profileSection}>
        <Pressable onPress={handleDebugTap} hitSlop={8}>
          <Text style={styles.profileTitle}>
            FREQUENZA DI AGGIORNAMENTO GPS
          </Text>
        </Pressable>
        <View style={styles.profileRow}>
          {(["easy", "medium", "race"] as UpdateProfile[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.profileBtn,
                profile === p && styles.profileBtnActive,
                is0100Enabled && p !== "race" && { opacity: 0.4 },
              ]}
              onPress={() => {
                if (is0100Enabled && p !== "race") return;
                setProfile(p);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.profileBtnLabel,
                  profile === p && styles.profileBtnLabelActive,
                ]}
              >
                {p === "easy" ? t("tracking.label.easy") : p === "medium" ? t("tracking.label.standard") : t("tracking.label.race")}
              </Text>
              <Text
                style={[
                  styles.profileBtnDesc,
                  profile === p && styles.profileBtnDescActive,
                ]}
              >
                {p === "easy" ? t("tracking.profile.easy") : p === "medium" ? t("tracking.profile.medium") : t("tracking.profile.race")}
              </Text>
              <View style={styles.profileBtnBatteryRow}>
                <Ionicons
                  name="battery-half-outline"
                  size={10}
                  color={profile === p ? Colors.accent : Colors.textSecondary + "AA"}
                />
                <View style={{ flexDirection: "column" as const, alignItems: "flex-start" as const }}>
                  <Text
                    style={[
                      styles.profileBtnBattery,
                      profile === p && styles.profileBtnBatteryActive,
                    ]}
                  >
                    {getMeasuredDrainPerHour(batteryDrainStats, p) !== null
                      ? `${getMeasuredDrainPerHour(batteryDrainStats, p)?.toFixed(1)}%/h`
                      : `~${getStaticBatteryDrainPerHour(p)}%/h`}
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      fontFamily: "Inter_400Regular",
                      color: getMeasuredDrainPerHour(batteryDrainStats, p) !== null
                        ? (profile === p ? Colors.success : Colors.success + "99")
                        : (profile === p ? Colors.textSecondary : Colors.textSecondary + "77"),
                      fontStyle: "italic",
                    }}
                  >
                    {getMeasuredDrainPerHour(batteryDrainStats, p) !== null
                      ? t("tracking.battery.measured")
                      : t("tracking.battery.estimated")}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.profileBatteryNote}>
          {batteryDrainStats.easy.length > 0 || batteryDrainStats.medium.length > 0 || batteryDrainStats.race.length > 0
            ? t("tracking.batteryMeasuredNote")
            : t("tracking.batteryEstimateNote")}
        </Text>

        {/* Battery drain stats expandable section - simplified for now */}
        <TouchableOpacity
          style={styles.batteryStatsToggle}
          onPress={() => setShowBatteryStats(!showBatteryStats)}
          activeOpacity={0.7}
        >
          <Ionicons name="battery-charging-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.batteryStatsToggleLabel}>{t("tracking.batteryStats.title")}</Text>
          <Ionicons
            name={showBatteryStats ? "chevron-up" : "chevron-down"}
            size={13}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Start Button */}
      <View style={styles.startModeSection}>
        <Text style={styles.startModeTitle}>{t("tracking.startMode.title")}</Text>
        <View style={styles.startModeRow}>
          {([
            ["manual", t("tracking.startMode.manual"), t("tracking.startMode.manualDescription")],
            ["automatic", t("tracking.startMode.automatic"), t("tracking.startMode.automaticDescription")],
          ] as const).map(([mode, label, description]) => (
            <TouchableOpacity
              key={mode}
              style={[styles.startModeButton, startMode === mode && styles.startModeButtonActive]}
              onPress={() => setStartMode(mode)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={mode === "manual" ? "hand-left-outline" : "speedometer-outline"}
                size={18}
                color={startMode === mode ? Colors.accent : Colors.textSecondary}
              />
              <Text style={[styles.startModeLabel, startMode === mode && styles.startModeLabelActive]}>{label}</Text>
              <Text style={styles.startModeDescription}>{description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.startBtn}
        onPress={handleStart}
        activeOpacity={0.85}
      >
        <Ionicons name="play" size={24} color="#1a1a1a" />
        <Text style={styles.startBtnLabel}>{t("tracking.start")}</Text>
      </TouchableOpacity>

      {/* Features grid */}
      <View style={styles.featuresGrid}>
        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Ionicons
              name="speedometer-outline"
              size={20}
              color={is0100Enabled ? Colors.accentRed : Colors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureLabel}>Performance 0-100</Text>
            <Text style={styles.featureDesc}>{t("tracking.feature.sprint")}</Text>
          </View>
          <Switch
            value={is0100Enabled}
            onValueChange={(val) => {
              setIs0100Enabled(val);
              if (val) {
                setProfile("race");
              }
            }}
            trackColor={{ false: Colors.border, true: Colors.accentRed + "80" }}
            thumbColor={is0100Enabled ? Colors.accentRed : Colors.textSecondary}
          />
        </View>

        {sensorsEnabled && (
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons
                name="pulse-outline"
                size={20}
                color={Colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureLabel}>
                {t("tracking.sensors")}
              </Text>
              <Text style={styles.featureDesc}>
                {t("tracking.feature.sensors")}
              </Text>
              <TouchableOpacity onPress={handleOpenMountCalib} style={{ marginTop: 4 }}>
                <Text style={[styles.calibLink, isCalibrated && { color: Colors.success }]}>
                  {isCalibrated ? t("tracking.mountCalib.calibrated") : t("tracking.mountCalib.configure")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Ionicons
              name="hand-left-outline"
              size={20}
              color={handsOffEnabled ? Colors.accent : Colors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureLabel}>Hands Off</Text>
            <Text style={styles.featureDesc}>{t("tracking.feature.handsoff")}</Text>
          </View>
          <Switch
            value={handsOffEnabled}
            onValueChange={setHandsOffEnabled}
            trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
            thumbColor={handsOffEnabled ? Colors.accent : Colors.textSecondary}
          />
        </View>

        <View style={styles.featureItem}>
          <View style={styles.featureIcon}>
            <Ionicons
              name="timer-outline"
              size={20}
              color={countdownEnabled ? Colors.accent : Colors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureLabel}>Countdown</Text>
            <Text style={styles.featureDesc}>{t("tracking.feature.countdown")}</Text>
          </View>
          <Switch
            value={countdownEnabled}
            onValueChange={setCountdownEnabled}
            trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
            thumbColor={countdownEnabled ? Colors.accent : Colors.textSecondary}
          />
        </View>
      </View>

      {/* History */}
      {renderHistory()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  idleScroll: {
    paddingHorizontal: 14,
    paddingTop: 2,
    gap: 8,
  },
  profileSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  profileTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textAlign: "center",
  },
  profileRow: {
    flexDirection: "row",
    gap: 8,
  },
  profileBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "10",
  },
  profileBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
  },
  profileBtnLabelActive: {
    color: Colors.accent,
  },
  profileBtnDesc: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  profileBtnDescActive: {
    color: Colors.text,
  },
  profileBtnBatteryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  profileBtnBattery: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  profileBtnBatteryActive: {
    color: Colors.accent,
  },
  profileBatteryNote: {
    fontSize: 9,
    color: Colors.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
    opacity: 0.8,
  },
  batteryStatsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 2,
    paddingVertical: 2,
  },
  batteryStatsToggleLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  startBtn: {
    backgroundColor: Colors.success,
    borderRadius: 16,
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startModeSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 7,
  },
  startModeTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    letterSpacing: 1.1,
    textAlign: "center",
  },
  startModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  startModeButton: {
    flex: 1,
    minHeight: 76,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  startModeButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "10",
  },
  startModeLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  startModeLabelActive: {
    color: Colors.accent,
  },
  startModeDescription: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  startBtnLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1a1a1a",
    letterSpacing: 1,
  },
  featuresGrid: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  featureDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  calibLink: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textDecorationLine: "underline",
  },
});
