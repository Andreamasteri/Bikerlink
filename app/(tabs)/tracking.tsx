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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Frequency = "1s" | "5s" | "30s";

interface TrackingStats {
  distance: number;
  maxSpeed: number;
  duration: number;
  points: number;
  currentSpeed: number;
  altitude: number;
}

export default function TrackingScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>("5s");
  const [stats, setStats] = useState<TrackingStats>({ distance: 0, maxSpeed: 0, duration: 0, points: 0, currentSpeed: 0, altitude: 0 });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const insets = useSafeAreaInsets();

  const frequencyMs: Record<Frequency, number> = { "1s": 1000, "5s": 5000, "30s": 30000 };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
      const res = await apiRequest("POST", "/api/routes/start", { trackingFrequency: frequency });
      const data = await res.json();
      setRouteId(data.route.id);
      setIsTracking(true);
      startTimeRef.current = Date.now();
      setSummary(null);

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
            speed = loc.coords.speed || 0;
          }

          await apiRequest("POST", `/api/routes/${data.route.id}/point`, {
            latitude: lat,
            longitude: lng,
            altitude,
            speed,
            isStop: speed < 0.5,
          });

          setStats(prev => ({
            distance: prev.distance + (speed * (frequencyMs[frequency] / 1000) / 1000),
            maxSpeed: Math.max(prev.maxSpeed, speed * 3.6),
            duration: Math.round((Date.now() - startTimeRef.current) / 60000),
            points: prev.points + 1,
            currentSpeed: speed * 3.6,
            altitude,
          }));
        } catch (e) {}
      }, frequencyMs[frequency]);
    } catch (err) {
      Alert.alert("Errore", "Impossibile avviare il tracciamento");
    } finally {
      setLoading(false);
    }
  };

  const stopTracking = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!routeId) return;

    setLoading(true);
    try {
      const res = await apiRequest("POST", `/api/routes/${routeId}/stop`);
      const data = await res.json();
      setSummary(data.route);
      setIsTracking(false);
    } catch (err) {
      Alert.alert("Errore", "Errore nel completamento tracciamento");
    } finally {
      setLoading(false);
    }
  };

  const publishRoute = async () => {
    if (!routeId) return;
    try {
      await apiRequest("PUT", `/api/routes/${routeId}/publish`, { title: `Giro del ${new Date().toLocaleDateString("it-IT")}` });
      Alert.alert("Pubblicato!", "Il tuo percorso è ora visibile nella bacheca");
      setSummary(null);
      setRouteId(null);
      setStats({ distance: 0, maxSpeed: 0, duration: 0, points: 0, currentSpeed: 0, altitude: 0 });
    } catch (err) {
      Alert.alert("Errore", "Errore nella pubblicazione");
    }
  };

  if (summary) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.success} style={styles.icon} />
        <Text style={styles.summaryTitle}>Percorso Completato!</Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.totalDistanceKm?.toFixed(1) || "0"}</Text>
            <Text style={styles.summaryLabel}>km</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.maxSpeedKmh?.toFixed(0) || "0"}</Text>
            <Text style={styles.summaryLabel}>km/h max</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.totalDurationMinutes || "0"}</Text>
            <Text style={styles.summaryLabel}>minuti</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.maxAltitudeM?.toFixed(0) || "-"}</Text>
            <Text style={styles.summaryLabel}>m alt. max</Text>
          </View>
        </View>

        <Pressable style={styles.publishBtn} onPress={publishRoute}>
          <Ionicons name="share-social" size={20} color={Colors.background} />
          <Text style={styles.publishText}>Pubblica nella Bacheca</Text>
        </Pressable>

        <Pressable style={styles.discardBtn} onPress={() => { setSummary(null); setRouteId(null); setStats({ distance: 0, maxSpeed: 0, duration: 0, points: 0, currentSpeed: 0, altitude: 0 }); }}>
          <Text style={styles.discardText}>Scarta</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!isTracking ? (
        <>
          <Ionicons name="navigate" size={64} color={Colors.accent} style={styles.icon} />
          <Text style={styles.title}>GPS Tracking</Text>
          <Text style={styles.subtitle}>Registra il tuo percorso in moto</Text>

          <Text style={styles.sectionTitle}>Frequenza di registrazione</Text>
          <View style={styles.freqRow}>
            {(["1s", "5s", "30s"] as const).map((f) => (
              <Pressable
                key={f}
                style={[styles.freqBtn, frequency === f && styles.freqBtnActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[styles.freqText, frequency === f && styles.freqTextActive]}>{f}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.startBtn} onPress={startTracking} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <>
                <Ionicons name="play" size={28} color={Colors.background} />
                <Text style={styles.startText}>Inizia Tracciamento</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.liveStats}>
            <View style={styles.liveStat}>
              <Text style={styles.liveValue}>{stats.currentSpeed.toFixed(0)}</Text>
              <Text style={styles.liveLabel}>km/h</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={styles.liveValue}>{stats.distance.toFixed(1)}</Text>
              <Text style={styles.liveLabel}>km</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={styles.liveValue}>{stats.duration}</Text>
              <Text style={styles.liveLabel}>min</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={styles.liveValue}>{stats.altitude.toFixed(0)}</Text>
              <Text style={styles.liveLabel}>m alt.</Text>
            </View>
          </View>

          <Text style={styles.pointsText}>{stats.points} punti registrati</Text>

          <Pressable style={styles.stopBtn} onPress={stopTracking} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="stop" size={28} color="#fff" />
                <Text style={styles.stopText}>Ferma Tracciamento</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, alignItems: "center", flexGrow: 1, justifyContent: "center" },
  icon: { marginBottom: 16 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 12, alignSelf: "flex-start" },
  freqRow: { flexDirection: "row", gap: 12, marginBottom: 32, width: "100%" },
  freqBtn: { flex: 1, backgroundColor: Colors.surface, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  freqBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  freqText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  freqTextActive: { color: Colors.accent },
  startBtn: { flexDirection: "row", backgroundColor: Colors.accent, paddingVertical: 18, paddingHorizontal: 32, borderRadius: 16, alignItems: "center", gap: 10, width: "100%", justifyContent: "center" },
  startText: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.background },
  liveStats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24, width: "100%" },
  liveStat: { flex: 1, minWidth: "40%", backgroundColor: Colors.surface, borderRadius: 16, padding: 20, alignItems: "center" },
  liveValue: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.accent },
  liveLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  pointsText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 24 },
  stopBtn: { flexDirection: "row", backgroundColor: Colors.accentRed, paddingVertical: 18, paddingHorizontal: 32, borderRadius: 16, alignItems: "center", gap: 10, width: "100%", justifyContent: "center" },
  stopText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 24 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24, width: "100%" },
  summaryCard: { flex: 1, minWidth: "40%", backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: "center" },
  summaryValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.accent },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  publishBtn: { flexDirection: "row", backgroundColor: Colors.accent, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, alignItems: "center", gap: 8, width: "100%", justifyContent: "center" },
  publishText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  discardBtn: { paddingVertical: 12, marginTop: 8 },
  discardText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
