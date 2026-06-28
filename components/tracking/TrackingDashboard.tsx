// LARGE-FILE-ALLOW: schermata/modulo — merge @no-split di file lazy-split
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CalibrationBanner } from "@/components/CalibrationBanner";
import { StatCard } from "./StatCard";
import { SensorOverlayPanel } from "./SensorOverlayPanel";
import TrackingMap from "@/components/TrackingMap";
import { DistanceUnit, SpeedUnit } from "@/lib/units-context";
import { MountAxisCalibration } from "@/components/MountCalibWizard";
import { UpdateProfile, formatHMS, convertSpeed, speedUnitLabel, convertDistance, distanceUnitLabel } from "./tracking-utils";

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

interface TrackingDashboardProps {
  phase: "active" | "paused";
  handlePause: () => void;
  handleStop: () => void;
  gpsLost: boolean;
  gpsAcquiring: boolean;
  fusionMode: "acquiring" | "gps_only" | "gps_sensors" | "sensors_only";
  isFermo: boolean;
  accuracyTier: { labelKey: string; color: string; value: string } | null;
  currentSpeed: number;
  speedUnit: SpeedUnit;
  is0100Enabled: boolean;
  currentCoord: { latitude: number; longitude: number } | null;
  mapCoords: Array<{ latitude: number; longitude: number }>;
  setMapModalVisible: (v: boolean) => void;
  profile: UpdateProfile;
  sensorsEnabled: boolean;
  isCalibrating: boolean;
  currentG: number;
  currentLateralG: number;
  currentTiltDeg: number;
  maxAccelG: number;
  mountAxisCalib: MountAxisCalibration | null;
  totalMs: number;
  netMs: number;
  maxSpeed: number;
  totalKm: number;
  distanceUnit: DistanceUnit;
  displayIdleMs: number;
  avgSpeedKmh: number;
  maxAltitude: number;
  maxDecelG: number;
  maxTiltDeg: number;
  handleRecalibrate: () => void;
  sprintPhase: "waiting" | "measuring" | "completed";
  discardSprintAttempt: () => void;
  sprint0to100Ms: number | null;
  isNewRecord: boolean;
  recordAnim: any;
  showSensorOverlay: boolean;
  setShowSensorOverlay: (v: boolean) => void;
  pointsBuffered: number;
  pointsSent: number;
  sprintGoFired: boolean;
  t: (key: string) => string;
  router: any;
  styles: Record<string, any>;
}

