import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "@/components/admin/exports.styles";
import type { ExportMeta, ExportProgress, ProgressPhase } from "./exports";

export function ExportProgressCard({
  isRunning,
  progressPct,
  PHASE_LABELS,
  progress,
  completedTables
}: {
  isRunning: boolean;
  progressPct: number;
  PHASE_LABELS: Record<ProgressPhase, string>;
  progress: ExportProgress | undefined;
  completedTables: number;
}) {
  if (!isRunning) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <ActivityIndicator size="small" color={Colors.accent} />
        <Text style={styles.cardTitle}>Export in corso</Text>
        <Text style={styles.progressPctText}>{progressPct}%</Text>
      </View>

      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
      </View>

      <Text style={styles.progressPhaseText}>
        {PHASE_LABELS[progress?.phase ?? "querying"]}
        {progress && progress.totalTables > 0
          ? ` · ${completedTables}/${progress.totalTables} tabelle`
          : ""}
      </Text>

      {progress?.tables.map((t) => (
        <View key={t.table} style={styles.progressTableRow}>
          <MaterialCommunityIcons
            name={
              t.status === "done"
                ? "check-circle"
                : t.status === "running"
                  ? "progress-clock"
                  : "circle-outline"
            }
            size={18}
            color={
              t.status === "done"
                ? "#22c55e"
                : t.status === "running"
                  ? Colors.accent
                  : Colors.textSecondary
            }
          />
          <Text
            style={[
              styles.progressTableName,
              t.status === "running" && styles.progressTableNameActive,
            ]}
          >
            {t.table}
          </Text>
          <Text style={styles.progressTableRows}>
            {t.status === "running"
              ? `${(progress?.rowsInCurrentTable ?? 0).toLocaleString()} righe…`
              : t.status === "done"
                ? `${t.rows.toLocaleString()} righe`
                : "—"}
          </Text>
        </View>
      ))}

      {progress && progress.totalRowsSoFar > 0 && (
        <Text style={styles.progressTotalText}>
          {progress.totalRowsSoFar.toLocaleString()} righe scritte finora
        </Text>
      )}
    </View>
  );
}

export function ExportHistoryList({
  history,
  formatDate,
  formatBytes,
  formatDuration,
  handleDownload,
  downloadingFile
}: {
  history: ExportMeta[];
  formatDate: (iso: string) => string;
  formatBytes: (bytes: number) => string;
  formatDuration: (ms: number) => string;
  handleDownload: (fileName: string) => void;
  downloadingFile: string | null;
}) {
  return (
    <View style={styles.card}>
      {history.map((item, idx) => (
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
  );
}
