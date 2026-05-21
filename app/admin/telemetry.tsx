import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { TelemetryStats } from "@/components/admin/telemetry/TelemetryStats";
import { TelemetryFilters } from "@/components/admin/telemetry/TelemetryFilters";
import { MapMatchingSection } from "@/components/admin/telemetry/MapMatchingSection";
import { CurvyScoreSection } from "@/components/admin/telemetry/CurvyScoreSection";

interface TelemetryAdminStats {
  users_with_telemetry: number;
  total_rides: number;
  total_samples: number;
  total_km: number;
  avg_km_per_user: number;
  target_km: number;
}

interface MapMatchingStats {
  pending: number;
  matched: number;
  segments: number;
  lastRun: string | null;
  isRunning: boolean;
  ghConfigured: boolean;
}

interface CurvyScoreStats {
  totalSegments: number;
  withScore: number;
  withoutScore: number;
  coveragePct: number;
  avgScore: number | null;
  lastRun: string | null;
  isRunning: boolean;
}

async function adminFetch(path: string): Promise<Response> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export default function AdminTelemetryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [targetInput, setTargetInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [runningCurvyJob, setRunningCurvyJob] = useState(false);

  const { data: stats, isLoading, error, refetch } = useQuery<TelemetryAdminStats>({
    queryKey: ["/api/admin/telemetry-stats"],
    queryFn: async () => {
      const d = await adminFetch("/api/admin/telemetry-stats").then((r) => r.json());
      if (!targetInput) setTargetInput(String(d.target_km));
      return d;
    },
    staleTime: 30_000,
  });

  const { data: mmStats, refetch: refetchMm } = useQuery<MapMatchingStats>({
    queryKey: ["/api/admin/map-matching-stats"],
    queryFn: () => adminFetch("/api/admin/map-matching-stats").then((r) => r.json()),
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data?.isRunning ? 5_000 : 30_000),
  });

  const { data: curvyStats, refetch: refetchCurvy } = useQuery<CurvyScoreStats>({
    queryKey: ["/api/admin/curvy-score-stats"],
    queryFn: () => adminFetch("/api/admin/curvy-score-stats").then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.isRunning ? 5_000 : 60_000),
  });

  const handleSaveTarget = async () => {
    const val = parseInt(targetInput, 10);
    if (!Number.isFinite(val) || val < 10 || val > 100000) {
      Alert.alert("Errore", "Inserisci un valore tra 10 e 100.000 km.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        new URL("/api/admin/telemetry-target-km", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(await authFetchHeaders()),
          },
          credentials: "include",
          body: JSON.stringify({ target_km: val }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/admin/telemetry-stats"] });
      Alert.alert("Salvato", `Nuovo obiettivo: ${val} km`);
    } catch {
      Alert.alert("Errore", "Impossibile aggiornare l'obiettivo.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunCurvyJob = async () => {
    if (runningCurvyJob || curvyStats?.isRunning) return;
    setRunningCurvyJob(true);
    try {
      const res = await fetch(
        new URL("/api/admin/curvy-score/run", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { ...(await authFetchHeaders()) },
          credentials: "include",
        }
      );
      if (res.status === 409) {
        Alert.alert("Info", "Job curvy score già in esecuzione.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert("Avviato", "Calcolo curvy score avviato in background. Aggiorna tra qualche minuto.");
      setTimeout(() => refetchCurvy(), 3_000);
    } catch {
      Alert.alert("Errore", "Impossibile avviare il job curvy score.");
    } finally {
      setRunningCurvyJob(false);
    }
  };

  const handleRunMapMatching = async () => {
    if (runningJob || mmStats?.isRunning) return;
    setRunningJob(true);
    try {
      const res = await fetch(
        new URL("/api/admin/map-matching/run", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { ...(await authFetchHeaders()) },
          credentials: "include",
        }
      );
      if (res.status === 409) {
        Alert.alert("Info", "Job già in esecuzione.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert("Avviato", "Job map matching avviato in background. Aggiorna tra qualche minuto.");
      setTimeout(() => refetchMm(), 3_000);
    } catch {
      Alert.alert("Errore", "Impossibile avviare il job.");
    } finally {
      setRunningJob(false);
    }
  };

  const progressPct = stats
    ? Math.min(100, Math.round((stats.total_km / stats.target_km) * 100))
    : 0;

  const formatLastRun = (iso: string | null | undefined): string => {
    if (!iso) return "Mai eseguito";
    try {
      return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="chart-line" size={22} color={Colors.accent} />
        <Text style={styles.headerTitle}>Dati Telemetria</Text>
      </View>
      <Text style={styles.headerSub}>
        Campioni GPS + sensori raccolti al termine di ogni giro
      </Text>

      {isLoading && (
        <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />
      )}
      {error && (
        <Text style={styles.errorText}>Errore nel caricamento stats</Text>
      )}

      {stats && (
        <>
          <TelemetryStats stats={stats} />
          <TelemetryFilters
            target_km={stats.target_km}
            targetInput={targetInput}
            setTargetInput={setTargetInput}
            onSaveTarget={handleSaveTarget}
            saving={saving}
            progressPct={progressPct}
          />
        </>
      )}

      <MapMatchingSection
        stats={mmStats}
        onRunJob={handleRunMapMatching}
        isRunning={runningJob}
        formatLastRun={formatLastRun}
      />

      <CurvyScoreSection
        stats={curvyStats}
        onRunJob={handleRunCurvyJob}
        isRunning={runningCurvyJob}
        formatLastRun={formatLastRun}
      />

      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={() => { refetch(); refetchMm(); refetchCurvy(); }}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh" size={16} color={Colors.accent} />
        <Text style={[styles.refreshText, { color: Colors.accent }]}>Aggiorna</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  refreshText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
    marginTop: 32,
  },
});
