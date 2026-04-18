import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  AppState,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  type AppStateStatus,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCurrentLocale } from "@/lib/i18n";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { DeviceMotion } from "expo-sensors";
import TrackingMap from "@/components/TrackingMap";

const BG_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "bikerlink-bg-gps-points";

if (Platform.OS !== "web") {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    BG_LOCATION_TASK,
    async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error || !data) return;
    const { locations } = data;
    if (!locations || locations.length === 0) return;
    try {
      const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
      const stored: GpsPoint[] = raw ? JSON.parse(raw) : [];
      for (const loc of locations) {
        const speedMs = loc.coords.speed;
        const speedKmh = speedMs !== null && speedMs >= 0 ? speedMs * 3.6 : 0;
        stored.push({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? 0,
          speedKmh,
          timestamp: new Date(loc.timestamp).toISOString(),
        });
      }
      await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify(stored));
    } catch {}
  });
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
  maxTiltDeg?: number | null;
  maxAccelerationG?: number | null;
  isSprint?: boolean;
  sprint0to100Ms?: number | null;
}

interface UserProfileMinimal {
  profile?: {
    gpsPrecision?: string | null;
  };
}

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  timestamp: string;
}

type TrackingMode = "highway" | "city" | "idle";
type UpdateProfile = "lowest" | "easy" | "medium" | "high" | "race";

const IDLE_THRESHOLD_KMH = 3;
const BATCH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 30000;
const AUTO_PAUSE_TIMEOUT_MS = 10 * 60 * 1000;
const STATS_SYNC_INTERVAL_MS = 60000;

const PROFILE_LABELS: Record<UpdateProfile, string> = {
  lowest: "Risparmio",
  easy: "Passeggio",
  medium: "Standard",
  high: "Alta",
  race: "Race",
};

const PROFILE_DESCRIPTIONS: Record<UpdateProfile, string> = {
  lowest: "Precisione minima (batteria)",
  easy: "Risparmio energetico",
  medium: "Alta precisione",
  high: "Precisione massima",
  race: "Massima precisione (1s)",
};

function getTrackingMode(speedKmh: number): TrackingMode {
  if (speedKmh > 60) return "highway";
  if (speedKmh > 10) return "city";
  return "idle";
}

function getModeConfig(mode: TrackingMode, profile: UpdateProfile = "medium"): { accuracy: Location.Accuracy; timeInterval: number; distanceInterval: number } {
  if (profile === "race") {
    return { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 };
  }
  if (profile === "high") {
    switch (mode) {
      case "highway":
        return { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 5 };
      case "city":
        return { accuracy: Location.Accuracy.Highest, timeInterval: 3000, distanceInterval: 3 };
      case "idle":
        return { accuracy: Location.Accuracy.Highest, timeInterval: 10000, distanceInterval: 2 };
    }
  }
  if (profile === "medium") {
    switch (mode) {
      case "highway":
        return { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 };
      case "city":
        return { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 };
      case "idle":
        return { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 2 };
    }
  }
  if (profile === "lowest") {
    switch (mode) {
      case "highway":
        return { accuracy: Location.Accuracy.Lowest, timeInterval: 15000, distanceInterval: 50 };
      case "city":
        return { accuracy: Location.Accuracy.Lowest, timeInterval: 20000, distanceInterval: 30 };
      case "idle":
        return { accuracy: Location.Accuracy.Lowest, timeInterval: 60000, distanceInterval: 10 };
    }
  }
  switch (mode) {
    case "highway":
      return { accuracy: Location.Accuracy.Balanced, timeInterval: 6000, distanceInterval: 20 };
    case "city":
      return { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 10 };
    case "idle":
      return { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 5 };
  }
}

function getAccuracyTier(meters: number | null): { label: string; color: string; value: string } | null {
  if (meters === null || meters < 0) return null;
  const m = Math.round(meters);
  if (meters < 5) return { label: "Ottima", color: Colors.success, value: `${m}m` };
  if (meters < 15) return { label: "Buona", color: "#4A9EFF", value: `${m}m` };
  if (meters <= 30) return { label: "Discreta", color: Colors.warning, value: `${m}m` };
  return { label: "Scarsa", color: Colors.accentRed, value: `${m}m` };
}

