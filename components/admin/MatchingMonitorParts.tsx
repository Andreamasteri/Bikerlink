import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Clipboard,
  Alert,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface LockLocal {
  isRunning: boolean;
  lastStartAt: number | null;
  lastStartIso: string | null;
  elapsedMs: number | null;
}

export interface LockDistributed {
  acquired: boolean;
  reason?: string;
  redis?: { configured: boolean; available: boolean };
}

export interface PhaseMetric {
  name: string;
  durationMs: number;
  matchesCreated?: number;
  error?: string;
}

export interface CycleMeta {
  completedAt: string;
  durationMs: number;
  zavorrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

export type SourceStatus = "OK" | "WARN" | "NO_DATA" | "INACTIVE";

export interface ThroughputEntry {
  key: string;
  label: string;
  lastCycleMatches: number;
  cumulativeMatches: number;
  sourceStatus: SourceStatus;
}

export interface NotificationCycleStats {
  sent: number;
  failed: number;
  retried: number;
}

export interface MonitorData {
  success: true;
  cycleStatus: "running" | "idle" | "error";
  lock: { local: LockLocal; distributed: LockDistributed | null };
  lastCycleMeta: CycleMeta | null;
  lastCyclePhases: PhaseMetric[];
  perfAggregate: {
    cycleCount: number;
    avgDurationMs: number;
    avgMatchesCreated: number;
  } | null;
  throughputByType: ThroughputEntry[];
  memory: { rssMb: number };
  integrity: {
    usesGistIndex: boolean | null;
    dragonfly: { configured: boolean; available: boolean };
    rateLimiterOk: boolean;
  };
  recentErrorCount: number;
  lastCycleNotifications?: NotificationCycleStats;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  phase: string;
  message: string;
  errorId?: string | null;
}

export interface LogsData {
  success: true;
  logs: LogEntry[];
  errorCount: number;
}

export type LogLevelFilter = "all" | "warn" | "error";

export const CYCLE_STATUS_COLOR: Record<string, string> = {
  running: "#22c55e",
  idle: "#6b7280",
  error: "#ef4444",
};

export const CYCLE_STATUS_LABEL: Record<string, string> = {
  running: "In corso",
  idle: "Inattivo",
  error: "Errore",
};

export const SOURCE_STATUS_COLOR: Record<SourceStatus, string> = {
  OK: "#22c55e",
  WARN: "#f59e0b",
  NO_DATA: "#6b7280",
  INACTIVE: "#374151",
};

const LEVEL_COLOR: Record<string, string> = {
  INFO: "#6b7280",
  WARN: "#f59e0b",
  ERROR: "#ef4444",
};

const LEVEL_BG: Record<string, string> = {
  INFO: "transparent",
  WARN: "rgba(245,158,11,0.08)",
  ERROR: "rgba(239,68,68,0.08)",
};

export function formatTs(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

export function Section({
  title,
  icon,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  open: boolean;
  onToggle: () => void;
  badge?: number | null;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
        <MaterialCommunityIcons name={icon} size={15} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge != null && badge > 0 && (
          <View style={styles.errorBadge}>
            <Text style={styles.errorBadgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
        <View style={styles.sectionChevron}>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

export function IntegrityRow({ label, ok }: { label: string; ok: boolean | null }) {
  const color = ok === null ? "#6b7280" : ok ? "#22c55e" : "#ef4444";
  const icon = ok === null ? "help-circle-outline" : ok ? "check-circle-outline" : "close-circle-outline";
  return (
    <View style={styles.integrityRow}>
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={15} color={color} />
      <Text style={[styles.integrityLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function MatchingLogFeed({
  logs,
  errorCount,
  isLoading,
  onRefresh,
  refetchInterval,
}: {
  logs: LogEntry[];
  errorCount: number;
  isLoading: boolean;
  onRefresh: () => void;
  refetchInterval?: number;
}) {
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>("all");

  const filtered =
    levelFilter === "all"
      ? logs
      : levelFilter === "warn"
        ? logs.filter((e) => e.level === "WARN" || e.level === "ERROR")
        : logs.filter((e) => e.level === "ERROR");

  return (
    <View style={styles.logFeed}>
      <View style={styles.logFilterRow}>
        {(["all", "warn", "error"] as LogLevelFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.levelChip, levelFilter === f && styles.levelChipActive]}
            onPress={() => setLevelFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.levelChipText, levelFilter === f && styles.levelChipTextActive]}>
              {f === "all" ? "Tutti" : f === "warn" ? "WARN+" : "ERROR"}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size={12} color={Colors.textSecondary} />
          ) : (
            <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {errorCount > 0 && (
        <Text style={styles.errorCountNote}>
          {errorCount} error{errorCount !== 1 ? "i" : "e"} negli ultimi 5 min
        </Text>
      )}

      {filtered.length === 0 ? (
        <Text style={styles.emptyText}>
          {isLoading ? "Caricamento…" : "Nessun evento."}
        </Text>
      ) : (
        filtered.map((entry) => (
          <View key={entry.id} style={[styles.logRow, { backgroundColor: LEVEL_BG[entry.level] }]}>
            <View style={[styles.levelDot, { backgroundColor: LEVEL_COLOR[entry.level] }]} />
            <View style={styles.logBody}>
              <View style={styles.logMeta}>
                <Text style={styles.logTime}>{formatTs(entry.timestamp)}</Text>
                <View style={[styles.levelBadge, { borderColor: LEVEL_COLOR[entry.level] }]}>
                  <Text style={[styles.levelBadgeText, { color: LEVEL_COLOR[entry.level] }]}>
                    {entry.level}
                  </Text>
                </View>
                <Text style={styles.logPhase} numberOfLines={1}>{entry.phase}</Text>
              </View>
              <Text style={styles.logMessage} numberOfLines={3}>{entry.message}</Text>
              {entry.errorId && (
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(entry.errorId as string);
                    Alert.alert("Copiato", `Sentry ID copiato: ${entry.errorId}`);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.errorIdLink}>⚡ Sentry ID: {entry.errorId}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      {refetchInterval != null && (
        <Text style={styles.volatileNote}>
          Auto-refresh ogni {Math.round(refetchInterval / 1000)}s · Buffer in memoria (si azzera al riavvio)
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  sectionChevron: { marginLeft: "auto" },
  sectionBody: { marginTop: 8, gap: 4 },
  errorBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10, minWidth: 18, height: 18,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  errorBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12, color: "#fff" },
  integrityRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  integrityLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  logFeed: { gap: 4 },
  logFilterRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  levelChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    backgroundColor: Colors.border,
  },
  levelChipActive: { backgroundColor: Colors.accent + "33" },
  levelChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  levelChipTextActive: { color: Colors.accent },
  refreshBtn: { marginLeft: "auto", padding: 4 },
  errorCountNote: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#ef4444", marginBottom: 4 },
  logRow: { flexDirection: "row", gap: 8, paddingVertical: 5, paddingHorizontal: 4, borderRadius: 6 },
  levelDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  logBody: { flex: 1, gap: 2 },
  logMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  logTime: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  levelBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  levelBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  logPhase: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  logMessage: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text },
  errorIdLink: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#f97316", textDecorationLine: "underline" },
  volatileNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 6, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, paddingVertical: 8, textAlign: "center" },
});
