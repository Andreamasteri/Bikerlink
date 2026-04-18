import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";
import { getCurrentLocale } from "@/lib/i18n";
import TrackingMap from "@/components/TrackingMap";
import { setTrackingActive } from "@/lib/tracking-active";
import Constants from "expo-constants";


// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "countdown" | "active" | "paused";
type UpdateProfile = "easy" | "medium" | "race";

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  timestamp: string;
}

interface RouteRecord {
  id: string;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_KMH = 2;
const BATCH_SIZE = 10;
const BATCH_FLUSH_MS = 20000;

const PROFILE_LABELS: Record<UpdateProfile, string> = {
  easy: "Passeggio",
  medium: "Standard",
  race: "Race",
};

const PROFILE_DESCRIPTIONS: Record<UpdateProfile, string> = {
  easy: "Risparmio energetico",
  medium: "Alta precisione",
  race: "Massima precisione (1s)",
};

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

function getAccuracyTier(meters: number | null): { label: string; color: string; value: string } | null {
  if (meters === null || meters < 0) return null;
  const m = Math.round(meters);
  if (meters < 5) return { label: "Ottima", color: Colors.success, value: `${m}m` };
  if (meters < 15) return { label: "Buona", color: "#4A9EFF", value: `${m}m` };
  if (meters <= 30) return { label: "Discreta", color: Colors.warning, value: `${m}m` };
  return { label: "Scarsa", color: Colors.accentRed, value: `${m}m` };
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

async function logGpsError(error: unknown, context: string, extras?: { speedKmh?: number; routeId?: string }) {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      errorMessage: err.message || String(error),
      stackTrace: err.stack ?? null,
      otaNumber: CURRENT_OTA_NUMBER,
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      deviceName: Constants.deviceName ?? null,
      context,
      ...extras,
    };
    const url = new URL("/api/errors", getApiUrl());
    fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
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

// ─── RecordCard ───────────────────────────────────────────────────────────────

function RecordCard({
  item,
  onPublish,
  onDelete,
}: {
  item: RouteRecord;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const dur = item.durationSeconds || 0;
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
          {new Date(item.createdAt).toLocaleDateString(getCurrentLocale(), {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </Text>
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
            <Text style={styles.recordStatLabel}>0→100 km/h</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>{(item.maxSpeedKmh || 0).toFixed(0)}</Text>
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
              {(item.totalDistanceKm || 0).toFixed(2)} km
            </Text>
            <Text style={styles.recordStatLabel}>distanza</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>{formatHMS(dur * 1000)}</Text>
            <Text style={styles.recordStatLabel}>durata</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>{(item.maxSpeedKmh || 0).toFixed(0)}</Text>
            <Text style={styles.recordStatLabel}>vel. max</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackingScreen() {
  const insets = useSafeAreaInsets();

  // Settings
  const [profile, setProfile] = useState<UpdateProfile>("medium");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownSec, setCountdownSec] = useState("10");
  const [handsOffEnabled, setHandsOffEnabled] = useState(false);
  const [handsOffSpeedStr, setHandsOffSpeedStr] = useState("50");
  const [is0100Enabled, setIs0100Enabled] = useState(false);

  // Phase & UI
  const [phase, setPhase] = useState<Phase>("idle");
  const [handsOffActive, setHandsOffActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [publishRecord, setPublishRecord] = useState<RouteRecord | null>(null);
  const [publishCaption, setPublishCaption] = useState("");

  // GPS display
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
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
  const [maxAccelG, setMaxAccelG] = useState(0);
  const [maxDecelG, setMaxDecelG] = useState(0);

  // Countdown display
  const [countdownValue, setCountdownValue] = useState(0);
  const countdownAnim = useRef(new Animated.Value(1)).current;

  // Sprint
  const [sprintPhase, setSprintPhase] = useState<"waiting" | "measuring" | "done">("waiting");
  const [sprint0to100Ms, setSprint0to100Ms] = useState<number | null>(null);

  // Buffer display
  const [pointsSent, setPointsSent] = useState(0);
  const [pointsBuffered, setPointsBuffered] = useState(0);

  // Refs
  const profileRef = useRef<UpdateProfile>("medium");
  const handsOffEnabledRef = useRef(false);
  const handsOffSpeedRef = useRef(50);
  const is0100EnabledRef = useRef(false);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const webWatchIdRef = useRef<number | null>(null);
  const accelSubRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const sprintStartTimeRef = useRef<number | null>(null);
  const sprintPhaseRef = useRef<"waiting" | "measuring" | "done">("waiting");
  const handsOffAnim = useRef(new Animated.Value(1)).current;
  const sprint0to100MsRef = useRef<number | null>(null);

  // Derived
  const isFermo = currentSpeed <= IDLE_THRESHOLD_KMH;
  const netMs = Math.max(totalMs - displayIdleMs, 0);
  const avgSpeedKmh = netMs > 0 ? totalKm / (netMs / 3600000) : 0;
  const accuracyTier = getAccuracyTier(gpsAccuracy);

  // ── Records query ──────────────────────────────────────────────────────────
  const { data: records, refetch: refetchRecords } = useQuery<RouteRecord[]>({
    queryKey: ["/api/routes"],
  });
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
      Alert.alert("Pubblicato!", "Il tuo record è stato pubblicato nella sezione Pic!");
    },
    onError: () => Alert.alert("Errore", "Impossibile pubblicare il record"),
  });

  // ── Hands-off blink ────────────────────────────────────────────────────────
  useEffect(() => {
    if (handsOffActive) {
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

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupTracking();
    };
  }, []);

  // ── GPS pre-warm ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status === "granted") {
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              .then((loc) => setGpsAccuracy(loc.coords.accuracy ?? null))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

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

  // ── Flush GPS points ───────────────────────────────────────────────────────
  const flushPoints = useCallback(async () => {
    const rId = routeIdRef.current;
    if (!rId || pointsBufferRef.current.length === 0) return;
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

      setCurrentSpeed(speedKmh);
      setGpsAccuracy(accuracy ?? null);

      if (handsOffEnabledRef.current) {
        setHandsOffActive(speedKmh > handsOffSpeedRef.current);
      }

      // Idle tracking
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

      // Distance
      const alt = altitude ?? 0;
      if (lastPosRef.current) {
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
      lastPosRef.current = { lat: latitude, lng: longitude, time: now };

      if (speedKmh > maxSpeedRef.current) {
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
        if (sprintPhaseRef.current === "waiting" && speedKmh > 1) {
          sprintPhaseRef.current = "measuring";
          sprintStartTimeRef.current = now;
          setSprintPhase("measuring");
        }
        if (sprintPhaseRef.current === "measuring" && speedKmh >= 100) {
          const elapsed = now - (sprintStartTimeRef.current ?? now);
          sprint0to100MsRef.current = elapsed;
          setSprint0to100Ms(elapsed);
          sprintPhaseRef.current = "done";
          setSprintPhase("done");
          stopTrackingInternal();
          return;
        }
      }

      const point: GpsPoint = {
        latitude,
        longitude,
        altitude: alt,
        speedKmh,
        timestamp: new Date(now).toISOString(),
      };
      pointsBufferRef.current.push(point);
      setPointsBuffered(pointsBufferRef.current.length);
      if (pointsBufferRef.current.length >= BATCH_SIZE) {
        flushPoints();
      }
    },
    [flushPoints]
  );

  // ── Web GPS handler ────────────────────────────────────────────────────────
  const onWebLocation = useCallback(
    (pos: GeolocationPosition) => {
      if (isPausedRef.current || phaseRef.current !== "active") return;
      const { latitude, longitude, altitude, speed, accuracy } = pos.coords;
      const speedKmh = speed !== null && speed >= 0 ? speed * 3.6 : 0;
      const now = pos.timestamp;

      setCurrentSpeed(speedKmh);
      setGpsAccuracy(accuracy ?? null);

      if (handsOffEnabledRef.current) {
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

      const alt = altitude ?? 0;
      if (lastPosRef.current) {
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
      lastPosRef.current = { lat: latitude, lng: longitude, time: now };

      if (speedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = speedKmh;
        setMaxSpeed(speedKmh);
      }
      if (alt > maxAltRef.current) {
        maxAltRef.current = alt;
        setMaxAltitude(alt);
      }

      const coord = { latitude, longitude };
      mapCoordsRef.current.push(coord);
      setCurrentCoord(coord);
      setMapCoords([...mapCoordsRef.current]);

      const point: GpsPoint = {
        latitude,
        longitude,
        altitude: alt,
        speedKmh,
        timestamp: new Date(now).toISOString(),
      };
      pointsBufferRef.current.push(point);
      setPointsBuffered(pointsBufferRef.current.length);
      if (pointsBufferRef.current.length >= BATCH_SIZE) {
        flushPoints();
      }
    },
    [flushPoints]
  );

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
    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }
    if (webWatchIdRef.current !== null && Platform.OS === "web") {
      navigator.geolocation.clearWatch(webWatchIdRef.current);
      webWatchIdRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    setTrackingActive(false);
  }, []);

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
    setMaxAccelG(0);
    setMaxDecelG(0);
    setPointsBuffered(0);
    setPointsSent(0);
    setSprintPhase("waiting");
    setSprint0to100Ms(null);

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
    sprintStartTimeRef.current = null;
    sprintPhaseRef.current = "waiting";
    sprint0to100MsRef.current = null;
    pausedMsRef.current = 0;
    isPausedRef.current = false;
  }, []);

  // ── Start accelerometer ────────────────────────────────────────────────────
  const startAccelerometer = useCallback(() => {
    if (Platform.OS === "web") return;
    const interval = is0100EnabledRef.current ? 100 : 250;
    try {
      // Dynamic require inside the function to avoid module-level side effects
      const { Accelerometer } = require("expo-sensors") as typeof import("expo-sensors");
      Accelerometer.setUpdateInterval(interval);
      const sub = Accelerometer.addListener(({ x: _x, y, z: _z }) => {
        // Calibration: average first 20 samples to remove gravity offset
        if (accelBaselineRef.current === null) {
          accelCalibSamples.current.push(y);
          if (accelCalibSamples.current.length >= 20) {
            const sum = accelCalibSamples.current.reduce((a, b) => a + b, 0);
            accelBaselineRef.current = sum / accelCalibSamples.current.length;
          }
          return;
        }
        const gLong = y - accelBaselineRef.current;
        setCurrentG(gLong);
        if (gLong > maxAccelGRef.current) {
          maxAccelGRef.current = gLong;
          setMaxAccelG(gLong);
        }
        if (-gLong > maxDecelGRef.current) {
          maxDecelGRef.current = -gLong;
          setMaxDecelG(-gLong);
        }
      });
      accelSubRef.current = sub;
    } catch (e) {
      logGpsError(e, "startAccelerometer");
    }
  }, []);

  // ── Begin active tracking (called after countdown) ─────────────────────────
  const beginActiveTracking = useCallback(async () => {
    phaseRef.current = "active";
    setPhase("active");
    startTimeRef.current = Date.now();

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
    }, 100);

    flushTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) flushPoints();
    }, BATCH_FLUSH_MS);

