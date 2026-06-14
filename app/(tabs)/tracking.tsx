import React, { useState, useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { useT } from "@/lib/language-context";
import { useUnits } from "@/lib/units-context";
import { convertSpeed, speedUnitLabel, getAccuracyTier } from "@/components/tracking/tracking-utils";
import TrackingMap from "@/components/TrackingMap";
import { useMapConfig } from "@/lib/map-context";
import { useTrackingState } from "@/components/tracking/useTrackingState";
import { apiRequest } from "@/lib/query-client";
import { trackingStyles as styles } from "@/components/tracking/tracking-styles";
import DebugPanel from "@/components/DebugPanel";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

// Extracted Components
import { RecordCard } from "@/components/tracking/RecordCard";
import { RouteMapModal } from "@/components/tracking/RouteMapModal";
import { HandsOffModal } from "@/components/tracking/HandsOffModal";
import { CountdownOverlay } from "@/components/tracking/CountdownOverlay";
import { SummaryModal } from "@/components/tracking/SummaryModal";
import { PublishModal } from "@/components/tracking/PublishModal";
import { IdleConfigScreen } from "@/components/tracking/IdleConfigScreen";
import { TrackingDashboard } from "@/components/tracking/TrackingDashboard";
import { MountCalibWizard } from "@/components/MountCalibWizard";

function TrackingScreenInner() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { speedUnit, distanceUnit } = useUnits();
  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();

  const { state, handlers } = useTrackingState();
  const whisper = useWhisperRecorder();
  const [voiceNoteToast, setVoiceNoteToast] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const syncToastAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state.offlineQueueLastSyncedCount > 0) {
      const count = state.offlineQueueLastSyncedCount;
      handlers.clearOfflineLastSynced();
      const msg = count === 1 ? "☁️ Gita sincronizzata" : `☁️ ${count} gite sincronizzate`;
      setSyncToast(msg);
      Animated.sequence([
        Animated.timing(syncToastAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(3500),
        Animated.timing(syncToastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setSyncToast(null));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.offlineQueueLastSyncedCount]);

  const handleVoiceNote = async () => {
    if (whisper.recording) {
      const text = await whisper.stopAndTranscribe();
      if (text) {
        const saved = await handlers.handleSaveVoiceNote(text);
        const msg = saved ? `📝 Nota: "${text.slice(0, 60)}"` : `📝 "${text.slice(0, 60)}" (non salvata)`;
        setVoiceNoteToast(msg);
        setTimeout(() => setVoiceNoteToast(null), 4000);
      } else {
        setVoiceNoteToast(whisper.error ?? "Trascrizione fallita");
        setTimeout(() => setVoiceNoteToast(null), 3000);
      }
    } else {
      await whisper.startRecording();
      setVoiceNoteToast("🎙 Registrazione in corso… tocca di nuovo per fermare");
    }
  };
  const handsOffAnim = React.useRef(new Animated.Value(1)).current;

  const isFermo = state.currentSpeed <= 2; // IDLE_THRESHOLD_KMH
  const netMs = Math.max(state.totalMs - state.displayIdleMs, 0);
  const avgSpeedKmh = netMs > 0 ? state.totalKm / (netMs / 3600000) : 0;
  const accuracyTier = getAccuracyTier(state.gpsAccuracy);

  if (state.loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── ACTIVE / PAUSED ──────────────────────────────────────────────── */}
      {(state.phase === "active" || state.phase === "paused") && (
        <TrackingDashboard
          phase={state.phase}
          handlePause={handlers.handlePause}
          handleStop={handlers.handleStop}
          gpsLost={state.gpsLost}
          isFermo={isFermo}
          accuracyTier={accuracyTier}
          currentSpeed={state.currentSpeed}
          speedUnit={speedUnit}
          is0100Enabled={state.is0100Enabled}
          currentCoord={state.currentCoord}
          mapCoords={state.mapCoords}
          setMapModalVisible={handlers.setMapModalVisible}
          profile={state.profile}
          sensorsEnabled={state.sensorsEnabled}
          isCalibrating={state.isCalibrating}
          currentG={state.currentG}
          currentLateralG={state.currentLateralG}
          currentTiltDeg={state.currentTiltDeg}
          maxAccelG={state.maxAccelG}
          mountAxisCalib={state.mountAxisCalib}
          totalMs={state.totalMs}
          netMs={netMs}
          maxSpeed={state.maxSpeed}
          totalKm={state.totalKm}
          distanceUnit={distanceUnit}
          displayIdleMs={state.displayIdleMs}
          avgSpeedKmh={avgSpeedKmh}
          maxAltitude={state.maxAltitude}
          maxDecelG={state.maxDecelG}
          maxTiltDeg={state.maxTiltDeg}
          handleRecalibrate={handlers.handleRecalibrate}
          sprintPhase={state.sprintPhase}
          discardSprintAttempt={handlers.discardSprintAttempt}
          sprint0to100Ms={state.sprint0to100Ms}
          isNewRecord={state.isNewRecord}
          recordAnim={state.recordAnim}
          showSensorOverlay={state.showSensorOverlay}
          setShowSensorOverlay={handlers.setShowSensorOverlay}
          pointsBuffered={state.pointsBuffered}
          pointsSent={state.pointsSent}
          sprintGoFired={state.sprintGoFired}
          t={t}
          router={router}
          styles={styles}
        />
      )}

      {/* ── VOICE NOTE FLOATING BUTTON (active / paused) ─────────────────── */}
      {(state.phase === "active" || state.phase === "paused") && (
        <>
          <TouchableOpacity
            style={[
              voiceStyles.voiceFab,
              { bottom: insets.bottom + 90 },
              whisper.recording && voiceStyles.voiceFabActive,
            ]}
            onPress={handleVoiceNote}
            activeOpacity={0.85}
          >
            {whisper.transcribing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={whisper.recording ? "mic" : "mic-outline"}
                size={22}
                color="#fff"
              />
            )}
          </TouchableOpacity>
          {voiceNoteToast !== null && (
            <View style={[voiceStyles.voiceToast, { bottom: insets.bottom + 150 }]}>
              <Text style={voiceStyles.voiceToastText} numberOfLines={3}>{voiceNoteToast}</Text>
            </View>
          )}
        </>
      )}

      {/* ── COUNTDOWN ────────────────────────────────────────────────────── */}
      {state.phase === "countdown" && (
        <CountdownOverlay
          countdownValue={state.countdownValue}
          countdownColor={state.countdownValue === 0 ? Colors.success : "#fff"}
          countdownFontSize={state.countdownValue === 0 ? 120 : 180}
          countdownAnim={state.countdownAnim}
          is0100Enabled={state.is0100Enabled}
          discardSprintAttempt={handlers.discardSprintAttempt}
        />
      )}

      {/* ── HANDS OFF OVERLAY ────────────────────────────────────────────── */}
      <HandsOffModal
        handsOffActive={state.handsOffActive}
        handsOffAnim={handsOffAnim}
        currentSpeed={state.currentSpeed}
        speedUnit={speedUnit}
        handsOffSpeedStr={state.handsOffSpeedStr}
      />

      {/* ── MAP FULLSCREEN MODAL ─────────────────────────────────────────── */}
      <Modal
        visible={state.mapModalVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => handlers.setMapModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#000" }}
          activeOpacity={1}
          onPress={() => handlers.setMapModalVisible(false)}
        >
          {state.currentCoord !== null && (
            <TrackingMap points={state.mapCoords} currentLocation={state.currentCoord} />
          )}
          <View style={styles.mapModalSpeed}>
            <Text style={styles.mapModalSpeedValue}>
              {convertSpeed(state.currentSpeed, speedUnit).toFixed(0)}
            </Text>
            <Text style={styles.mapModalSpeedUnit}>{speedUnitLabel(speedUnit)}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── IDLE (pre-start) ─────────────────────────────────────────────── */}
      {state.phase === "idle" && (
        <IdleConfigScreen
          insets={insets}
          profile={state.profile}
          setProfile={handlers.setProfile}
          is0100Enabled={state.is0100Enabled}
          setIs0100Enabled={handlers.setIs0100Enabled}
          sensorsEnabled={state.sensorsEnabled}
          handsOffEnabled={state.handsOffEnabled}
          setHandsOffEnabled={handlers.setHandsOffEnabled}
          countdownEnabled={state.countdownEnabled}
          setCountdownEnabled={handlers.setCountdownEnabled}
          batteryDrainStats={state.batteryDrainStats}
          showBatteryStats={state.showBatteryStats}
          setShowBatteryStats={handlers.setShowBatteryStats}
          handleDebugTap={handlers.handleDebugTap}
          handleStart={handlers.handleStart}
          handleOpenMountCalib={() => handlers.setShowMountCalibWizard(true)}
          isCalibrated={state.mountAxisCalib !== null}
          calibrationTimestamp={state.mountAxisCalib?.timestamp ?? null}
          t={t}
          renderHistory={() => (
            <View style={styles.recordsSection}>
              <Text style={styles.sectionTitle}>{t("tracking.history")}</Text>
              {(state.records || []).map((r) => (
                <RecordCard
                  key={r.id}
                  item={r}
                  onPublish={() => handlers.setPublishRecord(r)}
                  onDelete={() => handlers.handleDeleteRecord(r.id)}
                  onViewRoute={() => handlers.handleViewHistoricalRoute(r)}
                  onExportGpx={() => handlers.handleExportGpx(r.id)}
                />
              ))}
              {(state.records || []).length === 0 && (
                <Text style={styles.emptyText}>{t("tracking.noRecords")}</Text>
              )}
            </View>
          )}
        />
      )}

      {/* ── SUMMARY MODAL ────────────────────────────────────────────────── */}
      <SummaryModal
        visible={state.summaryVisible}
        onClose={() => handlers.setSummaryVisible(false)}
        insets={insets}
        rideTitle={state.rideTitle}
        setRideTitle={handlers.setRideTitle}
        totalKm={state.totalKm}
        maxSpeed={state.maxSpeed}
        totalMs={state.totalMs}
        avgSpeedKmh={avgSpeedKmh}
        distanceUnit={distanceUnit}
        speedUnit={speedUnit}
        sensorsEnabled={state.sensorsEnabled}
        maxAccelG={state.maxAccelG}
        maxDecelG={state.maxDecelG}
        maxTiltDeg={state.maxTiltDeg}
        is0100Enabled={state.is0100Enabled}
        sprint0to100Ms={state.sprint0to100Ms}
        isNewRecord={state.isNewRecord}
        showMyRoute={state.showMyRoute}
        summaryRoutePoints={state.summaryRoutePoints}
        setRouteMapVisible={handlers.setRouteMapVisible}
        patchFailed={state.summaryPatchFailed}
        onSave={async () => {
          if (state.completedRouteId) {
            try {
              await apiRequest("PATCH", `/api/routes/${state.completedRouteId}`, { title: state.rideTitle });
            } catch (_) {
              await handlers.enqueueOfflinePatch(
                state.completedRouteId,
                { title: state.rideTitle },
                "title"
              ).catch(() => {});
            }
          }
          handlers.setSummaryVisible(false);
        }}
        onPublish={() => {
          if (state.completedRouteId) {
            const netMs = Math.max(state.totalMs - state.displayIdleMs, 0);
            const computedAvg = netMs > 0 ? state.totalKm / (netMs / 3600000) : 0;
            handlers.setPublishRecord({
              id: state.completedRouteId,
              title: state.rideTitle || undefined,
              totalDistanceKm: state.totalKm,
              maxSpeedKmh: state.maxSpeed,
              avgSpeedKmh: computedAvg,
              durationSeconds: Math.round(state.totalMs / 1000),
              isSprint: state.is0100Enabled,
              sprint0to100Ms: state.sprint0to100Ms,
              maxAccelerationG: state.maxAccelG,
              status: "completed",
              createdAt: new Date().toISOString(),
            });
          }
        }}
        onDelete={() => {
          if (state.completedRouteId) {
            handlers.handleDeleteRecord(state.completedRouteId);
            handlers.setSummaryVisible(false);
          }
        }}
        t={t}
      />

      {/* ── ROUTE MAP MODAL ──────────────────────────────────────────────── */}
      <RouteMapModal
        visible={state.routeMapVisible}
        onClose={() => handlers.setRouteMapVisible(false)}
        onCloseAll={() => {
          handlers.setRouteMapVisible(false);
          handlers.setSummaryVisible(false);
        }}
        points={state.summaryRoutePoints}
        tileUrl={activeTileUrl}
        tileMaxZoom={activeTileMaxZoom}
        totalKm={state.totalKm}
        maxSpeed={state.maxSpeed}
        totalMs={state.totalMs}
        distanceUnit={distanceUnit}
        speedUnit={speedUnit}
        insets={insets}
        routeId={state.completedRouteId}
      />

      {/* ── HISTORICAL ROUTE MAP MODAL ────────────────────────────────────── */}
      <RouteMapModal
        visible={state.histMapVisible}
        onClose={() => handlers.setHistMapVisible(false)}
        onCloseAll={() => handlers.setHistMapVisible(false)}
        points={state.histMapPoints}
        tileUrl={activeTileUrl}
        tileMaxZoom={activeTileMaxZoom}
        totalKm={state.histMapRecord?.totalDistanceKm ?? 0}
        maxSpeed={state.histMapRecord?.maxSpeedKmh ?? 0}
        totalMs={(state.histMapRecord?.durationSeconds ?? 0) * 1000}
        distanceUnit={distanceUnit}
        speedUnit={speedUnit}
        insets={insets}
        loading={state.histMapLoading}
        routeId={state.histMapRecord?.id ?? null}
      />

      {/* ── MOUNT CALIBRATION WIZARD ─────────────────────────────────────── */}
      {state.showMountCalibWizard && (
        <MountCalibWizard
          onComplete={(calib) => {
            handlers.setMountAxisCalib(calib);
            handlers.setShowMountCalibWizard(false);
          }}
          onDismiss={() => handlers.setShowMountCalibWizard(false)}
        />
      )}

      {/* ── PUBLISH MODAL ────────────────────────────────────────────────── */}
      <PublishModal
        visible={!!state.publishRecord}
        onClose={() => handlers.setPublishRecord(null)}
        publishCaption={state.publishCaption}
        setPublishCaption={handlers.setPublishCaption}
        isPending={state.isPending}
        onPublish={handlers.handlePublish}
        t={t}
      />

      {/* ── Offline sync toast ────────────────────────────────────────── */}
      {syncToast !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bgToast,
            {
              bottom: insets.bottom + 130,
              opacity: syncToastAnim,
              transform: [
                {
                  translateY: syncToastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="cloud-done-outline" size={14} color={Colors.success} />
          <Text style={styles.bgToastText}>{syncToast}</Text>
        </Animated.View>
      )}

      {/* ── Background GPS toast ──────────────────────────────────────── */}
      {state.bgToastVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bgToast,
            {
              bottom: insets.bottom + 90,
              opacity: state.bgToastAnim,
              transform: [
                {
                  translateY: state.bgToastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="locate" size={14} color={Colors.accent} />
          <Text style={styles.bgToastText}>
            Acquisiti {state.bgToastCount} punti GPS in background
          </Text>
        </Animated.View>
      )}

      {/* ── Debug Panel overlay ───────────────────────────────────────── */}
      {state.debugVisible && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            bottom: insets.bottom + 50,
            left: 12,
            right: 12,
            zIndex: 20,
          }}
        >
          <DebugPanel logs={state.debugLogs} onClear={handlers.clearDebugLogs} />
        </View>
      )}
    </View>
  );
}

const voiceStyles = StyleSheet.create({
  voiceFab: {
    position: "absolute",
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  voiceFabActive: { backgroundColor: Colors.accent },
  voiceToast: {
    position: "absolute",
    left: 14,
    right: 70,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  voiceToastText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#fff" },
});

export default function TrackingScreen() {
  return <TrackingScreenInner />;
}
