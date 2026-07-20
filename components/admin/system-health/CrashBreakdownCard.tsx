import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getQueryFnWithTimeout } from "@/lib/query-client";
import Colors from "@/constants/colors";
import type { WatchdogLog } from "@/components/admin/system-health/ProposalsCard";

interface CrashGroup {
  crashType: string;
  appVersion: string | null;
  errorSummary: string | null;
  total: number;
  lastSeen: string;
}

interface CrashSample {
  id: string;
  crashType: string;
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  reportedAt: string;
  userId: string | null;
}

interface BreakdownResp {
  days: number;
  groups: CrashGroup[];
}

interface SamplesResp {
  samples: CrashSample[];
}

// Task #925 — stable synthetic ID shared with backend for proposal deduplication.
// Must produce the same string from the same CrashGroup both here and in system-health.tsx.
function syntheticCrashSignalId(group: CrashGroup): string {
  const normalized = (group.errorSummary ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 36);
  return `app.crash.${group.crashType}.${normalized}`;
}

function makeSamplesKey(group: CrashGroup, days: number) {
  const qs = new URLSearchParams({
    crashType: group.crashType,
    ...(group.appVersion ? { appVersion: group.appVersion } : {}),
    // Task #925 — only include errorSummary when it is a non-empty string.
    // null/undefined means the crash group has no error_message (SYSTEM crashes),
    // and we rely on the backend NULL-safe clause instead of a "= ''" comparison.
    ...(group.errorSummary ? { errorSummary: group.errorSummary } : {}),
    limit: "5",
    days: String(days),
  });
  return `/api/admin/watchdog/crash-breakdown/samples?${qs.toString()}`;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

function CrashTypeChip({ type }: { type: string }) {
  const color = type === "crash_system" ? "#ef4444" : "#f59e0b";
  const label = type === "crash_system" ? "SYSTEM" : "JS";
  return (
    <View style={[styles.chip, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function SamplesPanel({ group, days }: { group: CrashGroup; days: number }) {
  const key = makeSamplesKey(group, days);
  const { data, isLoading, isError } = useQuery<SamplesResp>({
    queryKey: [key],
    queryFn: getQueryFnWithTimeout<SamplesResp>(10_000),
    staleTime: 60_000,
  });

  if (isLoading) return <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 10 }} />;
  if (isError) return <Text style={styles.errText}>Errore nel caricamento dei sample.</Text>;

  const samples = data?.samples ?? [];
  if (samples.length === 0) return <Text style={styles.mutedText}>Nessun sample disponibile.</Text>;

  return (
    <View style={styles.samplesWrap}>
      {samples.map((s, i) => (
        <View key={s.id} style={[styles.sampleCard, i > 0 && { marginTop: 8 }]}>
          <View style={styles.sampleHeader}>
            <Text style={styles.sampleDate}>{new Date(s.reportedAt).toLocaleString("it-IT")}</Text>
            <View style={styles.sampleMeta}>
              {s.platform ? <Text style={styles.sampleTag}>{s.platform}</Text> : null}
              {s.appVersion ? <Text style={styles.sampleTag}>v{s.appVersion}</Text> : null}
              {s.deviceBrand && s.deviceModel
                ? <Text style={styles.sampleTag}>{s.deviceBrand} {s.deviceModel}</Text>
                : null}
            </View>
          </View>
          {s.errorMessage ? (
            <Text style={styles.sampleError} numberOfLines={3}>{s.errorMessage}</Text>
          ) : null}
          {s.stackTrace ? (
            <ScrollView horizontal style={styles.stackScroll}>
              <Text style={styles.stackText}>{s.stackTrace.slice(0, 800)}</Text>
            </ScrollView>
          ) : null}
          {s.userId ? (
            <Text style={styles.mutedText}>User: {s.userId.slice(0, 8)}…</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// Task #925 — safety timeout matches the API client timeout (90s) + a small buffer.
const ANALYZE_SAFETY_TIMEOUT_MS = 95_000;

function CrashGroupRow({
  group, days, pendingLogs, onAnalyzeCrash,
}: {
  group: CrashGroup;
  days: number;
  pendingLogs: WatchdogLog[];
  onAnalyzeCrash?: (group: CrashGroup) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Task #925 — check if there is already a pending proposal for this crash pattern.
  const crashSigId = syntheticCrashSignalId(group);
  const hasPending = pendingLogs.some(
    (log) => log.status === "pending" && (log.details as Record<string, unknown> | null)?.crashSignalId === crashSigId,
  );

  const handleAnalyze = async () => {
    if (!onAnalyzeCrash || analyzing || hasPending) return;
    setAnalyzing(true);
    safetyTimerRef.current = setTimeout(() => {
      setAnalyzing(false);
      safetyTimerRef.current = null;
    }, ANALYZE_SAFETY_TIMEOUT_MS);
    try {
      await onAnalyzeCrash(group);
    } finally {
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      setAnalyzing(false);
    }
  };

  return (
    <View style={styles.groupCard}>
      <TouchableOpacity style={styles.groupHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.75}>
        <View style={styles.groupLeft}>
          <CrashTypeChip type={group.crashType} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.errorSummary} numberOfLines={2}>
              {group.errorSummary ?? "(nessun messaggio)"}
            </Text>
            <Text style={styles.groupMeta}>
              {group.appVersion ? `v${group.appVersion}` : "versione sconosciuta"}
              {"  ·  "}
              {timeSince(group.lastSeen)}
            </Text>
          </View>
        </View>
        <View style={styles.groupRight}>
          <Text style={styles.totalCount}>{group.total}</Text>
          {/* Task #925 — Analizza ⚡ button */}
          {onAnalyzeCrash ? (
            <TouchableOpacity
              style={[
                styles.analyzeBtn,
                (analyzing || hasPending) && styles.analyzeBtnDisabled,
              ]}
              onPress={(e) => { e.stopPropagation?.(); void handleAnalyze(); }}
              disabled={analyzing || hasPending}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color="#fff" style={styles.analyzeSpinner} />
              ) : (
                <Text style={styles.analyzeBtnText}>
                  {hasPending ? "Pending" : "Analizza ⚡"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="#6b7280"
          />
        </View>
      </TouchableOpacity>
      {expanded && <SamplesPanel group={group} days={days} />}
    </View>
  );
}

interface CrashBreakdownCardProps {
  /** Task #925 — pending watchdog logs, used to show "Pending" state on Analizza ⚡. */
  pendingLogs?: WatchdogLog[];
  /** Task #925 — called when admin clicks "Analizza ⚡" on a crash pattern row. */
  onAnalyzeCrash?: (group: CrashGroup) => Promise<void>;
}

export function CrashBreakdownCard({ pendingLogs = [], onAnalyzeCrash }: CrashBreakdownCardProps = {}) {
  const [days, setDays] = useState(7);
  const key = `/api/admin/watchdog/crash-breakdown?days=${days}&limit=15`;
  const { data, isLoading, isError, refetch, isFetching } = useQuery<BreakdownResp>({
    queryKey: [key],
    queryFn: getQueryFnWithTimeout<BreakdownResp>(15_000),
    staleTime: 2 * 60_000,
  });

  const groups = data?.groups ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Ultimi</Text>
        {[1, 7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.dayBtn, days === d && styles.dayBtnActive]}
            onPress={() => setDays(d)}
          >
            <Text style={[styles.dayBtnText, days === d && styles.dayBtnTextActive]}>
              {d}g
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => refetch()} disabled={isFetching} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={16} color={isFetching ? "#6b7280" : Colors.accent} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />
      ) : isError ? (
        <Text style={styles.errText}>Errore nel caricamento — riprova.</Text>
      ) : groups.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="check-circle-outline" size={32} color="#22c55e" />
          <Text style={styles.emptyText}>Nessun crash negli ultimi {days} giorni.</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.totalBanner}>
            {groups.reduce((s, g) => s + g.total, 0)} crash totali · top {groups.length} pattern
          </Text>
          {groups.map((g, i) => (
            <CrashGroupRow
              key={`${g.crashType}_${g.appVersion ?? ""}_${i}`}
              group={g}
              days={days}
              pendingLogs={pendingLogs}
              onAnalyzeCrash={onAnalyzeCrash}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  toolbarLabel: { color: "#9ca3af", fontSize: 12 },
  dayBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: "#1f2937" },
  dayBtnActive: { backgroundColor: Colors.accent },
  dayBtnText: { color: "#9ca3af", fontSize: 12, fontWeight: "600" as const },
  dayBtnTextActive: { color: "#fff" },
  refreshBtn: { marginLeft: "auto" as const, padding: 4 },
  totalBanner: { color: "#9ca3af", fontSize: 11, marginBottom: 10 },
  groupCard: { backgroundColor: "#1f2937", borderRadius: 10, marginBottom: 8, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "flex-start", padding: 12, justifyContent: "space-between" },
  groupLeft: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  groupRight: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 10 },
  chip: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, alignSelf: "flex-start", marginTop: 1 },
  chipText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.5 },
  errorSummary: { color: "#f3f4f6", fontSize: 13, fontWeight: "500" as const, lineHeight: 18 },
  groupMeta: { color: "#6b7280", fontSize: 11, marginTop: 3 },
  totalCount: { color: "#ef4444", fontSize: 18, fontWeight: "700" as const, minWidth: 32, textAlign: "right" as const },
  // Task #925 — Analizza ⚡ button styles (mirrors ProblemsList fixBtn).
  analyzeBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#374151", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, minWidth: 70, justifyContent: "center",
  },
  analyzeBtnDisabled: { opacity: 0.45 },
  analyzeBtnText: { color: "#f3f4f6", fontSize: 11, fontWeight: "700" as const },
  analyzeSpinner: { width: 14, height: 14 },
  samplesWrap: { paddingHorizontal: 12, paddingBottom: 12 },
  sampleCard: { backgroundColor: "#111827", borderRadius: 8, padding: 10 },
  sampleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 4 },
  sampleDate: { color: "#9ca3af", fontSize: 11 },
  sampleMeta: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  sampleTag: { backgroundColor: "#374151", color: "#d1d5db", fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sampleError: { color: "#fca5a5", fontSize: 12, lineHeight: 17, marginBottom: 6 },
  stackScroll: { backgroundColor: "#0b0f1a", borderRadius: 6, padding: 6, maxHeight: 100, marginBottom: 4 },
  stackText: { color: "#6b7280", fontSize: 10, fontFamily: "monospace" as const, lineHeight: 14 },
  mutedText: { color: "#6b7280", fontSize: 11, marginTop: 4 },
  errText: { color: "#ef4444", fontSize: 12, textAlign: "center" as const, marginVertical: 10 },
  emptyBox: { alignItems: "center" as const, paddingVertical: 24, gap: 8 },
  emptyText: { color: "#6b7280", fontSize: 13, textAlign: "center" as const },
});
