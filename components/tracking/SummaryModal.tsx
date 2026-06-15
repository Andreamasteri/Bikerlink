import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StatCard } from "./StatCard";
import { formatDistance, formatSpeed } from "@/lib/units";
import { formatHMS, convertSpeed, speedUnitLabel } from "./tracking-utils";
import { DistanceUnit, SpeedUnit } from "@/lib/units-context";

const AUTO_SAVE_SECONDS = 30;

interface SummaryModalProps {
  visible: boolean;
  onClose: () => void;
  insets: { top: number; bottom: number };
  rideTitle: string;
  setRideTitle: (t: string) => void;
  totalKm: number;
  maxSpeed: number;
  totalMs: number;
  avgSpeedKmh: number;
  distanceUnit: DistanceUnit;
  speedUnit: SpeedUnit;
  sensorsEnabled: boolean;
  maxAccelG: number;
  maxDecelG: number;
  maxTiltDeg: number;
  is0100Enabled: boolean;
  sprint0to100Ms: number | null;
  isNewRecord: boolean;
  showMyRoute: boolean;
  summaryRoutePoints: Array<{ lat: number; lng: number }>;
  setRouteMapVisible: (v: boolean) => void;
  onPublish: () => void;
  onSave: () => void;
  onDelete: () => void;
  patchFailed?: boolean;
  t: (key: string) => string;
}

