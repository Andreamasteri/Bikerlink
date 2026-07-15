// Task #64 — Database Monitor: schermata admin.
//
// Mostra INSIEME carico DB e carico backend Node su una finestra selezionabile
// (24h/48h/7d/30d), con banner separati per sovraccarico DB e sovraccarico
// backend (un admin capisce a colpo d'occhio quale dei due — o entrambi — è il
// problema), trend bucketati, contatori errori/restart e download CSV del range.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, authFetchHeaders, queryClient } from "@/lib/query-client";
import { DbMonitorChart, type ChartSeries } from "@/components/admin/db-monitor/DbMonitorChart";
import {
  DEFAULT_OVERLOAD_THRESHOLDS,
  OVERLOAD_THRESHOLD_BOUNDS,
  normalizeOverloadThresholds,
  type OverloadThresholds,
} from "@shared/overload-thresholds";

type RangeKey = "24h" | "48h" | "7d" | "30d";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "48h", label: "48h" },
  { key: "7d", label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
];

interface BucketRow {
  bucket: string;
  poolActivePct: number;
  poolWaiting: number;
  pingMs: number | null;
  pingMsMax: number | null;
  dbErrors: number;
  dbRestarts: number;
  dbOverload: boolean;
  backendCpuPct: number;
  backendLagMs: number;
  backendLagMsMax: number;
  backendRssMb: number;
  backendOverload: boolean;
  samples: number;
}

interface HistoryResponse {
  range: RangeKey;
  bucketSec: number;
  sampleIntervalSec: number;
  current: {
    poolActivePct: number;
    poolWaiting: number;
    pingMs: number | null;
    dbErrors: number;
    dbOverload: boolean;
    backendCpuPct: number;
    backendEventLoopLagMs: number;
    backendRssMb: number;
    backendOverload: boolean;
  };
  thresholds: {
    poolActivePct: number;
    pingMs: number;
    backend: { eventLoopLagMs: number; eventLoopP99Ms: number; cpuPct: number };
  };
  summary: {
    totalSamples: number;
    dbOverloadSamples: number;
    backendOverloadSamples: number;
    dbErrorSamples: number;
    dbErrorsTotal: number;
    dbRestartsMax: number;
    pingMsMax: number;
    poolActivePctMax: number;
    backendCpuPctMax: number;
    backendLagMsMax: number;
  };
  series: BucketRow[];
}

