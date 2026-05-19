import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { apiRequest, getQueryFn, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useRouter, useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";
import { getCurrentLocale } from "@/lib/i18n";
import { useT } from "@/lib/language-context";
import { useUnits, SpeedUnit, DistanceUnit } from "@/lib/units-context";
import { formatDistance, formatSpeed } from "@/lib/units";
import TrackingMap from "@/components/TrackingMap";
import WebView from "react-native-webview";
import { buildLeafletPostRideHtml } from "@/lib/leaflet-route-map-html";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { setTrackingActive, setHandsOffBroadcast, setSprintMeasuringBroadcast } from "@/lib/tracking-active";
import * as Haptics from "expo-haptics";
import { logGpsError } from "@/lib/gps-logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Accelerometer, DeviceMotion } from "expo-sensors";
import { VolumeManager } from "react-native-volume-manager";
import * as TaskManager from "expo-task-manager";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Battery from "expo-battery";

// ─── Background location task (must be defined at module top level) ───────────

const BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "@bikerlink/bg_points_pending";
const BG_NOTIF_CONFIG_KEY = "@bikerlink/bg_notif_config";
const BG_NOTIF_THROTTLE = 5;

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    try {
      const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
      const existing: { latitude: number; longitude: number; altitude: number; speedKmh: number; timestamp: string }[] = raw ? JSON.parse(raw) : [];
      const newPoints = locations.map((loc) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude ?? 0,
        speedKmh: (loc.coords.speed ?? 0) * 3.6,
        timestamp: new Date(loc.timestamp).toISOString(),
      }));
      const newCount = existing.length + newPoints.length;
      await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([...existing, ...newPoints]));

      // Throttled notification update: refresh body when we cross a multiple of BG_NOTIF_THROTTLE
      const prevBucket = Math.floor(existing.length / BG_NOTIF_THROTTLE);
      const curBucket = Math.floor(newCount / BG_NOTIF_THROTTLE);
      if (curBucket > prevBucket && newCount > 0) {
        try {
          const cfgRaw = await AsyncStorage.getItem(BG_NOTIF_CONFIG_KEY);
          if (cfgRaw) {
            const cfg = JSON.parse(cfgRaw) as {
              title: string;
              body: string;
              pointsLabel: string;
              accuracy: number;
              timeInterval: number;
              distanceInterval: number;
            };
            const pointsText = cfg.pointsLabel.replace("{count}", String(newCount));
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: cfg.accuracy,
              timeInterval: cfg.timeInterval,
              distanceInterval: cfg.distanceInterval,
              foregroundService: {
                notificationTitle: cfg.title,
                notificationBody: `${cfg.body} • ${pointsText}`,
                notificationColor: "#FF6600",
                killServiceOnDestroy: false,
              },
              pausesUpdatesAutomatically: false,
              activityType: Location.ActivityType.AutomotiveNavigation,
            }).catch(() => {});
          }
        } catch {}
      }
    } catch {}
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "countdown" | "active" | "paused";
type UpdateProfile = "easy" | "medium" | "race";

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  timestamp: string;
  accelG?: number;
  tiltDeg?: number;
}

interface RouteRecord {
  id: string;
  title?: string | null;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxAltitude?: number;
  durationSeconds?: number;
  idleTimeSeconds?: number;
  status: string;
  createdAt: string;
  maxAccelerationG?: number | null;
  isSprint?: boolean;
  sprint0to100Ms?: number | null;
  gpsBlackoutCount?: number | null;
  gpsBlackoutSeconds?: number | null;
}

// ─── Local record type (offline-recovered, not synced to server) ──────────────

interface LocalRouteRecord extends RouteRecord {
  isRecovered: true;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_KMH = 2;
const BATCH_SIZE = 10;
const BATCH_FLUSH_MS = 30000;
const GPS_SIGNAL_TIMEOUT_MS = 15_000;
const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";
const GPS_BUFFER_SEG_KEY = (n: number) => `@bikerlink/gps_buffer_seg_${n}`;
const GPS_BUFFER_WRITE_EVERY = 5;

// ─── Mount-axis calibration ───────────────────────────────────────────────────

const MOUNT_CALIB_KEY = "@bikerlink/mount_axis_calibration_v1";

interface MountAxisCalibration {
  longAxis: "x" | "y" | "z";
  latAxis: "x" | "y" | "z";
  vertAxis: "x" | "y" | "z";
  longSign: 1 | -1;
  timestamp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHMS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAccuracyTier(meters: number | null): { labelKey: string; color: string; value: string } | null {
  if (meters === null || meters < 0) return null;
  const m = Math.round(meters);
  if (meters < 5) return { labelKey: "tracking.accuracy.excellent", color: Colors.success, value: `${m}m` };
  if (meters < 15) return { labelKey: "tracking.accuracy.good", color: "#4A9EFF", value: `${m}m` };
  if (meters <= 30) return { labelKey: "tracking.accuracy.fair", color: Colors.warning, value: `${m}m` };
  return { labelKey: "tracking.accuracy.poor", color: Colors.accentRed, value: `${m}m` };
}

// ─── Unit conversions ─────────────────────────────────────────────────────────

function convertSpeed(kmh: number, unit: SpeedUnit): number {
  if (unit === "mph") return kmh * 0.621371;
  if (unit === "knots") return kmh * 0.539957;
  return kmh;
}

function speedUnitLabel(unit: SpeedUnit): string {
  if (unit === "mph") return "mph";
  if (unit === "knots") return "kn";
  return "km/h";
}

function convertDistance(km: number, unit: DistanceUnit): number {
  if (unit === "mi_ft" || unit === "mi_yd") return km * 0.621371;
  if (unit === "nmi_ftm") return km * 0.539957;
  return km;
}

function distanceUnitLabel(unit: DistanceUnit): string {
  if (unit === "mi_ft" || unit === "mi_yd") return "mi";
  if (unit === "nmi_ftm") return "nmi";
  return "km";
}

function getModeConfig(profile: UpdateProfile): {
  accuracy: Location.Accuracy;
  timeInterval: number;
  distanceInterval: number;
} {
  if (profile === "race") {
    return { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 };
  }
  if (profile === "easy") {
    return { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 };
  }
  return { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 5 };
}

function getModeConfigBackground(profile: UpdateProfile): {
  accuracy: Location.Accuracy;
  timeInterval: number;
  distanceInterval: number;
} {
  if (profile === "race") {
    // Race: massima precisione anche in background, intervallo ridotto rispetto al fg
    return { accuracy: Location.Accuracy.Highest, timeInterval: 3000, distanceInterval: 5 };
  }
  if (profile === "easy") {
    // Easy: risparmio batteria massimo — accuracy bassa, aggiornamenti radi
    return { accuracy: Location.Accuracy.Low, timeInterval: 15000, distanceInterval: 30 };
  }
  // Medium: alta precisione, intervallo moderato
  return { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 15 };
}

// Stima statica del consumo batteria per ora in tracking in background.
// Valori approssimativi basati su intervallo di campionamento e accuracy GPS
// di getModeConfigBackground(). Non sono misure reali.
function getStaticBatteryDrainPerHour(profile: UpdateProfile): number {
  if (profile === "race") return 9;
  if (profile === "easy") return 3;
  return 5;
}

// ─── Battery drain stats (measured per-device, per-mode) ──────────────────────

const BATTERY_DRAIN_STATS_KEY = "@bikerlink/battery_drain_stats_v1";
const BATTERY_MIN_RIDE_MINUTES = 5;
const BATTERY_MAX_SAMPLES = 10;

interface BatteryDrainStats {
  easy: number[];
  medium: number[];
  race: number[];
}

function normalizeBatteryDrainStats(raw: unknown): BatteryDrainStats {
  const isNumArr = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number" && isFinite(x));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    return {
      easy: isNumArr(r.easy) ? r.easy : [],
      medium: isNumArr(r.medium) ? r.medium : [],
      race: isNumArr(r.race) ? r.race : [],
    };
  }
  return { easy: [], medium: [], race: [] };
}

async function loadBatteryDrainStats(): Promise<BatteryDrainStats> {
  try {
    const raw = await AsyncStorage.getItem(BATTERY_DRAIN_STATS_KEY);
    if (raw) return normalizeBatteryDrainStats(JSON.parse(raw));
  } catch (e) {
    if (__DEV__) console.warn("[BikerLink] loadBatteryDrainStats error:", e);
  }
  return { easy: [], medium: [], race: [] };
}

async function appendBatteryDrainSample(
  profile: UpdateProfile,
  drainPerHour: number
): Promise<BatteryDrainStats> {
  const stats = await loadBatteryDrainStats();
  const arr = [...stats[profile], drainPerHour].slice(-BATTERY_MAX_SAMPLES);
  const updated: BatteryDrainStats = { ...stats, [profile]: arr };
  try {
    await AsyncStorage.setItem(BATTERY_DRAIN_STATS_KEY, JSON.stringify(updated));
    if (__DEV__) console.log(`[BikerLink] Battery drain sample saved — profile=${profile} value=${drainPerHour.toFixed(2)}%/h samples=${arr.length}`);
  } catch (e) {
    if (__DEV__) console.warn("[BikerLink] appendBatteryDrainSample persist error:", e);
  }
  return updated;
}

function getMeasuredDrainPerHour(stats: BatteryDrainStats, profile: UpdateProfile): number | null {
  const samples = stats[profile];
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}


// ─── Mount-axis calibration helpers ──────────────────────────────────────────

function computeAxisCalibration(
  gravity: { x: number; y: number; z: number } | null,
  accelSamples: { x: number; y: number; z: number }[]
): MountAxisCalibration {
  const defaultCalib: MountAxisCalibration = {
    longAxis: "y", latAxis: "x", vertAxis: "z", longSign: 1, timestamp: Date.now(),
  };
  if (!gravity || accelSamples.length < 5) return defaultCalib;

  const absG = { x: Math.abs(gravity.x), y: Math.abs(gravity.y), z: Math.abs(gravity.z) };
  const vertAxis: "x" | "y" | "z" =
    absG.x >= absG.y && absG.x >= absG.z ? "x" :
    absG.y >= absG.x && absG.y >= absG.z ? "y" : "z";

  const candidates = (["x", "y", "z"] as const).filter((a) => a !== vertAxis);
  const [candA, candB] = candidates;

  const axisStats = (axis: "x" | "y" | "z") => {
    const mean = accelSamples.reduce((acc, s) => acc + s[axis], 0) / accelSamples.length;
    const variance = accelSamples.reduce((acc, s) => acc + (s[axis] - mean) ** 2, 0) / accelSamples.length;
    return { rms: Math.sqrt(variance), mean };
  };

  const statsA = axisStats(candA);
  const statsB = axisStats(candB);
  const longAxis = statsA.rms >= statsB.rms ? candA : candB;
  const latAxis = longAxis === candA ? candB : candA;
  const longMean = longAxis === candA ? statsA.mean : statsB.mean;
  const longSign: 1 | -1 = longMean >= 0 ? 1 : -1;

  return { longAxis, latAxis, vertAxis, longSign, timestamp: Date.now() };
}

async function loadMountCalibration(): Promise<MountAxisCalibration | null> {
  try {
    const raw = await AsyncStorage.getItem(MOUNT_CALIB_KEY);
    if (raw) return JSON.parse(raw) as MountAxisCalibration;
  } catch {}
  return null;
}

async function saveMountCalibration(c: MountAxisCalibration): Promise<void> {
  try {
    await AsyncStorage.setItem(MOUNT_CALIB_KEY, JSON.stringify(c));
  } catch {}
}

