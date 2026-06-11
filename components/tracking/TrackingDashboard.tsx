import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CalibrationBanner } from "@/components/CalibrationBanner";
import { StatCard } from "./StatCard";
import { SensorOverlayPanel } from "./SensorOverlayPanel";
import TrackingMap from "@/components/TrackingMap";
import { DistanceUnit, SpeedUnit } from "@/lib/units-context";
import { MountAxisCalibration } from "@/components/MountCalibWizard";
import { useRouter } from "expo-router";
import { UpdateProfile, formatHMS, convertSpeed, speedUnitLabel, convertDistance, distanceUnitLabel } from "./tracking-utils";

interface TrackingDashboardProps {
  phase: "active" | "paused";
  handlePause: () => void;
  handleStop: () => void;
  gpsLost: boolean;
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
  recordAnim: Animated.Value;
  showSensorOverlay: boolean;
  setShowSensorOverlay: (v: boolean) => void;
  pointsBuffered: number;
  pointsSent: number;
  sprintGoFired: boolean;
  t: (key: string) => string;
  router: ReturnType<typeof useRouter>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet object, typed by caller
  styles: Record<string, any>;
}

export function TrackingDashboard({
  phase,
  handlePause,
  handleStop,
  gpsLost,
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

      {/* GPS signal lost banner */}
      {gpsLost && (
        <View style={styles.gpsBanner}>
          <Ionicons name="warning-outline" size={16} color="#fff" />
          <Text style={styles.gpsBannerText}>{t("tracking.gpsLost")}</Text>
        </View>
      )}

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

        {/* Map (standard mode only) — tap to open fullscreen */}
        {!is0100Enabled && currentCoord !== null && (
          <TouchableOpacity activeOpacity={0.95} onPress={() => setMapModalVisible(true)}>
            <View style={styles.mapCard}>
              <TrackingMap points={mapCoords} currentLocation={currentCoord} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Race Mode sensor overlay (always visible below map) ───── */}
        {profile === "race" && !is0100Enabled && sensorsEnabled && !isCalibrating && (
          <SensorOverlayPanel
            currentG={currentG}
            currentLateralG={currentLateralG}
            currentTiltDeg={currentTiltDeg}
            maxAccelG={maxAccelG}
            mountAxisCalib={mountAxisCalib}
            sensorsEnabled={sensorsEnabled}
            colors={Colors}
            styles={styles as { sensorOverlayPanel: object; sensorOverlayItem: object; sensorOverlayValue: object; sensorOverlayLabel: object; sensorOverlaySep: object }}
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
              {/* G max card — only when sensors enabled */}
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
              {/* Calibration banner — shown below G max when sensors enabled */}
              {sensorsEnabled && !isCalibrating && (
                <CalibrationBanner
                  isCalibrated={mountAxisCalib !== null}
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
          <View style={styles.sprintContainer}>
            {/* Sprint header with history button */}
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

            {/* Annulla button when waiting for rider to start moving */}
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

            {/* Sensor overlay toggle — 0-100 sprint (only after GO!) */}
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
                    styles={styles as { sensorOverlayPanel: object; sensorOverlayItem: object; sensorOverlayValue: object; sensorOverlayLabel: object; sensorOverlaySep: object }}
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
        )}

        {/* Buffer indicator */}
        <View style={styles.bufferRow}>
          <Ionicons name="cloud-upload-outline" size={14} color={Colors.accent} />
          <Text style={styles.bufferText}>
            {pointsBuffered}/{pointsSent} {t("tracking.bufferSent")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
