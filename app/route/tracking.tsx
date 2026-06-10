import { useState, useEffect, useRef, useCallback } from "react";
import { haversineKm } from "@/lib/geo";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import TrackingMap from "@/components/TrackingMap";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useTelemetry } from "@/hooks/useTelemetry";
import { setManualTrackingActive } from "@/lib/manual-tracking-flag";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";
import DebugPanel from "@/components/DebugPanel";
import { StatBox } from "@/components/route/tracking/StatBox";
import { TrackingControls } from "@/components/route/tracking/TrackingControls";

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speedKmh: number | null;
  timestamp: string;
}

const FREQUENCY_OPTIONS = [
  { label: "1s", value: 1 },
  { label: "5s", value: 5 },
  { label: "30s", value: 30 },
];

export default function TrackingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { logs: debugLogs, clearLogs: clearDebugLogs, logFetch } = useApiDebugLog();
  const [debugVisible, setDebugVisible] = useState(__DEV__);
  const logFetchRef = useRef(logFetch);
  useEffect(() => { logFetchRef.current = logFetch; }, [logFetch]);
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDebugTap = useCallback(() => {
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= 5) {
      debugTapCount.current = 0;
      setDebugVisible((v) => !v);
      return;
    }
    debugTapTimer.current = setTimeout(() => { debugTapCount.current = 0; }, 1500);
  }, []);

  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [isTracking, setIsTracking] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState(5);
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [stats, setStats] = useState({
    distance: 0,
    speed: 0,
    maxSpeed: 0,
    altitude: 0,
    duration: 0,
  });

  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const pendingPointsRef = useRef<GpsPoint[]>([]);
  const lastSendRef = useRef<number>(0);

  const { pushLocation: pushTelemetryLocation } = useTelemetry(isTracking, true);
  const pushTelemetryLocationRef = useRef(pushTelemetryLocation);
  useEffect(() => { pushTelemetryLocationRef.current = pushTelemetryLocation; }, [pushTelemetryLocation]);

  const startMutation = useMutation({
    mutationFn: async (freq: number) => {
      return logFetchRef.current<{ id: string }>("/api/routes", "POST", () =>
        apiRequest("POST", "/api/routes", { trackingFrequency: freq })
      );
    },
  });

  const sendPointsMutation = useMutation({
    mutationFn: async ({
      id,
      pts,
    }: {
      id: string;
      pts: GpsPoint[];
    }) => {
      return logFetchRef.current(`/api/routes/${id}/points`, "POST", () =>
        apiRequest("POST", `/api/routes/${id}/points`, { points: pts })
      );
    },
    onError: (error: Error) => {
      Alert.alert(
        t("gps_error_title") || "Errore GPS",
        (error as Error).message || t("gps_error_body") || "Impossibile salvare i punti GPS. Verifica la connessione e riprova.",
        [{ text: "OK" }]
      );
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      return logFetchRef.current(`/api/routes/${id}/stop`, "PUT", () =>
        apiRequest("PUT", `/api/routes/${id}/stop`)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
    },
  });

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) {
      getCurrentLocation();
    }
  }, [permission]);

  const getCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch {
      // no-op: location tracking best-effort
    }
  };


  const startTracking = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }

    try {
      const route = await startMutation.mutateAsync(frequency);
      setRouteId(route.id);
      setManualTrackingActive(true);
      setIsTracking(true);
      setPoints([]);
      pendingPointsRef.current = [];
      startTimeRef.current = Date.now();
      lastSendRef.current = Date.now();
      setStats({ distance: 0, speed: 0, maxSpeed: 0, altitude: 0, duration: 0 });

      intervalRef.current = setInterval(() => {
        setStats((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 1000);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: frequency * 1000,
          distanceInterval: 1,
        },
        (loc) => {
          // Forward every GPS fix to the telemetry hook so it can build
          // accelerometer-enriched samples without opening a second subscription.
          pushTelemetryLocationRef.current(loc);

          const speedMs = loc.coords.speed ?? 0;
          const speedKmh = Math.max(0, speedMs * 3.6);
          const alt = loc.coords.altitude ?? 0;

          const newPoint: GpsPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: alt,
            speedKmh,
            timestamp: new Date().toISOString(),
          };

          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });

          setPoints((prev) => {
            const updated = [...prev, newPoint];

            let totalDist = 0;
            for (let i = 1; i < updated.length; i++) {
              totalDist += haversineKm(
                updated[i - 1].latitude,
                updated[i - 1].longitude,
                updated[i].latitude,
                updated[i].longitude
              );
            }

            setStats((s) => ({
              ...s,
              distance: totalDist,
              speed: speedKmh,
              maxSpeed: Math.max(s.maxSpeed, speedKmh),
              altitude: alt,
            }));

            return updated;
          });

          pendingPointsRef.current.push(newPoint);

          if (
            pendingPointsRef.current.length >= 10 ||
            Date.now() - lastSendRef.current > 30000
          ) {
            const toSend = [...pendingPointsRef.current];
            pendingPointsRef.current = [];
            lastSendRef.current = Date.now();
            sendPointsMutation.mutate({ id: route.id, pts: toSend });
          }
        }
      );

      locationSubRef.current = sub;
    } catch (err) {
      console.error("Start tracking error:", err);
    }
  };

  const stopTracking = async () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (routeId) {
      if (pendingPointsRef.current.length > 0) {
        try {
          await sendPointsMutation.mutateAsync({
            id: routeId,
            pts: pendingPointsRef.current,
          });
          pendingPointsRef.current = [];
        } catch {
          // no-op: points remain in ref and will be retried
        }
      }

      try {
        await stopMutation.mutateAsync(routeId);
      } catch {
        // no-op: server tracking will time out naturally
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/route/${routeId}` as any);
    }

    setManualTrackingActive(false);
    setIsTracking(false);
    setRouteId(null);
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    return () => {
      if (locationSubRef.current) locationSubRef.current.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setManualTrackingActive(false);
    };
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="map-marker-off"
          size={64}
          color={Colors.textSecondary}
        />
        <Text style={styles.permText}>
          Permesso di localizzazione necessario per il tracking GPS
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Concedi permesso</Text>
        </TouchableOpacity>
        {permission.status === "denied" &&
          !permission.canAskAgain &&
          (
            <TouchableOpacity
              style={[styles.permButton, { backgroundColor: Colors.surfaceLight }]}
              onPress={() => {
                try {
                  Location.enableNetworkProviderAsync?.();
                } catch {
                  // no-op: best-effort opening settings
                }
              }}
            >
              <Text style={styles.permButtonText}>Apri Impostazioni</Text>
            </TouchableOpacity>
          )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {currentLocation ? (
          <TrackingMap
            points={points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
            currentLocation={currentLocation}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <MaterialCommunityIcons
              name="map-search"
              size={48}
              color={Colors.textSecondary}
            />
            <Text style={styles.mapPlaceholderText}>
              Acquisizione posizione...
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statsPanel}>
        <View style={styles.statsRow}>
          <Pressable onPress={handleDebugTap} hitSlop={8} style={{ flex: 1 }}>
            <StatBox
              icon="road-variant"
              label={t("tracking.distance")}
              value={`${stats.distance.toFixed(2)} km`}
            />
          </Pressable>
          <StatBox
            icon="speedometer"
            label={t("tracking.speed")}
            value={`${stats.speed.toFixed(0)} km/h`}
          />
        </View>
        <View style={styles.statsRow}>
          <StatBox
            icon="mountain"
            label={t("tracking.altitude")}
            value={`${stats.altitude.toFixed(0)} m`}
          />
          <StatBox
            icon="timer-outline"
            label={t("tracking.duration")}
            value={formatDuration(stats.duration)}
          />
        </View>

        <TrackingControls
          isTracking={isTracking}
          frequency={frequency}
          options={FREQUENCY_OPTIONS}
          onFrequencyChange={setFrequency}
          maxSpeed={stats.maxSpeed}
          onActionPress={isTracking ? stopTracking : startTracking}
          isPending={startMutation.isPending || stopMutation.isPending}
          t={t}
        />

        {debugVisible && (
          <DebugPanel logs={debugLogs} onClear={clearDebugLogs} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  permText: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  permButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  permButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  mapContainer: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  mapPlaceholderText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  statsPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
});
