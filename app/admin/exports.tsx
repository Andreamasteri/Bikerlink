import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Switch,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest, authFetchHeaders } from "@/lib/query-client";

type ExportSchedule = "off" | "daily" | "weekly";

interface ExportTableResult {
  table: string;
  rows: number;
  bytes: number;
}

interface ExportMeta {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalRows: number;
  totalBytes: number;
  objectPath: string;
  fileName: string;
  options: { excludeFake: boolean; tables: string[] };
  tables: ExportTableResult[];
}

interface ExportStatus {
  isExporting: boolean;
  schedule: ExportSchedule;
  nextScheduled: string | null;
  schedulerActive: boolean;
  lastExport: ExportMeta | null;
  historyCount: number;
}

interface ExportHistory {
  history: ExportMeta[];
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const SCHEDULE_OPTIONS: { label: string; value: ExportSchedule; desc: string }[] = [
  { label: "Disattivo", value: "off", desc: "Solo esportazione manuale" },
  { label: "Giornaliero", value: "daily", desc: "Una volta al giorno" },
  { label: "Settimanale", value: "weekly", desc: "Una volta a settimana" },
];

export default function ExportsScreen() {
  const insets = useSafeAreaInsets();
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [excludeFake, setExcludeFake] = useState(true);

  const { data: status, refetch: refetchStatus } = useQuery<ExportStatus>({
    queryKey: ["/api/admin/exports/status"],
    refetchInterval: 3000,
  });

  const { data: historyData } = useQuery<ExportHistory>({
    queryKey: ["/api/admin/exports/history"],
    enabled: showHistory,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const url = new URL("/api/admin/exports/run", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ excludeFake }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore export");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/exports/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/exports/history"] });
      refetchStatus();
    },
    onError: (err: Error) => {
      Alert.alert("Errore Export", err.message);
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (schedule: ExportSchedule) =>
      apiRequest("PUT", "/api/admin/exports/schedule", { schedule }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/exports/status"] });
      refetchStatus();
    },
  });

  async function handleDownload(fileName: string) {
    setDownloadingFile(fileName);
    try {
      const url = new URL(`/api/admin/exports/download/${fileName}`, getApiUrl()).toString();
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      const dl = await FileSystem.downloadAsync(url, filePath, {
        headers: authFetchHeaders(),
      });
      if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dl.uri, {
          dialogTitle: `Salva ${fileName}`,
          mimeType: "application/zip",
        });
      } else {
        Alert.alert("Scaricato", `Salvato in: ${dl.uri}`);
      }
    } catch (err: unknown) {
      Alert.alert("Errore download", (err instanceof Error ? err.message : null) || "Impossibile scaricare");
    } finally {
      setDownloadingFile(null);
    }
  }

  const isRunning = runMutation.isPending || !!status?.isExporting;
  const currentSchedule = status?.schedule ?? "off";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
    >
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="cloud-lock" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Object Storage</Text>
        </View>
        <Text style={styles.storageInfo}>
          Gli export vengono salvati su Object Storage privato di Replit.
        </Text>
        <Text style={styles.storagePath}>.private/exports/</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="calendar-clock" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Pianificazione automatica</Text>
        </View>
        {SCHEDULE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.scheduleOption, currentSchedule === opt.value && styles.scheduleOptionActive]}
            onPress={() => scheduleMutation.mutate(opt.value)}
            disabled={scheduleMutation.isPending}
          >
            <View style={[styles.scheduleRadio, currentSchedule === opt.value && styles.scheduleRadioActive]}>
              {currentSchedule === opt.value && <View style={styles.scheduleRadioDot} />}
            </View>
            <View style={styles.scheduleTextGroup}>
              <Text style={[styles.scheduleLabel, currentSchedule === opt.value && styles.scheduleLabelActive]}>
                {opt.label}
              </Text>
              <Text style={styles.scheduleDesc}>{opt.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {status?.nextScheduled && currentSchedule !== "off" && (
          <Text style={styles.nextScheduledText}>
            Prossimo: {formatDate(status.nextScheduled)}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="tune-variant" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Opzioni export</Text>
        </View>
        <View style={styles.optionRow}>
          <View>
            <Text style={styles.optionLabel}>Escludi utenti fake</Text>
            <Text style={styles.optionDesc}>Filtra i profili di test dal dataset</Text>
          </View>
          <Switch
            value={excludeFake}
            onValueChange={setExcludeFake}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.runBtn, isRunning && styles.btnDisabled]}
        onPress={() => runMutation.mutate()}
        disabled={isRunning}
        activeOpacity={0.8}
      >
        {isRunning
          ? <ActivityIndicator size="small" color="#fff" />
          : <MaterialCommunityIcons name="database-export" size={22} color="#fff" />
        }
        <Text style={styles.runBtnText}>
          {isRunning ? "Export in corso..." : "Esegui Export Ora"}
        </Text>
      </TouchableOpacity>

      {runMutation.isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{(runMutation.error as Error).message}</Text>
        </View>
      )}

      {status?.lastExport && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={22} color="#22c55e" />
            <Text style={styles.cardTitle}>Ultimo export</Text>
          </View>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Data</Text>
              <Text style={styles.metaValue}>{formatDate(status.lastExport.startedAt)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Durata</Text>
              <Text style={styles.metaValue}>{formatDuration(status.lastExport.durationMs)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Righe totali</Text>
              <Text style={styles.metaValue}>{status.lastExport.totalRows.toLocaleString()}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Dimensione</Text>
              <Text style={styles.metaValue}>{formatBytes(status.lastExport.totalBytes)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.downloadBtn, downloadingFile === status.lastExport.fileName && styles.btnDisabled]}
            onPress={() => handleDownload(status.lastExport!.fileName)}
            disabled={downloadingFile === status.lastExport.fileName}
          >
            {downloadingFile === status.lastExport.fileName
              ? <ActivityIndicator size="small" color={Colors.accent} />
              : <MaterialCommunityIcons name="download" size={18} color={Colors.accent} />
            }
            <Text style={styles.downloadBtnText}>Scarica {status.lastExport.fileName}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.historyToggle}
        onPress={() => setShowHistory((v) => !v)}
      >
        <MaterialCommunityIcons
          name={showHistory ? "chevron-up" : "history"}
          size={20}
          color={Colors.accent}
        />
        <Text style={styles.historyToggleText}>
          {showHistory ? "Nascondi storico" : `Storico export (${status?.historyCount ?? 0})`}
        </Text>
      </TouchableOpacity>

      {showHistory && historyData?.history && historyData.history.length > 0 && (
        <View style={styles.card}>
          {historyData.history.map((item, idx) => (
            <View key={item.id} style={[styles.historyItem, idx > 0 && styles.historyItemBorder]}>
              <View style={styles.historyItemHeader}>
                <Text style={styles.historyDate}>{formatDate(item.startedAt)}</Text>
                <Text style={styles.historyMeta}>
                  {item.totalRows.toLocaleString()} righe · {formatBytes(item.totalBytes)}
                </Text>
              </View>
              <View style={styles.historyActions}>
                <Text style={styles.historyDuration}>{formatDuration(item.durationMs)}</Text>
                <TouchableOpacity
                  style={[styles.historyDownloadBtn, downloadingFile === item.fileName && styles.btnDisabled]}
                  onPress={() => handleDownload(item.fileName)}
                  disabled={downloadingFile === item.fileName}
                >
                  {downloadingFile === item.fileName
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <MaterialCommunityIcons name="download" size={16} color={Colors.accent} />
                  }
                  <Text style={styles.historyDownloadText}>Scarica</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {showHistory && historyData?.history?.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="database-off-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun export nella cronologia</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  storageInfo: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  storagePath: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  scheduleOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 10, marginBottom: 2,
  },
  scheduleOptionActive: { backgroundColor: Colors.accent + "12" },
  scheduleRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  scheduleRadioActive: { borderColor: Colors.accent },
  scheduleRadioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent,
  },
  scheduleTextGroup: { flex: 1 },
  scheduleLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  scheduleLabelActive: { color: Colors.accent },
  scheduleDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  nextScheduledText: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
    marginTop: 8, marginLeft: 4,
  },
  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, backgroundColor: Colors.accent,
    borderRadius: 14, paddingVertical: 16,
  },
  runBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: Colors.error + "20", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.error + "40",
  },
  errorText: { color: Colors.error, fontSize: 13, fontFamily: "Inter_400Regular" },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  metaItem: { width: "45%" },
  metaLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  metaValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.accent + "50",
    backgroundColor: Colors.accent + "10",
  },
  downloadBtnText: {
    color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13,
    flex: 1, flexShrink: 1,
  },
  historyToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  historyToggleText: { color: Colors.accent, fontFamily: "Inter_500Medium", fontSize: 14 },
  historyItem: { paddingVertical: 12 },
  historyItemBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  historyItemHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6,
  },
  historyDate: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  historyMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  historyActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyDuration: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  historyDownloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + "40",
  },
  historyDownloadText: { color: Colors.accent, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
});