export default function TrackingScreen() {
  const insets = useSafeAreaInsets();
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const routeIdRef = useRef<string | null>(null);

  const [totalTime, setTotalTime] = useState(0);
  const [idleTime, setIdleTime] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("idle");
  const [pointsBuffered, setPointsBuffered] = useState(0);
  const [totalPointsSent, setTotalPointsSent] = useState(0);
  const [mapCoords, setMapCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentCoord, setCurrentCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapCoordsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);

  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const pauseStartRef = useRef(0);
  const idleAccRef = useRef(0);
  const lastPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const totalKmRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const maxAltRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const webWatchIdRef = useRef<number | null>(null);
  const pointsBufferRef = useRef<GpsPoint[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMovementRef = useRef(Date.now());
  const autoPauseAlertedRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentModeRef = useRef<TrackingMode>("idle");
  const totalPointsSentRef = useRef(0);
  const statsSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [updateProfile, setUpdateProfile] = useState<UpdateProfile>("medium");
  const updateProfileRef = useRef<UpdateProfile>("medium");
  const prevUpdateProfileRef = useRef<UpdateProfile>("medium");

  const [delayedStartEnabled, setDelayedStartEnabled] = useState(false);
  const [delayedStartSeconds, setDelayedStartSeconds] = useState("10");
  const [countdownValue, setCountdownValue] = useState<number | "GO" | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const [stopAtZeroEnabled, setStopAtZeroEnabled] = useState(false);
  const stopAtZeroFreezeRef = useRef(false);

  const [handsOffEnabled, setHandsOffEnabled] = useState(false);
  const [handsOffSpeed, setHandsOffSpeed] = useState("80");
  const [handsOffActive, setHandsOffActive] = useState(false);

  const [bgPermGranted, setBgPermGranted] = useState(false);
  const [bgReturnPoints, setBgReturnPoints] = useState<number | null>(null);
  const bgDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [publishRecord, setPublishRecord] = useState<RouteRecord | null>(null);
  const [publishCaption, setPublishCaption] = useState("");

  const [maxTilt, setMaxTilt] = useState(0);
  const [maxAcceleration, setMaxAcceleration] = useState(0);
  const maxTiltRef = useRef(0);
  const maxAccelerationRef = useRef(0);
  const prevAccelRef = useRef<{ value: number; time: number } | null>(null);
  const deviceMotionSubRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);

  const [sprint0100Enabled, setSprint0100Enabled] = useState(false);
  const sprint0100EnabledRef = useRef(false);
  const [sprintPhase, setSprintPhase] = useState<"idle" | "countdown" | "waiting" | "measuring" | "done">("idle");
  const sprintPhaseRef = useRef<"idle" | "countdown" | "waiting" | "measuring" | "done">("idle");
  const [sprintCountdown, setSprintCountdown] = useState(10);
  const sprintCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sprint0to100Ms, setSprint0to100Ms] = useState<number | null>(null);
  const sprintStartTimeRef = useRef<number | null>(null);
  const sprint0to100MsRef = useRef<number | null>(null);
  const [sprintMaxAccelSensor, setSprintMaxAccelSensor] = useState(0);
  const [sprintMaxDecelSensor, setSprintMaxDecelSensor] = useState(0);
  const [sprintMaxTilt, setSprintMaxTilt] = useState(0);
  const sprintMaxAccelSensorRef = useRef(0);
  const sprintMaxDecelSensorRef = useRef(0);
  const sprintMaxTiltRef = useRef(0);

  const [sprintMaxAccelGps, setSprintMaxAccelGps] = useState(0);
  const [sprintMaxDecelGps, setSprintMaxDecelGps] = useState(0);
  const sprintMaxAccelGpsRef = useRef(0);
  const sprintMaxDecelGpsRef = useRef(0);
  const vehicleDeceleratingRef = useRef(false);

  const sensorVelocityRef = useRef(0);
  const prevMotionTimeRef = useRef<number | null>(null);
  const sprintBearingRad = useRef(0);
  const sprintAutoHandsOffRef = useRef(false);
  const lastGpsHeadingRef = useRef<number | null>(null);

  const publishMutation = useMutation({
    mutationFn: async (data: { performanceData: string; caption: string }) => {
      await apiRequest("POST", "/api/contest/entries", data);
    },
    onSuccess: () => {
      setPublishRecord(null);
      setPublishCaption("");
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
      if (Platform.OS === "web") {
        window.alert("Record pubblicato su Pic!");
      } else {
        Alert.alert("Pubblicato!", "Il tuo record è stato pubblicato nella sezione Pic!");
      }
    },
    onError: () => {
      if (Platform.OS === "web") {
        window.alert("Errore durante la pubblicazione");
      } else {
        Alert.alert("Errore", "Impossibile pubblicare il record");
      }
    },
  });

  const handlePublish = useCallback(() => {
    if (!publishRecord) return;
    const perfData = JSON.stringify({
      totalDistanceKm: publishRecord.totalDistanceKm || 0,
      maxSpeedKmh: publishRecord.maxSpeedKmh || 0,
      avgSpeedKmh: publishRecord.avgSpeedKmh || 0,
      maxAltitude: publishRecord.maxAltitude || 0,
      durationSeconds: publishRecord.durationSeconds || 0,
      idleTimeSeconds: publishRecord.idleTimeSeconds || 0,
      date: publishRecord.createdAt,
    });
    publishMutation.mutate({ performanceData: perfData, caption: publishCaption });
  }, [publishRecord, publishCaption]);

  const { data: records = [], isLoading: recordsLoading } = useQuery<RouteRecord[]>({
    queryKey: ["/api/routes"],
  });

  const { data: profileData } = useQuery<UserProfileMinimal>({
    queryKey: ["/api/users/me"],
  });
  const profilePrecisionInitializedRef = useRef(false);

  useEffect(() => {
    if (profilePrecisionInitializedRef.current) return;
    if (!profileData?.profile?.gpsPrecision) return;
    const gpsPrec = profileData.profile.gpsPrecision;
    const mapped: UpdateProfile =
      gpsPrec === "lowest" ? "easy"
      : gpsPrec === "balanced" ? "easy"
      : gpsPrec === "high" ? "medium"
      : gpsPrec === "highest" ? "medium"
      : gpsPrec === "bestForNavigation" ? "race"
      : "medium";
    setUpdateProfile(mapped);
    updateProfileRef.current = mapped;
    profilePrecisionInitializedRef.current = true;
  }, [profileData]);

  const completedRecords = (records || []).filter((r: RouteRecord) => r.status === "completed");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
      cleanupTracking();
    };
  }, []);

  useEffect(() => {
    const warmUp = async () => {
      try {
        if (Platform.OS !== "web") {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === "granted") {
            const gpsTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("GPS pre-warm timeout")), 8000)
            );
            const loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              gpsTimeout,
            ]);
            setGpsAccuracy(loc.coords.accuracy ?? null);
          }
        } else if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => setGpsAccuracy(pos.coords.accuracy),
            () => {},
            { enableHighAccuracy: false, timeout: 8000 }
          );
        }
      } catch {}
    };
    warmUp();
  }, []);

  useEffect(() => {
    if (!sprint0100Enabled || isTracking) return;
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const gpsTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("GPS sprint pre-warm timeout")), 8000)
        );
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
          gpsTimeout,
        ]);
        setGpsAccuracy(loc.coords.accuracy ?? null);
      } catch {}
    })();
  }, [sprint0100Enabled, isTracking]);


  const cleanupTracking = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    if (statsSyncTimerRef.current) clearInterval(statsSyncTimerRef.current);
    if (watchSubRef.current) watchSubRef.current.remove();
    if (webWatchIdRef.current !== null && Platform.OS === "web") {
      navigator.geolocation.clearWatch(webWatchIdRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (deviceMotionSubRef.current) {
      deviceMotionSubRef.current.remove();
      deviceMotionSubRef.current = null;
      if (Platform.OS !== "web") DeviceMotion.setUpdateInterval(1000);
    }
    if (sprintCountdownRef.current) {
      clearInterval(sprintCountdownRef.current);
      sprintCountdownRef.current = null;
    }
    if (bgDismissTimerRef.current) {
      clearTimeout(bgDismissTimerRef.current);
      bgDismissTimerRef.current = null;
    }
    if (Platform.OS !== "web") {
      Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)
        .then((running) => {
          if (running) Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {});
        })
        .catch(() => {});
      AsyncStorage.removeItem(BG_POINTS_KEY).catch(() => {});
    }
    setHandsOffActive(false);
  };

  const flushPoints = useCallback(async () => {
    const routeId = routeIdRef.current;
    if (!routeId || pointsBufferRef.current.length === 0) return;

    const batch = [...pointsBufferRef.current];
    pointsBufferRef.current = [];
    setPointsBuffered(0);

    try {
      const url = new URL(`/api/routes/${routeId}/points`, getApiUrl());
      await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ points: batch }),
      });
      totalPointsSentRef.current += batch.length;
      setTotalPointsSent(totalPointsSentRef.current);
    } catch {
      pointsBufferRef.current = [...batch, ...pointsBufferRef.current];
      setPointsBuffered(pointsBufferRef.current.length);
    }
  }, []);

  const syncStats = useCallback(async () => {
    const routeId = routeIdRef.current;
    if (!routeId) return;

    try {
      const url = new URL(`/api/routes/${routeId}/stats`, getApiUrl());
      await globalThis.fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          totalDistanceKm: totalKmRef.current,
          maxSpeedKmh: maxSpeedRef.current,
          maxAltitude: maxAltRef.current,
          idleTimeSeconds: Math.round(idleAccRef.current),
        }),
      });
    } catch {}
  }, []);

  const onNativeLocation = useCallback((loc: Location.LocationObject) => {
    setGpsAccuracy(loc.coords.accuracy ?? null);
    if ((loc.coords.heading ?? -1) >= 0) {
      lastGpsHeadingRef.current = loc.coords.heading!;
    }
    if (!isPausedRef.current) {
      handleGpsUpdate(loc.coords.latitude, loc.coords.longitude, loc.coords.altitude, loc.coords.speed);
    }
  }, []);

  const onWebLocation = useCallback((pos: GeolocationPosition) => {
    setGpsAccuracy(pos.coords.accuracy);
    if (!isPausedRef.current) {
      handleGpsUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.speed);
    }
  }, []);

  const switchTrackingAccuracy = useCallback(async (newMode: TrackingMode) => {
    if (Platform.OS === "web") return;
    if (currentModeRef.current === newMode) return;
    currentModeRef.current = newMode;
    setTrackingMode(newMode);

    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }

    const config = getModeConfig(newMode, updateProfileRef.current);
    const sub = await Location.watchPositionAsync(
      { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
      onNativeLocation
    );
    watchSubRef.current = sub;
  }, [onNativeLocation]);

  const stopAtZeroEnabledRef = useRef(false);
  const handsOffEnabledRef = useRef(false);
  const handsOffSpeedRef = useRef(80);

  const handleGpsUpdate = useCallback((lat: number, lng: number, altitude: number | null, speedMs: number | null) => {
    if (isPausedRef.current) return;

    const now = Date.now();

    let speedKmh: number;
    if (speedMs !== null && speedMs > 0) {
      speedKmh = speedMs * 3.6;
    } else if (lastPosRef.current && (now - lastPosRef.current.time) > 500) {
      const fallbackDist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
      const intervalSec = (now - lastPosRef.current.time) / 1000;
      speedKmh = (fallbackDist / intervalSec) * 3600;
    } else {
      speedKmh = 0;
    }

    setCurrentSpeed(speedKmh);

    if (sprint0100EnabledRef.current) {
      if (sprintPhaseRef.current === "waiting" && speedKmh >= 5) {
        sprintPhaseRef.current = "measuring";
        setSprintPhase("measuring");
        sprintStartTimeRef.current = now;
        sprintMaxAccelSensorRef.current = 0;
        sprintMaxDecelSensorRef.current = 0;
        sprintMaxAccelGpsRef.current = 0;
        sprintMaxDecelGpsRef.current = 0;
        sprintMaxTiltRef.current = 0;
        vehicleDeceleratingRef.current = false;
        prevAccelRef.current = null;
        sensorVelocityRef.current = 0;
        prevMotionTimeRef.current = null;
        const headingDeg = lastGpsHeadingRef.current;
        sprintBearingRad.current = (headingDeg !== null && headingDeg >= 0)
          ? headingDeg * (Math.PI / 180)
          : 0;
      } else if (sprintPhaseRef.current === "measuring") {
        if (prevAccelRef.current) {
          const dt = (now - prevAccelRef.current.time) / 1000;
          if (dt > 0) {
            const accelKmhS = (speedKmh - prevAccelRef.current.value) / dt;
            const accelG = Math.abs(accelKmhS / 3.6) / 9.81;
            if (accelKmhS > 0) {
              vehicleDeceleratingRef.current = false;
              if (accelG > sprintMaxAccelGpsRef.current) {
                sprintMaxAccelGpsRef.current = accelG;
                setSprintMaxAccelGps(accelG);
              }
            }
            if (accelKmhS < 0) {
              vehicleDeceleratingRef.current = true;
              if (accelG > sprintMaxDecelGpsRef.current) {
                sprintMaxDecelGpsRef.current = accelG;
                setSprintMaxDecelGps(accelG);
              }
            }
          }
        }
        prevAccelRef.current = { value: speedKmh, time: now };

        if (speedKmh >= 100 && sprintStartTimeRef.current) {
          const elapsed = now - sprintStartTimeRef.current;
          setSprint0to100Ms(elapsed);
          sprint0to100MsRef.current = elapsed;
          sprintPhaseRef.current = "done";
          setSprintPhase("done");
          if (sprintAutoHandsOffRef.current) {
            handsOffEnabledRef.current = false;
            setHandsOffActive(false);
          }
        }
      }
    }

    if (stopAtZeroEnabledRef.current) {
      const shouldFreeze = speedKmh < 1;
      stopAtZeroFreezeRef.current = shouldFreeze;
    } else {
      stopAtZeroFreezeRef.current = false;
    }

    if (handsOffEnabledRef.current) {
      const threshold = handsOffSpeedRef.current;
      setHandsOffActive(speedKmh > threshold);
    } else {
      setHandsOffActive(false);
    }

    if (stopAtZeroFreezeRef.current) {
      lastPosRef.current = { lat, lng, time: now };
      return;
    }

    if (speedKmh > maxSpeedRef.current) {
      maxSpeedRef.current = speedKmh;
      setMaxSpeed(speedKmh);
    }

    const alt = altitude ?? 0;
    if (alt > maxAltRef.current) {
      maxAltRef.current = alt;
      setMaxAltitude(alt);
    }

    if (lastPosRef.current) {
      const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
      if (dist > 0.001) {
        totalKmRef.current += dist;
        setTotalKm(totalKmRef.current);
      }

      const intervalSec = (now - lastPosRef.current.time) / 1000;
      if (speedKmh < IDLE_THRESHOLD_KMH) {
        idleAccRef.current += intervalSec;
        setIdleTime(Math.round(idleAccRef.current));
      }
    }

    lastPosRef.current = { lat, lng, time: now };

    if (speedKmh >= IDLE_THRESHOLD_KMH) {
      lastMovementRef.current = now;
      autoPauseAlertedRef.current = false;
    } else if (now - lastMovementRef.current > AUTO_PAUSE_TIMEOUT_MS && !autoPauseAlertedRef.current) {
      autoPauseAlertedRef.current = true;
      Alert.alert(
        "Fermo da 10 minuti",
        "Sembra che tu sia fermo. Vuoi mettere in pausa il tracciamento?",
        [
          { text: "Continua", style: "cancel" },
          { text: "Pausa", onPress: () => togglePause() },
        ]
      );
    }

    const newMode = getTrackingMode(speedKmh);
    if (newMode !== currentModeRef.current) {
      switchTrackingAccuracy(newMode);
    }

    const point: GpsPoint = {
      latitude: lat,
      longitude: lng,
      altitude: alt,
      speedKmh,
      timestamp: new Date(now).toISOString(),
    };
    pointsBufferRef.current.push(point);
    setPointsBuffered(pointsBufferRef.current.length);

    const coord = { latitude: lat, longitude: lng };
    mapCoordsRef.current.push(coord);
    setMapCoords([...mapCoordsRef.current]);
    setCurrentCoord(coord);

    if (pointsBufferRef.current.length >= BATCH_SIZE) {
      flushPoints();
    }
  }, []);

  const togglePause = useCallback(() => {
    if (isPausedRef.current) {
      const pauseDuration = Date.now() - pauseStartRef.current;
      pausedTimeRef.current += pauseDuration;
      isPausedRef.current = false;
      setIsPaused(false);
      lastMovementRef.current = Date.now();
      autoPauseAlertedRef.current = false;

      if (Platform.OS !== "web") {
        const config = getModeConfig(currentModeRef.current, updateProfileRef.current);
        Location.watchPositionAsync(
          { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
          onNativeLocation
        ).then((sub) => {
          watchSubRef.current = sub;
        });
      } else if (Platform.OS === "web") {
        const wid = navigator.geolocation.watchPosition(
          onWebLocation,
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000 }
        );
        webWatchIdRef.current = wid;
      }
    } else {
      isPausedRef.current = true;
      setIsPaused(true);
      pauseStartRef.current = Date.now();
      setCurrentSpeed(0);

      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
      if (webWatchIdRef.current !== null && Platform.OS === "web") {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
        webWatchIdRef.current = null;
      }

      flushPoints();
    }
  }, []);

  const loadBgPoints = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
      if (!raw) return;
      const bgPoints: GpsPoint[] = JSON.parse(raw);
      if (bgPoints.length === 0) return;
      await AsyncStorage.removeItem(BG_POINTS_KEY);
      for (const pt of bgPoints) {
        if (pt.speedKmh > maxSpeedRef.current) {
          maxSpeedRef.current = pt.speedKmh;
          setMaxSpeed(pt.speedKmh);
        }
        const alt = pt.altitude ?? 0;
        if (alt > maxAltRef.current) {
          maxAltRef.current = alt;
          setMaxAltitude(alt);
        }
        if (lastPosRef.current) {
          const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, pt.latitude, pt.longitude);
          if (dist > 0.001) {
            totalKmRef.current += dist;
          }
        }
        const t = new Date(pt.timestamp).getTime();
        lastPosRef.current = { lat: pt.latitude, lng: pt.longitude, time: t };
        pointsBufferRef.current.push(pt);
        mapCoordsRef.current.push({ latitude: pt.latitude, longitude: pt.longitude });
      }
      setTotalKm(totalKmRef.current);
      if (bgPoints.length > 0) {
        setMapCoords([...mapCoordsRef.current]);
        const last = bgPoints[bgPoints.length - 1];
        setCurrentCoord({ latitude: last.latitude, longitude: last.longitude });
      }
      setPointsBuffered(pointsBufferRef.current.length);
      setBgReturnPoints(bgPoints.length);
      if (bgDismissTimerRef.current) clearTimeout(bgDismissTimerRef.current);
      bgDismissTimerRef.current = setTimeout(() => setBgReturnPoints(null), 5000);
      flushPoints();
    } catch {}
  }, [flushPoints]);

  const handleAppStateChange = useCallback(async (nextState: AppStateStatus) => {
    const tracking = !!routeIdRef.current;

    if (nextState === "background" && tracking && Platform.OS !== "web") {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
      if (!isPausedRef.current) {
        try {
          const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
          if (!alreadyRunning) {
            await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 5,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: "BikerLink — Tracciamento attivo",
                notificationBody: "La tua gita viene registrata in background.",
                notificationColor: "#FF6600",
              },
            });
          }
        } catch {}
      }
    } else if (nextState === "active" && tracking && Platform.OS !== "web") {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
        if (running) {
          await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
        }
      } catch {}
      await loadBgPoints();
      if (!isPausedRef.current) {
        const config = getModeConfig(currentModeRef.current, updateProfileRef.current);
        try {
          const sub = await Location.watchPositionAsync(
            { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
            onNativeLocation
          );
          watchSubRef.current = sub;
        } catch {}
      }
      if (pointsBufferRef.current.length > 0) {
        flushPoints();
      }
    }
  }, [flushPoints, loadBgPoints, onNativeLocation]);

  const startTracking = async () => {
    try {
      setLoading(true);

      if (Platform.OS !== "web") {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== "granted") {
          Alert.alert("Permesso Negato", "Il permesso GPS è necessario per il tracciamento.");
          return;
        }
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus === "granted") {
          setBgPermGranted(true);
        } else {
          setBgPermGranted(false);
          Alert.alert(
            "Background GPS",
            "Per registrare la gita con lo schermo spento, consenti l'accesso alla posizione 'Sempre' nelle impostazioni.",
            [{ text: "Continua", style: "default" }]
          );
        }
      } else {
        const perm = await new Promise<boolean>((resolve) => {
          if (!navigator.geolocation) {
            resolve(false);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
        if (!perm) {
          Alert.alert("Permesso Negato", "Il permesso GPS è necessario per il tracciamento.");
          return;
        }
      }

      let res;
      try {
        res = await apiRequest("POST", "/api/routes", { trackingFrequency: 5, isSprint: sprint0100EnabledRef.current });
      } catch (err: any) {
        if (err.message?.includes("401")) {
          Alert.alert("Login Richiesto", "Devi effettuare il login per usare il tracciamento.");
        } else {
          Alert.alert("Errore", "Impossibile avviare il tracciamento.");
        }
        return;
      }

      const data = await res.json();
      routeIdRef.current = data.id;


      setTotalTime(0);
      setIdleTime(0);
      setTotalKm(0);
      setMaxSpeed(0);
      setMaxAltitude(0);
      setCurrentSpeed(0);
      setTrackingMode("idle");
      setIsPaused(false);
      setPointsBuffered(0);
      setTotalPointsSent(0);
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      pauseStartRef.current = 0;
      idleAccRef.current = 0;
      lastPosRef.current = null;
      totalKmRef.current = 0;
      maxSpeedRef.current = 0;
      maxAltRef.current = 0;
      pointsBufferRef.current = [];
      lastMovementRef.current = Date.now();
      autoPauseAlertedRef.current = false;
      isPausedRef.current = false;
      currentModeRef.current = "idle";
      mapCoordsRef.current = [];
      setMapCoords([]);
      setCurrentCoord(null);
      setMapExpanded(false);
      totalPointsSentRef.current = 0;
      updateProfileRef.current = updateProfile;
      stopAtZeroEnabledRef.current = stopAtZeroEnabled;
      handsOffEnabledRef.current = handsOffEnabled;
      handsOffSpeedRef.current = parseFloat(handsOffSpeed || "80") || 80;
      stopAtZeroFreezeRef.current = false;
      if (sprint0100Enabled) {
        sprintAutoHandsOffRef.current = true;
        handsOffEnabledRef.current = true;
        handsOffSpeedRef.current = 2;
      }
      setHandsOffActive(false);

      maxTiltRef.current = 0;
      maxAccelerationRef.current = 0;
      setMaxTilt(0);
      setMaxAcceleration(0);
      prevAccelRef.current = null;

      sprint0100EnabledRef.current = sprint0100Enabled;
      sprintPhaseRef.current = "idle";
      setSprintPhase("idle");
      setSprint0to100Ms(null);
      sprint0to100MsRef.current = null;
      sprintStartTimeRef.current = null;
      sprintMaxAccelSensorRef.current = 0;
      sprintMaxDecelSensorRef.current = 0;
      sprintMaxAccelGpsRef.current = 0;
      sprintMaxDecelGpsRef.current = 0;
      sprintMaxTiltRef.current = 0;
      vehicleDeceleratingRef.current = false;
      setSprintMaxAccelSensor(0);
      setSprintMaxDecelSensor(0);
      setSprintMaxAccelGps(0);
      setSprintMaxDecelGps(0);
      setSprintMaxTilt(0);
      sensorVelocityRef.current = 0;
      prevMotionTimeRef.current = null;
      sprintBearingRad.current = 0;
      lastGpsHeadingRef.current = null;

      if (sprint0100Enabled) {
        prevUpdateProfileRef.current = updateProfileRef.current;
        setUpdateProfile("race");
        updateProfileRef.current = "race";
      }

      setIsTracking(true);

      if (Platform.OS !== "web") {
        try {
          const available = await DeviceMotion.isAvailableAsync();
          if (available) {
            DeviceMotion.setUpdateInterval(sprint0100EnabledRef.current ? 100 : 250);
            deviceMotionSubRef.current = DeviceMotion.addListener((data) => {
              if (data.rotation) {
                const tiltRad = Math.abs(data.rotation.gamma ?? 0);
                const tiltDeg = tiltRad * (180 / Math.PI);
                if (tiltDeg > maxTiltRef.current) {
                  maxTiltRef.current = tiltDeg;
                  setMaxTilt(tiltDeg);
                }
                if (sprint0100EnabledRef.current && (sprintPhaseRef.current === "measuring")) {
                  if (tiltDeg > sprintMaxTiltRef.current) {
                    sprintMaxTiltRef.current = tiltDeg;
                    setSprintMaxTilt(tiltDeg);
                  }
                }
              }
              if (data.acceleration) {
                const { x, y, z } = data.acceleration;
                const magnitude = Math.sqrt((x ?? 0) ** 2 + (y ?? 0) ** 2 + (z ?? 0) ** 2) / 9.81;
                if (magnitude > maxAccelerationRef.current) {
                  maxAccelerationRef.current = magnitude;
                  setMaxAcceleration(magnitude);
                }
                if (sprint0100EnabledRef.current && (sprintPhaseRef.current === "measuring")) {
                  if (!vehicleDeceleratingRef.current && magnitude > sprintMaxAccelSensorRef.current) {
                    sprintMaxAccelSensorRef.current = magnitude;
                    setSprintMaxAccelSensor(magnitude);
                  }
                  if (vehicleDeceleratingRef.current && magnitude > sprintMaxDecelSensorRef.current) {
                    sprintMaxDecelSensorRef.current = magnitude;
                    setSprintMaxDecelSensor(magnitude);
                  }
                  const ax = x ?? 0;
                  const ay = y ?? 0;
                  const bearing = sprintBearingRad.current;
                  const aFwd = ax * Math.sin(bearing) + ay * Math.cos(bearing);
                  const tsNow = Date.now();
                  if (prevMotionTimeRef.current !== null) {
                    const dt = (tsNow - prevMotionTimeRef.current) / 1000;
                    if (dt > 0 && dt < 0.5 && aFwd > 0) {
                      sensorVelocityRef.current += aFwd * dt;
                    }
                  }
                  prevMotionTimeRef.current = tsNow;
                  if (sensorVelocityRef.current >= 27.78 && sprintStartTimeRef.current !== null) {
                    const elapsed = tsNow - sprintStartTimeRef.current;
                    setSprint0to100Ms(elapsed);
                    sprint0to100MsRef.current = elapsed;
                    sprintPhaseRef.current = "done";
                    setSprintPhase("done");
                    if (sprintAutoHandsOffRef.current) {
                      handsOffEnabledRef.current = false;
                      setHandsOffActive(false);
                    }
                  }
                }
              }
            });
          }
        } catch {}
      }

      timerRef.current = setInterval(() => {
        if (!isPausedRef.current && !stopAtZeroFreezeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
          setTotalTime(elapsed);
        }
      }, 1000);

      flushTimerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          flushPoints();
        }
      }, BATCH_FLUSH_INTERVAL_MS);

      statsSyncTimerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          syncStats();
        }
      }, STATS_SYNC_INTERVAL_MS);

      if (Platform.OS !== "web") {
        const config = getModeConfig("idle", updateProfileRef.current);
        const sub = await Location.watchPositionAsync(
          { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
          onNativeLocation
        );
        watchSubRef.current = sub;
      } else {
        const wid = navigator.geolocation.watchPosition(
          onWebLocation,
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000 }
        );
        webWatchIdRef.current = wid;
      }

      if (sprint0100Enabled) {
        if (Platform.OS !== "web") {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
            .then((loc) => setGpsAccuracy(loc.coords.accuracy ?? null))
            .catch(() => {});
        }
        let remaining = 10;
        setSprintCountdown(remaining);
        sprintPhaseRef.current = "countdown";
        setSprintPhase("countdown");
        sprintCountdownRef.current = setInterval(() => {
          remaining -= 1;
          setSprintCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(sprintCountdownRef.current!);
            sprintCountdownRef.current = null;
            sprintPhaseRef.current = "waiting";
            setSprintPhase("waiting");
          }
        }, 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const stopTracking = async () => {
    if (isPausedRef.current) {
      isPausedRef.current = false;
      setIsPaused(false);
    }
    setBgPermGranted(false);
    setBgReturnPoints(null);

    cleanupTracking();
    timerRef.current = null;
    flushTimerRef.current = null;
    statsSyncTimerRef.current = null;
    watchSubRef.current = null;
    webWatchIdRef.current = null;

    await flushPoints();

    const routeId = routeIdRef.current;
    if (!routeId) {
      if (sprintAutoHandsOffRef.current) {
        sprintAutoHandsOffRef.current = false;
        handsOffEnabledRef.current = handsOffEnabled;
        handsOffSpeedRef.current = parseFloat(handsOffSpeed || "80") || 80;
      }
      setIsTracking(false);
      setHandsOffActive(false);
      return;
    }

    setLoading(true);
    try {
      const dur = totalTime;
      const idle = Math.round(idleAccRef.current);
      const netT = Math.max(dur - idle, 0);
      const avgSpd = netT > 0 ? totalKmRef.current / (netT / 3600) : 0;

      await apiRequest("PUT", `/api/routes/${routeId}/stop`, {
        totalDistanceKm: totalKmRef.current,
        maxSpeedKmh: maxSpeedRef.current,
        avgSpeedKmh: avgSpd,
        maxAltitude: maxAltRef.current,
        durationSeconds: dur,
        idleTimeSeconds: idle,
        maxTiltDeg: maxTiltRef.current,
        maxAccelerationG: maxAccelerationRef.current,
        ...(sprint0to100MsRef.current !== null && { sprint0to100Ms: sprint0to100MsRef.current }),
      });
      routeIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });

      Alert.alert(
        "Sessione Completata",
        `Km: ${totalKmRef.current.toFixed(2)}\n` +
        `Tempo totale: ${formatTime(dur)}\n` +
        `Pause: ${formatTime(idle)}\n` +
        `Tempo netto: ${formatTime(netT)}\n` +
        `Vel. Media: ${avgSpd.toFixed(2)} km/h\n` +
        `Vel. Max: ${maxSpeedRef.current.toFixed(1)} km/h\n` +
        `Quota Max: ${maxAltRef.current.toFixed(0)} m\n` +
        `Punti GPS: ${totalPointsSentRef.current}`
      );

      setTotalTime(0);
      setIdleTime(0);
      setTotalKm(0);
      setMaxSpeed(0);
      setMaxAltitude(0);
      setCurrentSpeed(0);
      setPointsBuffered(0);
      setTotalPointsSent(0);

      if (sprint0100EnabledRef.current && prevUpdateProfileRef.current !== "race") {
        setUpdateProfile(prevUpdateProfileRef.current);
        updateProfileRef.current = prevUpdateProfileRef.current;
      }
    } catch {
      Alert.alert("Errore", "Errore nel completamento della sessione.");
    } finally {
      setIsTracking(false);
      if (sprintAutoHandsOffRef.current) {
        sprintAutoHandsOffRef.current = false;
        handsOffEnabledRef.current = handsOffEnabled;
        handsOffSpeedRef.current = parseFloat(handsOffSpeed || "80") || 80;
      }
      setHandsOffActive(false);
      setLoading(false);
    }
  };

  const handleStartPress = useCallback(() => {
    if (countdownValue !== null) return;
    if (!delayedStartEnabled) {
      startTracking();
      return;
    }
    const secs = Math.max(1, parseInt(delayedStartSeconds || "10", 10) || 10);
    setCountdownValue(secs);
    let remaining = secs;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownValue(remaining);
      } else {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
        setCountdownValue("GO");
        setTimeout(() => {
          setCountdownValue(null);
          startTracking();
        }, 600);
      }
    }, 1000);
  }, [countdownValue, delayedStartEnabled, delayedStartSeconds, startTracking]);

  const netTime = totalTime - idleTime;
  const avgSpeed = netTime > 0 ? totalKm / (netTime / 3600) : 0;
  const grossAvgSpeed = totalTime > 0 ? totalKm / (totalTime / 3600) : 0;
  const accuracyTier = getAccuracyTier(gpsAccuracy);

  return (
    <View style={styles.container}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <InlineMiniPlayer />
      </View>

      {countdownValue !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={[
            styles.countdownText,
            countdownValue === "GO"
              ? { color: Colors.success }
              : typeof countdownValue === "number" && countdownValue <= 3
              ? { color: Colors.accentRed }
              : { color: Colors.warning },
          ]}>
            {countdownValue}
          </Text>
        </View>
      )}
      <ScrollView
        pointerEvents={handsOffActive ? "none" : "auto"}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 20,
            paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
          },
        ]}
      >

      {isTracking ? (
        <>
          {bgPermGranted && (
            <View style={styles.bgBadge}>
              <Ionicons name="moon" size={12} color={Colors.accent} />
              <Text style={styles.bgBadgeText}>Background attivo</Text>
            </View>
          )}

          {bgReturnPoints !== null && (
            <View style={styles.bgBanner}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.bgBannerText}>
                {bgReturnPoints} {bgReturnPoints === 1 ? "punto GPS" : "punti GPS"} registrat{bgReturnPoints === 1 ? "o" : "i"} in background
              </Text>
            </View>
          )}

          <View style={styles.trackingHeader}>
            <Pressable
              style={[styles.mainBtn, { backgroundColor: Colors.accentRed }]}
              onPress={stopTracking}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Ionicons name="stop-circle" size={68} color="#fff" />
              )}
            </Pressable>
            <Pressable
              style={[styles.controlBtn, { backgroundColor: isPaused ? Colors.success : Colors.warning }]}
              onPress={togglePause}
            >
              <Ionicons name={isPaused ? "play" : "pause"} size={28} color="#fff" />
              <Text style={styles.controlLabel}>{isPaused ? "Riprendi" : "Pausa"}</Text>
            </Pressable>
          </View>

          <View style={styles.dashboard}>
            {sprintPhase !== "idle" ? (
              <SprintDashboard
                phase={sprintPhase}
                countdown={sprintCountdown}
                time0to100Ms={sprint0to100Ms}
                maxAccelGps={sprintMaxAccelGps}
                maxDecelGps={sprintMaxDecelGps}
                maxAccelSensor={sprintMaxAccelSensor}
                maxDecelSensor={sprintMaxDecelSensor}
                maxTilt={sprintMaxTilt}
                currentSpeed={currentSpeed}
              />
            ) : (
              <>
                <View style={styles.statusRow}>
                  {(() => {
                    const fermoGreen = !isPaused && currentSpeed < 1.5;
                    const fermoColor = isPaused ? Colors.warning : fermoGreen ? Colors.success : Colors.textSecondary;
                    const fermoBg = isPaused ? Colors.warning + "30" : fermoGreen ? Colors.success + "30" : Colors.textSecondary + "20";
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: fermoBg }]}>
                        <View style={[styles.statusDot, { backgroundColor: fermoColor }]} />
                        <Text style={[styles.statusText, { color: fermoColor }]}>
                          {isPaused ? "IN PAUSA" : "FERMO"}
                        </Text>
                      </View>
                    );
                  })()}
                  {accuracyTier ? (
                    <View style={styles.accuracyBadge}>
                      <Text style={[styles.accuracyText, { color: accuracyTier.color }]}>
                        {accuracyTier.label}
                      </Text>
                      <Text style={[styles.accuracyText, { color: "#ffffff" }]}>
                        {" "}{accuracyTier.value}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.speedBox}>
                  <Text style={[styles.speedValue, isPaused && { color: Colors.textSecondary }]}>
                    {isPaused ? "--" : currentSpeed.toFixed(1)}
                  </Text>
                  <Text style={styles.speedUnit}>km/h</Text>
                </View>
                <Text style={styles.subtitle}>Registra le tue prestazioni in moto</Text>

                <View style={styles.row}>
                  <StatCard icon="time" color={Colors.accent} value={formatTime(totalTime)} label="Tempo totale" />
                  <StatCard icon="pause-circle" color={Colors.warning} value={formatTime(idleTime)} label="Tempo fermo" />
                </View>
                <View style={styles.row}>
                  <StatCard icon="bicycle" color={Colors.success} value={formatTime(Math.max(netTime, 0))} label="Tempo netto" />
                  <StatCard icon="navigate" color={Colors.accent} value={totalKm.toFixed(2)} label="Km totali" />
                </View>
                <View style={styles.row}>
                  <StatCard icon="speedometer" color={Colors.accent} value={avgSpeed.toFixed(1)} label="Vel. media netta" />
                  <StatCard icon="analytics-outline" color={Colors.success} value={grossAvgSpeed.toFixed(1)} label="Vel. media lorda" />
                </View>
                <View style={styles.row}>
                  <StatCard icon="flash" color={Colors.accentRed} value={maxSpeed.toFixed(0)} label="Vel. max km/h" />
                  <StatCard icon="trending-up" color={Colors.success} value={maxAltitude.toFixed(0)} label="Quota max m" />
                </View>
                {Platform.OS !== "web" && (
                  <View style={styles.row}>
                    <StatCard icon="compass-outline" color={Colors.accent} value={maxTilt.toFixed(1) + "°"} label="Max Tilt" />
                    <StatCard icon="pulse-outline" color={Colors.accentRed} value={maxAcceleration.toFixed(2) + "G"} label="Acceleraz. Max" />
                  </View>
                )}
              </>
            )}
          </View>

          {currentCoord !== null && !sprint0100Enabled && (
            <View style={[styles.mapCard, mapExpanded && styles.mapCardExpanded]}>
              <TrackingMap
                points={mapCoords}
                currentLocation={currentCoord}
              />
              <TouchableOpacity
                style={styles.mapTapOverlay}
                onPress={() => setMapExpanded((e) => !e)}
                activeOpacity={1}
              >
                <View style={styles.mapExpandBtn} pointerEvents="none">
                  <Ionicons
                    name={mapExpanded ? "contract-outline" : "expand-outline"}
                    size={16}
                    color="#fff"
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {sprint0100Enabled && (sprintPhase === "waiting" || sprintPhase === "measuring") && (
            <SprintSpeedPanel
              currentSpeed={currentSpeed}
              phase={sprintPhase}
              maxAccelSensor={sprintMaxAccelSensor}
            />
          )}
        </>
      ) : (
        <>
          <Ionicons name="speedometer" size={48} color={Colors.accent} style={styles.headerIcon} />

          <View style={styles.profileSection}>
            <Text style={styles.profileTitle}>Frequenza di aggiornamento GPS</Text>
            <View style={styles.profileRow}>
              {(["easy", "medium", "race"] as UpdateProfile[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.profileBtn, updateProfile === p && styles.profileBtnActive]}
                  onPress={() => {
                    setUpdateProfile(p);
                    updateProfileRef.current = p;
                  }}
                >
                  <Text style={[styles.profileBtnLabel, updateProfile === p && styles.profileBtnLabelActive]}>
                    {PROFILE_LABELS[p]}
                  </Text>
                  <Text style={[styles.profileBtnDesc, updateProfile === p && styles.profileBtnDescActive]}>
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

          <View style={styles.delayedSection}>
            <View style={styles.delayedRow}>
              <View style={styles.delayedLeft}>
                <Ionicons name="timer-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.delayedLabel}>Countdown</Text>
              </View>
              <TextInput
                style={styles.delayedInput}
                value={delayedStartSeconds}
                onChangeText={setDelayedStartSeconds}
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={Colors.textSecondary}
                maxLength={3}
              />
              <Switch
                value={delayedStartEnabled}
                onValueChange={setDelayedStartEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={delayedStartEnabled ? Colors.accent : Colors.textSecondary}
              />
            </View>

            <View style={styles.triggerRow}>
              <View style={styles.delayedLeft}>
                <Ionicons name="stop-circle-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.triggerLabel}>Stop at 0 km/h</Text>
              </View>
              <Switch
                value={stopAtZeroEnabled}
                onValueChange={setStopAtZeroEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={stopAtZeroEnabled ? Colors.accent : Colors.textSecondary}
              />
            </View>

            <View style={styles.triggerRow}>
              <View style={styles.delayedLeft}>
                <Ionicons name="hand-left-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.triggerLabel}>Hands Off</Text>
              </View>
              <TextInput
                style={styles.delayedInput}
                value={handsOffSpeed}
                onChangeText={setHandsOffSpeed}
                keyboardType="numeric"
                placeholder="80"
                placeholderTextColor={Colors.textSecondary}
                maxLength={3}
              />
              <Switch
                value={handsOffEnabled}
                onValueChange={setHandsOffEnabled}
                trackColor={{ false: Colors.border, true: Colors.accent + "80" }}
                thumbColor={handsOffEnabled ? Colors.accent : Colors.textSecondary}
              />
            </View>

            <View style={styles.triggerRow}>
              <View style={styles.delayedLeft}>
                <Ionicons name="speedometer-outline" size={16} color={sprint0100Enabled ? Colors.accentRed : Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.triggerLabel, sprint0100Enabled && { color: Colors.accentRed, fontFamily: "Inter_700Bold" }]}>0-100 km/h</Text>
                  {sprint0100Enabled && (
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                      GPS Race forzato · countdown 10s
                    </Text>
                  )}
                </View>
              </View>
              <Switch
                value={sprint0100Enabled}
                onValueChange={setSprint0100Enabled}
                trackColor={{ false: Colors.border, true: Colors.accentRed + "80" }}
                thumbColor={sprint0100Enabled ? Colors.accentRed : Colors.textSecondary}
              />
            </View>
          </View>

          {accuracyTier ? (
            <View style={[styles.statusRow, { justifyContent: "center", marginBottom: 8 }]}>
              <View style={styles.accuracyBadge}>
                <Text style={[styles.accuracyText, { color: accuracyTier.color }]}>
                  {accuracyTier.label}
                </Text>
                <Text style={[styles.accuracyText, { color: "#ffffff" }]}>
                  {" "}{accuracyTier.value}
                </Text>
              </View>
            </View>
          ) : null}

          <Pressable
            style={[styles.mainBtnStart, { backgroundColor: Colors.success, alignSelf: "center" }]}
            onPress={handleStartPress}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Ionicons name="play-circle" size={87} color="#fff" />
            )}
          </Pressable>
        </>
      )}
      <Text style={styles.hint}>
        {isTracking ? (isPaused ? "In pausa — tocca Riprendi o Stop" : "Tracciamento attivo") : "Tocca per iniziare"}
      </Text>

      <View style={styles.recordsSection}>
        <Text style={styles.recordsTitle}>I tuoi record</Text>
        {recordsLoading ? (
          <ActivityIndicator color={Colors.accent} style={styles.recordsLoader} />
        ) : completedRecords.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="analytics" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun record ancora</Text>
          </View>
        ) : (
          completedRecords.map((item: RouteRecord) => (
            <RecordCard
              key={item.id}
              item={item}
              onPublish={() => { setPublishRecord(item); setPublishCaption(""); }}
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
                          queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
                        } catch {
                          Alert.alert("Errore", "Impossibile eliminare il record.");
                        }
                      },
                    },
                  ]
                );
              }}
            />
          ))
        )}
      </View>

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
              Aggiungi una descrizione al tuo record prima di pubblicarlo
            </Text>
            <TextInput
              style={styles.publishInput}
              placeholder="Es: Giro fantastico sulle colline toscane!"
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
                style={[styles.publishConfirmBtn, publishMutation.isPending && { opacity: 0.5 }]}
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
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, color, value, label }: { icon: string; color: string; value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RecordCard({ item, onPublish, onDelete }: { item: RouteRecord; onPublish: () => void; onDelete: () => void }) {
  const dur = item.durationSeconds || 0;
  const idle = item.idleTimeSeconds || 0;
  const net = Math.max(dur - idle, 0);

  return (
    <View style={[styles.recordCard, item.isSprint && { borderColor: Colors.accentRed, borderWidth: 1.5 }]}>
      <View style={styles.recordHeader}>
        <Ionicons name={item.isSprint ? "speedometer" : "flag"} size={16} color={item.isSprint ? Colors.accentRed : Colors.accent} />
        {item.isSprint && (
          <View style={{ backgroundColor: Colors.accentRed + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.accentRed }}>0-100</Text>
          </View>
        )}
        <Text style={[styles.recordDate, { flex: 1 }]}>
          {new Date(item.createdAt).toLocaleDateString(getCurrentLocale(), { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
        <TouchableOpacity onPress={onPublish} style={styles.publishIconBtn} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={18} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={[styles.publishIconBtn, { backgroundColor: Colors.accentRed + "15", marginLeft: 6 }]} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={Colors.accentRed} />
        </TouchableOpacity>
      </View>
      {item.isSprint ? (
        <>
          <View style={styles.recordRow}>
            <RecordStat
              value={item.sprint0to100Ms != null ? (item.sprint0to100Ms / 1000).toFixed(2) + "s" : "—"}
              label="0→100 km/h"
            />
            <RecordStat value={(item.maxSpeedKmh || 0).toFixed(0)} label="vel. max" />
            {item.maxAccelerationG != null && (
              <RecordStat value={item.maxAccelerationG.toFixed(2) + " G"} label="accel. max" />
            )}
            {item.maxTiltDeg != null && (
              <RecordStat value={item.maxTiltDeg.toFixed(1) + "°"} label="inclin. max" />
            )}
          </View>
          <View style={styles.recordRow}>
            <RecordStat value={formatTime(dur)} label="sessione" />
            <RecordStat value={item.sprint0to100Ms != null ? "Completato" : "Non completato"} label="risultato" />
          </View>
        </>
      ) : (
        <>
          <View style={styles.recordRow}>
            <RecordStat value={(item.totalDistanceKm || 0).toFixed(1)} label="km" />
            <RecordStat value={formatTime(dur)} label="totale" />
            <RecordStat value={formatTime(idle)} label="fermo" />
            <RecordStat value={formatTime(net)} label="netto" />
          </View>
          <View style={styles.recordRow}>
            <RecordStat value={(item.avgSpeedKmh || 0).toFixed(2)} label="vel. media" />
            <RecordStat value={(item.maxSpeedKmh || 0).toFixed(0)} label="vel. max" />
            <RecordStat value={(item.maxAltitude || 0).toFixed(0)} label="quota max" />
          </View>
          {(item.maxTiltDeg != null || item.maxAccelerationG != null) && (
            <View style={styles.recordRow}>
              {item.maxTiltDeg != null && (
                <RecordStat value={item.maxTiltDeg.toFixed(1) + "°"} label="inclin. max" />
              )}
              {item.maxAccelerationG != null && (
                <RecordStat value={item.maxAccelerationG.toFixed(2) + " G"} label="accel. max" />
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function RecordStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.recordStat}>
      <Text style={styles.recordValue}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  );
}

function SprintSpeedPanel({
  currentSpeed,
  phase,
  maxAccelSensor,
}: {
  currentSpeed: number;
  phase: "waiting" | "measuring";
  maxAccelSensor: number;
}) {
  const isMeasuring = phase === "measuring";
  const phaseColor = isMeasuring ? Colors.accentRed : Colors.success;
  const phaseLabel = isMeasuring ? "VIA!" : "ATTENDI";
  const phaseSubLabel = isMeasuring ? "In misurazione 0→100 km/h" : "Fermo — accelera per iniziare";
  const phaseIcon: "flash" | "hourglass-outline" = isMeasuring ? "flash" : "hourglass-outline";

  return (
    <View style={sprintSpeedStyles.container}>
      <View style={[sprintSpeedStyles.phaseBadge, { backgroundColor: phaseColor + "20", borderColor: phaseColor }]}>
        <Ionicons name={phaseIcon} size={16} color={phaseColor} />
        <Text style={[sprintSpeedStyles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
      </View>

      <View style={sprintSpeedStyles.speedBlock}>
        <Text style={[sprintSpeedStyles.speedValue, { color: isMeasuring ? Colors.accentRed : Colors.text }]}>
          {currentSpeed.toFixed(0)}
        </Text>
        <Text style={sprintSpeedStyles.speedUnit}>km/h</Text>
      </View>

      <Text style={sprintSpeedStyles.subLabel}>{phaseSubLabel}</Text>

      {isMeasuring && maxAccelSensor > 0 && (
        <View style={sprintSpeedStyles.accelRow}>
          <Ionicons name="trending-up-outline" size={14} color={Colors.success} />
          <Text style={sprintSpeedStyles.accelText}>
            Accel. max {maxAccelSensor.toFixed(2)} G
          </Text>
        </View>
      )}
    </View>
  );
}

const sprintSpeedStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    height: 220,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingHorizontal: 20,
  },
  phaseBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  phaseLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold" as const,
    letterSpacing: 1.5,
  },
  speedBlock: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 6,
  },
  speedValue: {
    fontSize: 80,
    fontFamily: "Inter_700Bold" as const,
    lineHeight: 88,
    letterSpacing: -2,
  },
  speedUnit: {
    fontSize: 22,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular" as const,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  accelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 2,
  },
  accelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.success,
  },
});

function SprintDashboard({
  phase, countdown, time0to100Ms, maxAccelGps, maxDecelGps, maxAccelSensor, maxDecelSensor, maxTilt, currentSpeed
}: {
  phase: "idle" | "countdown" | "waiting" | "measuring" | "done";
  countdown: number;
  time0to100Ms: number | null;
  maxAccelGps: number;
  maxDecelGps: number;
  maxAccelSensor: number;
  maxDecelSensor: number;
  maxTilt: number;
  currentSpeed: number;
}) {
  const phaseLabel = phase === "countdown"
    ? `Preparati... ${countdown}`
    : phase === "waiting"
    ? "Accelera! ▶"
    : phase === "measuring"
    ? "In misura..."
    : "Risultati";

  const phaseColor = phase === "countdown"
    ? Colors.warning
    : phase === "waiting"
    ? Colors.success
    : phase === "measuring"
    ? Colors.accentRed
    : Colors.accent;

  const timeStr = time0to100Ms !== null
    ? `${(time0to100Ms / 1000).toFixed(2)}s`
    : phase === "done" ? "N/D" : "--";

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1, backgroundColor: phaseColor + "20", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: phaseColor }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: phaseColor, textAlign: "center" }}>
            {phaseLabel}
          </Text>
        </View>
        <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border, alignItems: "center", minWidth: 80 }}>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.accent }}>{currentSpeed.toFixed(0)}</Text>
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>km/h</Text>
        </View>
      </View>

      <View style={sprintStyles.panel}>
        <Ionicons name="timer-outline" size={20} color={Colors.accentRed} />
        <Text style={sprintStyles.panelLabel}>Tempo 0→100 km/h</Text>
        <Text style={[sprintStyles.panelValue, { color: Colors.accentRed }]}>{timeStr}</Text>
      </View>

      <View style={sprintStyles.panel}>
        <Ionicons name="trending-up-outline" size={20} color={Colors.success} />
        <Text style={sprintStyles.panelLabel}>Acceleraz. Max</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          <View style={{ alignItems: "center" }}>
            <Text style={[sprintStyles.panelValue, { color: Colors.success, fontSize: 22 }]}>
              {maxAccelGps > 0 ? `${maxAccelGps.toFixed(2)}G` : "--"}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>GPS</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[sprintStyles.panelValue, { color: Colors.success, fontSize: 22 }]}>
              {maxAccelSensor > 0 ? `${maxAccelSensor.toFixed(2)}G` : "--"}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>Sensore</Text>
          </View>
        </View>
      </View>

      <View style={sprintStyles.panel}>
        <Ionicons name="trending-down-outline" size={20} color={Colors.warning} />
        <Text style={sprintStyles.panelLabel}>Decel. Max</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          <View style={{ alignItems: "center" }}>
            <Text style={[sprintStyles.panelValue, { color: Colors.warning, fontSize: 22 }]}>
              {maxDecelGps > 0 ? `${maxDecelGps.toFixed(2)}G` : "--"}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>GPS</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[sprintStyles.panelValue, { color: Colors.warning, fontSize: 22 }]}>
              {maxDecelSensor > 0 ? `${maxDecelSensor.toFixed(2)}G` : "--"}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>Sensore</Text>
          </View>
        </View>
      </View>

      <View style={sprintStyles.panel}>
        <Ionicons name="compass-outline" size={20} color={Colors.accent} />
        <Text style={sprintStyles.panelLabel}>Max Tilt</Text>
        <Text style={[sprintStyles.panelValue, { color: Colors.accent }]}>
          {maxTilt > 0 ? `${maxTilt.toFixed(1)}°` : "--"}
        </Text>
      </View>
    </View>
  );
}

