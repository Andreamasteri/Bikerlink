import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface PerformanceStats {
  totalKm: number;
  idleTime: number;
  totalTime: number;
  maxSpeed: number;
  maxAltitude: number;
  currentSpeed: number;
  currentAltitude: number;
  points: number;
}

interface RouteRecord {
  id: string;
  title?: string;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxAltitude?: number;
  durationSeconds?: number;
  status: string;
  createdAt: string;
}

const IDLE_SPEED_THRESHOLD = 3;

export default function TrackingScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stats, setStats] = useState<PerformanceStats>({
    totalKm: 0, idleTime: 0, totalTime: 0, maxSpeed: 0,
    maxAltitude: 0, currentSpeed: 0, currentAltitude: 0, points: 0,
  });
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const idleTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const insets = useSafeAreaInsets();

  const { data: records = [], isLoading: recordsLoading } = useQuery<RouteRecord[]>({
    queryKey: ["/api/routes"],
  });

  const completedRecords = records.filter((r: RouteRecord) => r.status === "completed");

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTracking = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permesso Negato", "Permesso di localizzazione necessario per il tracciamento");
          return;
        }
      }

      setLoading(true);
      let res;
      try {
        res = await apiRequest("POST", "/api/routes", { trackingFrequency: 5 });
      } catch (err: any) {
        if (err.message?.startsWith("401")) {
          Alert.alert("Login Richiesto", "Devi effettuare il login per usare il tracciamento");
        } else {
          Alert.alert("Errore", "Impossibile avviare il tracciamento");
        }
        return;
      }
      const data = await res.json();
      setRouteId(data.id);
      setIsTracking(true);
      startTimeRef.current = Date.now();
      idleTimeRef.current = 0;
      lastPosRef.current = null;
      setStats({
        totalKm: 0, idleTime: 0, totalTime: 0, maxSpeed: 0,
        maxAltitude: 0, currentSpeed: 0, currentAltitude: 0, points: 0,
      });

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setStats(prev => ({ ...prev, totalTime: elapsed, idleTime: idleTimeRef.current }));
      }, 1000);

      intervalRef.current = setInterval(async () => {
        try {
          let lat = 45.4642 + (Math.random() - 0.5) * 0.01;
          let lng = 9.19 + (Math.random() - 0.5) * 0.01;
          let altitude = 120 + Math.random() * 50;
          let speed = Math.random() * 30;

          if (Platform.OS !== "web") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            altitude = loc.coords.altitude || altitude;
            speed = (loc.coords.speed || 0) * 3.6;
          } else {
            speed = speed * 3.6;
          }

          await apiRequest("POST", `/api/routes/${data.id}/points`, {
            points: [{
              latitude: lat,
              longitude: lng,
              altitude,
              speedKmh: speed,
              timestamp: new Date().toISOString(),
            }],
          });

          let distDelta = 0;
          if (lastPosRef.current) {
            distDelta = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
          }
          lastPosRef.current = { lat, lng };

          if (speed < IDLE_SPEED_THRESHOLD) {
            idleTimeRef.current += 5;
          }

          setStats(prev => ({
            ...prev,
            totalKm: prev.totalKm + distDelta,
            maxSpeed: Math.max(prev.maxSpeed, speed),
            maxAltitude: Math.max(prev.maxAltitude, altitude),
            currentSpeed: speed,
            currentAltitude: altitude,
            points: prev.points + 1,
          }));
        } catch (e) {}
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const stopTracking = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!routeId) return;

    setLoading(true);
    try {
      await apiRequest("PUT", `/api/routes/${routeId}/stop`);
      setIsTracking(false);
      setRouteId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      Alert.alert("Sessione Completata", `Km: ${stats.totalKm.toFixed(2)} | Vel. Max: ${stats.maxSpeed.toFixed(0)} km/h | Quota Max: ${stats.maxAltitude.toFixed(0)} m`);
      setStats({
        totalKm: 0, idleTime: 0, totalTime: 0, maxSpeed: 0,
        maxAltitude: 0, currentSpeed: 0, currentAltitude: 0, points: 0,
      });
    } catch (err) {
      Alert.alert("Errore", "Errore nel completamento della sessione");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const renderRecord = ({ item }: { item: RouteRecord }) => (
    <View style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <Ionicons name="flag" size={16} color={Colors.accent} />
        <Text style={styles.recordDate}>
          {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      </View>
      <View style={styles.recordStats}>
        <View style={styles.recordStat}>
          <Text style={styles.recordValue}>{(item.totalDistanceKm || 0).toFixed(1)}</Text>
          <Text style={styles.recordLabel}>km</Text>
        </View>
        <View style={styles.recordStat}>
          <Text style={styles.recordValue}>{(item.maxSpeedKmh || 0).toFixed(0)}</Text>
          <Text style={styles.recordLabel}>km/h max</Text>
        </View>
        <View style={styles.recordStat}>
          <Text style={styles.recordValue}>{(item.maxAltitude || 0).toFixed(0)}</Text>
          <Text style={styles.recordLabel}>m quota</Text>
        </View>
        <View style={styles.recordStat}>
          <Text style={styles.recordValue}>{item.durationSeconds ? formatTime(item.durationSeconds) : "--"}</Text>
          <Text style={styles.recordLabel}>durata</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 },
      ]}
    >
      <Ionicons name="speedometer" size={48} color={Colors.accent} style={{ alignSelf: "center", marginBottom: 8 }} />
      <Text style={styles.title}>Performance Counter</Text>
      <Text style={styles.subtitle}>Registra le tue prestazioni in moto</Text>

      {isTracking && (
        <View style={styles.liveGrid}>
          <View style={styles.liveBig}>
            <Text style={styles.liveBigValue}>{stats.currentSpeed.toFixed(0)}</Text>
            <Text style={styles.liveBigLabel}>km/h</Text>
          </View>

          <View style={styles.liveRow}>
            <View style={styles.liveStat}>
              <Ionicons name="navigate" size={16} color={Colors.accent} />
              <Text style={styles.liveValue}>{stats.totalKm.toFixed(2)}</Text>
              <Text style={styles.liveLabel}>km totali</Text>
            </View>
            <View style={styles.liveStat}>
              <Ionicons name="time" size={16} color={Colors.accent} />
              <Text style={styles.liveValue}>{formatTime(stats.totalTime)}</Text>
              <Text style={styles.liveLabel}>tempo totale</Text>
            </View>
          </View>
          <View style={styles.liveRow}>
            <View style={styles.liveStat}>
              <Ionicons name="pause-circle" size={16} color={Colors.warning} />
              <Text style={styles.liveValue}>{formatTime(stats.idleTime)}</Text>
              <Text style={styles.liveLabel}>tempo fermo</Text>
            </View>
            <View style={styles.liveStat}>
              <Ionicons name="flash" size={16} color={Colors.accentRed} />
              <Text style={styles.liveValue}>{stats.maxSpeed.toFixed(0)}</Text>
              <Text style={styles.liveLabel}>vel. max km/h</Text>
            </View>
          </View>
          <View style={styles.liveRow}>
            <View style={styles.liveStat}>
              <Ionicons name="trending-up" size={16} color={Colors.success} />
              <Text style={styles.liveValue}>{stats.maxAltitude.toFixed(0)}</Text>
              <Text style={styles.liveLabel}>quota max m</Text>
            </View>
            <View style={styles.liveStat}>
              <Ionicons name="location" size={16} color={Colors.textSecondary} />
              <Text style={styles.liveValue}>{stats.points}</Text>
              <Text style={styles.liveLabel}>punti GPS</Text>
            </View>
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
      <Text style={styles.btnHint}>
        {isTracking ? "Tocca per fermare" : "Tocca per iniziare"}
      </Text>

      <View style={styles.recordsSection}>
        <Text style={styles.recordsTitle}>I tuoi record</Text>
        {recordsLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
        ) : completedRecords.length === 0 ? (
          <View style={styles.emptyRecords}>
            <Ionicons name="analytics" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun record ancora</Text>
          </View>
        ) : (
          completedRecords.map((item: RouteRecord) => (
            <View key={item.id}>{renderRecord({ item })}</View>
          ))
        )}
      </View>
    </ScrollView>
  );
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
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 24 },
  liveGrid: { marginBottom: 24 },
  liveBig: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: Colors.accent },
  liveBigValue: { fontSize: 56, fontFamily: "Inter_700Bold", color: Colors.accent },
  liveBigLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  liveRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  liveStat: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border },
  liveValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  liveLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  mainBtn: {
    width: 120, height: 120, borderRadius: 60, alignSelf: "center",
    alignItems: "center", justifyContent: "center",
    elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  btnHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 8, marginBottom: 32 },
  recordsSection: { marginTop: 8 },
  recordsTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  recordCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  recordHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  recordDate: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  recordStats: { flexDirection: "row", justifyContent: "space-between" },
  recordStat: { alignItems: "center", flex: 1 },
  recordValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.text },
  recordLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyRecords: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
