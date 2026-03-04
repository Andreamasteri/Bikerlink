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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const IDLE_THRESHOLD_KMH = 3;

export default function TrackingScreen() {
  const insets = useSafeAreaInsets();

  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const routeIdRef = useRef<string | null>(null);

  const [totalTime, setTotalTime] = useState(0);
  const [idleTime, setIdleTime] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  const startTimeRef = useRef(0);
  const idleAccRef = useRef(0);
  const lastPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const totalKmRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const maxAltRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const webWatchIdRef = useRef<number | null>(null);

  const { data: records = [], isLoading: recordsLoading } = useQuery<RouteRecord[]>({
    queryKey: ["/api/routes"],
  });

  const completedRecords = records.filter((r: RouteRecord) => r.status === "completed");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchSubRef.current) watchSubRef.current.remove();
      if (webWatchIdRef.current !== null && Platform.OS === "web") {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
      }
    };
  }, []);

  const handleGpsUpdate = useCallback((lat: number, lng: number, altitude: number | null, speedMs: number | null) => {
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
      totalKmRef.current += dist;
      setTotalKm(totalKmRef.current);

      const intervalSec = (now - lastPosRef.current.time) / 1000;
      if (speedKmh < IDLE_THRESHOLD_KMH) {
        idleAccRef.current += intervalSec;
        setIdleTime(Math.round(idleAccRef.current));
      }
    }

    lastPosRef.current = { lat, lng, time: now };

    const routeId = routeIdRef.current;
    if (routeId) {
      apiRequest("POST", `/api/routes/${routeId}/points`, {
        points: [{
          latitude: lat,
          longitude: lng,
          altitude: alt,
          speedKmh,
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }
  }, []);

  const startTracking = async () => {
    try {
      setLoading(true);

      if (Platform.OS !== "web") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
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
      startTimeRef.current = Date.now();
      idleAccRef.current = 0;
      lastPosRef.current = null;
      totalKmRef.current = 0;
      maxSpeedRef.current = 0;
      maxAltRef.current = 0;

      setIsTracking(true);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setTotalTime(elapsed);
      }, 1000);

      if (Platform.OS !== "web") {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
          (loc) => {
            handleGpsUpdate(
              loc.coords.latitude,
              loc.coords.longitude,
              loc.coords.altitude,
              loc.coords.speed
            );
          }
        );
        watchSubRef.current = sub;
      } else {
        const wid = navigator.geolocation.watchPosition(
          (pos) => {
            handleGpsUpdate(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.altitude,
              pos.coords.speed
            );
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }
    if (webWatchIdRef.current !== null && Platform.OS === "web") {
      navigator.geolocation.clearWatch(webWatchIdRef.current);
      webWatchIdRef.current = null;
    }

    const routeId = routeIdRef.current;
    if (!routeId) return;

    setLoading(true);
    try {
      await apiRequest("PUT", `/api/routes/${routeId}/stop`);
      setIsTracking(false);
      routeIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });

      const netTime = Math.max(totalTime - Math.round(idleAccRef.current), 0);
      Alert.alert(
        "Sessione Completata",
        `Km: ${totalKmRef.current.toFixed(2)}\n` +
        `Tempo totale: ${formatTime(totalTime)}\n` +
        `Pause: ${formatTime(Math.round(idleAccRef.current))}\n` +
        `Tempo netto: ${formatTime(netTime)}\n` +
        `Vel. Max: ${maxSpeedRef.current.toFixed(0)} km/h\n` +
        `Quota Max: ${maxAltRef.current.toFixed(0)} m`
      );

      setTotalTime(0);
      setIdleTime(0);
      setTotalKm(0);
      setMaxSpeed(0);
      setMaxAltitude(0);
      setCurrentSpeed(0);
    } catch {
      Alert.alert("Errore", "Errore nel completamento della sessione.");
    } finally {
      setLoading(false);
    }
  };

  const netTime = totalTime - idleTime;
  const avgSpeed = netTime > 0 ? totalKm / (netTime / 3600) : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
        },
      ]}
    >
      <Ionicons name="speedometer" size={48} color={Colors.accent} style={styles.headerIcon} />
      <Text style={styles.title}>Performance Counter</Text>
      <Text style={styles.subtitle}>Registra le tue prestazioni in moto</Text>

      {isTracking && (
        <View style={styles.dashboard}>
          <View style={styles.speedBox}>
            <Text style={styles.speedValue}>{currentSpeed.toFixed(0)}</Text>
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
          </View>
        </View>
      )}

      <Pressable
        style={[styles.mainBtn, { backgroundColor: isTracking ? Colors.accentRed : Colors.success }]}
        onPress={isTracking ? stopTracking : startTracking}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Ionicons name={isTracking ? "stop-circle" : "play-circle"} size={56} color="#fff" />
        )}
      </Pressable>
      <Text style={styles.hint}>
        {isTracking ? "Tocca per fermare" : "Tocca per iniziare"}
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
            <RecordCard key={item.id} item={item} />
          ))
        )}
      </View>
    </ScrollView>
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

function RecordCard({ item }: { item: RouteRecord }) {
  const dur = item.durationSeconds || 0;
  const idle = item.idleTimeSeconds || 0;
  const net = Math.max(dur - idle, 0);

  return (
    <View style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <Ionicons name="flag" size={16} color={Colors.accent} />
        <Text style={styles.recordDate}>
          {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
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
  mainBtn: {
    width: 120, height: 120, borderRadius: 60, alignSelf: "center",
    alignItems: "center", justifyContent: "center",
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  hint: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary,
    textAlign: "center", marginTop: 8, marginBottom: 32,
  },
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
});