async function clearMountCalibration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MOUNT_CALIB_KEY);
  } catch {}
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  color,
  value,
  label,
}: {
  icon: string;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── SensorOverlayPanel ──────────────────────────────────────────────────────
// Convention note: displayed values use absolute magnitude for lateral/tilt peaks
// (same as DeviceMotion source) so they reflect worst-case lean angle regardless
// of direction. This differs from signed admin "dati finali" contexts where
// direction is preserved. Do not change to signed without aligning the admin screen.

function SensorOverlayPanel({
  currentG,
  currentLateralG,
  currentTiltDeg,
  maxAccelG,
  colors,
  styles: s,
  t,
}: {
  currentG: number;
  currentLateralG: number;
  currentTiltDeg: number;
  maxAccelG: number;
  colors: ReturnType<typeof useColors>["Colors"];
  styles: {
    sensorOverlayPanel: object;
    sensorOverlayItem: object;
    sensorOverlayValue: object;
    sensorOverlayLabel: object;
    sensorOverlaySep: object;
  };
  t: (key: string) => string;
}) {
  return (
    <View style={s.sensorOverlayPanel}>
      <View style={s.sensorOverlayItem}>
        <Text style={[s.sensorOverlayValue, currentG > 0.05 ? { color: colors.success } : currentG < -0.05 ? { color: colors.accentRed } : {}]}>
          {currentG >= 0 ? "+" : ""}{currentG.toFixed(2)}
        </Text>
        <Text style={s.sensorOverlayLabel}>{t("tracking.gLong")}</Text>
      </View>
      <View style={s.sensorOverlaySep} />
      <View style={s.sensorOverlayItem}>
        <Text style={s.sensorOverlayValue}>
          {currentLateralG.toFixed(2)}
        </Text>
        <Text style={s.sensorOverlayLabel}>{t("tracking.gLateral")}</Text>
      </View>
      <View style={s.sensorOverlaySep} />
      <View style={s.sensorOverlayItem}>
        <Text style={[s.sensorOverlayValue, { color: colors.accent }]}>
          {currentTiltDeg.toFixed(1)}°
        </Text>
        <Text style={s.sensorOverlayLabel}>{t("tracking.tiltLive")}</Text>
      </View>
      <View style={s.sensorOverlaySep} />
      <View style={s.sensorOverlayItem}>
        <Text style={[s.sensorOverlayValue, { color: colors.accentRed }]}>
          {maxAccelG.toFixed(2)}
        </Text>
        <Text style={s.sensorOverlayLabel}>{t("tracking.gMaxAccel")}</Text>
      </View>
    </View>
  );
}

// ─── RecordCard ───────────────────────────────────────────────────────────────

function RecordCard({
  item,
  onPublish,
  onDelete,
  onViewRoute,
  onExportGpx,
}: {
  item: RouteRecord;
  onPublish: () => void;
  onDelete: () => void;
  onViewRoute: () => void;
  onExportGpx: () => void;
}) {
  const t = useT();
  const { speedUnit, distanceUnit, timeFormat } = useUnits();
  const dur = item.durationSeconds || 0;
  const locale = getCurrentLocale();
  return (
    <View
      style={[
        styles.recordCard,
        item.isSprint && { borderColor: Colors.accentRed, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.recordHeader}>
        <Ionicons
          name={item.isSprint ? "speedometer" : "flag"}
          size={16}
          color={item.isSprint ? Colors.accentRed : Colors.accent}
        />
        {item.isSprint && (
          <View style={styles.sprintBadge}>
            <Text style={styles.sprintBadgeText}>0-100</Text>
          </View>
        )}
        <Text style={[styles.recordDate, { flex: 1 }]}>
          {new Date(item.createdAt).toLocaleDateString(locale, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          })}
        </Text>
        <TouchableOpacity onPress={onViewRoute} style={[styles.publishIconBtn, { backgroundColor: Colors.accent + "18", marginRight: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }]} activeOpacity={0.7}>
          <Ionicons name="map-outline" size={16} color={Colors.accent} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent }}>{t("tracking.route")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onExportGpx} style={[styles.publishIconBtn, { backgroundColor: Colors.accent + "18", marginRight: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }]} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={16} color={Colors.accent} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent }}>{t("tracking.exportGpx")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPublish} style={styles.publishIconBtn} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={18} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          style={[styles.publishIconBtn, { backgroundColor: Colors.accentRed + "15", marginLeft: 6 }]}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.accentRed} />
        </TouchableOpacity>
      </View>
      {item.isSprint ? (
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {item.sprint0to100Ms != null ? (item.sprint0to100Ms / 1000).toFixed(2) + "s" : "—"}
            </Text>
            <Text style={styles.recordStatLabel}>0→{convertSpeed(100, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatSpeed(item.maxSpeedKmh || 0, speedUnit, 0)}
            </Text>
            <Text style={styles.recordStatLabel}>vel. max</Text>
          </View>
          {item.maxAccelerationG != null && (
            <View style={styles.recordStat}>
              <Text style={styles.recordStatValue}>{item.maxAccelerationG.toFixed(2)}G</Text>
              <Text style={styles.recordStatLabel}>accel. max</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatDistance(item.totalDistanceKm || 0, distanceUnit, 2)}
            </Text>
            <Text style={styles.recordStatLabel}>{t("tracking.distance")}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>{formatHMS(dur * 1000)}</Text>
            <Text style={styles.recordStatLabel}>{t("tracking.duration")}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatSpeed(item.maxSpeedKmh || 0, speedUnit, 0)}
            </Text>
            <Text style={styles.recordStatLabel}>{t("tracking.maxSpeed")}</Text>
          </View>
        </View>
      )}
      {!item.isSprint && (item.gpsBlackoutCount ?? 0) > 0 && (
        <View style={styles.gpsBlackoutRow}>
          <Ionicons name="warning-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.gpsBlackoutText}>
            {`${t("tracking.gpsBlackoutLabel")}: ${item.gpsBlackoutCount} ${t("tracking.gpsBlackoutTimes")} (${item.gpsBlackoutSeconds ?? 0} s ${t("tracking.gpsBlackoutTotal")})`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── RouteMapModal — fullscreen post-ride map ─────────────────────────────────

interface RouteMapModalProps {
  visible: boolean;
  onClose: () => void;
  onCloseAll: () => void;
  points: Array<{ lat: number; lng: number }>;
  tileUrl: string;
  tileMaxZoom: number;
  totalKm: number;
  maxSpeed: number;
  totalMs: number;
  distanceUnit: DistanceUnit;
  speedUnit: SpeedUnit;
  insets: { top: number; bottom: number };
  loading?: boolean;
  routeId?: string | null;
}

function RouteMapModal({
  visible, onClose, onCloseAll, points, tileUrl, tileMaxZoom,
  totalKm, maxSpeed, totalMs, distanceUnit, speedUnit, insets, loading, routeId,
}: RouteMapModalProps) {
  const t = useT();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportGpx = async () => {
    if (!routeId || isExporting) return;
    setIsExporting(true);
    try {
      const url = new URL(`/api/routes/${routeId}/export.gpx`, getApiUrl()).href;
      const resp = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const gpxText = await resp.text();
      const safeName = routeId.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.gpx`;
      await FileSystem.writeAsStringAsync(fileUri, gpxText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/gpx+xml",
          dialogTitle: t("tracking.exportGpx"),
          UTI: "com.topografix.gpx",
        });
      } else {
        Alert.alert("GPX", fileUri);
      }
    } catch (err) {
      console.warn("[BikerLink] GPX export error:", err);
      Alert.alert(t("common.error"), t("tracking.exportGpxError"));
    } finally {
      setIsExporting(false);
    }
  };

  const html = useMemo(
    () => buildLeafletPostRideHtml(tileUrl, tileMaxZoom, Colors.accent, points),
    [tileUrl, tileMaxZoom, points]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        {/* Header */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: Colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}>
          <Ionicons name="map-outline" size={20} color={Colors.accent} />
          <Text style={{
            flex: 1,
            marginLeft: 8,
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
            color: Colors.text,
          }}>{t("tracking.myRoute")}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 12 }}>
                {t("tracking.loadingRoute")}
              </Text>
            </View>
          ) : points.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
              <Ionicons name="map-outline" size={48} color={Colors.textSecondary} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.textSecondary, marginTop: 12 }}>
                {t("tracking.noRoute")}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4, textAlign: "center", paddingHorizontal: 32 }}>
                {t("tracking.noGpsPoints")}
              </Text>
            </View>
          ) : (
            <WebView
              source={{ html, baseUrl: "" }}
              style={{ flex: 1, backgroundColor: "#1a1a1a" }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={["https://*", "http://*", "about:*"]}
              scrollEnabled={false}
              bounces={false}
              overScrollMode="never"
              cacheEnabled={false}
            />
          )}
        </View>

        {/* Stats bar + actions */}
        <View style={{
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: insets.bottom + 8,
        }}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-around",
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}>
            {[
              { icon: "navigate-outline" as const, label: t("tracking.distance"), value: formatDistance(totalKm, distanceUnit, 2) },
              { icon: "flash" as const, label: t("tracking.maxSpeed"), value: formatSpeed(maxSpeed, speedUnit, 1) },
              { icon: "time-outline" as const, label: t("tracking.duration"), value: formatHMS(totalMs) },
            ].map((s) => (
              <View key={s.label} style={{ alignItems: "center", flex: 1 }}>
                <Ionicons name={s.icon} size={18} color={Colors.accent} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginTop: 2 }}>{s.value}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: Colors.surfaceLight,
              }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary }}>
                {t("tracking.backToRide")}
              </Text>
            </TouchableOpacity>
            {!!routeId && (
              <TouchableOpacity
                onPress={handleExportGpx}
                activeOpacity={0.8}
                disabled={isExporting}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: Colors.surfaceLight,
                  opacity: isExporting ? 0.5 : 1,
                }}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accent }}>
                    {t("tracking.exportGpx")}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onCloseAll}
              activeOpacity={0.8}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: Colors.accent,
              }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#ffffff" }}>
                {t("tracking.close")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── MountCalibWizard ─────────────────────────────────────────────────────────

type CalibWizardStep = "intro" | "still" | "accelerate" | "done";

function MountCalibWizard({
  onComplete,
  onDismiss,
}: {
  onComplete: (calib: MountAxisCalibration) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<CalibWizardStep>("intro");
  const [countdown, setCountdown] = useState(3);
  const [progressPct, setProgressPct] = useState(0);
  const [detectedCalib, setDetectedCalib] = useState<MountAxisCalibration | null>(null);

  const gravitySamplesRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const accelSamplesRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const gravityRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const dmSubRef = useRef<{ remove: () => void } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSensors = () => {
    dmSubRef.current?.remove();
    dmSubRef.current = null;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  useEffect(() => () => clearSensors(), []);

  const startStillPhase = () => {
    gravitySamplesRef.current = [];
    setStep("still");
    setCountdown(3);
    setProgressPct(0);
    DeviceMotion.setUpdateInterval(100);
    dmSubRef.current = DeviceMotion.addListener((data) => {
      const ag = data.accelerationIncludingGravity;
      if (ag) {
        gravitySamplesRef.current.push({ x: ag.x ?? 0, y: ag.y ?? 0, z: ag.z ?? 0 });
      }
    });
    const startTime = Date.now();
    const DURATION = 3000;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgressPct(Math.min(elapsed / DURATION, 1));
      setCountdown(Math.max(1, Math.ceil((DURATION - elapsed) / 1000)));
      if (elapsed >= DURATION) {
        clearSensors();
        const smp = gravitySamplesRef.current;
        if (smp.length > 0) {
          const n = smp.length;
          gravityRef.current = {
            x: smp.reduce((a, s) => a + s.x, 0) / n,
            y: smp.reduce((a, s) => a + s.y, 0) / n,
            z: smp.reduce((a, s) => a + s.z, 0) / n,
          };
        }
        startAccelPhase();
      }
    }, 80);
  };

  const startAccelPhase = () => {
    accelSamplesRef.current = [];
    setStep("accelerate");
    setCountdown(3);
    setProgressPct(0);
    DeviceMotion.setUpdateInterval(100);
    dmSubRef.current = DeviceMotion.addListener((data) => {
      const ac = data.acceleration;
      if (ac) {
        accelSamplesRef.current.push({ x: ac.x ?? 0, y: ac.y ?? 0, z: ac.z ?? 0 });
      }
    });
    const startTime = Date.now();
    const DURATION = 3000;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgressPct(Math.min(elapsed / DURATION, 1));
      setCountdown(Math.max(1, Math.ceil((DURATION - elapsed) / 1000)));
      if (elapsed >= DURATION) {
        clearSensors();
        const calib = computeAxisCalibration(gravityRef.current, accelSamplesRef.current);
        setDetectedCalib(calib);
        setStep("done");
      }
    }, 80);
  };

  const axisLabel = (a: "x" | "y" | "z") => a.toUpperCase();

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={calibStyles.overlay}>
        <View style={calibStyles.sheet}>
          {/* Header */}
          <View style={calibStyles.header}>
            <Ionicons name="compass-outline" size={22} color={Colors.accent} />
            <Text style={calibStyles.headerTitle}>{t("tracking.mountCalib.title")}</Text>
            <TouchableOpacity onPress={() => { clearSensors(); onDismiss(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {step === "intro" && (
            <View style={calibStyles.body}>
              <Ionicons name="bicycle-outline" size={48} color={Colors.accent} style={{ alignSelf: "center", marginBottom: 16 }} />
              <Text style={calibStyles.stepTitle}>{t("tracking.mountCalib.introTitle")}</Text>
              <Text style={calibStyles.stepDesc}>{t("tracking.mountCalib.introDesc")}</Text>
              <View style={calibStyles.stepsList}>
                <Text style={calibStyles.stepsItem}>{"1. " + t("tracking.mountCalib.step1")}</Text>
                <Text style={calibStyles.stepsItem}>{"2. " + t("tracking.mountCalib.step2")}</Text>
              </View>
              <TouchableOpacity style={calibStyles.primaryBtn} onPress={startStillPhase} activeOpacity={0.85}>
                <Text style={calibStyles.primaryBtnText}>{t("tracking.mountCalib.startBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {(step === "still" || step === "accelerate") && (
            <View style={calibStyles.body}>
              <Ionicons
                name={step === "still" ? "pause-circle-outline" : "speedometer-outline"}
                size={48}
                color={step === "still" ? Colors.warning : Colors.accentRed}
                style={{ alignSelf: "center", marginBottom: 16 }}
              />
              <Text style={calibStyles.stepTitle}>
                {step === "still" ? t("tracking.mountCalib.stillTitle") : t("tracking.mountCalib.accelTitle")}
              </Text>
              <Text style={calibStyles.stepDesc}>
                {step === "still" ? t("tracking.mountCalib.stillDesc") : t("tracking.mountCalib.accelDesc")}
              </Text>
              {/* Progress bar */}
              <View style={calibStyles.progressBg}>
                <View style={[calibStyles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
              </View>
              <Text style={calibStyles.countdown}>{countdown}s</Text>
            </View>
          )}

          {step === "done" && detectedCalib && (
            <View style={calibStyles.body}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} style={{ alignSelf: "center", marginBottom: 16 }} />
              <Text style={calibStyles.stepTitle}>{t("tracking.mountCalib.doneTitle")}</Text>
              <View style={calibStyles.resultBox}>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.longAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.longAxis)}</Text>
                </View>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.latAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.latAxis)}</Text>
                </View>
                <View style={calibStyles.resultRow}>
                  <Text style={calibStyles.resultLabel}>{t("tracking.mountCalib.vertAxisLabel")}</Text>
                  <Text style={calibStyles.resultValue}>{axisLabel(detectedCalib.vertAxis)}</Text>
                </View>
              </View>
              <Text style={calibStyles.stepDesc}>{t("tracking.mountCalib.doneDesc")}</Text>
              <TouchableOpacity style={calibStyles.primaryBtn} onPress={() => { saveMountCalibration(detectedCalib).catch(() => {}); onComplete(detectedCalib); }} activeOpacity={0.85}>
                <Text style={calibStyles.primaryBtnText}>{t("tracking.mountCalib.confirmBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const calibStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 10,
  },
  stepDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  stepsList: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  stepsItem: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#ffffff",
  },
  progressBg: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    marginVertical: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  countdown: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  resultBox: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  resultValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackingScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { speedUnit, distanceUnit } = useUnits();
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  // Settings
  const [profile, setProfile] = useState<UpdateProfile>("medium");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownSec, setCountdownSec] = useState("10");
  const [handsOffEnabled, setHandsOffEnabled] = useState(false);
  const [handsOffSpeedStr, setHandsOffSpeedStr] = useState("50");
  const [is0100Enabled, setIs0100Enabled] = useState(false);
  const [showMyRoute, setShowMyRoute] = useState(true);
  const [sensorsEnabled, setSensorsEnabled] = useState(false);
  const [showMountCalibWizard, setShowMountCalibWizard] = useState(false);
  const [mountAxisCalib, setMountAxisCalib] = useState<MountAxisCalibration | null>(null);

  // Phase & UI
  const [phase, setPhase] = useState<Phase>("idle");
  const [handsOffActive, setHandsOffActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [summaryRoutePoints, setSummaryRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [routeMapVisible, setRouteMapVisible] = useState(false);
  const [publishRecord, setPublishRecord] = useState<RouteRecord | null>(null);
  const [publishCaption, setPublishCaption] = useState("");
  const [recoveredRecords, setRecoveredRecords] = useState<LocalRouteRecord[]>([]);

  // Ride title (summary modal)
  const [rideTitle, setRideTitle] = useState<string>("");
  const [completedRouteId, setCompletedRouteId] = useState<string | null>(null);

  // Historical route viewer
  const [histMapVisible, setHistMapVisible] = useState(false);
  const [histMapPoints, setHistMapPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [histMapRecord, setHistMapRecord] = useState<RouteRecord | null>(null);
  const [histMapLoading, setHistMapLoading] = useState(false);

  // GPS display
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsLost, setGpsLost] = useState(false);
  const [totalKm, setTotalKm] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [mapCoords, setMapCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentCoord, setCurrentCoord] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Time display
  const [totalMs, setTotalMs] = useState(0);
  const [displayIdleMs, setDisplayIdleMs] = useState(0);

  // Sensor display
  const [currentG, setCurrentG] = useState(0);
  const [currentLateralG, setCurrentLateralG] = useState(0);
  const [currentTiltDeg, setCurrentTiltDeg] = useState(0);
  const [maxAccelG, setMaxAccelG] = useState(0);
  const [maxDecelG, setMaxDecelG] = useState(0);
  const [maxLateralG, setMaxLateralG] = useState(0);
  const [maxTiltDeg, setMaxTiltDeg] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showSensorOverlay, setShowSensorOverlay] = useState(false);

  // Countdown display
  const [countdownValue, setCountdownValue] = useState(0);
  const countdownAnim = useRef(new Animated.Value(1)).current;

  // Sprint
  const [sprintPhase, setSprintPhase] = useState<"waiting" | "measuring" | "done">("waiting");
  const [sprintGoFired, setSprintGoFired] = useState(false);
  const [sprint0to100Ms, setSprint0to100Ms] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const recordAnim = useRef(new Animated.Value(0)).current;
  const personalBestMsRef = useRef<number | null>(null);

  // Buffer display
  const [pointsSent, setPointsSent] = useState(0);
  const [pointsBuffered, setPointsBuffered] = useState(0);

  // Battery drain stats (measured per-device, per-mode)
  const [batteryDrainStats, setBatteryDrainStats] = useState<BatteryDrainStats>({ easy: [], medium: [], race: [] });
  const rideStartBatteryLevelRef = useRef<number | null>(null);
  const rideStartBatteryTimeRef = useRef<number>(0);
  const rideBatteryProfileRef = useRef<UpdateProfile>("medium");

  // Refs
  const profileRef = useRef<UpdateProfile>("medium");
  const handsOffEnabledRef = useRef(false);
  const handsOffSpeedRef = useRef(50);
  const is0100EnabledRef = useRef(false);
  const sensorsEnabledRef = useRef(false);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const bgTrackingActiveRef = useRef(false);
  const bgStartGenRef = useRef(0); // incremented each time we attempt a bg transition; detects stale async completions
  const onNativeLocationRef = useRef<(loc: Location.LocationObject) => void>(() => {});

  const accelSubRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);
  const isPausedRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const totalKmRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const maxAltRef = useRef(0);
  const lastPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const pointsBufferRef = useRef<GpsPoint[]>([]);
  const mapCoordsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const routeIdRef = useRef<string | null>(null);
  const totalPointsSentRef = useRef(0);
  const idleMsRef = useRef(0);
  const idleStartRef = useRef<number | null>(null);
  const isIdleRef = useRef(false);
  const accelBaselineRef = useRef<number | null>(null);
  const accelCalibSamples = useRef<number[]>([]);
  const maxAccelGRef = useRef(0);
  const maxDecelGRef = useRef(0);
  const maxTiltDegRef = useRef(0);
  const currentAccelGRef = useRef(0);
  const currentLateralGRef = useRef(0);
  const currentTiltDegRef = useRef(0);
  const maxLateralGRef = useRef(0);
  const sensorStartingRef = useRef(false);
  const sensorSourceRef = useRef<"deviceMotion" | "accelerometer" | "none">("none");
  const mountAxisCalibRef = useRef<MountAxisCalibration | null>(null);
  const sprintStartTimeRef = useRef<number | null>(null);
  const sprintPhaseRef = useRef<"waiting" | "measuring" | "done">("waiting");
  const sprintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handsOffAnim = useRef(new Animated.Value(1)).current;
  const sprint0to100MsRef = useRef<number | null>(null);
  const countdownTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownGoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emaSpeedRef = useRef<number>(0);
  const gpsOfflineBufferRef = useRef<GpsPoint[]>([]);
  const gpsOfflineWriteCountRef = useRef(0);
  const bufferWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const gpsWasLostRef = useRef(false);
  const gpsBlackoutCountRef = useRef(0);
  const gpsBlackoutSecondsRef = useRef(0);
  const gpsBlackoutStartRef = useRef<number | null>(null);
  const volumePressTimestampsRef = useRef<number[]>([]);
  const lastVolumeRef = useRef<number | null>(null);
  const handsOffDismissedForRideRef = useRef(false);
  const lastAvgSpeedUpdateRef = useRef(0);

  // Background GPS toast
  const totalGpsPointsRef = useRef(0);
  const bgStartPointsRef = useRef(0);
  const bgPointsCountRef = useRef(0);
  const bgToastAnim = useRef(new Animated.Value(0)).current;
  const bgToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bgToastCount, setBgToastCount] = useState(0);
  const [bgToastVisible, setBgToastVisible] = useState(false);
  // Count stored when app returns from background while this tab is not focused,
  // so we can show the toast when the user navigates back to this tab.
  const pendingBgToastCountRef = useRef(0);
  // Ref kept in sync with useIsFocused so the AppState closure can read it.
  const isTabFocused = useIsFocused();
  const isTabFocusedRef = useRef(isTabFocused);
  useEffect(() => { isTabFocusedRef.current = isTabFocused; }, [isTabFocused]);

  // Derived
  const isFermo = currentSpeed <= IDLE_THRESHOLD_KMH;
  const netMs = Math.max(totalMs - displayIdleMs, 0);
  const avgSpeedKmh = netMs > 0 ? totalKm / (netMs / 3600000) : 0;

  // Throttled avg speed — updated only every 6 minutes
  const [avgSpeedDisplayKmh, setAvgSpeedDisplayKmh] = useState(0);
  const accuracyTier = getAccuracyTier(gpsAccuracy);

  // ── Records query ──────────────────────────────────────────────────────────
  const { data: records, refetch: refetchRecords } = useQuery<RouteRecord[]>({
    queryKey: ["/api/routes"],
  });

  // ── Sprint personal best (fetched when 0-100 mode enabled) ────────────────
  const { data: sprintHistory } = useQuery<Array<{ sprint0to100Ms: number | null }>>({
    queryKey: ["/api/sprints"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: is0100Enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (sprintHistory && sprintHistory.length > 0 && sprintHistory[0].sprint0to100Ms != null) {
      personalBestMsRef.current = sprintHistory[0].sprint0to100Ms;
    } else {
      personalBestMsRef.current = null;
    }
  }, [sprintHistory]);

  // ── Load battery drain stats from AsyncStorage on mount ───────────────────
  useEffect(() => {
    loadBatteryDrainStats().then((stats) => setBatteryDrainStats(stats)).catch(() => {});
  }, []);

  // ── Admin flag: sensori telefono visibili ──────────────────────────────────
  const { data: phoneSensorsData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-sensors-enabled"],
    staleTime: 120_000,
  });
  const phoneSensorsAdminEnabled = phoneSensorsData?.enabled === true;
  const completedRecords = (records || []).filter((r) => r.status === "completed");

  // ── Publish mutation ───────────────────────────────────────────────────────
  const publishMutation = useMutation({
    mutationFn: async (data: { performanceData: string; caption: string }) => {
      await apiRequest("POST", "/api/contest/entries", data);
    },
    onSuccess: () => {
      setPublishRecord(null);
      setPublishCaption("");
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
      Alert.alert(t("tracking.published"), t("tracking.publishedMsg"));
    },
    onError: () => Alert.alert(t("common.error"), t("tracking.publishError")),
  });

  // ── 0-100 sprint nav-lock broadcast ──────────────────────────────────────
  useEffect(() => {
    // Only lock navigation when actually measuring (not during countdown)
    const locked = sprintPhase === "measuring";
    setSprintMeasuringBroadcast(locked);
  }, [sprintPhase]);

  // ── Hands-off blink + haptic + global broadcast ───────────────────────────
  useEffect(() => {
    const thresholdKmh = parseFloat(handsOffSpeedStr || "50") || 50;
    setHandsOffBroadcast(handsOffActive, thresholdKmh);
    if (handsOffActive) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(handsOffAnim, {
            toValue: 0.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(handsOffAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      handsOffAnim.setValue(1);
    }
  }, [handsOffActive]);

  // ── Volume down x5 to dismiss Hands-Off (Android only) ───────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!handsOffActive) return;

    volumePressTimestampsRef.current = [];
    lastVolumeRef.current = null;

    VolumeManager.getVolume().then((vol) => {
      const v = typeof vol === "object" && vol !== null ? (vol as { volume: number }).volume : (vol as number);
      lastVolumeRef.current = v;
    }).catch(() => {});

    const subscription = VolumeManager.addVolumeListener((result) => {
      const currentVol = result.volume;
      const prevVol = lastVolumeRef.current;
      lastVolumeRef.current = currentVol;

      if (prevVol !== null && currentVol < prevVol) {
        const now = Date.now();
        volumePressTimestampsRef.current.push(now);
        volumePressTimestampsRef.current = volumePressTimestampsRef.current.filter(
          (t) => now - t <= 3000
        );
        if (volumePressTimestampsRef.current.length >= 5) {
          volumePressTimestampsRef.current = [];
          handsOffDismissedForRideRef.current = true;
          setHandsOffActive(false);
          setHandsOffBroadcast(false, parseFloat(handsOffSpeedStr || "50") || 50);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handsOffActive, handsOffSpeedStr]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupTracking();
    };
  }, []);

  // ── GPS pre-warm ───────────────────────────────────────────────────────────
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === "granted") {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then((loc) => setGpsAccuracy(loc.coords.accuracy ?? null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // ── Background GPS toast helper ────────────────────────────────────────────
  const showBgPointsToast = useCallback((count: number) => {
    if (count <= 0) return;
    if (bgToastTimerRef.current) clearTimeout(bgToastTimerRef.current);
    setBgToastCount(count);
    setBgToastVisible(true);
    bgToastAnim.setValue(0);
    Animated.timing(bgToastAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    bgToastTimerRef.current = setTimeout(() => {
      Animated.timing(bgToastAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setBgToastVisible(false));
    }, 3500);
  }, [bgToastAnim]);

  // ── AppState listener — background GPS point summary + battery-aware switch ─
  useEffect(() => {
    // Track previous state so we can distinguish outgoing vs incoming inactive.
    // iOS lifecycle: active → inactive → background (going to bg)
    //                background → inactive → active (coming to fg)
    // We must only save bgStartPointsRef on the OUTGOING transition (active→*)
    // and never overwrite it on the incoming inactive→active path.
    const prevAppStateRef = { current: AppState.currentState };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = prevAppStateRef.current;
      prevAppStateRef.current = nextState;

      // Going to background: only when coming FROM active state (Android uses "background"; iOS goes active→inactive→background)
      if (prevState === "active" && nextState === "background" && Platform.OS === "android") {
        bgStartPointsRef.current = totalGpsPointsRef.current;
        // Switch to battery-saving background task with foreground service notification
        if (phaseRef.current === "active") {
          // Increment generation so we can detect if foreground return races with this async
          bgStartGenRef.current += 1;
          const myGen = bgStartGenRef.current;
          void (async () => {
            // 1. Check background permission FIRST — do not touch foreground watch if denied
            const { status } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: "undetermined" as const }));
            if (status !== "granted" || bgStartGenRef.current !== myGen) return;

            // 2. Clear any stale pending background points BEFORE starting the task
            //    to avoid early-fire race where new points mix with old data
            await AsyncStorage.setItem(BG_POINTS_KEY, "[]").catch(() => {});
            if (bgStartGenRef.current !== myGen) return;

            // 3. Try to start background task BEFORE stopping the foreground watch
            //    so there is no window without location tracking
            const bgConfig = getModeConfigBackground(profileRef.current);
            const bgTitle = t("tracking.bgNotification.title");
            const bgBody = profileRef.current === "easy" ? t("tracking.bgNotification.easy") : profileRef.current === "medium" ? t("tracking.bgNotification.standard") : t("tracking.bgNotification.race");
            // Persist config so the background task can rebuild the notification with the live point count
            await AsyncStorage.setItem(BG_NOTIF_CONFIG_KEY, JSON.stringify({
              title: bgTitle,
              body: bgBody,
              pointsLabel: t("tracking.bgNotification.pointsCount"),
              accuracy: bgConfig.accuracy,
              timeInterval: bgConfig.timeInterval,
              distanceInterval: bgConfig.distanceInterval,
            })).catch(() => {});
            const started = await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: bgConfig.accuracy,
              timeInterval: bgConfig.timeInterval,
              distanceInterval: bgConfig.distanceInterval,
              foregroundService: {
                notificationTitle: bgTitle,
                notificationBody: bgBody,
                notificationColor: "#FF6600",
                killServiceOnDestroy: false,
              },
              pausesUpdatesAutomatically: false,
              activityType: Location.ActivityType.AutomotiveNavigation,
            }).then(() => true).catch(() => false);

            if (!started) return; // Failed to start — keep foreground watch alive

            // Stale-check: app may have returned to foreground while startLocationUpdatesAsync was awaited
            if (bgStartGenRef.current !== myGen) {
              // Foreground return happened — clean up the background task we just started
              Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
              return;
            }

            // 4. Only stop foreground watch after background task is confirmed running and still needed
            if (watchSubRef.current) {
              watchSubRef.current.remove();
              watchSubRef.current = null;
            }
            // Mark background tracking as active (only on confirmed success)
            bgTrackingActiveRef.current = true;
          })();
        }
      }

      if (prevState === "active" && nextState === "inactive") {
        // iOS: save background start point on the outgoing transition
        bgStartPointsRef.current = totalGpsPointsRef.current;
      }

      // Returning to foreground: nextState active, previous was non-active
      if (nextState === "active" && prevState !== "active") {
        // Invalidate any in-flight background-start async (cancellation token)
        bgStartGenRef.current += 1;

        const wasBgActive = bgTrackingActiveRef.current && phaseRef.current === "active";
        if (wasBgActive) bgTrackingActiveRef.current = false;

        // Defer the bg-task teardown, point merge, and toast to an async IIFE so
        // the merge happens BEFORE we compute the toast count — otherwise
        // totalGpsPointsRef hasn't been incremented yet and the toast would
        // always show 0 on Android (the bg task writes only to AsyncStorage).
        void (async () => {
          // 1. If background task was running, stop it and resume foreground watch
          if (wasBgActive) {
            const hasTask = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
            if (hasTask) {
              await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
            }
            const fgConfig = getModeConfig(profileRef.current);
            const fgSub = await Location.watchPositionAsync(
              { accuracy: fgConfig.accuracy, timeInterval: fgConfig.timeInterval, distanceInterval: fgConfig.distanceInterval },
              onNativeLocationRef.current,
            ).catch(() => null);
            if (fgSub) watchSubRef.current = fgSub;
          }

          // 2. Drain accumulated background points and merge them through
          //    onNativeLocation so they contribute to distance, route map
          //    coords, offline GPS buffer, and eventual server upload — exactly
          //    like foreground points. Done unconditionally so points written
          //    by the bg task aren't lost when wasBgActive is false (e.g. the
          //    bg task fired right before we got the foreground event).
          //    onNativeLocation internally drops the sample unless
          //    phaseRef.current === "active" and the ride isn't paused, so
          //    it's safe to call in any phase (paused / countdown / idle
          //    samples are no-ops and just get cleared from the key).
          try {
            const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
            const bgPoints: { latitude: number; longitude: number; altitude: number; speedKmh: number; timestamp: string }[] =
              raw ? JSON.parse(raw) : [];
            for (const pt of bgPoints) {
              // Reconstruct a LocationObject so onNativeLocation processes it
              // identically to a foreground sample: haversine distance,
              // mapCoords, batch buffer, offline append, flush.
              const fakeLoc: Location.LocationObject = {
                coords: {
                  latitude: pt.latitude,
                  longitude: pt.longitude,
                  altitude: pt.altitude,
                  speed: pt.speedKmh / 3.6,
                  accuracy: null,
                  altitudeAccuracy: null,
                  heading: null,
                },
                timestamp: new Date(pt.timestamp).getTime(),
              };
              onNativeLocationRef.current(fakeLoc);
            }
            await AsyncStorage.setItem(BG_POINTS_KEY, "[]").catch(() => {});
          } catch {}

          // 3. Toast count — computed AFTER the merge so the delta reflects
          //    the points that were just merged in (totalGpsPointsRef is
          //    incremented inside onNativeLocation).
          if (phaseRef.current === "active" || phaseRef.current === "paused") {
            const acquired = totalGpsPointsRef.current - bgStartPointsRef.current;
            bgPointsCountRef.current = acquired;
            if (acquired > 0) {
              if (isTabFocusedRef.current) {
                showBgPointsToast(acquired);
              } else {
                pendingBgToastCountRef.current += acquired;
              }
            }
          }
          bgStartPointsRef.current = 0;
        })();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      if (bgToastTimerRef.current) clearTimeout(bgToastTimerRef.current);
    };
  }, [showBgPointsToast]);

  // ── Show deferred bg-points toast when tab gains focus ────────────────────
  useFocusEffect(
    useCallback(() => {
      const pending = pendingBgToastCountRef.current;
      if (pending > 0) {
        pendingBgToastCountRef.current = 0;
        showBgPointsToast(pending);
      }
    }, [showBgPointsToast])
  );

  // ── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => {
    handsOffEnabledRef.current = handsOffEnabled;
    handsOffSpeedRef.current = parseFloat(handsOffSpeedStr || "50") || 50;
  }, [handsOffEnabled, handsOffSpeedStr]);
  useEffect(() => {
    is0100EnabledRef.current = is0100Enabled;
    if (is0100Enabled) {
      setProfile("race");
      profileRef.current = "race";
    }
  }, [is0100Enabled]);
  const sensorsHydratedRef = useRef(false);
  useEffect(() => {
    sensorsEnabledRef.current = sensorsEnabled;
    if (sensorsHydratedRef.current) {
      AsyncStorage.setItem("@bikerlink/sensors_enabled", sensorsEnabled ? "1" : "0").catch(() => {});
    }
  }, [sensorsEnabled]);
  useEffect(() => {
    AsyncStorage.getItem("@bikerlink/sensors_enabled").then((v) => {
      sensorsHydratedRef.current = true;
      if (v === "1") setSensorsEnabled(true);
    }).catch(() => { sensorsHydratedRef.current = true; });
  }, []);

  // ── Load mount-axis calibration from AsyncStorage on mount ────────────────
  useEffect(() => {
    loadMountCalibration().then((c) => {
      if (c) {
        mountAxisCalibRef.current = c;
        setMountAxisCalib(c);
      }
    }).catch(() => {});
  }, []);

  // ── Offline GPS buffer helpers (true-append: one key per batch segment) ────
  //
  // DESIGN NOTE: Instead of a single key @bikerlink/gps_buffer (full-rewrite on
  // every flush), we use a segmented scheme:
  //   GPS_BUFFER_SEGCOUNT_KEY  → stringified integer N (number of segments written)
  //   GPS_BUFFER_SEG_KEY(0..N-1) → JSON array of GpsPoint (up to WRITE_EVERY each)
  //
  // Rationale: true append — each flush writes exactly ONE new segment key and
  // increments the counter; previous segments are never touched. This eliminates
  // full-array rewrites and is safe for long rides. All writes are serialized via
  // bufferWriteQueueRef to prevent concurrent segcount read-modify-write races.
  //
  // Recovery: SEGCOUNT → multiGet(all seg keys) → flatMap(points) → haversine stats.
  // Recovered ride summaries live in component state only (session-scoped); for
  // persistent cross-session storage, see follow-up task #739 (server sync).

  // Serialized via bufferWriteQueueRef to prevent concurrent segcount reads
  const appendSegmentToBuffer = useCallback((batch: GpsPoint[]) => {
    bufferWriteQueueRef.current = bufferWriteQueueRef.current.then(async () => {
      try {
        const rawN = await AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY);
        const n = rawN ? parseInt(rawN, 10) : 0;
        await AsyncStorage.setItem(GPS_BUFFER_SEG_KEY(n), JSON.stringify(batch));
        await AsyncStorage.setItem(GPS_BUFFER_SEGCOUNT_KEY, String(n + 1));
      } catch (_) {}
    });
  }, []);

  const clearGpsBuffer = useCallback(async () => {
    gpsOfflineBufferRef.current = [];
    gpsOfflineWriteCountRef.current = 0;
    try {
      const rawN = await AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY);
      const n = rawN ? parseInt(rawN, 10) : 0;
      const keys = [
        GPS_BUFFER_SEGCOUNT_KEY,
        ...Array.from({ length: n }, (_, i) => GPS_BUFFER_SEG_KEY(i)),
      ];
      await AsyncStorage.multiRemove(keys);
    } catch (_) {}
  }, []);

  const appendPointToOfflineBuffer = useCallback(
    (point: GpsPoint) => {
      gpsOfflineBufferRef.current.push(point);
      gpsOfflineWriteCountRef.current += 1;
      if (gpsOfflineWriteCountRef.current >= GPS_BUFFER_WRITE_EVERY) {
        const batch = gpsOfflineBufferRef.current.slice(-GPS_BUFFER_WRITE_EVERY);
        gpsOfflineWriteCountRef.current = 0;
        appendSegmentToBuffer(batch);
      }
    },
    [appendSegmentToBuffer]
  );

  // Flush any remaining in-memory points (1–4) that haven't reached batch threshold.
  // Called before stopTrackingInternal PUT and on cleanup so no acquired points are lost.
  const flushRemainingToBuffer = useCallback(async () => {
    const rem = gpsOfflineWriteCountRef.current;
    if (rem <= 0) return;
    const batch = gpsOfflineBufferRef.current.slice(-rem);
    gpsOfflineWriteCountRef.current = 0;
    appendSegmentToBuffer(batch);
    // Wait for the serialized queue to drain so the segment is persisted
    await bufferWriteQueueRef.current;
  }, [appendSegmentToBuffer]);

  // ── Check for orphan buffer on mount ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const rawN = await AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY);
        if (!rawN) return;
        const segCount = parseInt(rawN, 10);
        if (!segCount || segCount <= 0) {
          await AsyncStorage.removeItem(GPS_BUFFER_SEGCOUNT_KEY);
          return;
        }

        // Read all segments in one multiGet call
        const segKeys = Array.from({ length: segCount }, (_, i) => GPS_BUFFER_SEG_KEY(i));
        const pairs = await AsyncStorage.multiGet(segKeys);
        const points: GpsPoint[] = pairs.flatMap(([, val]) => {
          if (!val) return [];
          try { return JSON.parse(val) as GpsPoint[]; } catch { return []; }
        });

        // Auto-discard trivial traces
        const allKeys = [GPS_BUFFER_SEGCOUNT_KEY, ...segKeys];
        if (points.length <= 3) {
          await AsyncStorage.multiRemove(allKeys);
          return;
        }

        Alert.alert(
          t("tracking.interruptedRideTitle"),
          `${t("tracking.interruptedRideBody1")} ${points.length} ${t("tracking.interruptedRideBody2")}`,
          [
            {
              text: t("tracking.discardRide"),
              style: "destructive",
              onPress: async () => {
                await AsyncStorage.multiRemove(allKeys);
              },
            },
            {
              text: t("tracking.recoverRide"),
              onPress: () => {
                let totalDistKm = 0;
                let maxSpeedKmh = 0;

                for (let i = 0; i < points.length; i++) {
                  const p = points[i];
                  if (i > 0) {
                    const prev = points[i - 1];
                    const d = haversineKm(
                      prev.latitude, prev.longitude,
                      p.latitude, p.longitude
                    );
                    if (d > 0.001 && d < 1) totalDistKm += d;
                  }
                  if (p.speedKmh > maxSpeedKmh) maxSpeedKmh = p.speedKmh;
                }

                const firstTs = new Date(points[0].timestamp).getTime();
                const lastTs = new Date(points[points.length - 1].timestamp).getTime();
                const durationSec = Math.max(Math.round((lastTs - firstTs) / 1000), 1);
                // avgSpeedKmh = distance / time (consistent with normal stop logic)
                const avgSpeedKmh = durationSec > 0
                  ? (totalDistKm / (durationSec / 3600))
                  : 0;

                const recovered: LocalRouteRecord = {
                  id: `recovered-${Date.now()}`,
                  totalDistanceKm: totalDistKm,
                  maxSpeedKmh: maxSpeedKmh,
                  avgSpeedKmh: avgSpeedKmh,
                  durationSeconds: durationSec,
                  status: "completed",
                  createdAt: points[0].timestamp,
                  isRecovered: true,
                  notes: "(recuperato)",
                };

                setRecoveredRecords((prev) => [recovered, ...prev]);
                AsyncStorage.multiRemove(allKeys).catch(() => {});
              },
            },
          ],
          { cancelable: false }
        );
      } catch (_) {}
    })();
  }, []); // only on mount

  // ── Flush GPS points ───────────────────────────────────────────────────────
  const flushPoints = useCallback(async () => {
    const rId = routeIdRef.current;
    if (!rId || pointsBufferRef.current.length === 0) return;
    // During active sprint: keep points buffered locally; send only after completion
    if (is0100EnabledRef.current && sprintPhaseRef.current !== "done") return;
    const toSend = [...pointsBufferRef.current];
    pointsBufferRef.current = [];
    setPointsBuffered(0);
    try {
      await apiRequest("POST", `/api/routes/${rId}/points`, { points: toSend });
      totalPointsSentRef.current += toSend.length;
      setPointsSent(totalPointsSentRef.current);
    } catch (e) {
      logGpsError(e, "flushPoints", { routeId: rId ?? undefined });
      pointsBufferRef.current = [...toSend, ...pointsBufferRef.current];
      setPointsBuffered(pointsBufferRef.current.length);
    }
  }, []);

  // ── Native GPS handler ─────────────────────────────────────────────────────
  const onNativeLocation = useCallback(
    (loc: Location.LocationObject) => {
      if (isPausedRef.current || phaseRef.current !== "active") return;

      const { latitude, longitude, altitude, speed, accuracy } = loc.coords;
      const now = loc.timestamp;
      const speedKmh = speed !== null && speed >= 0 ? speed * 3.6 : 0;
      const smoothedSpeed = emaSpeedRef.current * 0.7 + speedKmh * 0.3;
      emaSpeedRef.current = smoothedSpeed;

      setCurrentSpeed(smoothedSpeed);
      setGpsAccuracy(accuracy ?? null);

      if (handsOffEnabledRef.current && !handsOffDismissedForRideRef.current) {
        setHandsOffActive(speedKmh > handsOffSpeedRef.current);
      }

      if (speedKmh <= IDLE_THRESHOLD_KMH) {
        if (!isIdleRef.current) {
          isIdleRef.current = true;
          idleStartRef.current = now;
        }
      } else {
        if (isIdleRef.current && idleStartRef.current !== null) {
          idleMsRef.current += now - idleStartRef.current;
          idleStartRef.current = null;
        }
        isIdleRef.current = false;
      }

      // Distance — only accumulate with valid GPS samples (accuracy <= 30m or unknown)
      const alt = altitude ?? 0;
      const coordAccuracyOk = accuracy === null || accuracy === undefined || accuracy <= 30;
      if (coordAccuracyOk && lastPosRef.current) {
        const dist = haversineKm(
          lastPosRef.current.lat,
          lastPosRef.current.lng,
          latitude,
          longitude
        );
        if (dist > 0.001 && dist < 1) {
          totalKmRef.current += dist;
          setTotalKm(totalKmRef.current);
        }
      }
      if (coordAccuracyOk) {
        lastPosRef.current = { lat: latitude, lng: longitude, time: now };
      }

      // Throttle avg speed display — update only every 6 minutes
      const _avgNow = Date.now();
      if (_avgNow - lastAvgSpeedUpdateRef.current >= 360000) {
        const _netMs = Math.max(
          _avgNow - startTimeRef.current - pausedMsRef.current - idleMsRef.current,
          0
        );
        if (_netMs > 0) setAvgSpeedDisplayKmh(totalKmRef.current / (_netMs / 3600000));
        lastAvgSpeedUpdateRef.current = _avgNow;
      }

      // Max speed — only update with valid GPS samples (accuracy <= 30m or unknown)
      if (coordAccuracyOk && speedKmh <= 300 && speedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = speedKmh;
        setMaxSpeed(speedKmh);
      }
      if (alt > maxAltRef.current) {
        maxAltRef.current = alt;
        setMaxAltitude(alt);
      }

      const coord = { latitude, longitude };
      mapCoordsRef.current.push(coord);
      if (mapCoordsRef.current.length % 3 === 0) {
        setMapCoords([...mapCoordsRef.current]);
      }
      setCurrentCoord(coord);

      // Sprint 0-100
      if (is0100EnabledRef.current) {
        // Only use GPS samples with reasonable accuracy for sprint detection
        const accuracyOk = accuracy === null || accuracy === undefined || accuracy <= 25;
        if (accuracyOk) {
          if (sprintPhaseRef.current === "waiting" && speedKmh > 1) {
            sprintPhaseRef.current = "measuring";
            sprintStartTimeRef.current = now;
            setSprintPhase("measuring");
          }
          // Detection always uses km/h internally (100 km/h ≈ 62.1 mph), matching the
          // UI label which converts 100 km/h to the user's preferred unit via convertSpeed().
          if (sprintPhaseRef.current === "measuring" && speedKmh >= 100) {
            // Sprint completed — cancel the 30s timeout
            if (sprintTimeoutRef.current) {
              clearTimeout(sprintTimeoutRef.current);
              sprintTimeoutRef.current = null;
            }
            const elapsed = now - (sprintStartTimeRef.current ?? now);
            sprint0to100MsRef.current = elapsed;
            setSprint0to100Ms(elapsed);
            sprintPhaseRef.current = "done";
            setSprintPhase("done");
            // Persist sprint result to dedicated sprint_results table
            apiRequest("POST", "/api/sprints", {
              sprint0to100Ms: elapsed,
              maxAccelerationG: maxAccelGRef.current > 0 ? maxAccelGRef.current : null,
              maxDecelerationG: maxDecelGRef.current > 0 ? maxDecelGRef.current : null,
              maxTiltDeg: maxTiltDegRef.current > 0 ? maxTiltDegRef.current : null,
              routeId: routeIdRef.current,
            })
              .then(() => queryClient.invalidateQueries({ queryKey: ["/api/sprints"] }))
              .catch((err) => console.warn("[Sprint] save failed:", err));
            // Check if this is a new personal best
            const prevBest = personalBestMsRef.current;
            if (prevBest === null || elapsed < prevBest) {
              setIsNewRecord(true);
              Animated.sequence([
                Animated.spring(recordAnim, { toValue: 1, useNativeDriver: true }),
                Animated.delay(3000),
                Animated.timing(recordAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
              ]).start();
            }
            stopTrackingInternal();
            return;
          }
        }
      }

      const point: GpsPoint = {
        latitude,
        longitude,
        altitude: alt,
        speedKmh,
        timestamp: new Date(now).toISOString(),
        // Include per-point sensor data whenever calibration is complete —
        // decoupled from sensorsEnabled (display preference) so traces are
        // always recorded during any trip when DeviceMotion/Accelerometer is active.
        ...(accelBaselineRef.current !== null
          ? { accelG: currentAccelGRef.current, tiltDeg: currentTiltDegRef.current }
          : {}),
      };
      pointsBufferRef.current.push(point);
      setPointsBuffered(pointsBufferRef.current.length);
      if (pointsBufferRef.current.length >= BATCH_SIZE) {
        flushPoints();
      }
      appendPointToOfflineBuffer(point);
      totalGpsPointsRef.current += 1;
    },
    [flushPoints, appendPointToOfflineBuffer]
  );

  // Keep stable ref so the AppState effect (background switch) can call it without changing deps
  useEffect(() => { onNativeLocationRef.current = onNativeLocation; }, [onNativeLocation]);

  // ── Cleanup all subscriptions ──────────────────────────────────────────────
  const cleanupTracking = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (gpsHeartbeatTimerRef.current) {
      clearInterval(gpsHeartbeatTimerRef.current);
      gpsHeartbeatTimerRef.current = null;
    }
    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    // Stop background location task if it was running
    if (bgTrackingActiveRef.current) {
      bgTrackingActiveRef.current = false;
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .then((hasTask) => { if (hasTask) Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {}); })
        .catch(() => {});
    }
    setTrackingActive(false);
    setGpsLost(false);
    pendingBgToastCountRef.current = 0;
  }, []);

  // ── Discard sprint attempt (no save) — called on 30s timeout or manual cancel ──
  const discardSprintAttempt = useCallback(() => {
    // Cancel all pending timers (countdown interval + GO! delay + 30s timeout)
    if (countdownTickRef.current) {
      clearInterval(countdownTickRef.current);
      countdownTickRef.current = null;
    }
    if (countdownGoTimeoutRef.current) {
      clearTimeout(countdownGoTimeoutRef.current);
      countdownGoTimeoutRef.current = null;
    }
    if (sprintTimeoutRef.current) {
      clearTimeout(sprintTimeoutRef.current);
      sprintTimeoutRef.current = null;
    }
    cleanupTracking();
    const failedId = routeIdRef.current;
    routeIdRef.current = null;
    phaseRef.current = "idle";
    setPhase("idle");
    setSprintMeasuringBroadcast(false);
    // Clear all in-memory point buffers (no trace locally)
    pointsBufferRef.current = [];
    setPointsBuffered(0);
    gpsOfflineBufferRef.current = [];
    gpsOfflineWriteCountRef.current = 0;
    // Delete the route that was created (no trace on server)
    if (failedId) {
      apiRequest("DELETE", `/api/routes/${failedId}`).catch(() => {});
    }
    // Clear GPS offline segments from AsyncStorage (fire-and-forget)
    AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY).then((rawN) => {
      const n = rawN ? parseInt(rawN, 10) : 0;
      const keys = [
        GPS_BUFFER_SEGCOUNT_KEY,
        ...Array.from({ length: n }, (_, i) => GPS_BUFFER_SEG_KEY(i)),
      ];
      return AsyncStorage.multiRemove(keys);
    }).catch(() => {});
    sprintPhaseRef.current = "waiting";
    sprint0to100MsRef.current = null;
    sprintStartTimeRef.current = null;
    setSprintPhase("waiting");
    setSprint0to100Ms(null);
  }, [cleanupTracking]);

  // ── Reset tracking state ───────────────────────────────────────────────────
  const resetTrackingState = useCallback(() => {
    setCurrentSpeed(0);
    setTotalKm(0);
    setMaxSpeed(0);
    setMaxAltitude(0);
    setMapCoords([]);
    setCurrentCoord(null);
    setTotalMs(0);
    setDisplayIdleMs(0);
    setCurrentG(0);
    setCurrentLateralG(0);
    setCurrentTiltDeg(0);
    setMaxAccelG(0);
    setMaxDecelG(0);
    setMaxLateralG(0);
    setMaxTiltDeg(0);
    setShowSensorOverlay(false);
    setPointsBuffered(0);
    setPointsSent(0);
    setSprintPhase("waiting");
    setSprint0to100Ms(null);
    setIsNewRecord(false);
    recordAnim.setValue(0);
    setAvgSpeedDisplayKmh(0);

    totalKmRef.current = 0;
    maxSpeedRef.current = 0;
    maxAltRef.current = 0;
    lastPosRef.current = null;
    pointsBufferRef.current = [];
    mapCoordsRef.current = [];
    routeIdRef.current = null;
    totalPointsSentRef.current = 0;
    idleMsRef.current = 0;
    idleStartRef.current = null;
    isIdleRef.current = false;
    accelBaselineRef.current = null;
    accelCalibSamples.current = [];
    maxAccelGRef.current = 0;
    maxDecelGRef.current = 0;
    maxTiltDegRef.current = 0;
    maxLateralGRef.current = 0;
    sensorStartingRef.current = false;
    sprintStartTimeRef.current = null;
    sprintPhaseRef.current = "waiting";
    setSprintGoFired(false);
    sprint0to100MsRef.current = null;
    emaSpeedRef.current = 0;
    lastAvgSpeedUpdateRef.current = 0;
    pausedMsRef.current = 0;
    isPausedRef.current = false;
    setIsCalibrating(false);
    gpsOfflineBufferRef.current = [];
    gpsOfflineWriteCountRef.current = 0;
    bufferWriteQueueRef.current = Promise.resolve();
    gpsWasLostRef.current = false;
    gpsBlackoutCountRef.current = 0;
    gpsBlackoutSecondsRef.current = 0;
    pendingBgToastCountRef.current = 0;
    gpsBlackoutStartRef.current = null;
    volumePressTimestampsRef.current = [];
    lastVolumeRef.current = null;
    handsOffDismissedForRideRef.current = false;
    totalGpsPointsRef.current = 0;
    bgStartPointsRef.current = 0;
    bgPointsCountRef.current = 0;
    if (sprintTimeoutRef.current) {
      clearTimeout(sprintTimeoutRef.current);
      sprintTimeoutRef.current = null;
    }
    if (countdownTickRef.current) {
      clearInterval(countdownTickRef.current);
      countdownTickRef.current = null;
    }
    if (countdownGoTimeoutRef.current) {
      clearTimeout(countdownGoTimeoutRef.current);
      countdownGoTimeoutRef.current = null;
    }
  }, []);

  // ── Recalibrate G on-demand ────────────────────────────────────────────────
  const handleRecalibrate = useCallback(() => {
    // Reset peak aggregates regardless of sensor source
    maxAccelGRef.current = 0;
    maxDecelGRef.current = 0;
    maxTiltDegRef.current = 0;
    maxLateralGRef.current = 0;
    setMaxAccelG(0);
    setMaxDecelG(0);
    setMaxTiltDeg(0);
    setMaxLateralG(0);
    setCurrentG(0);
    setCurrentLateralG(0);
    setCurrentTiltDeg(0);
    setShowSensorOverlay(false);

    if (sensorSourceRef.current === "accelerometer") {
      // Accelerometer path requires gravity re-calibration
      setIsCalibrating(true);
      accelBaselineRef.current = null;
      accelCalibSamples.current = [];
    }
    // DeviceMotion path: no baseline needed — gravity is already separated by the OS.
    // Peaks are reset above; live values will update naturally on next sample.
  }, []);

  // ── Start DeviceMotion sensor (with Accelerometer fallback) ───────────────
  const startDeviceMotion = useCallback(async () => {
    // Always attempt DeviceMotion — data is always collected regardless of display preference.
    // sensorsEnabled only controls overlay/stats visibility, not data collection.
    // Guard against duplicate subscriptions if called twice before first resolves
    if (accelSubRef.current || sensorStartingRef.current) return;
    sensorStartingRef.current = true;
    // 100ms in race or sprint mode for higher resolution; 250ms otherwise
    const interval = (is0100EnabledRef.current || profileRef.current === "race") ? 100 : 250;

    // Try DeviceMotion first — it provides gravity-separated acceleration and
    // rotation angles so no manual calibration is needed.
    let deviceMotionAvailable = false;
    try {
      deviceMotionAvailable = await DeviceMotion.isAvailableAsync();
    } catch (_) {}

    if (deviceMotionAvailable) {
      try {
        DeviceMotion.setUpdateInterval(interval);
        // Mark calibrated immediately — DeviceMotion already removes gravity
        accelBaselineRef.current = 0;
        setIsCalibrating(false);
        let sampleCount = 0;
        const sub = DeviceMotion.addListener((data) => {
          const G = 9.81; // m/s² per G
          let gLong = 0;
          let gLat = 0;
          let tiltDeg = 0;

          if (data.acceleration) {
            // acceleration = user-exerted component, gravity removed, in m/s²
            const calib = mountAxisCalibRef.current;
            if (calib) {
              gLong = (data.acceleration[calib.longAxis] ?? 0) / G * calib.longSign;
              gLat = Math.abs((data.acceleration[calib.latAxis] ?? 0) / G);
            } else {
              gLong = (data.acceleration.y ?? 0) / G; // longitudinal: accel/braking
              gLat = Math.abs((data.acceleration.x ?? 0) / G); // lateral
            }
          }

          if (data.rotation) {
            // gamma = lean angle around the front-back axis, in radians
            tiltDeg = Math.abs((data.rotation.gamma ?? 0) * (180 / Math.PI));
          } else if (data.accelerationIncludingGravity) {
            const ag = data.accelerationIncludingGravity;
            const calib = mountAxisCalibRef.current;
            if (calib) {
              tiltDeg = Math.atan2(
                Math.abs(ag[calib.latAxis] ?? 0),
                Math.abs(ag[calib.vertAxis] ?? 0)
              ) * (180 / Math.PI);
            } else {
              tiltDeg = Math.atan2(
                Math.abs(ag.x ?? 0),
                Math.abs(ag.z ?? 0)
              ) * (180 / Math.PI);
            }
          }

          currentAccelGRef.current = gLong;
          currentLateralGRef.current = gLat;
          currentTiltDegRef.current = tiltDeg;
          // Deadzone filtering: ignore noise below minimum thresholds
          if (gLong > 0.05 && gLong > maxAccelGRef.current) maxAccelGRef.current = gLong;
          if (-gLong > 0.05 && -gLong > maxDecelGRef.current) maxDecelGRef.current = -gLong;
          if (gLat > 0.1 && gLat > maxLateralGRef.current) maxLateralGRef.current = gLat;
          if (tiltDeg > 2 && tiltDeg > maxTiltDegRef.current) maxTiltDegRef.current = tiltDeg;

          sampleCount++;
          const highFreq = is0100EnabledRef.current || profileRef.current === "race";
          if (highFreq || sampleCount % 2 === 0) {
            setCurrentG(gLong);
            setCurrentLateralG(gLat);
            setCurrentTiltDeg(tiltDeg);
            setMaxAccelG(maxAccelGRef.current);
            setMaxDecelG(maxDecelGRef.current);
            setMaxLateralG(maxLateralGRef.current);
            setMaxTiltDeg(maxTiltDegRef.current);
          }
        });
        accelSubRef.current = sub;
        sensorStartingRef.current = false;
        sensorSourceRef.current = "deviceMotion";
        return; // DeviceMotion successfully started
      } catch (e) {
        logGpsError(e, "startDeviceMotion");
      }
    }
    // If we reach here DeviceMotion failed and we fall through to Accelerometer
    // sensorStartingRef stays true until Accelerometer subscription is set

    // Fallback: raw Accelerometer (requires gravity calibration)
    try {
      Accelerometer.setUpdateInterval(interval);
      setIsCalibrating(true);
      let sampleCount = 0;
      const sub = Accelerometer.addListener(({ x, y, z }) => {
        const rawVals: Record<"x" | "y" | "z", number> = { x, y, z };
        const calib = mountAxisCalibRef.current;
        const longAxis = calib ? calib.longAxis : "y" as const;
        const latAxis = calib ? calib.latAxis : "x" as const;
        const vertAxis = calib ? calib.vertAxis : "z" as const;
        if (accelBaselineRef.current === null) {
          accelCalibSamples.current.push(rawVals[longAxis]);
          if (accelCalibSamples.current.length >= 20) {
            const sum = accelCalibSamples.current.reduce((a, b) => a + b, 0);
            accelBaselineRef.current = sum / accelCalibSamples.current.length;
            setIsCalibrating(false);
          }
          return;
        }
        sampleCount++;
        const longRaw = rawVals[longAxis];
        const latRaw = rawVals[latAxis];
        const vertRaw = rawVals[vertAxis];
        const baseline = accelBaselineRef.current ?? 0;
        const gLong = calib ? calib.longSign * (longRaw - baseline) : (longRaw - baseline);
        const gLat = Math.abs(latRaw);
        const tiltDeg = Math.atan2(Math.abs(latRaw), Math.abs(vertRaw)) * (180 / Math.PI);
        currentAccelGRef.current = gLong;
        currentLateralGRef.current = gLat;
        currentTiltDegRef.current = tiltDeg;
        // Deadzone filtering: ignore noise below minimum thresholds
        if (gLong > 0.05 && gLong > maxAccelGRef.current) maxAccelGRef.current = gLong;
        if (-gLong > 0.05 && -gLong > maxDecelGRef.current) maxDecelGRef.current = -gLong;
        if (gLat > 0.1 && gLat > maxLateralGRef.current) maxLateralGRef.current = gLat;
        if (tiltDeg > 2 && tiltDeg > maxTiltDegRef.current) maxTiltDegRef.current = tiltDeg;
        const highFreq = is0100EnabledRef.current || profileRef.current === "race";
        if (highFreq || sampleCount % 2 === 0) {
          setCurrentG(gLong);
          setCurrentLateralG(gLat);
          setCurrentTiltDeg(tiltDeg);
          setMaxAccelG(maxAccelGRef.current);
          setMaxDecelG(maxDecelGRef.current);
          setMaxLateralG(maxLateralGRef.current);
          setMaxTiltDeg(maxTiltDegRef.current);
        }
      });
      accelSubRef.current = sub;
      sensorStartingRef.current = false;
      sensorSourceRef.current = "accelerometer";
    } catch (e) {
      sensorStartingRef.current = false;
      sensorSourceRef.current = "none";
      setIsCalibrating(false); // Ensure overlay panel is not stuck hidden if no sensor is available
      logGpsError(e, "startAccelerometer-fallback");
    }
  }, []);

  // ── Begin active tracking (called after countdown) ─────────────────────────
  const beginActiveTracking = useCallback(async () => {
    phaseRef.current = "active";
    setPhase("active");
    startTimeRef.current = Date.now();

    // Capture battery level at ride start for drain measurement
    rideStartBatteryLevelRef.current = null;
    rideStartBatteryTimeRef.current = Date.now();
    rideBatteryProfileRef.current = profileRef.current;
    try {
      if (Platform.OS !== "web") {
        const level = await Battery.getBatteryLevelAsync();
        if (level >= 0) {
          rideStartBatteryLevelRef.current = level;
          if (__DEV__) console.log(`[BikerLink] Battery at ride start: ${(level * 100).toFixed(1)}% (profile=${profileRef.current})`);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn("[BikerLink] Battery read at ride start failed:", e);
    }
    lastAvgSpeedUpdateRef.current = Date.now(); // first avg update after 6 minutes

    timerRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      const now = Date.now();
      const elapsed = now - startTimeRef.current - pausedMsRef.current;
      setTotalMs(elapsed);
      if (isIdleRef.current && idleStartRef.current !== null) {
        setDisplayIdleMs(idleMsRef.current + (now - idleStartRef.current));
      } else {
        setDisplayIdleMs(idleMsRef.current);
      }
      // GPS signal loss detection: if last known position is older than 15 s
      const lastGpsAge = lastPosRef.current
        ? now - lastPosRef.current.time
        : now - startTimeRef.current;
      const isNowLost = lastGpsAge > GPS_SIGNAL_TIMEOUT_MS;
      const wasLost = gpsWasLostRef.current;
      if (!wasLost && isNowLost) {
        gpsBlackoutStartRef.current = now;
        gpsBlackoutCountRef.current += 1;
      } else if (wasLost && !isNowLost && gpsBlackoutStartRef.current !== null) {
        gpsBlackoutSecondsRef.current += Math.round((now - gpsBlackoutStartRef.current) / 1000);
        gpsBlackoutStartRef.current = null;
      }
      gpsWasLostRef.current = isNowLost;
      setGpsLost(isNowLost);
    }, 100);

    flushTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) flushPoints();
    }, BATCH_FLUSH_MS);

    // Heartbeat GPS (Task #856): invia almeno 1 punto GPS ogni 30s.
    // Fix per linea dritta nel percorso quando i batch falliscono per connessione instabile.
    // Usa lastPosRef (coordinata più recente) e emaSpeedRef (velocità EMA corrente).
    gpsHeartbeatTimerRef.current = setInterval(() => {
      if (isPausedRef.current || phaseRef.current !== "active") return;
      const pos = lastPosRef.current;
      if (!pos) return;
      const point: GpsPoint = {
        latitude: pos.lat,
        longitude: pos.lng,
        altitude: 0,
        speedKmh: Math.round(emaSpeedRef.current * 10) / 10,
        timestamp: new Date(pos.time).toISOString(),
      };
      pointsBufferRef.current.push(point);
      setPointsBuffered(pointsBufferRef.current.length);
      flushPoints();
    }, BATCH_FLUSH_MS);

    // Avvia sensori solo se non già attivi (potrebbe essere già partito durante il countdown)
    if (!accelSubRef.current) {
      startDeviceMotion();
    }

    const config = getModeConfig(profileRef.current);
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: config.accuracy,
            timeInterval: config.timeInterval,
            distanceInterval: config.distanceInterval,
          },
          onNativeLocation
        );
        watchSubRef.current = sub;
      } catch (e) {
        logGpsError(e, "watchPositionAsync");
        cleanupTracking();
        phaseRef.current = "idle";
        setPhase("idle");
        const failedId = routeIdRef.current;
        routeIdRef.current = null;
        if (failedId) apiRequest("DELETE", `/api/routes/${failedId}`).catch(() => {});
        Alert.alert(t("tracking.gpsUnavailable"), t("tracking.gpsUnavailableMsg"));
        return;
      }

    setTrackingActive(true);
  }, [startDeviceMotion, onNativeLocation, flushPoints, cleanupTracking]);

  // ── Handle START ───────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== "granted") {
          Alert.alert(t("tracking.gpsDenied"), t("tracking.gpsDeniedMsg"));
          return;
        }
      }

      resetTrackingState();
      // Clear any orphan buffer segments from a previous failed session
      // so they don't mix with the new ride's points
      await clearGpsBuffer();

      const routeRes = await apiRequest("POST", "/api/routes", {
        trackingFrequency: profile === "race" ? 1 : profile === "easy" ? 3 : 2,
        isSprint: is0100EnabledRef.current,
      });
      const route = (await routeRes.json()) as RouteRecord;
      routeIdRef.current = route.id;

      // When 0-100 is active, always force countdown to 10s
      const effectiveCountdownSecs = is0100Enabled
        ? 10
        : countdownEnabled
        ? Math.max(parseInt(countdownSec, 10) || 10, 0)
        : 0;

      if (effectiveCountdownSecs > 0) {
        setCountdownValue(effectiveCountdownSecs);
        phaseRef.current = "countdown";
        setPhase("countdown");

        // Avvia sensori durante il countdown (warmup) — evita freeze al GO
        startDeviceMotion();

        let remaining = effectiveCountdownSecs;
        countdownTickRef.current = setInterval(() => {
          remaining -= 1;
          setCountdownValue(remaining);

          Animated.sequence([
            Animated.timing(countdownAnim, {
              toValue: 0.75,
              duration: 80,
              useNativeDriver: true,
            }),
            Animated.spring(countdownAnim, {
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();

          if (remaining <= 0) {
            if (countdownTickRef.current) {
              clearInterval(countdownTickRef.current);
              countdownTickRef.current = null;
            }
            // Show sensor overlay immediately at GO! in sprint mode
            if (is0100EnabledRef.current) setSprintGoFired(true);
            // Pause 800ms on "GO!" before starting active tracking
            countdownGoTimeoutRef.current = setTimeout(() => {
              countdownGoTimeoutRef.current = null;
              beginActiveTracking()
                .then(() => {
                  // Start the 30s sprint timeout after GO! fires
                  if (is0100EnabledRef.current) {
                    if (sprintTimeoutRef.current) clearTimeout(sprintTimeoutRef.current);
                    sprintTimeoutRef.current = setTimeout(() => {
                      sprintTimeoutRef.current = null;
                      // 30s elapsed and speed never hit 100 — discard silently
                      if (sprintPhaseRef.current !== "done") {
                        discardSprintAttempt();
                      }
                    }, 30000);
                  }
                })
                .catch((e) => {
                  logGpsError(e, "beginActiveTracking-from-countdown");
                });
            }, 800);
          }
        }, 1000);
      } else {
        await beginActiveTracking();
      }
    } catch (e) {
      logGpsError(e, "handleStart");
      Alert.alert(t("common.error"), t("tracking.startError"));
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    profile,
    is0100Enabled,
    countdownEnabled,
    countdownSec,
    resetTrackingState,
    clearGpsBuffer,
    beginActiveTracking,
    startDeviceMotion,
    countdownAnim,
    discardSprintAttempt,
  ]);

  // ── Handle PAUSE / RESUME ──────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    if (isPausedRef.current) {
      const pauseDuration = Date.now() - pauseStartRef.current;
      pausedMsRef.current += pauseDuration;
      isPausedRef.current = false;
      phaseRef.current = "active";
      setPhase("active");
    } else {
      isPausedRef.current = true;
      pauseStartRef.current = Date.now();
      phaseRef.current = "paused";
      setPhase("paused");
    }
  }, []);

  // ── Internal stop (called from sprint auto-stop) ───────────────────────────
  const stopTrackingInternal = useCallback(async () => {
    if (isIdleRef.current && idleStartRef.current !== null) {
      idleMsRef.current += Date.now() - idleStartRef.current;
      idleStartRef.current = null;
    }

    // Measure battery drain before cleaning up
    const stopTime = Date.now();
    const rideStartBattery = rideStartBatteryLevelRef.current;
    const rideStartTime = rideStartBatteryTimeRef.current;
    const rideDurationMs = stopTime - rideStartTime;
    const rideDurationMinutes = rideDurationMs / 60000;
    if (
      Platform.OS !== "web" &&
      rideStartBattery !== null &&
      rideDurationMinutes >= BATTERY_MIN_RIDE_MINUTES
    ) {
      try {
        const endLevel = await Battery.getBatteryLevelAsync();
        if (__DEV__) console.log(`[BikerLink] Battery at ride stop: ${(endLevel * 100).toFixed(1)}% (start=${(rideStartBattery * 100).toFixed(1)}%)`);
        if (endLevel >= 0 && endLevel <= rideStartBattery) {
          const drainFraction = rideStartBattery - endLevel;
          const drainPercent = drainFraction * 100;
          const rideDurationHours = rideDurationMs / 3600000;
          const drainPerHour = drainPercent / rideDurationHours;
          // Sanity check: ignore implausible values (>30%/h or <0.1%/h)
          if (drainPerHour >= 0.1 && drainPerHour <= 30) {
            const updatedStats = await appendBatteryDrainSample(rideBatteryProfileRef.current, drainPerHour);
            setBatteryDrainStats(updatedStats);
          } else if (__DEV__) {
            console.warn(`[BikerLink] Battery drain out of sanity range — ${drainPerHour.toFixed(2)}%/h, skipping sample`);
          }
        } else if (__DEV__) {
          console.warn(`[BikerLink] Battery end level (${endLevel}) >= start (${rideStartBattery}) — skipping sample (possibly charging)`);
        }
      } catch (e) {
        if (__DEV__) console.warn("[BikerLink] Battery read at ride stop failed:", e);
      }
    }
    rideStartBatteryLevelRef.current = null;

    cleanupTracking();
    phaseRef.current = "idle";
    setPhase("idle");
    setHandsOffActive(false);

    await flushPoints();

    const rId = routeIdRef.current;
    if (!rId) return;

    const finalTotalSec = Math.floor(
      (Date.now() - startTimeRef.current - pausedMsRef.current) / 1000
    );
    const finalIdleSec = Math.round(idleMsRef.current / 1000);
    const finalNetSec = Math.max(finalTotalSec - finalIdleSec, 0);
    const finalAvgSpeed = finalNetSec > 0 ? totalKmRef.current / (finalNetSec / 3600) : 0;

    // Persist any in-memory points that haven't reached the 5-point batch threshold yet
    await flushRemainingToBuffer();

    // Close out any GPS blackout period still active at stop time
    if (gpsBlackoutStartRef.current !== null) {
      gpsBlackoutSecondsRef.current += Math.round((Date.now() - gpsBlackoutStartRef.current) / 1000);
      gpsBlackoutStartRef.current = null;
    }

    try {
      await apiRequest("PUT", `/api/routes/${rId}/stop`, {
        totalDistanceKm: totalKmRef.current,
        maxSpeedKmh: maxSpeedRef.current,
        avgSpeedKmh: finalAvgSpeed,
        maxAltitude: maxAltRef.current,
        durationSeconds: finalTotalSec,
        idleTimeSeconds: finalIdleSec,
        maxAccelerationG: maxAccelGRef.current > 0 ? maxAccelGRef.current : null,
        maxDecelerationG: maxDecelGRef.current > 0 ? maxDecelGRef.current : null,
        maxLateralG: maxLateralGRef.current > 0 ? maxLateralGRef.current : null,
        maxTiltDeg: maxTiltDegRef.current > 0 ? maxTiltDegRef.current : null,
        sprint0to100Ms: sprint0to100MsRef.current,
        gpsBlackoutCount: gpsBlackoutCountRef.current,
        gpsBlackoutSeconds: gpsBlackoutSecondsRef.current,
      });
      await clearGpsBuffer();
      await refetchRecords();
      // Capture route points for "Vedi percorso" in Summary Modal
      setSummaryRoutePoints(
        mapCoordsRef.current.map((c) => ({ lat: c.latitude, lng: c.longitude }))
      );
      const now = new Date();
      const pad2 = (n: number) => n.toString().padStart(2, "0");
      setRideTitle(`${t("tracking.rideDefaultPrefix")} ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)} · ${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
      setCompletedRouteId(rId);
      setSummaryVisible(true);
    } catch (e) {
      logGpsError(e, "stopTracking:PUT", { routeId: rId });
      // Buffer intentionally NOT cleared on PUT failure:
      // the segmented buffer remains in AsyncStorage and will be offered
      // for recovery the next time the app launches.
    }
  }, [cleanupTracking, flushPoints, flushRemainingToBuffer, refetchRecords, clearGpsBuffer]);

  // ── Handle STOP (user-initiated) ───────────────────────────────────────────
  const handleStop = useCallback(() => {
    Alert.alert(t("tracking.stopConfirmTitle"), t("tracking.stopConfirmMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("tracking.stopConfirmBtn"), style: "destructive", onPress: stopTrackingInternal },
    ]);
  }, [stopTrackingInternal]);

  // ── Handle publish ─────────────────────────────────────────────────────────
  const handlePublish = useCallback(() => {
    if (!publishRecord) return;
    const perfData = JSON.stringify({
      totalDistanceKm: publishRecord.totalDistanceKm || 0,
      maxSpeedKmh: publishRecord.maxSpeedKmh || 0,
      avgSpeedKmh: publishRecord.avgSpeedKmh || 0,
      maxAltitude: publishRecord.maxAltitude || 0,
      durationSeconds: publishRecord.durationSeconds || 0,
      date: publishRecord.createdAt,
    });
    publishMutation.mutate({ performanceData: perfData, caption: publishCaption });
  }, [publishRecord, publishCaption, publishMutation]);

  // ── View historical route ──────────────────────────────────────────────────
  const handleViewHistoricalRoute = useCallback(async (record: RouteRecord) => {
    setHistMapRecord(record);
    setHistMapLoading(true);
    setHistMapVisible(true);
    try {
      const res = await apiRequest("GET", `/api/routes/${record.id}`);
      const data: { points?: Array<{ latitude?: number; longitude?: number; lat?: number; lng?: number }> } = await res.json();
      const pts = (data.points ?? [])
        .map((p) => ({ lat: p.latitude ?? p.lat, lng: p.longitude ?? p.lng }))
        .filter((p): p is { lat: number; lng: number } =>
          typeof p.lat === "number" && isFinite(p.lat) &&
          typeof p.lng === "number" && isFinite(p.lng)
        );
      setHistMapPoints(pts);
    } catch (_) {
      Alert.alert(t("common.error"), t("tracking.loadError"));
      setHistMapVisible(false);
      setHistMapRecord(null);
    } finally {
      setHistMapLoading(false);
    }
  }, []);

  // ── Countdown colors ───────────────────────────────────────────────────────
  const countdownColor =
    countdownValue > 3
      ? "#ffffff"
      : countdownValue >= 1
      ? "#FFD700"
      : "#00E676";

  const countdownFontSize = countdownValue === 0 ? 144 : 96;

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top },
      ]}
    >
      {/* ── Hands Off overlay (covers tab bar via Modal) ─────────────────── */}
      <Modal
        visible={handsOffActive}
        transparent
        statusBarTranslucent
        animationType="fade"
      >
        <View style={styles.handsOffBg} pointerEvents="box-only">
          <Animated.View style={[styles.handsOffContent, { opacity: handsOffAnim }]}>
            <Ionicons name="hand-left" size={72} color="#ef4444" />
            <Text style={styles.handsOffTitle}>⚠ ATTENZIONE!</Text>
            <Text style={styles.handsOffMsg}>VELOCITÀ HANDS OFF RAGGIUNTA!</Text>
          </Animated.View>
          <View style={styles.handsOffInfo}>
            <Text style={styles.handsOffSpeed}>{convertSpeed(currentSpeed, speedUnit).toFixed(0)}</Text>
            <Text style={styles.handsOffUnit}>{speedUnitLabel(speedUnit)}</Text>
            <Text style={styles.handsOffSub}>
              Tocchi bloccati sopra {convertSpeed(parseFloat(handsOffSpeedStr || "50") || 50, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)}
            </Text>
            <Text style={styles.handsOffSub}>
              Si riattivano quando rallenti
            </Text>
            <Text style={styles.handsOffHint}>
              Abbassa 5 volte velocemente il volume per disattivare
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── COUNTDOWN ────────────────────────────────────────────────────── */}
      {phase === "countdown" && (
        <View style={styles.countdownContainer}>
          <Animated.Text
            style={[
              styles.countdownNumber,
              {
                color: countdownColor,
                fontSize: countdownFontSize,
                transform: [{ scale: countdownAnim }],
              },
            ]}
          >
            {countdownValue === 0 ? "GO!" : countdownValue.toString()}
          </Animated.Text>
          {countdownValue > 0 && (
            <Text style={styles.countdownSub}>Preparati...</Text>
          )}
          {is0100Enabled && (
            <TouchableOpacity
              style={styles.countdownCancelBtn}
              onPress={discardSprintAttempt}
              activeOpacity={0.8}
            >
              <Text style={styles.countdownCancelText}>Annulla</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── ACTIVE / PAUSED ──────────────────────────────────────────────── */}
      {(phase === "active" || phase === "paused") && (
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
                  {/* G max card with recalibrate button — only when sensors enabled */}
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
                    {phase === "active" && !isCalibrating && (
                      <TouchableOpacity
                        onPress={handleRecalibrate}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.recalibrateLink}>Ricalibra</Text>
                      </TouchableOpacity>
                    )}
                  </View>}
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

            {/* ── Race Mode sensor overlay ─────────────────────────────── */}
            {profile === "race" && !is0100Enabled && (
              <>
                {/* Toggle row */}
                <TouchableOpacity
                  style={styles.sensorOverlayToggleRow}
                  onPress={() => setShowSensorOverlay((v) => !v)}
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

                {/* Live sensor panel */}
                {showSensorOverlay && !isCalibrating && (
                  <SensorOverlayPanel
                    currentG={currentG}
                    currentLateralG={currentLateralG}
                    currentTiltDeg={currentTiltDeg}
                    maxAccelG={maxAccelG}
                    colors={Colors}
                    styles={styles}
                    t={t}
                  />
                )}
              </>
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
                      onPress={() => setShowSensorOverlay((v) => !v)}
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
      )}

      {/* ── MAP FULLSCREEN MODAL ─────────────────────────────────────────── */}
      <Modal
        visible={mapModalVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMapModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#000" }}
          activeOpacity={1}
          onPress={() => setMapModalVisible(false)}
        >
          {currentCoord !== null && (
            <TrackingMap points={mapCoords} currentLocation={currentCoord} />
          )}
          <View style={styles.mapModalSpeed}>
            <Text style={styles.mapModalSpeedValue}>
              {convertSpeed(currentSpeed, speedUnit).toFixed(0)}
            </Text>
            <Text style={styles.mapModalSpeedUnit}>{speedUnitLabel(speedUnit)}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── IDLE (pre-start) ─────────────────────────────────────────────── */}
      {phase === "idle" && (
        <ScrollView
          contentContainerStyle={[
            styles.idleScroll,
            {
              paddingBottom:
                insets.bottom + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Ionicons
            name="speedometer"
            size={28}
            color={Colors.accent}
            style={styles.headerIcon}
          />

          {/* GPS Profile */}
          <View style={styles.profileSection}>
            <Text style={styles.profileTitle}>
              FREQUENZA DI AGGIORNAMENTO GPS
            </Text>
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
                    profileRef.current = p;
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
                    {(() => {
                      const measured = getMeasuredDrainPerHour(batteryDrainStats, p);
                      const isMeasured = measured !== null;
                      const valueText = isMeasured
                        ? `${measured.toFixed(1)}%/h`
                        : `~${getStaticBatteryDrainPerHour(p)}%/h`;
                      const labelText = isMeasured
                        ? t("tracking.battery.measured")
                        : t("tracking.battery.estimated");
                      return (
                        <View style={{ flexDirection: "column" as const, alignItems: "flex-start" as const }}>
                          <Text
                            style={[
                              styles.profileBtnBattery,
                              profile === p && styles.profileBtnBatteryActive,
                            ]}
                          >
                            {valueText}
                          </Text>
                          <Text
                            style={{
                              fontSize: 8,
                              fontFamily: "Inter_400Regular" as const,
                              color: isMeasured
                                ? (profile === p ? Colors.success : Colors.success + "99")
                                : (profile === p ? Colors.textSecondary : Colors.textSecondary + "77"),
                              fontStyle: "italic" as const,
                            }}
                          >
                            {labelText}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.profileBatteryNote}>
              {batteryDrainStats.easy.length > 0 || batteryDrainStats.medium.length > 0 || batteryDrainStats.race.length > 0
                ? t("tracking.batteryMeasuredNote")
                : t("tracking.batteryEstimateNote")}
            </Text>
            <View style={styles.profileWarning}>
              <Ionicons name="warning-outline" size={14} color={Colors.warning} />
              <Text style={styles.profileWarningText}>
                {t("tracking.precisionNote")}
              </Text>
            </View>
          </View>

          {/* Triggers */}
          <View style={styles.triggersSection}>
            {/* Countdown */}
            <View style={[styles.triggerRow, is0100Enabled && { opacity: 0.6 }]}>
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="timer-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.triggerLabel}>{t("tracking.countdown")}</Text>
              </View>
              <TextInput
                style={[
                  styles.triggerInput,
                  !countdownEnabled && !is0100Enabled && { opacity: 0.4 },
                ]}
                value={is0100Enabled ? "10" : countdownSec}
                onChangeText={(v) =>
                  setCountdownSec(v.replace(/[^0-9]/g, "").slice(0, 2))
                }
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={Colors.textSecondary}
                maxLength={2}
                editable={countdownEnabled && !is0100Enabled}
              />
              <Switch
                value={is0100Enabled || countdownEnabled}
                onValueChange={is0100Enabled ? undefined : setCountdownEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={is0100Enabled || countdownEnabled ? Colors.accent : Colors.textSecondary}
                disabled={is0100Enabled}
              />
            </View>

            {/* Hands Off */}
            <View style={styles.triggerRow}>
              <View style={[styles.triggerLeft, { flex: 1 }]}>
                <Ionicons
                  name="hand-left-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <View>
                  <Text style={styles.triggerLabel}>{t("tracking.handsOff")}</Text>
                  <Text style={styles.triggerDesc}>
                    {t("tracking.handsOffDesc")}
                  </Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.triggerInput,
                  !handsOffEnabled && { opacity: 0.4 },
                ]}
                value={handsOffSpeedStr}
                onChangeText={(v) =>
                  setHandsOffSpeedStr(v.replace(/[^0-9]/g, "").slice(0, 3))
                }
                keyboardType="numeric"
                placeholder="50"
                placeholderTextColor={Colors.textSecondary}
                maxLength={3}
                editable={handsOffEnabled}
              />
              <Switch
                value={handsOffEnabled}
                onValueChange={setHandsOffEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={
                  handsOffEnabled ? Colors.accent : Colors.textSecondary
                }
              />
            </View>

            {/* 0-100 */}
            <View style={styles.triggerRow}>
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="speedometer-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <View>
                  <Text style={styles.triggerLabel}>0-{convertSpeed(100, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)}</Text>
                  {is0100Enabled && (
                    <Text style={[styles.triggerDesc, { color: Colors.accent }]}>
                      {t("tracking.forceRaceMode")}
                    </Text>
                  )}
                </View>
              </View>
              <Switch
                value={is0100Enabled}
                onValueChange={setIs0100Enabled}
                trackColor={{
                  false: Colors.border,
                  true: Colors.accentRed + "80",
                }}
                thumbColor={
                  is0100Enabled ? Colors.accentRed : Colors.textSecondary
                }
              />
            </View>

            {/* Show My Route — toggle reale */}
            <TouchableOpacity
              style={[styles.triggerRow, is0100Enabled && { opacity: 0.4 }]}
              onPress={() => !is0100Enabled && setShowMyRoute((v) => !v)}
              activeOpacity={0.7}
              disabled={is0100Enabled}
            >
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="map-outline"
                  size={18}
                  color={showMyRoute && !is0100Enabled ? Colors.accent : Colors.textSecondary}
                />
                <Text style={styles.triggerLabel}>Mostra percorso</Text>
              </View>
              <Switch
                value={showMyRoute && !is0100Enabled}
                onValueChange={is0100Enabled ? undefined : setShowMyRoute}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accent }}
                thumbColor="#ffffff"
                disabled={is0100Enabled}
              />
            </TouchableOpacity>

            {/* Sensori telefono (G-force) — BETA — visibile solo se abilitato da admin */}
            {phoneSensorsAdminEnabled && (
            <TouchableOpacity
              style={[styles.triggerRow, { opacity: sensorsEnabled ? 1 : 0.7 }]}
              onPress={() => {
                const next = !sensorsEnabled;
                setSensorsEnabled(next);
                if (next && !mountAxisCalibRef.current) {
                  setShowMountCalibWizard(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="pulse-outline"
                  size={18}
                  color={sensorsEnabled ? Colors.accentRed : Colors.textSecondary}
                />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.triggerLabel}>Sensori telefono (G)</Text>
                  <View style={{ backgroundColor: Colors.warning + "30", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.warning, letterSpacing: 0.5 }}>BETA</Text>
                  </View>
                </View>
              </View>
              <Switch
                value={sensorsEnabled}
                onValueChange={setSensorsEnabled}
                trackColor={{ false: Colors.border, true: Colors.accentRed + "80" }}
                thumbColor={sensorsEnabled ? Colors.accentRed : Colors.textSecondary}
              />
            </TouchableOpacity>
            )}

            {/* Mount calibration row — only when sensors are enabled */}
            {phoneSensorsAdminEnabled && sensorsEnabled && (
              <View style={[styles.triggerRow, { borderBottomWidth: 0 }]}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                  onPress={() => setShowMountCalibWizard(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.triggerLeft}>
                    <Ionicons
                      name="compass-outline"
                      size={18}
                      color={mountAxisCalib ? Colors.success : Colors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.triggerLabel}>{t("tracking.mountCalib.calibrateBtn")}</Text>
                      {mountAxisCalib ? (
                        <Text style={{ fontFamily: "Inter_400Regular" as const, fontSize: 11, color: Colors.success, marginTop: 1 }}>
                          {t("tracking.mountCalib.calibratedBadge")} · {mountAxisCalib.longAxis.toUpperCase()}/{mountAxisCalib.latAxis.toUpperCase()}
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: "Inter_400Regular" as const, fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                          {t("tracking.mountCalib.notCalibrated")}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                {mountAxisCalib && (
                  <TouchableOpacity
                    onPress={() => {
                      clearMountCalibration().catch(() => {});
                      mountAxisCalibRef.current = null;
                      setMountAxisCalib(null);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
                    style={{ paddingLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* START button */}
          <View style={styles.startBtnContainer}>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStart}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <Ionicons name="play" size={64} color="#ffffff" />
              )}
            </TouchableOpacity>
            <Text style={styles.startBtnLabel}>Tocca per iniziare</Text>
          </View>

          {/* Recovered records (offline-only, not synced) */}
          {recoveredRecords.length > 0 && (
            <View style={styles.recordsSection}>
              <Text style={styles.sectionTitle}>Giri recuperati</Text>
              {recoveredRecords.map((item) => (
                <View key={item.id} style={[styles.statCard, { flexDirection: "column", alignItems: "flex-start", gap: 6 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.warning }}>
                      {item.notes}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setRecoveredRecords((prev) => prev.filter((r) => r.id !== item.id))
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: "auto" }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.statValue}>
                    {formatDistance(item.totalDistanceKm ?? 0, distanceUnit, 2)}
                  </Text>
                  <Text style={styles.statLabel}>
                    Vel. max {formatSpeed(item.maxSpeedKmh ?? 0, speedUnit, 1)} ·{" "}
                    {formatHMS((item.durationSeconds ?? 0) * 1000)}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                    {new Date(item.createdAt).toLocaleString(getCurrentLocale())}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Completed records */}
          {completedRecords.length > 0 && (
            <View style={styles.recordsSection}>
              <Text style={styles.sectionTitle}>I miei giri</Text>
              {completedRecords.map((item) => (
                <RecordCard
                  key={item.id}
                  item={item}
                  onViewRoute={() => handleViewHistoricalRoute(item)}
                  onPublish={() => {
                    setPublishRecord(item);
                    setPublishCaption("");
                  }}
                  onDelete={() => {
                    Alert.alert(
                      t("tracking.deleteRecordTitle"),
                      t("tracking.deleteRecordConfirm"),
                      [
                        { text: t("common.cancel"), style: "cancel" },
                        {
                          text: t("common.delete"),
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await apiRequest("DELETE", `/api/routes/${item.id}`);
                              queryClient.invalidateQueries({
                                queryKey: ["/api/routes"],
                              });
                            } catch {
                              Alert.alert(t("common.error"), t("tracking.deleteRecordError"));
                            }
                          },
                        },
                      ]
                    );
                  }}
                  onExportGpx={async () => {
                    try {
                      const url = new URL(`/api/routes/${item.id}/export.gpx`, getApiUrl()).href;
                      const resp = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
                      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                      const gpxText = await resp.text();
                      const safeName = (item.title ?? item.id).replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
                      const fileUri = `${FileSystem.cacheDirectory}${safeName}.gpx`;
                      await FileSystem.writeAsStringAsync(fileUri, gpxText, {
                        encoding: FileSystem.EncodingType.UTF8,
                      });
                      const canShare = await Sharing.isAvailableAsync();
                      if (canShare) {
                        await Sharing.shareAsync(fileUri, {
                          mimeType: "application/gpx+xml",
                          dialogTitle: t("tracking.exportGpx"),
                          UTI: "com.topografix.gpx",
                        });
                      } else {
                        Alert.alert("GPX", fileUri);
                      }
                    } catch (err) {
                      console.warn("[BikerLink] GPX export error:", err);
                      Alert.alert(t("common.error"), t("tracking.exportGpxError"));
                    }
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── SUMMARY MODAL ────────────────────────────────────────────────── */}
      <Modal
        visible={summaryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryVisible(false)}
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
                  <View style={[styles.statCard, { opacity: 0 }]} />
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
                onPress={async () => {
                  // Auto-save titolo prima di aprire il modal di pubblicazione (Task #856)
                  if (completedRouteId && rideTitle.trim()) {
                    try {
                      await apiRequest("PATCH", `/api/routes/${completedRouteId}/title`, {
                        title: rideTitle.trim(),
                      });
                      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
                    } catch (err) {
                      console.warn("[BikerLink] auto-save title before publish failed:", err);
                    }
                  }
                  setSummaryVisible(false);
                  const last = completedRecords[0];
                  if (last) {
                    setPublishRecord(last);
                    setPublishCaption("");
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={18} color="#ffffff" />
                <Text style={styles.summaryPublishText}>{t("tracking.publish")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.summaryDeleteBtn}
                onPress={() => {
                  const last = completedRecords[0];
                  if (!last) { setSummaryVisible(false); return; }
                  Alert.alert(
                    t("tracking.deleteRideTitle"),
                    t("tracking.deleteRideConfirm"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      {
                        text: t("common.delete"),
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await apiRequest("DELETE", `/api/routes/${last.id}`);
                            queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
                          } catch (_) {}
                          setSummaryVisible(false);
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.summaryDeleteText}>{t("common.delete")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.summaryCloseBtn}
                onPress={async () => {
                  if (completedRouteId && rideTitle.trim()) {
                    try {
                      await apiRequest("PATCH", `/api/routes/${completedRouteId}/title`, {
                        title: rideTitle.trim(),
                      });
                      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
                    } catch (_) {}
                  }
                  setSummaryVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.summaryCloseText}>{t("tracking.close")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── ROUTE MAP MODAL ──────────────────────────────────────────────── */}
      <RouteMapModal
        visible={routeMapVisible}
        onClose={() => setRouteMapVisible(false)}
        onCloseAll={() => {
          setRouteMapVisible(false);
          setSummaryVisible(false);
        }}
        points={summaryRoutePoints}
        tileUrl={tileConfig.urlTemplate}
        tileMaxZoom={tileConfig.maximumZ}
        totalKm={totalKm}
        maxSpeed={maxSpeed}
        totalMs={totalMs}
        distanceUnit={distanceUnit}
        speedUnit={speedUnit}
        insets={insets}
        routeId={completedRouteId}
      />

      {/* ── HISTORICAL ROUTE MAP MODAL ────────────────────────────────────── */}
      <RouteMapModal
        visible={histMapVisible}
        onClose={() => { setHistMapVisible(false); setHistMapPoints([]); setHistMapRecord(null); }}
        onCloseAll={() => { setHistMapVisible(false); setHistMapPoints([]); setHistMapRecord(null); }}
        points={histMapPoints}
        tileUrl={tileConfig.urlTemplate}
        tileMaxZoom={tileConfig.maximumZ}
        totalKm={histMapRecord?.totalDistanceKm ?? 0}
        maxSpeed={histMapRecord?.maxSpeedKmh ?? 0}
        totalMs={(histMapRecord?.durationSeconds ?? 0) * 1000}
        distanceUnit={distanceUnit}
        speedUnit={speedUnit}
        insets={insets}
        loading={histMapLoading}
        routeId={histMapRecord?.id ?? null}
      />

      {/* ── MOUNT CALIBRATION WIZARD ─────────────────────────────────────── */}
      {showMountCalibWizard && (
        <MountCalibWizard
          onComplete={(calib) => {
            mountAxisCalibRef.current = calib;
            setMountAxisCalib(calib);
            setShowMountCalibWizard(false);
          }}
          onDismiss={() => setShowMountCalibWizard(false)}
        />
      )}

      {/* ── PUBLISH MODAL ────────────────────────────────────────────────── */}
      <Modal
        visible={!!publishRecord}
        transparent
        animationType="fade"
        onRequestClose={() => setPublishRecord(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPublishRecord(null)}>
          <Pressable style={styles.publishModal} onPress={() => {}}>
            <Text style={styles.publishTitle}>{t("tracking.publish")}</Text>
            <Text style={styles.publishSubtitle}>
              {t("tracking.publishDesc")}
            </Text>
            <TextInput
              style={styles.publishInput}
              placeholder={t("tracking.publishPlaceholder")}
              placeholderTextColor={Colors.textSecondary}
              value={publishCaption}
              onChangeText={setPublishCaption}
              maxLength={200}
              multiline
            />
            <View style={styles.publishActions}>
              <TouchableOpacity
                style={styles.publishCancelBtn}
                onPress={() => setPublishRecord(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.publishCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.publishConfirmBtn,
                  publishMutation.isPending && { opacity: 0.5 },
                ]}
                onPress={handlePublish}
                disabled={publishMutation.isPending}
                activeOpacity={0.7}
              >
                {publishMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={16} color="#fff" />
                    <Text style={styles.publishConfirmText}>{t("tracking.publishBtn")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Background GPS toast ──────────────────────────────────────── */}
      {bgToastVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bgToast,
            {
              bottom: insets.bottom + 90,
              opacity: bgToastAnim,
              transform: [
                {
                  translateY: bgToastAnim.interpolate({
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
            Acquisiti {bgToastCount} punti GPS in background
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Countdown
  countdownContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  countdownNumber: {
    fontFamily: "Inter_700Bold" as const,
    letterSpacing: -4,
    textAlign: "center" as const,
  },
  countdownSub: {
    fontSize: 18,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  countdownCancelBtn: {
    marginTop: 40,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.accentRed + "80",
    backgroundColor: Colors.accentRed + "15",
  },
  countdownCancelText: {
    fontFamily: "Inter_600SemiBold" as const,
    fontSize: 15,
    color: Colors.accentRed,
    textAlign: "center" as const,
  },

  // Active header
  activeHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pauseBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "#FFCC00",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pauseBtnResume: {
    backgroundColor: Colors.success,
  },
  pauseBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold" as const,
    color: "#1a1a1a",
    letterSpacing: 0.5,
  },
  stopBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: Colors.accentRed,
    borderRadius: 10,
    paddingVertical: 12,
  },
  stopBtnLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold" as const,
    color: "#ffffff",
    letterSpacing: 1,
  },
  gpsBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accentRed,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  gpsBannerText: {
    fontFamily: "Inter_600SemiBold" as const,
    fontSize: 13,
    color: "#ffffff",
  },

  activeScroll: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 30,
    gap: 7,
  },

  // Speed panel
  speedPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center" as const,
  },
  speedMetaRow: {
    width: "100%",
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 4,
  },
  fermoRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  fermoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fermoLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold" as const,
    letterSpacing: 1,
  },
  accuracyRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  accuracyLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold" as const,
  },
  accuracyValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular" as const,
    color: "#ffffff",
  },
  speedValue: {
    fontSize: 65,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.accent,
    letterSpacing: -2,
    lineHeight: 70,
    fontVariant: ["tabular-nums" as const],
  },
  speedValueSprint: {
    color: Colors.accentRed,
    fontSize: 73,
  },
  speedUnit: {
    fontSize: 16,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: -4,
  },

  // Stats
  statsRow: {
    flexDirection: "row" as const,
    gap: 7,
  },
  statsCol: {
    flex: 1,
    gap: 7,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center" as const,
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
    fontVariant: ["tabular-nums" as const],
    textAlign: "center" as const,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },

  // Sprint
  sprintContainer: {
    gap: 10,
  },
  sprintPhaseBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center" as const,
  },
  sprintPhaseLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold" as const,
    letterSpacing: 1,
  },
  sprint0100Time: {
    fontSize: 28,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.success,
    textAlign: "center" as const,
  },
  sprintHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 2,
  },
  sprintHeaderLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  sprintHistoryBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  sprintHistoryBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.accent,
  },
  sprintCancelBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accentRed + "70",
    backgroundColor: Colors.accentRed + "12",
    alignSelf: "center" as const,
  },
  sprintCancelText: {
    fontFamily: "Inter_600SemiBold" as const,
    fontSize: 13,
    color: Colors.accentRed,
  },
  newRecordBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: "#FFD700" + "22",
    borderWidth: 1,
    borderColor: "#FFD700" + "80",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  newRecordText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold" as const,
    color: "#FFD700",
  },

  // Map
  mapCard: {
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 220,
  },

  // Map fullscreen modal
  mapModalSpeed: {
    position: "absolute" as const,
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: "center" as const,
  },
  mapModalSpeedValue: {
    fontSize: 72,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.accent,
    lineHeight: 80,
    letterSpacing: -2,
  },
  mapModalSpeedUnit: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.accent,
    marginTop: -4,
  },

  // Buffer
  bufferRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    marginTop: 4,
  },
  bufferText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.textSecondary,
  },

  // Idle scroll
  idleScroll: {
    paddingHorizontal: 14,
    paddingTop: 2,
    gap: 8,
  },
  headerIcon: {
    alignSelf: "center" as const,
    marginBottom: 0,
  },

  // Profile
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
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textAlign: "center" as const,
  },
  profileRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  profileBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 7,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  profileBtnLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  profileBtnLabelActive: {
    color: Colors.accent,
  },
  profileBtnDesc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary + "88",
    textAlign: "center" as const,
    marginTop: 2,
  },
  profileBtnDescActive: {
    color: Colors.accent + "CC",
  },
  profileBtnBatteryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    marginTop: 4,
  },
  profileBtnBattery: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary + "AA",
  },
  profileBtnBatteryActive: {
    color: Colors.accent,
  },
  profileBatteryNote: {
    fontSize: 10,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary + "99",
    textAlign: "center" as const,
    marginTop: 6,
    marginBottom: 4,
    fontStyle: "italic" as const,
  },
  profileWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: Colors.warning + "15",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
  },
  profileWarningText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.warning,
    flex: 1,
  },

  // Triggers
  triggersSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden" as const,
  },
  triggerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  triggerLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
  },
  triggerLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.text,
  },
  triggerDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  triggerInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 52,
    textAlign: "center" as const,
  },
  comingSoonBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  comingSoonText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.textSecondary,
  },

  // Start button
  startBtnContainer: {
    alignItems: "center" as const,
    paddingVertical: 4,
    gap: 8,
  },
  startBtn: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.success,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  startBtnLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.textSecondary,
  },

  // Records
  recordsSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
    marginBottom: 4,
  },
  recordCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  gpsBlackoutRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginTop: -4,
  },
  gpsBlackoutText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
  },
  recordHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  recordDate: {
    fontSize: 13,
    fontFamily: "Inter_500Medium" as const,
    color: Colors.textSecondary,
  },
  recordRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  recordStat: {
    flex: 1,
    alignItems: "center" as const,
  },
  recordStatValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
  },
  recordStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  publishIconBtn: {
    padding: 6,
    backgroundColor: Colors.accent + "15",
    borderRadius: 8,
  },
  sprintBadge: {
    backgroundColor: Colors.accentRed + "20",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sprintBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.accentRed,
  },

  // Hands Off overlay
  handsOffBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.93)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 24,
    paddingHorizontal: 32,
  },
  handsOffContent: {
    alignItems: "center" as const,
    gap: 10,
  },
  handsOffTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold" as const,
    color: "#ef4444",
    textAlign: "center" as const,
  },
  handsOffMsg: {
    fontSize: 20,
    fontFamily: "Inter_700Bold" as const,
    color: "#ef4444",
    textAlign: "center" as const,
    lineHeight: 28,
  },
  handsOffInfo: {
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: "#ef444460",
  },
  handsOffSpeed: {
    fontSize: 64,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
    fontVariant: ["tabular-nums" as const],
    lineHeight: 72,
  },
  handsOffUnit: {
    fontSize: 18,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
  },
  handsOffSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 2,
  },
  handsOffHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular" as const,
    fontStyle: "italic" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 12,
    opacity: 0.7,
  },

  // Summary — Task #856: modal posizionato in ALTO (flex-start), border radius in basso
  summaryOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-start" as const,
  },
  summaryModal: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: 24,
    paddingTop: 16, // override dinamico in JSX: insets.top + 16
    gap: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  summaryTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
  },
  rideTitleInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.text,
    backgroundColor: Colors.surfaceLight,
  },
  summaryTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
    flex: 1,
  },
  liveRunBadge: {
    backgroundColor: Colors.success + "20",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.success + "60",
  },
  liveRunText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.success,
    letterSpacing: 1,
  },
  summaryRecordBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "#FFD70020",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FFD70060",
    alignSelf: "center" as const,
    flex: 1,
    justifyContent: "center" as const,
  },
  summaryRecordText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold" as const,
    color: "#FFD700",
  },
  summaryRouteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  summaryRouteBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.accent,
  },
  summaryNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  summaryActions: {
    flexDirection: "row" as const,
    gap: 10,
  },
  summaryPublishBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  summaryPublishText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold" as const,
    color: "#ffffff",
  },
  summaryCloseBtn: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCloseText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary,
  },
  recalibrateLink: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.accent,
    textAlign: "center" as const,
    paddingTop: 2,
  },

  // Sensor overlay (Race Mode live panel)
  sensorOverlayToggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sensorOverlayToggleLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.text,
  },
  sensorOverlayToggleHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sensorOverlayPanel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentRed + "40",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  sensorOverlayItem: {
    alignItems: "center" as const,
    flex: 1,
  },
  sensorOverlayValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
  },
  sensorOverlayLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  sensorOverlaySep: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  summaryDeleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  summaryDeleteText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold" as const,
    color: "#ef4444",
  },

  // Publish modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center" as const,
    padding: 24,
  },
  publishModal: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  publishTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.text,
  },
  publishSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
  },
  publishInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  publishActions: {
    flexDirection: "row" as const,
    gap: 10,
  },
  publishCancelBtn: {
    flex: 1,
    alignItems: "center" as const,
    padding: 14,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  publishCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.textSecondary,
  },
  publishConfirmBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    padding: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
  },
  publishConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold" as const,
    color: "#ffffff",
  },
  bgToast: {
    position: "absolute" as const,
    alignSelf: "center" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "rgba(20,20,30,0.92)" as const,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.accent + "50",
  },
  bgToastText: {
    fontFamily: "Inter_600SemiBold" as const,
    fontSize: 13,
    color: Colors.text,
  },
});
