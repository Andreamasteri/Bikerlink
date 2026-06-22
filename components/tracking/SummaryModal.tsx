import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
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
  gpsBlackoutCount?: number;
  gpsBlackoutSeconds?: number;
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
  gpsBlackoutCount = 0,
  gpsBlackoutSeconds = 0,
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
                {gpsBlackoutCount > 0 && (
                  <View style={styles.sensorOnlyBadge}>
                    <Ionicons name="warning-outline" size={13} color={Colors.warning} />
                    <Text style={styles.sensorOnlyBadgeText}>
                      {t("tracking.gpsBlackoutLabel")}: {gpsBlackoutCount} {t("tracking.gpsBlackoutTimes")} ({gpsBlackoutSeconds} s {t("tracking.gpsBlackoutTotal")}) — {t("tracking.sensorOnlyIncluded")}
                    </Text>
                  </View>
                )}
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

import { styles } from "./SummaryModal.styles";