export function TrackingDashboard({
  phase,
  handlePause,
  handleStop,
  gpsLost,
  gpsAcquiring,
  fusionMode,
  isFermo,
  accuracyTier,
  currentSpeed,
  speedUnit,
  is0100Enabled,
  currentCoord,
  mapCoords,
  setMapModalVisible,
  profile,
  sensorsEnabled,
  isCalibrating,
  currentG,
  currentLateralG,
  currentTiltDeg,
  maxAccelG,
  mountAxisCalib,
  totalMs,
  netMs,
  maxSpeed,
  totalKm,
  distanceUnit,
  displayIdleMs,
  avgSpeedKmh,
  maxAltitude,
  maxDecelG,
  maxTiltDeg,
  handleRecalibrate,
  sprintPhase,
  discardSprintAttempt,
  sprint0to100Ms,
  isNewRecord,
  recordAnim,
  showSensorOverlay,
  setShowSensorOverlay,
  pointsBuffered,
  pointsSent,
  sprintGoFired,
  t,
  router,
  styles,
}: TrackingDashboardProps) {
  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.activeHeader}>
        <TouchableOpacity
          style={[
            styles.pauseBtn,
            phase === "paused" && styles.pauseBtnResume,
          ]}
          onPress={handlePause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={phase === "paused" ? "play" : "pause"}
            size={18}
            color="#1a1a1a"
          />
          <Text style={styles.pauseBtnLabel}>
            {phase === "paused" ? t("tracking.resume") : t("tracking.pause")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stopBtn}
          onPress={handleStop}
          activeOpacity={0.8}
        >
          <Ionicons name="stop" size={20} color="#ffffff" />
          <Text style={styles.stopBtnLabel}>STOP</Text>
        </TouchableOpacity>
      </View>

      {/* GPS acquiring banner */}
      {gpsAcquiring && !gpsLost && (
        <View style={[styles.gpsBanner, styles.gpsAcquiringBanner]}>
          <Ionicons name="locate-outline" size={16} color="#fff" />
          <Text style={styles.gpsBannerText}>{t("tracking.gpsAcquiring")}</Text>
        </View>
      )}

      {/* GPS signal lost banner */}
      {gpsLost && (
        <View style={styles.gpsBanner}>
          <Ionicons name="warning-outline" size={16} color="#fff" />
          <Text style={styles.gpsBannerText}>{t("tracking.gpsLost")}</Text>
        </View>
      )}

      {/* Fusion mode chip */}
      <View style={styles.fusionChipRow}>
        <View
          style={[
            styles.fusionChip,
            fusionMode === "sensors_only" && styles.fusionChipSensors,
            fusionMode === "acquiring" && styles.fusionChipAcquiring,
          ]}
        >
          <Ionicons
            name={
              fusionMode === "acquiring"
                ? "locate-outline"
                : fusionMode === "sensors_only"
                ? "speedometer-outline"
                : fusionMode === "gps_sensors"
                ? "git-merge-outline"
                : "navigate-outline"
            }
            size={12}
            color="#fff"
          />
          <Text style={styles.fusionChipText}>{t(`tracking.fusion.${fusionMode}`)}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.activeScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Speed panel */}
        <View
          style={[
            styles.speedPanel,
            phase === "paused" && { opacity: 0.75, borderColor: Colors.warning + "60" },
          ]}
        >
          <View style={styles.speedMetaRow}>
            <View style={styles.fermoRow}>
              <View
                style={[
                  styles.fermoDot,
                  {
                    backgroundColor: isFermo
                      ? Colors.success
                      : Colors.textSecondary,
                  },
                ]}
              />
              <Text
                style={[
                  styles.fermoLabel,
                  {
                    color: isFermo
                      ? Colors.success
                      : Colors.textSecondary,
                  },
                ]}
              >
                FERMO
              </Text>
            </View>
            {accuracyTier && (
              <View style={styles.accuracyRow}>
                <Text style={[styles.accuracyLabel, { color: accuracyTier.color }]}>
                  {t(accuracyTier.labelKey)}
                </Text>
                <Text style={styles.accuracyValue}>{accuracyTier.value}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.speedValue, is0100Enabled && styles.speedValueSprint]}>
            {is0100Enabled
              ? convertSpeed(currentSpeed, speedUnit).toFixed(1)
              : convertSpeed(currentSpeed, speedUnit).toFixed(0)}
          </Text>
          <Text style={styles.speedUnit}>{speedUnitLabel(speedUnit)}</Text>
        </View>

        {/* Map (standard mode only) */}
        {!is0100Enabled && currentCoord !== null && (
          <TouchableOpacity activeOpacity={0.95} onPress={() => setMapModalVisible(true)}>
            <View style={styles.mapCard}>
              <TrackingMap points={mapCoords} currentLocation={currentCoord} />
            </View>
          </TouchableOpacity>
        )}

        {/* Race Mode sensor overlay */}
        {profile === "race" && !is0100Enabled && sensorsEnabled && !isCalibrating && (
          <SensorOverlayPanel
            currentG={currentG}
            currentLateralG={currentLateralG}
            currentTiltDeg={currentTiltDeg}
            maxAccelG={maxAccelG}
            mountAxisCalib={mountAxisCalib}
            sensorsEnabled={sensorsEnabled}
            colors={Colors}
            styles={styles as any}
            t={t}
          />
        )}

        {/* Stats — standard mode */}
        {!is0100Enabled && (
          <View style={styles.statsRow}>
            <View style={styles.statsCol}>
              <StatCard
                icon="time-outline"
                color={Colors.accent}
                value={formatHMS(totalMs)}
                label={t("tracking.totalTime")}
              />
              <StatCard
                icon="bicycle-outline"
                color={Colors.success}
                value={formatHMS(netMs)}
                label={t("tracking.netTime")}
              />
              <StatCard
                icon="flash"
                color={Colors.accentRed}
                value={convertSpeed(maxSpeed, speedUnit).toFixed(2)}
                label={`${t("tracking.maxSpeed")} ${speedUnitLabel(speedUnit)}`}
              />
              <StatCard
                icon="navigate-outline"
                color={Colors.accent}
                value={convertDistance(totalKm, distanceUnit).toFixed(3)}
                label={`${distanceUnitLabel(distanceUnit)} totali`}
              />
            </View>
            <View style={styles.statsCol}>
              <StatCard
                icon="pause-outline"
                color={Colors.warning}
                value={formatHMS(displayIdleMs)}
                label={t("tracking.idleTime")}
              />
              <StatCard
                icon="speedometer-outline"
                color={Colors.success}
                value={convertSpeed(avgSpeedKmh, speedUnit).toFixed(2)}
                label={`${t("tracking.avgSpeed")} ${speedUnitLabel(speedUnit)}`}
              />
              <StatCard
                icon="trending-up-outline"
                color={Colors.success}
                value={maxAltitude.toFixed(0)}
                label={t("tracking.maxAlt")}
              />
              {sensorsEnabled && <View style={styles.statCard}>
                <Ionicons name="pulse-outline" size={16} color={Colors.accentRed} />
                {isCalibrating ? (
                  <Text style={[styles.statValue, { color: Colors.textSecondary, fontSize: 16 }]}>
                    {t("tracking.calibrating")}
                  </Text>
                ) : (
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                    {`↑${maxAccelG.toFixed(2)} ↓${maxDecelG.toFixed(2)}`}
                  </Text>
                )}
                <Text style={styles.statLabel}>G max</Text>
              </View>}
              {sensorsEnabled && !isCalibrating && (
                <CalibrationBanner
                  isCalibrated={mountAxisCalib !== null}
                  calibrationTimestamp={mountAxisCalib?.timestamp ?? null}
                  onCalibrate={handleRecalibrate}
                />
              )}
              {sensorsEnabled && !isCalibrating && <View style={styles.statCard}>
                <Ionicons name="compass-outline" size={16} color={Colors.accent} />
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {maxTiltDeg.toFixed(1) + "°"}
                </Text>
                <Text style={styles.statLabel}>{t("tracking.tiltMax")}</Text>
              </View>}
            </View>
          </View>
        )}

        {/* Stats — 0-100 sprint mode */}
        {is0100Enabled && (
          <SprintOverlay
            sprintPhase={sprintPhase}
            discardSprintAttempt={discardSprintAttempt}
            sprint0to100Ms={sprint0to100Ms}
            speedUnit={speedUnit}
            isNewRecord={isNewRecord}
            recordAnim={recordAnim}
            sprintGoFired={sprintGoFired}
            showSensorOverlay={showSensorOverlay}
            setShowSensorOverlay={setShowSensorOverlay}
            sensorsEnabled={sensorsEnabled}
            isCalibrating={isCalibrating}
            currentG={currentG}
            currentLateralG={currentLateralG}
            currentTiltDeg={currentTiltDeg}
            maxAccelG={maxAccelG}
            maxDecelG={maxDecelG}
            maxTiltDeg={maxTiltDeg}
            mountAxisCalib={mountAxisCalib}
            accuracyTier={accuracyTier}
            t={t}
            styles={styles}
            router={router}
          />
        )}

        {/* Buffer indicator */}
        <BufferIndicator
          pointsBuffered={pointsBuffered}
          pointsSent={pointsSent}
          t={t}
          styles={styles}
        />
      </ScrollView>
    </View>
  );
}
