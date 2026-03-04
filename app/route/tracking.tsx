import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import TrackingMap from "@/components/TrackingMap";
import { apiRequest } from "@/lib/query-client";
import { Colors } from "@/constants/colors";
import { t } from "@/lib/i18n";

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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();


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

  const startMutation = useMutation({
    mutationFn: async (freq: number) => {
      const res = await apiRequest("POST", "/api/routes", {
        trackingFrequency: freq,
      });
      return res.json();
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
      const res = await apiRequest("POST", `/api/routes/${id}/points`, {
        points: pts,
      });
      return res.json();
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/routes/${id}/stop`);
      return res.json();
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
    } catch {}
  };

  const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startTracking = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }

    try {
      const route = await startMutation.mutateAsync(frequency);
      setRouteId(route.id);
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
        } catch {}
      }

      try {
        await stopMutation.mutateAsync(routeId);
      } catch {}

      router.replace(`/route/${routeId}` as any);
    }

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
          color={Colors.dark.textMuted}
        />
        <Text style={styles.permText}>
          Permesso di localizzazione necessario per il tracking GPS
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Concedi permesso</Text>
        </TouchableOpacity>
        {permission.status === "denied" &&
          !permission.canAskAgain &&
          Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.permButton, { backgroundColor: Colors.dark.surfaceLight }]}
              onPress={() => {
                try {
                  Location.enableNetworkProviderAsync?.();
                } catch {}
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
              color={Colors.dark.textMuted}
            />
            <Text style={styles.mapPlaceholderText}>
              Acquisizione posizione...
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statsPanel}>
        <View style={styles.statsRow}>
          <StatBox
            icon="road-variant"
            label={t("tracking.distance")}
            value={`${stats.distance.toFixed(2)} km`}
          />
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

        {!isTracking && (
          <View style={styles.frequencyRow}>
            <Text style={styles.frequencyLabel}>{t("tracking.frequency")}:</Text>
            {FREQUENCY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.freqChip,
                  frequency === opt.value && styles.freqChipActive,
                ]}
                onPress={() => setFrequency(opt.value)}
              >
                <Text
                  style={[
                    styles.freqChipText,
                    frequency === opt.value && styles.freqChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isTracking && (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              MAX: {stats.maxSpeed.toFixed(0)} km/h
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.actionButton,
            isTracking ? styles.stopButton : styles.startButton,
          ]}
          onPress={isTracking ? stopTracking : startTracking}
          disabled={startMutation.isPending || stopMutation.isPending}
        >
          <MaterialCommunityIcons
            name={isTracking ? "stop-circle" : "play-circle"}
            size={28}
            color="#FFFFFF"
          />
          <Text style={styles.actionButtonText}>
            {isTracking ? t("tracking.stop") : t("tracking.start")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statBox}>
      <MaterialCommunityIcons
        name={icon as any}
        size={20}
        color={Colors.dark.accent}
      />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  permText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  permButton: {
    backgroundColor: Colors.dark.accent,
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
    backgroundColor: Colors.dark.surface,
  },
  mapPlaceholderText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    marginTop: 8,
  },
  statsPanel: {
    backgroundColor: Colors.dark.surface,
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
  statBox: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  statValue: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700" as const,
    marginTop: 2,
  },
  frequencyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 4,
  },
  frequencyLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    marginRight: 12,
  },
  freqChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    marginRight: 8,
  },
  freqChipActive: {
    backgroundColor: Colors.dark.accent,
  },
  freqChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  freqChipTextActive: {
    color: "#FFFFFF",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
    marginRight: 8,
  },
  liveText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  startButton: {
    backgroundColor: Colors.dark.success,
  },
  stopButton: {
    backgroundColor: Colors.dark.error,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
