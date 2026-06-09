/**
 * MatchingMonitorCard — real-time monitor for the matching engine.
 * Polls /api/admin/matching/monitor every 15s (state) and
 * /api/admin/matching/logs every 30s (events).
 */
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
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function authPost<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
    credentials: "include",
    body: "{}",
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { message?: string })?.message ?? `HTTP ${res.status}`);
  return json as T;
}

interface LockLocal {
  isRunning: boolean;
  lastStartAt: number | null;
  lastStartIso: string | null;
  elapsedMs: number | null;
}

interface LockDistributed {
  acquired: boolean;
  reason?: string;
  redis?: { configured: boolean; available: boolean };
}

interface PhaseMetric {
  name: string;
  durationMs: number;
  matchesCreated?: number;
  error?: string;
}

interface CycleMeta {
  completedAt: string;
  durationMs: number;
  zavarrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

type SourceStatus = "OK" | "WARN" | "NO_DATA" | "INACTIVE";

interface ThroughputEntry {
  key: string;
  label: string;
  lastCycleMatches: number;
  cumulativeMatches: number;
  sourceStatus: SourceStatus;
}

/**
 * sendSuccess spreads fields at top level: { success: true, cycleStatus, lock, ... }
 * (no nested "data" key). Interfaces below reflect the actual wire format.
 */
interface MonitorData {
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
    redis: { configured: boolean; available: boolean };
    rateLimiterOk: boolean;
  };
  recentErrorCount: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  phase: string;
  message: string;
  errorId?: string | null;
}

interface LogsData {
  success: true;
  logs: LogEntry[];
  errorCount: number;
}

type LogLevelFilter = "all" | "warn" | "error";

const CYCLE_STATUS_COLOR: Record<string, string> = {
  running: "#22c55e",
  idle: "#6b7280",
  error: "#ef4444",
};

