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
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { TelemetryStats } from "@/components/admin/telemetry/TelemetryStats";
import { TelemetryFilters } from "@/components/admin/telemetry/TelemetryFilters";
import { MapMatchingSection } from "@/components/admin/telemetry/MapMatchingSection";
import { CurvyScoreSection } from "@/components/admin/telemetry/CurvyScoreSection";
import { InfoModal } from "@/components/admin/telemetry/InfoModal";
import { SensorsGlobalCard } from "@/components/admin/telemetry/SensorsGlobalCard";
import { ErrorLogPanel } from "@/components/admin/telemetry/ErrorLogPanel";
import { TelemetryHealthCard } from "@/components/admin/telemetry/TelemetryHealthCard";
import { TelemetryDebugCard } from "@/components/admin/telemetry/TelemetryDebugCard";
import type { ErrorLogEntry } from "@/components/admin/telemetry/ErrorLogPanel";

interface TelemetryAdminStats {
  activeUsers: number;
  totalRides: number;
  totalSamples: number;
  kmCollected: number;
  avgKmPerUser: number;
  targetKm: number;
  latestSample?: string | null;
}

interface JobAttempt {
  ts: string;
  ok: boolean;
  retries: number;
  error: string | null;
}

interface MapMatchingStats {
  pending: number;
  retry: number;
  matched: number;
  unmatchable: number;
  segments: number;
  lastRun: string | null;
  lastAttempt?: JobAttempt | null;
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
    headers: { ...(authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export default function AdminTelemetryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [targetInput, setTargetInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savingSensors, setSavingSensors] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [rematchingJob, setRematchingJob] = useState(false);
  const [drainingJob, setDrainingJob] = useState(false);
  const [runningCurvyJob, setRunningCurvyJob] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);

  const { data: stats, isLoading, error, refetch } = useQuery<TelemetryAdminStats>({
    queryKey: ["/api/admin/telemetry-stats"],
    queryFn: async () => {
      const d = await adminFetch("/api/admin/telemetry-stats").then((r) => r.json());
      if (!targetInput) setTargetInput(String(d.targetKm));
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

  const { data: errorLogData, refetch: refetchErrorLog } = useQuery<{ entries: ErrorLogEntry[]; count: number }>({
    queryKey: ["/api/admin/telemetry/error-log"],
    queryFn: () => adminFetch("/api/admin/telemetry/error-log").then((r) => r.json()),
    staleTime: 15_000,
    enabled: showErrorLog,
  });

  const { data: sensorsGlobal, refetch: refetchSensors } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/admin/sensors-global"],
    queryFn: () => adminFetch("/api/admin/sensors-global").then((r) => r.json()),
    staleTime: 30_000,
  });

  const handleToggleSensorsGlobal = async (value: boolean) => {
    setSavingSensors(true);
    try {
      const res = await fetch(
        new URL("/api/admin/sensors-global", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
          credentials: "include",
          body: JSON.stringify({ enabled: value }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refetchSensors();
      qc.invalidateQueries({ queryKey: ["/api/admin/sensors-global"] });
    } catch {
      Alert.alert("Errore", "Impossibile aggiornare i sensori globali.");
    } finally {
      setSavingSensors(false);
    }
  };

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
          headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
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
        { method: "POST", headers: { ...(await authFetchHeaders()) }, credentials: "include" }
      );
      if (res.status === 409) { Alert.alert("Info", "Job curvy score già in esecuzione."); return; }
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
        { method: "POST", headers: { ...(await authFetchHeaders()) }, credentials: "include" }
      );
      if (res.status === 409) { Alert.alert("Info", "Job già in esecuzione."); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert("Avviato", "Job map matching avviato in background. Aggiorna tra qualche minuto.");
      setTimeout(() => refetchMm(), 3_000);
    } catch {
      Alert.alert("Errore", "Impossibile avviare il job.");
    } finally {
      setRunningJob(false);
    }
  };

  const handleRematchMapMatching = async () => {
    if (rematchingJob || runningJob || mmStats?.isRunning) return;
    setRematchingJob(true);
    try {
      const res = await fetch(
        new URL("/api/admin/map-matching/rematch", getApiUrl()).toString(),
        { method: "POST", headers: { ...(await authFetchHeaders()) }, credentials: "include" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.skipped) {
        Alert.alert(
          "Saltato",
          "ThinkCentre in modalità spento (engine offline): riaccodare ora ricreerebbe solo il backlog. Riaccendi il ThinkCentre prima di riprovare.",
        );
        return;
      }
      Alert.alert(
        "Riaccodate",
        `${(data.requeuedSessions ?? 0).toLocaleString("it-IT")} sessioni (${(data.requeuedSamples ?? 0).toLocaleString("it-IT")} campioni) riportate in coda. Verranno riprocessate alla prossima esecuzione.`,
      );
      setTimeout(() => refetchMm(), 1_000);
    } catch {
      Alert.alert("Errore", "Impossibile riaccodare le sessioni.");
    } finally {
      setRematchingJob(false);
    }
  };

  const handleDrainMapMatching = async () => {
    if (drainingJob || rematchingJob || runningJob || mmStats?.isRunning) return;
    setDrainingJob(true);
    try {
      const res = await fetch(
        new URL("/api/admin/map-matching/drain-backlog", getApiUrl()).toString(),
        { method: "POST", headers: { ...(await authFetchHeaders()) }, credentials: "include" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      Alert.alert(
        "Backlog drenato",
        `${(data.drainedSessions ?? 0).toLocaleString("it-IT")} sessioni (${(data.drainedSamples ?? 0).toLocaleString("it-IT")} campioni) bloccate oltre il cap segnate come esaurite. L'allarme backlog si calmerà.`,
      );
      setTimeout(() => refetchMm(), 1_000);
    } catch {
      Alert.alert("Errore", "Impossibile drenare il backlog.");
    } finally {
      setDrainingJob(false);
    }
  };

  const progressPct = stats
    ? Math.min(100, Math.round((stats.kmCollected / stats.targetKm) * 100))
    : 0;

  const formatLastRun = (iso: string | null | undefined): string => {
    if (!iso) return "Mai eseguito";
    try {
      return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <>
      <InfoModal visible={showInfo} onClose={() => setShowInfo(false)} />

      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="chart-line" size={22} color={Colors.accent} />
            <Text style={styles.headerTitle}>Dati Telemetria</Text>
          </View>
          <TouchableOpacity
            style={styles.infoBtn}
            onPress={() => setShowInfo(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={24} color={Colors.accent} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          Campioni GPS + sensori raccolti al termine di ogni giro
        </Text>

        {isLoading && <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />}
        {error && <Text style={styles.errorText}>Errore nel caricamento stats</Text>}

        {stats && stats.totalRides === 0 && !isLoading && (
          <View style={styles.emptyBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#f59e0b" />
            <Text style={styles.emptyBannerText}>
              Nessun giro registrato. Fai un giro con il tracciamento attivo per vedere i dati.
              Tocca <Text style={{ color: Colors.accent }}>ⓘ</Text> per maggiori informazioni.
            </Text>
          </View>
        )}

        <SensorsGlobalCard
          enabled={sensorsGlobal?.enabled}
          saving={savingSensors}
          onToggle={handleToggleSensorsGlobal}
        />

        <TelemetryHealthCard />

        <TelemetryDebugCard />

        {stats && (
          <>
            <TelemetryStats stats={stats} />
            <TelemetryFilters
              targetKm={stats.targetKm}
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
          onRematch={handleRematchMapMatching}
          onDrain={handleDrainMapMatching}
          isRunning={runningJob}
          isRematching={rematchingJob}
          isDraining={drainingJob}
          formatLastRun={formatLastRun}
        />

        <CurvyScoreSection
          stats={curvyStats}
          onRunJob={handleRunCurvyJob}
          isRunning={runningCurvyJob}
          formatLastRun={formatLastRun}
        />

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push("/admin/telemetry-users" as never)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="map-marker-path" size={18} color={Colors.accent} />
          <Text style={styles.navBtnText}>Sessioni per Utente</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, { marginTop: 6 }]}
          onPress={() => router.push("/admin/dr-correction" as never)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="compass-outline" size={18} color={Colors.accent} />
          <Text style={styles.navBtnText}>Correzione Dead Reckoning</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, { marginTop: 6 }]}
          onPress={() => { setShowErrorLog((v) => !v); if (!showErrorLog) refetchErrorLog(); }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#ef4444" />
          <Text style={[styles.navBtnText, { color: "#ef4444", flex: 1 }]}>Log Errori Pipeline</Text>
          {errorLogData && errorLogData.count > 0 && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>{errorLogData.count}</Text>
            </View>
          )}
          <Ionicons name={showErrorLog ? "chevron-up" : "chevron-down"} size={16} color="#ef4444" />
        </TouchableOpacity>

        {showErrorLog && (
          <ErrorLogPanel data={errorLogData} onRefresh={() => refetchErrorLog()} />
        )}

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { refetch(); refetchMm(); refetchCurvy(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={16} color={Colors.accent} />
          <Text style={[styles.refreshText, { color: Colors.accent }]}>Aggiorna</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
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
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  infoBtn: {
    padding: 2,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  emptyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#f59e0b18",
    borderWidth: 1,
    borderColor: "#f59e0b44",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  emptyBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#f59e0b",
    flex: 1,
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
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.accent,
    flex: 1,
  },
  errorBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  errorBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
  },
});
