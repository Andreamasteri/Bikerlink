import React from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StatCard } from "./StatCard";
import { formatDistance, formatSpeed } from "@/lib/units";
import { formatHMS, convertSpeed, speedUnitLabel } from "./tracking-utils";
import { DistanceUnit, SpeedUnit } from "@/lib/units-context";

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
  onDelete: () => void;
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
  onDelete,
  t,
}: SummaryModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.summaryOverlay}>
        <View style={[styles.summaryModal, { paddingTop: insets.top + 16 }]}>
          <View style={styles.summaryTitleRow}>
            <Ionicons name="flag-outline" size={24} color={Colors.success} />
            <Text style={styles.summaryTitle}>{t("tracking.completed")}</Text>
            <View style={styles.liveRunBadge}>
              <Text style={styles.liveRunText}>{t("tracking.liveRun")}</Text>
            </View>
          </View>

          <TextInput
            style={styles.rideTitleInput}
            value={rideTitle}
            onChangeText={setRideTitle}
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

          <View style={styles.summaryActions}>
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
              onPress={onDelete}
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
    justifyContent: "flex-end",
  },
  summaryModal: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 10,
  },
  summaryTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  liveRunBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.success + "40",
  },
  liveRunText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.success,
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
    borderColor: Colors.border,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  statCardPlaceholder: {
    flex: 1,
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
    borderColor: "#FFD700" + "40",
  },
  summaryRecordText: {
    color: "#FFD700",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
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
    borderColor: Colors.accent + "30",
  },
  summaryRouteBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  summaryNote: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 30,
    lineHeight: 18,
  },
  summaryActions: {
    flexDirection: "row",
    gap: 10,
  },
  summaryPublishBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  summaryPublishText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  summaryDeleteBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444" + "15",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444" + "30",
  },
  summaryDeleteText: {
    display: "none",
  },
  summaryCloseBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCloseText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