const CYCLE_STATUS_LABEL: Record<string, string> = {
  running: "In corso",
  idle: "Inattivo",
  error: "Errore",
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

const SOURCE_STATUS_COLOR: Record<SourceStatus, string> = {
  OK: "#22c55e",
  WARN: "#f59e0b",
  NO_DATA: "#6b7280",
  INACTIVE: "#374151",
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function Section({
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

function IntegrityRow({ label, ok }: { label: string; ok: boolean | null }) {
  const color = ok === null ? "#6b7280" : ok ? "#22c55e" : "#ef4444";
  const icon = ok === null ? "help-circle-outline" : ok ? "check-circle-outline" : "close-circle-outline";
  return (
    <View style={styles.integrityRow}>
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={15} color={color} />
      <Text style={[styles.integrityLabel, { color }]}>{label}</Text>
    </View>
  );
}

function MatchingLogFeed({
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
          <View
            key={entry.id}
            style={[styles.logRow, { backgroundColor: LEVEL_BG[entry.level] }]}
          >
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

export function MatchingMonitorCard({ onStatus }: { onStatus?: (s: "ok" | "degraded" | "offline") => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const [openThroughput, setOpenThroughput] = useState(true);
  const [openPerf, setOpenPerf] = useState(true);
  const [openLogs, setOpenLogs] = useState(true);
  const [openIntegrity, setOpenIntegrity] = useState(false);

  // Monitor query stays enabled always so the header status chip and error badge
  // remain live even when the card is collapsed. Slower interval while collapsed.
  const { data: monitor, isLoading: monitorLoading, isError: monitorError } = useQuery<MonitorData>({
    queryKey: ["/api/admin/matching/monitor"],
    queryFn: () => authGet<MonitorData>("/api/admin/matching/monitor"),
    refetchInterval: collapsed ? 60_000 : 15_000,
    staleTime: collapsed ? 55_000 : 10_000,
    enabled: true,
    retry: 2,
  });

  // Log feed only polled when expanded (no header value from log entries).
  const {
    data: logsData,
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useQuery<LogsData>({
    queryKey: ["/api/admin/matching/logs"],
    queryFn: () => authGet<LogsData>("/api/admin/matching/logs"),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !collapsed,
  });

  const logs = logsData?.logs ?? [];
  // Use monitor.recentErrorCount as the authoritative count — it's always
  // available from the /monitor endpoint even when the card is collapsed
  // and the log feed is not being polled.
  const errorCount = monitor?.recentErrorCount ?? logsData?.errorCount ?? 0;

  const triggerMutation = useMutation<unknown, Error>({
    mutationFn: () => authPost("/api/admin/matching/trigger"),
  });

  const unlockMutation = useMutation<unknown, Error>({
    mutationFn: () => authPost("/api/admin/matching/force-unlock"),
  });

  const cycleStatus = monitor?.cycleStatus ?? "idle";
  const isRunning = cycleStatus === "running";
  const headerColor = monitorError
    ? "#ef4444"
    : isRunning
      ? "#22c55e"
      : errorCount > 0
        ? "#ef4444"
        : "#6b7280";

  React.useEffect(() => {
    if (!onStatus) return;
    if (monitorError) {
      onStatus("offline");
      return;
    }
    if (!monitor) return;
    if (errorCount > 0 || cycleStatus === "error") onStatus("degraded");
    else onStatus("ok");
  }, [monitor, monitorError, errorCount, cycleStatus, onStatus]);

  const phases = monitor?.lastCyclePhases ?? [];
  const maxPhaseDuration = phases.reduce((m, p) => Math.max(m, p.durationMs), 1);
  const lockFree = !isRunning && !(monitor?.lock?.distributed?.acquired);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="matching-monitor-header"
      >
        <MaterialCommunityIcons name="link-variant" size={18} color={headerColor} />
        <View style={styles.headerTitleGroup}>
          <Text style={styles.cardTitle}>Matching Engine</Text>
          {monitor?.lastCycleMeta && (
            <Text style={styles.headerSubline}>
              {new Date(monitor.lastCycleMeta.completedAt).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {" · "}
              {formatDuration(monitor.lastCycleMeta.durationMs)}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {monitorError && (
            <View style={[styles.statusChip, { backgroundColor: "#ef444422" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#ef4444" }]} />
              <Text style={[styles.statusChipText, { color: "#ef4444" }]}>Offline</Text>
            </View>
          )}
          {!monitorError && monitor && (
            <View style={[styles.statusChip, { backgroundColor: CYCLE_STATUS_COLOR[cycleStatus] + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: CYCLE_STATUS_COLOR[cycleStatus] }]} />
              <Text style={[styles.statusChipText, { color: CYCLE_STATUS_COLOR[cycleStatus] }]}>
                {CYCLE_STATUS_LABEL[cycleStatus]}
              </Text>
            </View>
          )}
          {errorCount > 0 && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>{errorCount > 99 ? "99+" : errorCount}</Text>
            </View>
          )}
          {monitorLoading && !monitor && <ActivityIndicator size={12} color={Colors.textSecondary} />}
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.body}>
          {monitor ? (
            <>
              <View style={styles.cycleRow}>
                <View style={styles.cycleBlock}>
                  <Text style={styles.cycleLabel}>Ultimo ciclo</Text>
                  <Text style={styles.cycleValue}>
                    {monitor.lastCycleMeta
                      ? new Date(monitor.lastCycleMeta.completedAt).toLocaleTimeString("it-IT", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </Text>
                  <Text style={styles.cycleSub}>
                    {monitor.lastCycleMeta
                      ? formatDuration(monitor.lastCycleMeta.durationMs)
                      : "nessun ciclo"}
                  </Text>
                </View>
                <View style={styles.cycleBlock}>
                  <Text style={styles.cycleLabel}>Memoria</Text>
                  <Text style={styles.cycleValue}>{monitor.memory.rssMb} MB</Text>
                  <Text style={styles.cycleSub}>RSS</Text>
                </View>
                <View style={styles.cycleBlock}>
                  <Text style={styles.cycleLabel}>Cicli tracciati</Text>
                  <Text style={styles.cycleValue}>{monitor.perfAggregate?.cycleCount ?? 0}</Text>
                  <Text style={styles.cycleSub}>
                    avg {monitor.perfAggregate ? formatDuration(monitor.perfAggregate.avgDurationMs) : "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.lockRow}>
                <View style={styles.lockStatus}>
                  <View style={[styles.lockDot, { backgroundColor: isRunning ? "#f59e0b" : lockFree ? "#22c55e" : "#6b7280" }]} />
                  <Text style={styles.lockLabel}>
                    Lock: {isRunning ? "In uso" : lockFree ? "Libero" : "Stato sconosciuto"}
                  </Text>
                  {isRunning && monitor.lock.local.elapsedMs != null && (
                    <Text style={styles.lockElapsed}>
                      ({formatDuration(monitor.lock.local.elapsedMs)})
                    </Text>
                  )}
                </View>
                <View style={styles.lockActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.triggerBtn, triggerMutation.isPending && styles.actionBtnBusy]}
                    onPress={() => { if (!triggerMutation.isPending && !isRunning) triggerMutation.mutate(); }}
                    disabled={isRunning || triggerMutation.isPending}
                    activeOpacity={0.7}
                    testID="matching-trigger-btn"
                  >
                    {triggerMutation.isPending ? (
                      <ActivityIndicator size={12} color="#22c55e" />
                    ) : (
                      <Ionicons name="play" size={13} color={isRunning ? "#6b7280" : "#22c55e"} />
                    )}
                    <Text style={[styles.actionBtnText, { color: isRunning ? "#6b7280" : "#22c55e" }]}>
                      Trigger
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.unlockBtn, unlockMutation.isPending && styles.actionBtnBusy]}
                    onPress={() => { if (!unlockMutation.isPending) unlockMutation.mutate(); }}
                    disabled={unlockMutation.isPending}
                    activeOpacity={0.7}
                    testID="matching-unlock-btn"
                  >
                    {unlockMutation.isPending ? (
                      <ActivityIndicator size={12} color="#f59e0b" />
                    ) : (
                      <MaterialCommunityIcons name="lock-open-outline" size={13} color="#f59e0b" />
                    )}
                    <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>Force Unlock</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {(triggerMutation.isError || unlockMutation.isError) && (
                <Text style={styles.mutationError}>
                  {(triggerMutation.error ?? unlockMutation.error)?.message}
                </Text>
              )}

              <Section
                title="Throughput"
                icon="chart-bar"
                open={openThroughput}
                onToggle={() => setOpenThroughput((v) => !v)}
              >
                <View style={styles.throughputHeader}>
                  <Text style={[styles.throughputCol, { flex: 3 }]}>Matcher</Text>
                  <Text style={[styles.throughputCol, { flex: 1, textAlign: "right" }]}>Ciclo</Text>
                  <Text style={[styles.throughputCol, { flex: 1, textAlign: "right" }]}>Tot.</Text>
                  <Text style={[styles.throughputCol, { flex: 1, textAlign: "center" }]}>Src</Text>
                </View>
                {monitor.throughputByType.map((t) => (
                  <View key={t.key} style={styles.throughputRow}>
                    <Text style={[styles.throughputLabel, { flex: 3 }]} numberOfLines={1}>{t.label}</Text>
                    <Text style={[styles.throughputCount, { flex: 1, textAlign: "right" }]}>
                      {t.lastCycleMatches > 0 ? t.lastCycleMatches : "—"}
                    </Text>
                    <Text style={[styles.throughputCount, { flex: 1, textAlign: "right" }]}>
                      {t.cumulativeMatches > 0 ? t.cumulativeMatches : "—"}
                    </Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <View style={[styles.sourceStatusDot, { backgroundColor: SOURCE_STATUS_COLOR[t.sourceStatus] }]} />
                    </View>
                  </View>
                ))}
                {monitor.lastCycleMeta && (
                  <View style={styles.throughputSummary}>
                    <Text style={styles.throughputSummaryText}>
                      Biker↔Biker: {monitor.lastCycleMeta.bikerBikerMatchesNew} · Wishlist: {monitor.lastCycleMeta.zavarrinaMatchesNew}
                    </Text>
                    <Text style={styles.throughputSummaryNote}>
                      Src: ● OK · ● WARN · ● NO_DATA
                    </Text>
                  </View>
                )}
              </Section>

              <Section
                title="Performance fasi"
                icon="timer-outline"
                open={openPerf}
                onToggle={() => setOpenPerf((v) => !v)}
              >
                {phases.length === 0 ? (
                  <Text style={styles.emptyText}>Nessun dato di fase disponibile.</Text>
                ) : (
                  [...phases]
                    .sort((a, b) => b.durationMs - a.durationMs)
                    .map((phase) => (
                      <View key={phase.name} style={styles.phaseRow}>
                        <Text style={styles.phaseName} numberOfLines={1}>
                          {phase.name.replace(/_/g, " ")}
                          {phase.error ? " ⚠" : ""}
                        </Text>
                        <View style={styles.phaseBar}>
                          <View
                            style={[
                              styles.phaseBarFill,
                              {
                                width: `${Math.round((phase.durationMs / maxPhaseDuration) * 100)}%`,
                                backgroundColor: phase.error ? "#ef4444" : "#60a5fa",
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.phaseDuration, phase.error ? { color: "#ef4444" } : {}]}>
                          {formatDuration(phase.durationMs)}
                        </Text>
                      </View>
                    ))
                )}
              </Section>

              <Section
                title="Log eventi"
                icon="format-list-bulleted"
                open={openLogs}
                onToggle={() => setOpenLogs((v) => !v)}
                badge={errorCount}
              >
                <MatchingLogFeed
                  logs={logs}
                  errorCount={errorCount}
                  isLoading={logsLoading}
                  onRefresh={() => { void refetchLogs(); }}
                  refetchInterval={30_000}
                />
              </Section>

              <Section
                title="Integrità sistema"
                icon="shield-check-outline"
                open={openIntegrity}
                onToggle={() => setOpenIntegrity((v) => !v)}
              >
                <IntegrityRow
                  label={`PostGIS GIST index: ${monitor.integrity.usesGistIndex === null ? "verifica..." : monitor.integrity.usesGistIndex ? "presente" : "assente!"}`}
                  ok={monitor.integrity.usesGistIndex}
                />
                <IntegrityRow
                  label={`Redis: ${monitor.integrity.redis.configured ? (monitor.integrity.redis.available ? "online" : "offline") : "non configurato"}`}
                  ok={monitor.integrity.redis.configured ? monitor.integrity.redis.available : null}
                />
                <IntegrityRow
                  label={`Rate limiter: ${monitor.integrity.rateLimiterOk ? "OK" : "Code elevate!"}`}
                  ok={monitor.integrity.rateLimiterOk}
                />
              </Section>
            </>
          ) : (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitleGroup: { flex: 1, flexDirection: "column", gap: 1 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  headerSubline: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusChipText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  errorBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10, minWidth: 18, height: 18,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  errorBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },

  body: { marginTop: 14, gap: 12 },

  cycleRow: { flexDirection: "row", gap: 8 },
  cycleBlock: { flex: 1, alignItems: "center", gap: 2 },
  cycleLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  cycleValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text },
  cycleSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },

  lockRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  lockStatus: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  lockDot: { width: 8, height: 8, borderRadius: 4 },
  lockLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  lockElapsed: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  lockActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1,
  },
  actionBtnBusy: { opacity: 0.6 },
  actionBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  triggerBtn: { backgroundColor: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.3)" },
  unlockBtn: { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" },
  mutationError: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#ef4444" },

  section: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  sectionChevron: { marginLeft: "auto" },
  sectionBody: { marginTop: 8, gap: 4 },

  throughputHeader: {
    flexDirection: "row", paddingHorizontal: 2, marginBottom: 4,
  },
  throughputCol: {
    fontFamily: "Inter_600SemiBold", fontSize: 10,
    color: Colors.textSecondary, textTransform: "uppercase",
  },
  throughputRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  throughputLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  throughputCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  sourceStatusDot: { width: 8, height: 8, borderRadius: 4 },
  throughputSummary: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border, gap: 2 },
  throughputSummaryText: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  throughputSummaryNote: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },

  phaseRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phaseName: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, width: 100 },
  phaseBar: {
    flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden",
  },
  phaseBarFill: { height: "100%", borderRadius: 3 },
  phaseDuration: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textSecondary, width: 40, textAlign: "right" },

  logFeed: { gap: 4 },
  logFilterRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  levelChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    backgroundColor: Colors.border,
  },
  levelChipActive: { backgroundColor: Colors.accent + "33" },
  levelChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  levelChipTextActive: { color: Colors.accent },
  refreshBtn: { marginLeft: "auto", padding: 4 },
  errorCountNote: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: "#ef4444",
    marginBottom: 4,
  },
  logRow: {
    flexDirection: "row", gap: 8, paddingVertical: 5, paddingHorizontal: 4,
    borderRadius: 6,
  },
  levelDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  logBody: { flex: 1, gap: 2 },
  logMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  logTime: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  levelBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  levelBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9 },
  logPhase: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, flex: 1 },
  logMessage: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text },
  errorId: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  errorIdLink: {
    fontFamily: "Inter_400Regular", fontSize: 10,
    color: "#f97316", textDecorationLine: "underline",
  },
  volatileNote: {
    fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary,
    marginTop: 6, textAlign: "center",
  },

  emptyText: {
    fontFamily: "Inter_400Regular", fontSize: 12,
    color: Colors.textSecondary, paddingVertical: 8, textAlign: "center",
  },

  integrityRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  integrityLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
});