export function SummaryModal({
  visible,
  onClose,
  insets,
  rideTitle,
  setRideTitle,
  totalKm,
  maxSpeed,
  totalMs,
  avgSpeedKmh,
  distanceUnit,
  speedUnit,
  sensorsEnabled,
  maxAccelG,
  maxDecelG,
  maxTiltDeg,
  is0100Enabled,
  sprint0to100Ms,
  isNewRecord,
  showMyRoute,
  summaryRoutePoints,
  setRouteMapVisible,
  onPublish,
  onSave,
  onDelete,
  patchFailed = false,
  t
}: SummaryModalProps) {
  const [countdown, setCountdown] = useState(AUTO_SAVE_SECONDS);
  const countdownRef = useRef(AUTO_SAVE_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedRef = useRef(false);

  const clearCountdownInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetCountdown = () => {
    clearCountdownInterval();
    countdownRef.current = AUTO_SAVE_SECONDS;
    setCountdown(AUTO_SAVE_SECONDS);
    startCountdown();
  };

  const startCountdown = () => {
    intervalRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        clearCountdownInterval();
        if (!savedRef.current) {
          savedRef.current = true;
          onSave();
        }
      }
    }, 1000);
  };

  useEffect(() => {
    if (!visible) {
      clearCountdownInterval();
      return;
    }
    savedRef.current = false;
    countdownRef.current = AUTO_SAVE_SECONDS;
    setCountdown(AUTO_SAVE_SECONDS);
    startCountdown();
    return () => clearCountdownInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSave = () => {
    clearCountdownInterval();
    savedRef.current = true;
    onSave();
  };

  const handleDelete = () => {
    clearCountdownInterval();
    savedRef.current = true;
    onDelete();
  };

  const handleTitleChange = (text: string) => {
    setRideTitle(text);
    resetCountdown();
  };

  const screenHeight = Dimensions.get("window").height;
  const maxSheetHeight = screenHeight * 0.9;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.summaryOverlay}>
        <View style={[styles.summaryModal, { paddingTop: insets.top + 16, maxHeight: maxSheetHeight }]}>
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.summaryTitleRow}>
              <Ionicons name="flag-outline" size={24} color={Colors.success} />
              <Text style={styles.summaryTitle}>{t("tracking.completed")}</Text>
              <View style={styles.liveRunBadge}>
                <Text style={styles.liveRunText}>{t("tracking.liveRun")}</Text>
              </View>
            </View>

            {patchFailed && (
              <View style={styles.syncWarningBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={Colors.warning} />
                <Text style={styles.syncWarningText}>{t("tracking.syncWarning")}</Text>
              </View>
            )}

            <View style={[styles.kmGainedBanner, patchFailed && styles.kmGainedBannerOffline]}>
              <Ionicons
                name={patchFailed ? "cloud-offline-outline" : "trending-up-outline"}
                size={16}
                color={patchFailed ? Colors.textSecondary : Colors.success}
              />
              <Text style={[styles.kmGainedText, patchFailed && styles.kmGainedTextOffline]}>
                {patchFailed
                  ? t("tracking.kmAddedOffline")
                  : t("tracking.kmAddedToTotal").replace("{distance}", formatDistance(totalKm, distanceUnit, 2))}
              </Text>
            </View>

            <TextInput
              style={styles.rideTitleInput}
              value={rideTitle}
              onChangeText={handleTitleChange}
              placeholder={t("tracking.rideNamePlaceholder")}
              placeholderTextColor={Colors.textSecondary}
              maxLength={80}
              returnKeyType="done"
            />

            <View style={styles.statsRow}>
              <StatCard
                icon="navigate-outline"
                color={Colors.accent}
                value={formatDistance(totalKm, distanceUnit, 3)}
                label={t("tracking.distance")}
              />
              <StatCard
                icon="flash"
                color={Colors.accentRed}
                value={formatSpeed(maxSpeed, speedUnit, 1)}
                label={t("tracking.maxSpeed")}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="time-outline"
                color={Colors.accent}
                value={formatHMS(totalMs)}
                label={t("tracking.totalTime")}
              />
              <StatCard
                icon="speedometer-outline"
                color={Colors.success}
                value={formatSpeed(avgSpeedKmh, speedUnit, 1)}
                label={t("tracking.avgSpeed")}
              />
            </View>
            {sensorsEnabled && (
              <>
                <View style={styles.statsRow}>
                  <StatCard
                    icon="pulse-outline"
                    color={Colors.accentRed}
                    value={maxAccelG.toFixed(2) + " G"}
                    label={t("tracking.gMaxAccel")}
                  />
                  <StatCard
                    icon="trending-down-outline"
                    color={Colors.warning}
                    value={maxDecelG.toFixed(2) + " G"}
                    label={t("tracking.gMaxBrake")}
                  />
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    icon="compass-outline"
                    color={Colors.accent}
                    value={maxTiltDeg.toFixed(1) + "°"}
                    label={t("tracking.tiltMax")}
                  />
                  <View style={[styles.statCardPlaceholder, { opacity: 0 }]} />
                </View>
              </>
            )}
            {is0100Enabled && sprint0to100Ms !== null && (
              <View style={styles.statsRow}>
                <StatCard
                  icon="timer-outline"
                  color={Colors.accentRed}
                  value={(sprint0to100Ms / 1000).toFixed(2) + "s"}
                  label={`0→${convertSpeed(100, speedUnit).toFixed(0)} ${speedUnitLabel(speedUnit)}`}
                />
                {isNewRecord && (
                  <View style={styles.summaryRecordBadge}>
                    <Ionicons name="trophy" size={16} color="#FFD700" />
                    <Text style={styles.summaryRecordText}>{t("tracking.newRecord")}</Text>
                  </View>
                )}
              </View>
            )}

            {showMyRoute && summaryRoutePoints.length >= 10 && (
              <TouchableOpacity
                style={styles.summaryRouteBtn}
                onPress={() => setRouteMapVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="map-outline" size={16} color={Colors.accent} />
                <Text style={styles.summaryRouteBtnText}>{t("tracking.viewRoute")}</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.summaryNote}>
              {t("tracking.summaryNote")}
            </Text>

            <View style={styles.autoSaveRow}>
              <Ionicons name="timer-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.autoSaveText}>
                {t("tracking.autoSaveIn")} {countdown}s…
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.summaryActions, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
            <TouchableOpacity
              style={styles.summarySaveBtn}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-outline" size={18} color="#ffffff" />
              <Text style={styles.summarySaveText}>{t("tracking.save")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.summaryPublishBtn}
              onPress={onPublish}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color="#ffffff" />
              <Text style={styles.summaryPublishText}>{t("tracking.publish")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.summaryDeleteBtn}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.summaryDeleteText}>{t("common.delete")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.summaryCloseBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.summaryCloseText}>{t("tracking.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summaryOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end"
  },
  summaryModal: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20
  },
  scrollContent: {
    flexShrink: 1
  },
  scrollContentContainer: {
    paddingBottom: 8
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 10
  },
  summaryTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text
  },
  liveRunBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.success + "40"
  },
  liveRunText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.success
  },
  syncWarningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14
  },
  syncWarningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
    lineHeight: 16
  },
  kmGainedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "15",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + "35",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14
  },
  kmGainedBannerOffline: {
    backgroundColor: Colors.textSecondary + "12",
    borderColor: Colors.textSecondary + "25"
  },
  kmGainedText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.success
  },
  kmGainedTextOffline: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary
  },
  rideTitleInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10
  },
  statCardPlaceholder: {
    flex: 1
  },
  summaryRecordBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700" + "20",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFD700" + "40"
  },
  summaryRecordText: {
    color: "#FFD700",
    fontSize: 14,
    fontFamily: "Inter_700Bold"
  },
  summaryRouteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent + "15",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "30"
  },
  summaryRouteBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold"
  },
  summaryNote: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 8,
    lineHeight: 18
  },
  autoSaveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20
  },
  autoSaveText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular"
  },
  summaryActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  summarySaveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 14
  },
  summarySaveText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold"
  },
  summaryPublishBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14
  },
  summaryPublishText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold"
  },
  summaryDeleteBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444" + "15",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444" + "30"
  },
  summaryDeleteText: {
    display: "none"
  },
  summaryCloseBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border
  },
  summaryCloseText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold"
  }
});
