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
import { ExportProgressCard, ExportHistoryList } from "./exports.part2";
import { styles } from "./exports.styles";

export type ExportSchedule = "off" | "daily" | "weekly";

export interface ExportTableResult {
  table: string;
  rows: number;
  bytes: number;
}

export interface ExportMeta {
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

export type ProgressPhase = "idle" | "querying" | "archiving" | "uploading" | "done" | "error";

interface ExportProgressTable {
  table: string;
  rows: number;
  status: "pending" | "running" | "done";
}

export interface ExportProgress {
  active: boolean;
  startedAt: string | null;
  currentTable: string | null;
  currentTableIndex: number;
  totalTables: number;
  rowsInCurrentTable: number;
  totalRowsSoFar: number;
  tables: ExportProgressTable[];
  phase: ProgressPhase;
  error: string | null;
}

const PHASE_LABELS: Record<ProgressPhase, string> = {
  idle: "In attesa",
  querying: "Lettura tabelle",
  archiving: "Compressione archivio",
  uploading: "Caricamento su storage",
  done: "Completato",
  error: "Errore",
};

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

  const { data: progress } = useQuery<ExportProgress>({
    queryKey: ["/api/admin/exports/progress"],
    refetchInterval: isRunning ? 1000 : false,
    enabled: isRunning,
  });

  const completedTables = progress?.tables.filter((t) => t.status === "done").length ?? 0;
  const progressPct = progress && progress.totalTables > 0
    ? Math.round((completedTables / progress.totalTables) * 100)
    : 0;

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

      <ExportProgressCard
        isRunning={isRunning}
        progressPct={progressPct}
        PHASE_LABELS={PHASE_LABELS}
        progress={progress}
        completedTables={completedTables}
      />

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
        <ExportHistoryList
          history={historyData.history}
          formatDate={formatDate}
          formatBytes={formatBytes}
          formatDuration={formatDuration}
          handleDownload={handleDownload}
          downloadingFile={downloadingFile}
        />
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
