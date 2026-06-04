import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
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

// ─── Info sections content ────────────────────────────────────────────────────
const INFO_SECTIONS = [
  {
    icon: "crosshairs-gps" as const,
    color: "#f59e0b",
    title: "Cos'è la telemetria",
    body:
      "GPS + accelerometro raccolti a 1 campione/secondo durante ogni giro. I dati vengono bufferizzati in locale e inviati al server ogni 90 secondi (o ogni 200 campioni). Comprendono: coordinate, velocità, angolo di piega, G-force, altitudine.",
  },
  {
    icon: "play-circle-outline" as const,
    color: "#22c55e",
    title: "Quando si raccolgono i dati",
    body:
      "La raccolta parte automaticamente quando il tracciamento GPS è attivo (bottone REC nella schermata mappa). Si ferma al termine del giro e i dati residui vengono inviati. Se l'app va in background, la raccolta continua con un task di sistema (richiede permesso posizione sempre).",
  },
  {
    icon: "account-group" as const,
    color: "#3b82f6",
    title: "Riepilogo globale",
    body:
      'Aggrega tutti i giri di tutti gli utenti. "Utenti con dati" = almeno un giro registrato. "Campioni totali" = singole letture GPS. "Km totali" = somma delle distanze percorse, calcolata geometricamente dai campioni. I giri ideal_lap (pista) sono esclusi.',
  },
  {
    icon: "chart-line" as const,
    color: Colors.accent,
    title: "Progresso collettivo",
    body:
      "Obiettivo di km aggregati per abilitare i percorsi personalizzati basati su dati reali. Quando raggiunto, l'algoritmo curvy route può usare telemetria vera invece dei dati OSM base. L'obiettivo è configurabile da questa schermata.",
  },
  {
    icon: "map-marker-check" as const,
    color: "#f59e0b",
    title: "Map Matching OSM (Fase 2)",
    body:
      "Job notturno alle 02:00 che aggancia ogni campione GPS al segmento stradale OSM più vicino, tramite GraphHopper. Popola osm_way_id nella tabella telemetria. Richiede GraphHopper configurato (GRAPHHOPPER_URL o server ThinkCentre). Può essere eseguito manualmente.",
  },
  {
    icon: "sine-wave" as const,
    color: "#8b5cf6",
    title: "Curvy Score (Fase 3)",
    body:
      "Job settimanale (domenica 03:00) che calcola il curvy_score di ogni segmento OSM basandosi sull'angolo di piega e G-force reali dei biker. Dipende dal Map Matching: deve essere eseguito dopo. Più biker percorrono la stessa strada, più lo score è preciso.",
  },
  {
    icon: "alert-circle-outline" as const,
    color: "#ef4444",
    title: "Se i valori sono 0",
    body:
      "Nessun giro è ancora stato completato con la telemetria attiva. Per raccogliere dati: apri l'app su un dispositivo reale, vai sulla mappa, premi REC, fai un giro, premi di nuovo REC. I dati appariranno qui entro pochi minuti. Il simulatore non invia telemetria reale.",
  },
];

function InfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalTitleRow}>
            <Ionicons name="information-circle" size={20} color={Colors.accent} />
            <Text style={styles.modalTitle}>Come funziona il monitor telemetria</Text>
          </View>

          <ScrollView
            style={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16 }}
          >
            {INFO_SECTIONS.map((s) => (
              <View key={s.title} style={styles.infoBlock}>
                <View style={styles.infoBlockHeader}>
                  <View style={[styles.infoIconBg, { backgroundColor: s.color + "22" }]}>
                    <MaterialCommunityIcons name={s.icon} size={16} color={s.color} />
                  </View>
                  <Text style={styles.infoBlockTitle}>{s.title}</Text>
                </View>
                <Text style={styles.infoBlockBody}>{s.body}</Text>
              </View>
            ))}

            <View style={styles.pipelineBanner}>
              <Text style={styles.pipelineBannerTitle}>Pipeline completa</Text>
              <Text style={styles.pipelineBannerBody}>
                {"Giro completato  →  batch GPS inviato  →  Map Matching (02:00)  →  Curvy Score (dom. 03:00)  →  percorsi personalizzati"}
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseBtnText}>Chiudi</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AdminTelemetryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [targetInput, setTargetInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [runningCurvyJob, setRunningCurvyJob] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

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

        {isLoading && (
          <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />
        )}
        {error && (
          <Text style={styles.errorText}>Errore nel caricamento stats</Text>
        )}

        {stats && stats.total_rides === 0 && !isLoading && (
          <View style={styles.emptyBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#f59e0b" />
            <Text style={styles.emptyBannerText}>
              Nessun giro registrato. Fai un giro con il tracciamento attivo per vedere i dati.
              Tocca{" "}
              <Text style={{ color: Colors.accent }}>ⓘ</Text>
              {" "}per maggiori informazioni.
            </Text>
          </View>
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
  // ── Modal ────────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    flex: 1,
  },
  modalScroll: {
    flexGrow: 0,
  },
  infoBlock: {
    gap: 6,
  },
  infoBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBlockTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  infoBlockBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    paddingLeft: 36,
  },
  pipelineBanner: {
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  pipelineBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pipelineBannerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
  },
  modalCloseBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  modalCloseBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#000",
  },
});
