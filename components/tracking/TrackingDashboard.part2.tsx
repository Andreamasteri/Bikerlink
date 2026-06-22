/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text, Animated, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StatCard } from "./StatCard";
import { SensorOverlayPanel } from "./SensorOverlayPanel";
import { convertSpeed, speedUnitLabel } from "./tracking-utils";

interface SprintOverlayProps {
  sprintPhase: "waiting" | "measuring" | "completed";
  discardSprintAttempt: () => void;
  sprint0to100Ms: number | null;
  speedUnit: any;
  isNewRecord: boolean;
  recordAnim: Animated.Value;
  sprintGoFired: boolean;
  showSensorOverlay: boolean;
  setShowSensorOverlay: (v: boolean) => void;
  sensorsEnabled: boolean;
  isCalibrating: boolean;
  currentG: number;
  currentLateralG: number;
  currentTiltDeg: number;
  maxAccelG: number;
  maxDecelG: number;
  maxTiltDeg: number;
  mountAxisCalib: any;
  accuracyTier: any;
  t: (key: string) => string;
  styles: any;
  router: any;
}

export function SprintOverlay({
  sprintPhase,
  discardSprintAttempt,
  sprint0to100Ms,
  speedUnit,
  isNewRecord,
  recordAnim,
  sprintGoFired,
  showSensorOverlay,
  setShowSensorOverlay,
  sensorsEnabled,
  isCalibrating,
  currentG,
  currentLateralG,
  currentTiltDeg,
  maxAccelG,
  maxDecelG,
  maxTiltDeg,
  mountAxisCalib,
  accuracyTier,
  t,
  styles,
  router,
}: SprintOverlayProps) {
  return (
    <View style={styles.sprintContainer}>
      <View style={styles.sprintHeaderRow}>
        <Text style={styles.sprintHeaderLabel}>Sprint 0-100</Text>
        <TouchableOpacity
          onPress={() => router.push("/sprint-history" as const)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.sprintHistoryBtn}
        >
          <Ionicons name="trophy-outline" size={18} color={Colors.accent} />
          <Text style={styles.sprintHistoryBtnText}>Storico</Text>
        </TouchableOpacity>
      </View>
      <View
        style={[
          styles.sprintPhaseBadge,
          {
            backgroundColor:
              sprintPhase === "waiting"
                ? Colors.success + "20"
                : sprintPhase === "measuring"
                ? Colors.accentRed + "20"
                : Colors.accent + "20",
            borderColor:
              sprintPhase === "waiting"
                ? Colors.success
                : sprintPhase === "measuring"
                ? Colors.accentRed
                : Colors.accent,
          },
        ]}
      >
        <Text
          style={[
            styles.sprintPhaseLabel,
            {
              color:
                sprintPhase === "waiting"
                  ? Colors.success
                  : sprintPhase === "measuring"
                  ? Colors.accentRed
                  : Colors.accent,
            },
          ]}
        >
          {sprintPhase === "waiting"
            ? t("tracking.sprintAccelerate")
            : sprintPhase === "measuring"
            ? t("tracking.sprintMeasuring")
            : t("tracking.sprintCompleted")}
        </Text>
      </View>

      {sprintPhase === "waiting" && (
        <TouchableOpacity
          style={styles.sprintCancelBtn}
          onPress={discardSprintAttempt}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={18} color={Colors.accentRed} />
          <Text style={styles.sprintCancelText}>Annulla</Text>
        </TouchableOpacity>
      )}

      {sprint0to100Ms !== null && (
        <Text style={styles.sprint0100Time}>
          0→{convertSpeed(100, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)} in {(sprint0to100Ms / 1000).toFixed(2)}s
        </Text>
      )}

      {isNewRecord && (
        <Animated.View
          style={[
            styles.newRecordBadge,
            {
              opacity: recordAnim,
              transform: [{ scale: recordAnim }],
            },
          ]}
        >
          <Ionicons name="trophy" size={16} color="#FFD700" />
          <Text style={styles.newRecordText}>Nuovo Record!</Text>
        </Animated.View>
      )}

      {(sprintGoFired || sprintPhase !== "waiting") && (
        <>
          <TouchableOpacity
            style={styles.sensorOverlayToggleRow}
            onPress={() => setShowSensorOverlay(!showSensorOverlay)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="pulse-outline"
              size={16}
              color={showSensorOverlay ? Colors.accentRed : Colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.sensorOverlayToggleLabel}>
                {t("tracking.sensorOverlay")}
              </Text>
              <Text style={styles.sensorOverlayToggleHint}>
                {t("tracking.sensorOverlayHint")}
              </Text>
            </View>
            <Switch
              value={showSensorOverlay}
              onValueChange={setShowSensorOverlay}
              trackColor={{ false: Colors.border, true: Colors.accentRed + "80" }}
              thumbColor={showSensorOverlay ? Colors.accentRed : Colors.textSecondary}
            />
          </TouchableOpacity>

          {showSensorOverlay && !isCalibrating && (
            <SensorOverlayPanel
              currentG={currentG}
              currentLateralG={currentLateralG}
              currentTiltDeg={currentTiltDeg}
              maxAccelG={maxAccelG}
              mountAxisCalib={mountAxisCalib}
              sensorsEnabled={sensorsEnabled}
              colors={Colors}
              styles={styles}
              t={t}
            />
          )}
        </>
      )}

      {sensorsEnabled && (sprintGoFired || sprintPhase !== "waiting") && (
        <View style={styles.statsRow}>
          <StatCard
            icon="trending-up-outline"
            color={Colors.success}
            value={`${currentG.toFixed(2)} G`}
            label={t("tracking.gInstant")}
          />
          <StatCard
            icon="pulse-outline"
            color={Colors.accentRed}
            value={`${maxAccelG.toFixed(2)} G`}
            label={t("tracking.gMaxAccel")}
          />
        </View>
      )}
      <View style={styles.statsRow}>
        {sensorsEnabled && (sprintGoFired || sprintPhase !== "waiting") && (
          <StatCard
            icon="trending-down-outline"
            color={Colors.warning}
            value={`${maxDecelG.toFixed(2)} G`}
            label={t("tracking.gMaxBrake")}
          />
        )}
        {sensorsEnabled && !isCalibrating && (sprintGoFired || sprintPhase !== "waiting") && (
          <StatCard
            icon="compass-outline"
            color={Colors.accent}
            value={`${maxTiltDeg.toFixed(1)}°`}
            label={t("tracking.tiltMax")}
          />
        )}
        {accuracyTier ? (
          <StatCard
            icon="locate-outline"
            color={accuracyTier.color}
            value={accuracyTier.value}
            label={t(accuracyTier.labelKey)}
          />
        ) : (
          <View style={[styles.statCard, { opacity: 0 }]} />
        )}
      </View>
    </View>
  );
}

export function BufferIndicator({ pointsBuffered, pointsSent, t, styles }: { pointsBuffered: number; pointsSent: number; t: any; styles: any }) {
  return (
    <View style={styles.bufferRow}>
      <Ionicons name="cloud-upload-outline" size={14} color={Colors.accent} />
      <Text style={styles.bufferText}>
        {pointsBuffered}/{pointsSent} {t("tracking.bufferSent")}
      </Text>
    </View>
  );
}
