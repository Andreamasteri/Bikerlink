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
type BatteryImpact = "alta" | "media" | "bassa";

const IDLE_THRESHOLD_KMH = 3;
const BATCH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 30000;
const AUTO_PAUSE_TIMEOUT_MS = 10 * 60 * 1000;
const STATS_SYNC_INTERVAL_MS = 60000;

function getTrackingMode(speedKmh: number): TrackingMode {
  if (speedKmh > 60) return "highway";
  if (speedKmh > 10) return "city";
  return "idle";
}

function getModeConfig(mode: TrackingMode): { accuracy: Location.Accuracy; timeInterval: number; distanceInterval: number } {
  switch (mode) {
    case "highway":
      return { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 10 };
    case "city":
      return { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 };
    case "idle":
      return { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 2 };
  }
}

function getBatteryImpact(mode: TrackingMode): BatteryImpact {
  switch (mode) {
    case "highway": return "alta";
    case "city": return "media";
    case "idle": return "bassa";
  }
}

function getBatteryColor(impact: BatteryImpact): string {
  switch (impact) {
    case "alta": return Colors.accentRed;
    case "media": return Colors.warning;
    case "bassa": return Colors.success;
  }
}

function getBatteryIcon(impact: BatteryImpact): string {
  switch (impact) {
    case "alta": return "battery-dead";
    case "media": return "battery-half";
    case "bassa": return "battery-full";
  }
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

  const switchTrackingAccuracy = useCallback(async (newMode: TrackingMode) => {
    if (Platform.OS === "web") return;
    if (currentModeRef.current === newMode) return;
    currentModeRef.current = newMode;
    setTrackingMode(newMode);

    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }

    const config = getModeConfig(newMode);
    const sub = await Location.watchPositionAsync(
      { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
      (loc) => {
        if (!isPausedRef.current) {
          handleGpsUpdate(loc.coords.latitude, loc.coords.longitude, loc.coords.altitude, loc.coords.speed);
        }
      }
    );
    watchSubRef.current = sub;
  }, []);

  const handleGpsUpdate = useCallback((lat: number, lng: number, altitude: number | null, speedMs: number | null) => {
    if (isPausedRef.current) return;

    const now = Date.now();
    const speedKmh = speedMs !== null && speedMs >= 0 ? speedMs * 3.6 : 0;

    setCurrentSpeed(speedKmh);

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
        const config = getModeConfig(currentModeRef.current);
        Location.watchPositionAsync(
          { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
          (loc) => {
            if (!isPausedRef.current) {
              handleGpsUpdate(loc.coords.latitude, loc.coords.longitude, loc.coords.altitude, loc.coords.speed);
            }
          }
        ).then((sub) => {
          watchSubRef.current = sub;
        });
      } else if (Platform.OS === "web") {
        const wid = navigator.geolocation.watchPosition(
          (pos) => {
            if (!isPausedRef.current) {
              handleGpsUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.speed);
            }
          },
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

      setIsTracking(true);

      timerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
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
        const config = getModeConfig("idle");
        const sub = await Location.watchPositionAsync(
          { accuracy: config.accuracy, timeInterval: config.timeInterval, distanceInterval: config.distanceInterval },
          (loc) => {
            if (!isPausedRef.current) {
              handleGpsUpdate(loc.coords.latitude, loc.coords.longitude, loc.coords.altitude, loc.coords.speed);
            }
          }
        );
        watchSubRef.current = sub;
      } else {
        const wid = navigator.geolocation.watchPosition(
          (pos) => {
            if (!isPausedRef.current) {
              handleGpsUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.speed);
            }
          },
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
      await apiRequest("PUT", `/api/routes/${routeId}/stop`);
      setIsTracking(false);
      routeIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });

      const dur = totalTime;
      const idle = Math.round(idleAccRef.current);
      const netT = Math.max(dur - idle, 0);
      Alert.alert(
        "Sessione Completata",
        `Km: ${totalKmRef.current.toFixed(2)}\n` +
        `Tempo totale: ${formatTime(dur)}\n` +
        `Pause: ${formatTime(idle)}\n` +
        `Tempo netto: ${formatTime(netT)}\n` +
        `Vel. Max: ${maxSpeedRef.current.toFixed(0)} km/h\n` +
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

  const netTime = totalTime - idleTime;
  const avgSpeed = netTime > 0 ? totalKm / (netTime / 3600) : 0;
  const batteryImpact = getBatteryImpact(trackingMode);
  const batteryColor = getBatteryColor(batteryImpact);

  return (
    <View style={styles.container}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <InlineMiniPlayer />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 56,
            paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
          },
        ]}
      >
      <Ionicons name="speedometer" size={48} color={Colors.accent} style={styles.headerIcon} />
      <Text style={styles.title}>Performance Counter</Text>
      <Text style={styles.subtitle}>Registra le tue prestazioni in moto</Text>

      {isTracking && (
        <View style={styles.dashboard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: isPaused ? Colors.warning + "30" : Colors.success + "30" }]}>
              <View style={[styles.statusDot, { backgroundColor: isPaused ? Colors.warning : Colors.success }]} />
              <Text style={[styles.statusText, { color: isPaused ? Colors.warning : Colors.success }]}>
                {isPaused ? "IN PAUSA" : trackingMode === "highway" ? "AUTOSTRADA" : trackingMode === "city" ? "CITTÀ" : "FERMO"}
              </Text>
            </View>
            <View style={[styles.batteryBadge, { backgroundColor: batteryColor + "20" }]}>
              <Ionicons name={getBatteryIcon(batteryImpact) as any} size={14} color={batteryColor} />
              <Text style={[styles.batteryText, { color: batteryColor }]}>
                {batteryImpact.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.speedBox}>
            <Text style={[styles.speedValue, isPaused && { color: Colors.textSecondary }]}>
              {isPaused ? "--" : currentSpeed.toFixed(0)}
            </Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>

          <View style={styles.row}>
            <StatCard icon="time" color={Colors.accent} value={formatTime(totalTime)} label="Tempo totale" />
            <StatCard icon="pause-circle" color={Colors.warning} value={formatTime(idleTime)} label="Tempo fermo" />
          </View>
          <View style={styles.row}>
            <StatCard icon="bicycle" color={Colors.success} value={formatTime(Math.max(netTime, 0))} label="Tempo netto" />
            <StatCard icon="speedometer" color={Colors.accent} value={avgSpeed.toFixed(1)} label="Vel. media km/h" />
          </View>
          <View style={styles.row}>
            <StatCard icon="flash" color={Colors.accentRed} value={maxSpeed.toFixed(0)} label="Vel. max km/h" />
            <StatCard icon="trending-up" color={Colors.success} value={maxAltitude.toFixed(0)} label="Quota max m" />
          </View>
          <View style={styles.row}>
            <StatCard icon="navigate" color={Colors.accent} value={totalKm.toFixed(2)} label="Km totali" />
            <StatCard icon="cloud-upload" color={Colors.maleIcon} value={`${pointsBuffered}/${totalPointsSent}`} label="Buffer / Inviati" />
          </View>
        </View>
      )}

      {isTracking ? (
        <View style={styles.controlRow}>
          <Pressable
            style={[styles.controlBtn, { backgroundColor: isPaused ? Colors.success : Colors.warning }]}
            onPress={togglePause}
          >
            <Ionicons name={isPaused ? "play" : "pause"} size={28} color="#fff" />
            <Text style={styles.controlLabel}>{isPaused ? "Riprendi" : "Pausa"}</Text>
          </Pressable>
          <Pressable
            style={[styles.mainBtn, { backgroundColor: Colors.accentRed }]}
            onPress={stopTracking}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Ionicons name="stop-circle" size={56} color="#fff" />
            )}
          </Pressable>
          <View style={styles.controlPlaceholder} />
        </View>
      ) : (
        <Pressable
          style={[styles.mainBtn, { backgroundColor: Colors.warning, alignSelf: "center" }]}
          onPress={startTracking}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons name="play-circle" size={56} color="#fff" />
          )}
        </Pressable>
      )}
      <Text style={styles.hint}>
        {isTracking ? (isPaused ? "In pausa — tocca Riprendi o Stop" : "Tracciamento attivo") : "Tocca per iniziare"}
      </Text>

      {isTracking && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            Frequenza GPS adattiva: {trackingMode === "highway" ? "3s (alta precisione)" : trackingMode === "city" ? "5s (bilanciato)" : "15s (risparmio)"}
            {" · "}Punti inviati in batch da {BATCH_SIZE}
          </Text>
        </View>
      )}

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
            <RecordCard key={item.id} item={item} onPublish={() => { setPublishRecord(item); setPublishCaption(""); }} />
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

function RecordCard({ item, onPublish }: { item: RouteRecord; onPublish: () => void }) {
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
      </View>
      <View style={styles.recordRow}>
        <RecordStat value={(item.totalDistanceKm || 0).toFixed(1)} label="km" />
        <RecordStat value={formatTime(dur)} label="totale" />
        <RecordStat value={formatTime(idle)} label="fermo" />
        <RecordStat value={formatTime(net)} label="netto" />
      </View>
      <View style={styles.recordRow}>
        <RecordStat value={(item.avgSpeedKmh || 0).toFixed(1)} label="vel. media" />
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
  statusText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  batteryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  batteryText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 4 },
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
  controlPlaceholder: { width: 80 },
  mainBtn: {
    width: 120, height: 120, borderRadius: 60,
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
});