const sprintStyles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  panelLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold" as const,
    color: Colors.text,
  },
  panelValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold" as const,
  },
});

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  headerIcon: { alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 24 },
  dashboard: { marginBottom: 24 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 23, fontFamily: "Inter_700Bold" },
  accuracyBadge: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  accuracyText: { fontSize: 23, fontFamily: "Inter_700Bold" },
  speedBox: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 20, alignItems: "center",
    marginBottom: 12, borderWidth: 1, borderColor: Colors.accent,
  },
  speedValue: { fontSize: 48, fontFamily: "Inter_700Bold", color: Colors.accent },
  speedUnit: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  row: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  trackingHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 20, marginBottom: 16,
  },
  controlBtn: {
    width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center",
    elevation: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: {},
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.25)" },
    }),
  },
  controlLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff", marginTop: 2 },
  mainBtn: {
    width: 173, height: 173, borderRadius: 87,
    alignItems: "center", justifyContent: "center",
    elevation: 8,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: {},
      web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" },
    }),
  },
  mainBtnStart: {
    width: 187, height: 187, borderRadius: 94,
    alignItems: "center", justifyContent: "center",
    elevation: 8,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: {},
      web: { boxShadow: "0px 4px 8px rgba(0,0,0,0.3)" },
    }),
  },
  hint: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary,
    textAlign: "center", marginTop: 8, marginBottom: 16,
  },
  infoBox: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.surface,
    borderRadius: 10, padding: 10, marginBottom: 24, borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, flex: 1 },
  recordsSection: { marginTop: 8 },
  recordsTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  recordsLoader: { marginTop: 16 },
  emptyBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  recordCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  recordHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  recordDate: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  recordRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  recordStat: { alignItems: "center", flex: 1 },
  recordValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text },
  recordLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  publishIconBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: Colors.accent + "15",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  publishModal: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  publishTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 6,
  },
  publishSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  publishInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 70,
    textAlignVertical: "top" as const,
    marginBottom: 16,
  },
  publishActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 10,
  },
  publishCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  publishCancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  publishConfirmBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  publishConfirmText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  profileSection: {
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  profileRow: {
    flexDirection: "row" as const,
    gap: 6,
    marginBottom: 8,
  },
  profileBtn: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  profileBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
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
    textAlign: "center" as const,
    marginTop: 2,
  },
  profileBtnDescActive: {
    color: Colors.accent,
  },
  profileWarning: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: Colors.warning + "15",
    borderRadius: 8,
    padding: 8,
  },
  profileWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
  },
  delayedSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  delayedRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  delayedLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
  },
  delayedLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  triggerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  triggerLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  delayedInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    width: 60,
    textAlign: "center" as const,
  },
  countdownOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    zIndex: 100,
  },
  countdownText: {
    fontSize: 240,
    fontFamily: "Inter_700Bold",
    textAlign: "center" as const,
  },
  bgBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-end" as const,
    gap: 4,
    backgroundColor: Colors.accent + "18",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  bgBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  bgBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: Colors.success + "CC",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  bgBannerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
  mapCard: {
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative" as const,
    height: 200,
  },
  mapCardExpanded: {
    height: 380,
  },
  mapTapOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "flex-end" as const,
    justifyContent: "flex-end" as const,
    padding: 10,
  },
  mapExpandBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    padding: 6,
  },
});
