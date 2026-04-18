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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCurrentLocale } from "@/lib/i18n";
import { InlineMiniPlayer } from "@/components/MiniPlayer";

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
}

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  timestamp: string;
}

type TrackingMode = "highway" | "city" | "idle";
type UpdateProfile = "easy" | "medium" | "race";

const IDLE_THRESHOLD_KMH = 3;
const BATCH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 30000;
const AUTO_PAUSE_TIMEOUT_MS = 10 * 60 * 1000;
const STATS_SYNC_INTERVAL_MS = 60000;

const PROFILE_LABELS: Record<UpdateProfile, string> = {
  easy: "Easy",
  medium: "Medium",
  race: "Race",
};

const PROFILE_DESCRIPTIONS: Record<UpdateProfile, string> = {
  easy: "Risparmio energetico",
  medium: "Bilanciato",
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
  const mult = profile === "easy" ? 2 : 1;
  switch (mode) {
    case "highway":
      return { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000 * mult, distanceInterval: 10 * mult };
    case "city":
      return { accuracy: Location.Accuracy.High, timeInterval: 5000 * mult, distanceInterval: 5 * mult };
    case "idle":
      return { accuracy: Location.Accuracy.Balanced, timeInterval: 15000 * mult, distanceInterval: 2 * mult };
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

  const [publishRecord, setPublishRecord] = useState<RouteRecord | null>(null);
  const [publishCaption, setPublishCaption] = useState("");

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

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    if (nextState === "active" && routeIdRef.current && pointsBufferRef.current.length > 0) {
      flushPoints();
    }
  }, []);

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
    if (speedMs !== null && speedMs >= 0) {
      speedKmh = speedMs * 3.6;
    } else if (lastPosRef.current && (now - lastPosRef.current.time) > 500) {
      const fallbackDist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
      const intervalSec = (now - lastPosRef.current.time) / 1000;
      speedKmh = (fallbackDist / intervalSec) * 3600;
    } else {
      speedKmh = 0;
    }

    setCurrentSpeed(speedKmh);

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

  const startTracking = async () => {
    try {
      setLoading(true);

      if (Platform.OS !== "web") {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== "granted") {
          Alert.alert("Permesso Negato", "Il permesso GPS è necessario per il tracciamento.");
          return;
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
        res = await apiRequest("POST", "/api/routes", { trackingFrequency: 5 });
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
      totalPointsSentRef.current = 0;
      updateProfileRef.current = updateProfile;
      stopAtZeroEnabledRef.current = stopAtZeroEnabled;
      handsOffEnabledRef.current = handsOffEnabled;
      handsOffSpeedRef.current = parseFloat(handsOffSpeed || "80") || 80;
      stopAtZeroFreezeRef.current = false;
      setHandsOffActive(false);

      setIsTracking(true);

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
        const config = getModeConfig("idle", updateProfile);
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
    } finally {
      setLoading(false);
    }
  };

  const stopTracking = async () => {
    if (isPausedRef.current) {
      isPausedRef.current = false;
      setIsPaused(false);
    }

    cleanupTracking();
    timerRef.current = null;
    flushTimerRef.current = null;
    statsSyncTimerRef.current = null;
    watchSubRef.current = null;
    webWatchIdRef.current = null;

    await flushPoints();

    const routeId = routeIdRef.current;
    if (!routeId) return;


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
      });
      setIsTracking(false);
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
    } catch {
      Alert.alert("Errore", "Errore nel completamento della sessione.");
    } finally {
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
          </View>
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
    <View style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <Ionicons name="flag" size={16} color={Colors.accent} />
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
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 12,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  profileRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 12,
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
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
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
    paddingTop: 6,
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
});