function overloadMinutes(samples: number, intervalSec: number): string {
  const min = Math.round((samples * intervalSec) / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type ThresholdDraft = Record<keyof OverloadThresholds, string>;
const THRESHOLD_KEYS = Object.keys(OVERLOAD_THRESHOLD_BOUNDS) as (keyof OverloadThresholds)[];

function toDraft(t: OverloadThresholds): ThresholdDraft {
  const out = {} as ThresholdDraft;
  for (const k of THRESHOLD_KEYS) out[k] = String(t[k]);
  return out;
}

interface ThresholdsResponse {
  thresholds: OverloadThresholds;
  defaults: OverloadThresholds;
  bounds: typeof OVERLOAD_THRESHOLD_BOUNDS;
}

export default function DbMonitorScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<RangeKey>("24h");
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<HistoryResponse>({
    queryKey: [`/api/admin/db-monitor/history?range=${range}`],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/db-monitor/history?range=${range}`)).json(),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const url = new URL(`/api/admin/db-monitor/history/csv?range=${range}`, getApiUrl()).toString();
      const fileName = `db_monitor_${range}_${Date.now()}.csv`;
      if (Platform.OS === "web") {
        const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(blobUrl);
      } else {
        const filePath = `${FileSystem.cacheDirectory}${fileName}`;
        const dl = await FileSystem.downloadAsync(url, filePath, { headers: authFetchHeaders() });
        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dl.uri, { mimeType: "text/csv", dialogTitle: "Database Monitor CSV" });
        }
      }
    } catch (err) {
      Alert.alert("Errore download", err instanceof Error ? err.message : "Impossibile scaricare");
    } finally {
      setDownloading(false);
    }
  }, [range]);

  // Task #83 — soglie di sovraccarico regolabili dall'admin.
  const { data: cfg } = useQuery<ThresholdsResponse>({
    queryKey: ["/api/admin/db-monitor/thresholds"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/db-monitor/thresholds")).json(),
    staleTime: 60_000,
  });
  const [draft, setDraft] = useState<ThresholdDraft>(() => toDraft(DEFAULT_OVERLOAD_THRESHOLDS));
  useEffect(() => {
    if (cfg?.thresholds) setDraft(toDraft(cfg.thresholds));
  }, [cfg?.thresholds]);

  const saveMutation = useMutation({
    mutationFn: async (payload: OverloadThresholds) =>
      (await apiRequest("PUT", "/api/admin/db-monitor/thresholds", payload)).json() as Promise<ThresholdsResponse>,
    onSuccess: (res) => {
      if (res?.thresholds) setDraft(toDraft(res.thresholds));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-monitor/thresholds"] });
      Alert.alert("Salvato", "Soglie di sovraccarico aggiornate. Le allerte usano i nuovi valori entro ~1 minuto.");
    },
    onError: (err) => Alert.alert("Errore", err instanceof Error ? err.message : "Salvataggio fallito"),
  });
  const isSaving = saveMutation.isPending;

  const chartWidth = Math.max(240, width - 48);
  const series = useMemo(() => data?.series ?? [], [data?.series]);
  const timestamps = useMemo(() => series.map((s) => s.bucket), [series]);

  const dbSeries: ChartSeries[] = useMemo(
    () => [
      { values: series.map((s) => s.poolActivePct), color: "#8B5CF6", label: "Pool", isPct: true, unit: "%" },
      { values: series.map((s) => s.pingMs), color: "#22c55e", label: "Ping", unit: "ms" },
    ],
    [series],
  );
  const backendSeries: ChartSeries[] = useMemo(
    () => [
      { values: series.map((s) => s.backendCpuPct), color: "#f59e0b", label: "CPU", isPct: true, unit: "%" },
      { values: series.map((s) => s.backendLagMs), color: "#38bdf8", label: "Event-loop lag", unit: "ms" },
    ],
    [series],
  );
  const rssSeries: ChartSeries[] = useMemo(
    () => [
      { values: series.map((s) => s.backendRssMb), color: "#a78bfa", label: "RSS", unit: "MB" },
    ],
    [series],
  );
  const dbOverloadFlags = useMemo(() => series.map((s) => s.dbOverload), [series]);
  const backendOverloadFlags = useMemo(() => series.map((s) => s.backendOverload), [series]);

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }
  if (isError && !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.textSecondary} />
        <Text style={styles.errorText}>Errore caricamento dati</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cur = data?.current;
  const sum = data?.summary;
  const intervalSec = data?.sampleIntervalSec ?? 60;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.accent} />}
    >
      {/* Banner sovraccarico DB */}
      {cur?.dbOverload ? (
        <View style={[styles.banner, styles.bannerDanger]}>
          <MaterialCommunityIcons name="database-alert" size={20} color="#fca5a5" />
          <Text style={styles.bannerText}>
            Database SOVRACCARICO — pool {cur.poolActivePct}%
            {cur.pingMs != null ? `, ping ${cur.pingMs}ms` : ""}
            {cur.dbErrors > 0 ? `, ${cur.dbErrors} errori` : ""}
          </Text>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerOk]}>
          <MaterialCommunityIcons name="database-check" size={20} color="#86efac" />
          <Text style={styles.bannerText}>Database OK — pool {cur?.poolActivePct ?? 0}%{cur?.pingMs != null ? `, ping ${cur.pingMs}ms` : ""}</Text>
        </View>
      )}

      {/* Banner sovraccarico backend */}
      {cur?.backendOverload ? (
        <View style={[styles.banner, styles.bannerDanger]}>
          <MaterialCommunityIcons name="server-network-off" size={20} color="#fca5a5" />
          <Text style={styles.bannerText}>
            Backend SOVRACCARICO — CPU {cur.backendCpuPct}%, event-loop {cur.backendEventLoopLagMs}ms
          </Text>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerOk]}>
          <MaterialCommunityIcons name="server-network" size={20} color="#86efac" />
          <Text style={styles.bannerText}>
            Backend OK — CPU {cur?.backendCpuPct ?? 0}%, event-loop {cur?.backendEventLoopLagMs ?? 0}ms, RSS {cur?.backendRssMb ?? 0}MB
          </Text>
        </View>
      )}

      {/* Selettore range */}
      <View style={styles.rangeRow}>
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeBtn, active && styles.rangeBtnActive]}
              onPress={() => setRange(r.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Grafico carico DB */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Carico Database</Text>
        <Text style={styles.cardSub}>Saturazione pool (%) e latenza ping (ms) — fasce rosse = sovraccarico</Text>
        <DbMonitorChart series={dbSeries} timestamps={timestamps} overload={dbOverloadFlags} width={chartWidth} />
      </View>

      {/* Grafico carico backend */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Carico Backend</Text>
        <Text style={styles.cardSub}>CPU (%) ed event-loop lag (ms) — fasce arancioni = sovraccarico</Text>
        <DbMonitorChart
          series={backendSeries}
          timestamps={timestamps}
          overload={backendOverloadFlags}
          overloadColor="#f59e0b"
          width={chartWidth}
        />
      </View>

      {/* Grafico memoria backend (RSS) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Memoria Backend (RSS)</Text>
        <Text style={styles.cardSub}>RSS del processo Node (MB) — un aumento lento e costante segnala un memory leak</Text>
        <DbMonitorChart series={rssSeries} timestamps={timestamps} width={chartWidth} />
      </View>

      {/* Riepilogo range */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Riepilogo ({range})</Text>
        <View style={styles.statsGrid}>
          <Stat label="DB sovraccarico" value={overloadMinutes(sum?.dbOverloadSamples ?? 0, intervalSec)} danger={(sum?.dbOverloadSamples ?? 0) > 0} />
          <Stat label="Backend sovracc." value={overloadMinutes(sum?.backendOverloadSamples ?? 0, intervalSec)} danger={(sum?.backendOverloadSamples ?? 0) > 0} />
          <Stat label="Errori DB" value={String(sum?.dbErrorsTotal ?? 0)} danger={(sum?.dbErrorsTotal ?? 0) > 0} />
          <Stat label="Restart (max)" value={String(sum?.dbRestartsMax ?? 0)} danger={(sum?.dbRestartsMax ?? 0) > 0} />
          <Stat label="Ping max" value={`${sum?.pingMsMax ?? 0}ms`} />
          <Stat label="Pool max" value={`${sum?.poolActivePctMax ?? 0}%`} />
          <Stat label="CPU max" value={`${sum?.backendCpuPctMax ?? 0}%`} />
          <Stat label="Lag max" value={`${sum?.backendLagMsMax ?? 0}ms`} />
        </View>
        <Text style={styles.samplesNote}>{sum?.totalSamples ?? 0} campioni nel range</Text>
      </View>

      {/* Soglie allerte sovraccarico (Task #83) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Soglie allerte sovraccarico</Text>
        <Text style={styles.cardSub}>
          Regola quando scattano le allerte proattive di sovraccarico DB/backend. Valori fuori range vengono
          riportati al default. Le modifiche entrano in vigore entro ~1 minuto.
        </Text>
        {THRESHOLD_KEYS.map((key) => {
          const b = OVERLOAD_THRESHOLD_BOUNDS[key];
          return (
            <View key={key} style={styles.threshRow}>
              <View style={styles.threshInfo}>
                <Text style={styles.threshLabel}>{b.label}</Text>
                <Text style={styles.threshHint}>
                  {b.min}–{b.max} {b.unit} · default {DEFAULT_OVERLOAD_THRESHOLDS[key]}
                </Text>
              </View>
              <TextInput
                style={styles.threshInput}
                value={draft[key]}
                onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v.replace(/[^0-9]/g, "") }))}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isSaving}
                placeholder={String(DEFAULT_OVERLOAD_THRESHOLDS[key])}
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.threshUnit}>{b.unit}</Text>
            </View>
          );
        })}
        <View style={styles.threshBtnRow}>
          <TouchableOpacity
            style={[styles.threshBtn, styles.threshBtnGhost]}
            onPress={() => setDraft(toDraft(DEFAULT_OVERLOAD_THRESHOLDS))}
            disabled={isSaving}
          >
            <Text style={styles.threshBtnGhostText}>Ripristina default</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.threshBtn, styles.threshBtnPrimary]}
            onPress={() => saveMutation.mutate(normalizeOverloadThresholds(draft))}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.threshBtnPrimaryText}>Salva soglie</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Download */}
      <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={downloading}>
        {downloading ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <MaterialCommunityIcons name="download" size={18} color={Colors.accent} />
        )}
        <Text style={styles.downloadText}>Scarica CSV ({range})</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, danger && styles.statValueDanger]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background, gap: 10 },
  errorText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13 },
  retryBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  bannerDanger: { backgroundColor: "#7f1d1d33", borderColor: "#ef444455" },
  bannerOk: { backgroundColor: "#14532d33", borderColor: "#22c55e44" },
  bannerText: { flex: 1, color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 12 },
  rangeRow: { flexDirection: "row", borderWidth: 1, borderColor: Colors.border, borderRadius: 8, overflow: "hidden", marginVertical: 6 },
  rangeBtn: { flex: 1, paddingVertical: 8, alignItems: "center" },
  rangeBtnActive: { backgroundColor: Colors.accent + "22" },
  rangeText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  rangeTextActive: { color: Colors.accent, fontFamily: "Inter_700Bold" },
  card: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginVertical: 8 },
  cardTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cardSub: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2, marginBottom: 8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { width: "22%", minWidth: 72, backgroundColor: Colors.background, borderRadius: 8, padding: 8, alignItems: "center" },
  statValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 15 },
  statValueDanger: { color: "#f87171" },
  statLabel: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 2, textAlign: "center" },
  samplesNote: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 8 },
  threshRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  threshInfo: { flex: 1 },
  threshLabel: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  threshHint: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 },
  threshInput: {
    width: 72,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    textAlign: "right",
  },
  threshUnit: { width: 34, color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11 },
  threshBtnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  threshBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  threshBtnGhost: { borderWidth: 1, borderColor: Colors.border },
  threshBtnGhostText: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  threshBtnPrimary: { backgroundColor: Colors.accent },
  threshBtnPrimaryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  downloadText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