    startAccelerometer();

    if (Platform.OS !== "web") {
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
        Alert.alert("GPS non disponibile", "Impossibile avviare il GPS. Riprova.");
        return;
      }
    } else {
      const wid = navigator.geolocation.watchPosition(
        onWebLocation,
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
      webWatchIdRef.current = wid;
    }

    setTrackingActive(true);
  }, [startAccelerometer, onNativeLocation, onWebLocation, flushPoints, cleanupTracking]);

  // ── Handle START ───────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (Platform.OS !== "web") {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== "granted") {
            Alert.alert("Permesso GPS negato", "Abilita la localizzazione nelle impostazioni.");
            return;
          }
        }
      }

      resetTrackingState();

      const route = (await apiRequest("POST", "/api/routes", {
        trackingFrequency: profile === "race" ? 1 : profile === "easy" ? 3 : 2,
        isSprint: is0100EnabledRef.current,
      })) as unknown as RouteRecord;
      routeIdRef.current = route.id;

      if (countdownEnabled) {
        const secs = Math.max(parseInt(countdownSec || "10", 10) || 10, 1);
        setCountdownValue(secs);
        phaseRef.current = "countdown";
        setPhase("countdown");

        let remaining = secs;
        const tick = setInterval(async () => {
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
            clearInterval(tick);
            await beginActiveTracking();
          }
        }, 1000);
      } else {
        await beginActiveTracking();
      }
    } catch (e) {
      logGpsError(e, "handleStart");
      Alert.alert("Errore", "Impossibile avviare il tracciamento.");
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    profile,
    countdownEnabled,
    countdownSec,
    resetTrackingState,
    beginActiveTracking,
    countdownAnim,
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

    try {
      await apiRequest("PUT", `/api/routes/${rId}/stop`, {
        totalDistanceKm: totalKmRef.current,
        maxSpeedKmh: maxSpeedRef.current,
        avgSpeedKmh: finalAvgSpeed,
        maxAltitude: maxAltRef.current,
        durationSeconds: finalTotalSec,
        idleTimeSeconds: finalIdleSec,
        maxAccelerationG: maxAccelGRef.current,
        sprint0to100Ms: sprint0to100MsRef.current,
      });
      await refetchRecords();
      setSummaryVisible(true);
    } catch (e) {
      logGpsError(e, "stopTracking:PUT", { routeId: rId });
    }
  }, [cleanupTracking, flushPoints, refetchRecords]);

  // ── Handle STOP (user-initiated) ───────────────────────────────────────────
  const handleStop = useCallback(() => {
    Alert.alert("Termina giro", "Vuoi terminare il giro e salvare i dati?", [
      { text: "Annulla", style: "cancel" },
      { text: "Termina", style: "destructive", onPress: stopTrackingInternal },
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

  // ── Countdown colors ───────────────────────────────────────────────────────
  const countdownColor =
    countdownValue > 10
      ? "#ffffff"
      : countdownValue >= 6
      ? "#ef4444"
      : countdownValue >= 1
      ? "#eab308"
      : "#22c55e";

  const countdownFontSize = countdownValue === 0 ? 120 : 96;

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top },
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
            <Text style={styles.handsOffSpeed}>{currentSpeed.toFixed(0)}</Text>
            <Text style={styles.handsOffUnit}>km/h</Text>
            <Text style={styles.handsOffSub}>
              Tocchi bloccati sopra {handsOffSpeedStr} km/h
            </Text>
            <Text style={styles.handsOffSub}>
              Si riattivano quando rallenti
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
            {countdownValue === 0 ? "GO" : countdownValue.toString()}
          </Animated.Text>
          <Text style={styles.countdownSub}>Preparati...</Text>
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
                {phase === "paused" ? "RIPRENDI" : "PAUSA"}
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
                      {accuracyTier.label}
                    </Text>
                    <Text style={styles.accuracyValue}>{accuracyTier.value}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.speedValue, is0100Enabled && styles.speedValueSprint]}>
                {is0100Enabled
                  ? currentSpeed.toFixed(1)
                  : currentSpeed.toFixed(0)}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </View>

            {/* Stats — standard mode */}
            {!is0100Enabled && (
              <View style={styles.statsRow}>
                <View style={styles.statsCol}>
                  <StatCard
                    icon="time-outline"
                    color={Colors.accent}
                    value={formatHMS(totalMs)}
                    label="Tempo totale"
                  />
                  <StatCard
                    icon="bicycle-outline"
                    color={Colors.success}
                    value={formatHMS(netMs)}
                    label="Tempo netto"
                  />
                  <StatCard
                    icon="flash"
                    color={Colors.accentRed}
                    value={maxSpeed.toFixed(2)}
                    label="Vel. max km/h"
                  />
                  <StatCard
                    icon="navigate-outline"
                    color={Colors.accent}
                    value={totalKm.toFixed(3)}
                    label="Km totali"
                  />
                </View>
                <View style={styles.statsCol}>
                  <StatCard
                    icon="pause-outline"
                    color={Colors.warning}
                    value={formatHMS(displayIdleMs)}
                    label="Tempo fermo"
                  />
                  <StatCard
                    icon="speedometer-outline"
                    color={Colors.success}
                    value={avgSpeedKmh.toFixed(2)}
                    label="Vel. media km/h"
                  />
                  <StatCard
                    icon="trending-up-outline"
                    color={Colors.success}
                    value={maxAltitude.toFixed(0)}
                    label="Quota max m"
                  />
                  <StatCard
                    icon="pulse-outline"
                    color={Colors.accentRed}
                    value={`↑${maxAccelG.toFixed(2)} ↓${maxDecelG.toFixed(2)}`}
                    label="G max"
                  />
                </View>
              </View>
            )}

            {/* Stats — 0-100 sprint mode */}
            {is0100Enabled && (
              <View style={styles.sprintContainer}>
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
                      ? "Accelera! ▶"
                      : sprintPhase === "measuring"
                      ? "In misura..."
                      : "Completato! ✓"}
                  </Text>
                </View>

                {sprint0to100Ms !== null && (
                  <Text style={styles.sprint0100Time}>
                    0→100 in {(sprint0to100Ms / 1000).toFixed(2)}s
                  </Text>
                )}

                <View style={styles.statsRow}>
                  <StatCard
                    icon="trending-up-outline"
                    color={Colors.success}
                    value={`${currentG.toFixed(2)} G`}
                    label="G istantaneo"
                  />
                  <StatCard
                    icon="pulse-outline"
                    color={Colors.accentRed}
                    value={`${maxAccelG.toFixed(2)} G`}
                    label="G max accel"
                  />
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    icon="trending-down-outline"
                    color={Colors.warning}
                    value={`${maxDecelG.toFixed(2)} G`}
                    label="G max frenata"
                  />
                  {accuracyTier ? (
                    <StatCard
                      icon="locate-outline"
                      color={accuracyTier.color}
                      value={accuracyTier.value}
                      label={accuracyTier.label}
                    />
                  ) : (
                    <View style={[styles.statCard, { opacity: 0 }]} />
                  )}
                </View>
              </View>
            )}

            {/* Map (standard mode only) */}
            {!is0100Enabled && currentCoord !== null && (
              <View style={styles.mapCard}>
                <TrackingMap points={mapCoords} currentLocation={currentCoord} />
              </View>
            )}

            {/* Buffer indicator */}
            <View style={styles.bufferRow}>
              <Ionicons name="cloud-upload-outline" size={14} color={Colors.accent} />
              <Text style={styles.bufferText}>
                {pointsBuffered}/{pointsSent} Buffer / Inviati
              </Text>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── IDLE (pre-start) ─────────────────────────────────────────────── */}
      {phase === "idle" && (
        <ScrollView
          contentContainerStyle={[
            styles.idleScroll,
            {
              paddingBottom:
                insets.bottom + (Platform.OS === "web" ? 34 : 20),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Ionicons
            name="speedometer"
            size={48}
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
                    {PROFILE_LABELS[p]}
                  </Text>
                  <Text
                    style={[
                      styles.profileBtnDesc,
                      profile === p && styles.profileBtnDescActive,
                    ]}
                  >
                    {PROFILE_DESCRIPTIONS[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.profileWarning}>
              <Ionicons name="warning-outline" size={14} color={Colors.warning} />
              <Text style={styles.profileWarningText}>
                Più precisione = Maggior consumo di batteria
              </Text>
            </View>
          </View>

          {/* Triggers */}
          <View style={styles.triggersSection}>
            {/* Countdown */}
            <View style={styles.triggerRow}>
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="timer-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.triggerLabel}>Countdown</Text>
              </View>
              <TextInput
                style={[
                  styles.triggerInput,
                  !countdownEnabled && { opacity: 0.4 },
                ]}
                value={countdownSec}
                onChangeText={(v) =>
                  setCountdownSec(v.replace(/[^0-9]/g, "").slice(0, 2))
                }
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={Colors.textSecondary}
                maxLength={2}
                editable={countdownEnabled}
              />
              <Switch
                value={countdownEnabled}
                onValueChange={setCountdownEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={countdownEnabled ? Colors.accent : Colors.textSecondary}
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
                  <Text style={styles.triggerLabel}>Hands Off</Text>
                  <Text style={styles.triggerDesc}>
                    per evitare tocchi ad alta velocità
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
                  <Text style={styles.triggerLabel}>0-100 km/h</Text>
                  {is0100Enabled && (
                    <Text style={[styles.triggerDesc, { color: Colors.accent }]}>
                      Forza modalità Race
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

            {/* Show My Route — placeholder */}
            <TouchableOpacity
              style={[styles.triggerRow, { borderBottomWidth: 0 }]}
              onPress={() =>
                Alert.alert(
                  "In arrivo",
                  "Questa funzione sarà disponibile prossimamente."
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.triggerLeft}>
                <Ionicons
                  name="map-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.triggerLabel}>Show My Route</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Ionicons name="map-outline" size={12} color={Colors.textSecondary} />
                <Text style={styles.comingSoonText}>In arrivo</Text>
              </View>
            </TouchableOpacity>
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

          {/* Completed records */}
          {completedRecords.length > 0 && (
            <View style={styles.recordsSection}>
              <Text style={styles.sectionTitle}>I miei giri</Text>
              {completedRecords.map((item) => (
                <RecordCard
                  key={item.id}
                  item={item}
                  onPublish={() => {
                    setPublishRecord(item);
                    setPublishCaption("");
                  }}
                  onDelete={() => {
                    Alert.alert(
                      "Elimina record",
                      "Vuoi eliminare questo record? L'operazione è irreversibile.",
                      [
                        { text: "Annulla", style: "cancel" },
                        {
                          text: "Elimina",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await apiRequest("DELETE", `/api/routes/${item.id}`);
                              queryClient.invalidateQueries({
                                queryKey: ["/api/routes"],
                              });
                            } catch {
                              Alert.alert("Errore", "Impossibile eliminare il record.");
                            }
                          },
                        },
                      ]
                    );
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
        animationType="slide"
        onRequestClose={() => setSummaryVisible(false)}
      >
        <View style={styles.summaryOverlay}>
          <View style={styles.summaryModal}>
            <View style={styles.summaryTitleRow}>
              <Ionicons name="flag-outline" size={24} color={Colors.success} />
              <Text style={styles.summaryTitle}>Giro completato!</Text>
              <View style={styles.liveRunBadge}>
                <Text style={styles.liveRunText}>LIVE RUN</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <StatCard
                icon="navigate-outline"
                color={Colors.accent}
                value={totalKm.toFixed(3) + " km"}
                label="Distanza"
              />
              <StatCard
                icon="flash"
                color={Colors.accentRed}
                value={maxSpeed.toFixed(1)}
                label="Vel. max km/h"
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="time-outline"
                color={Colors.accent}
                value={formatHMS(totalMs)}
                label="Tempo totale"
              />
              <StatCard
                icon="speedometer-outline"
                color={Colors.success}
                value={avgSpeedKmh.toFixed(1)}
                label="Vel. media"
              />
            </View>
            {is0100Enabled && sprint0to100Ms !== null && (
              <View style={styles.statsRow}>
                <StatCard
                  icon="timer-outline"
                  color={Colors.accentRed}
                  value={(sprint0to100Ms / 1000).toFixed(2) + "s"}
                  label="0→100 km/h"
                />
                <StatCard
                  icon="pulse-outline"
                  color={Colors.success}
                  value={maxAccelG.toFixed(2) + " G"}
                  label="G max accel"
                />
              </View>
            )}

            <Text style={styles.summaryNote}>
              Puoi rivedere il giro in "I miei percorsi"
            </Text>

            <View style={styles.summaryActions}>
              <TouchableOpacity
                style={styles.summaryPublishBtn}
                onPress={() => {
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
                <Text style={styles.summaryPublishText}>Pubblica su Pic!</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.summaryCloseBtn}
                onPress={() => setSummaryVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.summaryCloseText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PUBLISH MODAL ────────────────────────────────────────────────── */}
      <Modal
        visible={!!publishRecord}
        transparent
        animationType="fade"
        onRequestClose={() => setPublishRecord(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPublishRecord(null)}>
          <Pressable style={styles.publishModal} onPress={() => {}}>
            <Text style={styles.publishTitle}>Pubblica su Pic!</Text>
            <Text style={styles.publishSubtitle}>
              Aggiungi una descrizione al tuo record
            </Text>
            <TextInput
              style={styles.publishInput}
              placeholder="Es: Giro fantastico sulle Dolomiti!"
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
                <Text style={styles.publishCancelText}>Annulla</Text>
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
                    <Text style={styles.publishConfirmText}>Pubblica</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

  activeScroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 10,
  },

  // Speed panel
  speedPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    fontSize: 72,
    fontFamily: "Inter_700Bold" as const,
    color: Colors.accent,
    letterSpacing: -2,
    lineHeight: 80,
    fontVariant: ["tabular-nums" as const],
  },
  speedValueSprint: {
    color: Colors.accentRed,
    fontSize: 80,
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
    gap: 10,
  },
  statsCol: {
    flex: 1,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center" as const,
    gap: 4,
  },
  statValue: {
    fontSize: 20,
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

  // Map
  mapCard: {
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 220,
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
    paddingTop: 8,
    gap: 14,
  },
  headerIcon: {
    alignSelf: "center" as const,
    marginBottom: 4,
  },

  // Profile
  profileSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
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
    padding: 10,
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
    paddingVertical: 14,
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
    paddingVertical: 8,
    gap: 12,
  },
  startBtn: {
    width: 220,
    height: 220,
    borderRadius: 110,
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

  // Summary
  summaryOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end" as const,
  },
  summaryModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  summaryTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
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
});
