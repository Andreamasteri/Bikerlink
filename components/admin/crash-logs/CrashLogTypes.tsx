import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Core stored crash types
export type StoredCrashType = "crash_system" | "crash_js" | "restart_loop" | "clean_close";

// Signal types derived from [resume:X] errorMessage prefix or server-side heuristic
export type SignalType =
  | "js_thread_freeze"
  | "gps_flood"
  | "memory_pressure"
  | "native_module_missing"
  | "appstate_transition"
  // Task #578 — crash_system with long session and no error = Android OS background kill
  | "background_kill";

// All types visible in the admin UI
export type CrashType = StoredCrashType | SignalType;

// Signal types that are high-frequency diagnostic signals (NOT real crashes)
export const DIAGNOSTIC_SIGNAL_TYPES: SignalType[] = [
  "js_thread_freeze",
  "gps_flood",
  "memory_pressure",
  "native_module_missing",
  // appstate_transition uses much higher thresholds (≥200/≥10 → warn; ≥500/≥20 → high)
  // to avoid false positives from normal foreground/background cycling.
  "appstate_transition",
  // Task #578 — Android OS background process kills (battery optimizer, no AppState event)
  "background_kill",
];
// Reserved for future context-only signals (no entries currently)
export const CONTEXT_SIGNAL_TYPES: SignalType[] = [];
export const ALL_SIGNAL_TYPES: SignalType[] = [...DIAGNOSTIC_SIGNAL_TYPES, ...CONTEXT_SIGNAL_TYPES];

interface TypeMeta {
  label: string;
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

export const CRASH_TYPE_META: Record<string, TypeMeta> = {
  crash_system: { label: "Sistema",          color: "#FF6B35", icon: "phone-alert" },
  crash_js:     { label: "JS Error",         color: "#FF4444", icon: "code-braces" },
  restart_loop: { label: "Restart Loop",     color: "#9B59B6", icon: "restart" },
  // Diagnostic signals
  js_thread_freeze:      { label: "Thread Freeze",   color: "#F59E0B", icon: "timer-alert-outline" },
  gps_flood:             { label: "GPS Flood",       color: "#3B82F6", icon: "map-marker-alert" },
  memory_pressure:       { label: "Pressione RAM",   color: "#EF4444", icon: "memory" },
  native_module_missing: { label: "Modulo Nativo",   color: "#8B5CF6", icon: "puzzle-remove" },
  // Task #578 — OS background kill: crash_system with long session and no error_message.
  // Caused by Android battery optimizer killing the process without AppState event.
  background_kill:       { label: "BG Kill",         color: "#0EA5E9", icon: "power-sleep" },
  // Context signals (very noisy)
  appstate_transition:   { label: "Transizione App", color: "#6B7280", icon: "transit-connection" },
};

export function getTypeMeta(type: string): TypeMeta {
  return CRASH_TYPE_META[type] ?? { label: type, color: "#6B7280", icon: "help-circle-outline" };
}

export function CrashTypeBadge({ type }: { type: string }) {
  const meta = getTypeMeta(type);
  return (
    <View style={[badgeStyles.badge, { backgroundColor: meta.color + "22" }]}>
      <MaterialCommunityIcons name={meta.icon} size={12} color={meta.color} />
      <Text style={[badgeStyles.text, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

export interface CrashLogRow {
  id: string;
  userId: string;
  sessionId: string;
  crashType: string;
  derivedType: string;
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  totalMemoryMb: number | null;
  errorMessage: string | null;
  stackTrace: string | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  reportedAt: string;
  nickname: string | null;
}

export interface DeviceStat {
  platform: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  total: number;
}

export interface BrandStat {
  brand: string;
  total: number;
  pct: number;
}

export interface CrashAlert {
  device_model: string;
  device_brand: string | null;
  cnt: number;
  crash_system: number;
  crash_js: number;
  restart_loop: number;
  js_thread_freeze: number;
  gps_flood: number;
  memory_pressure: number;
  native_module_missing: number;
  background_kill?: number;
}

export type AlertDominantType = string;

export function getAlertDominantType(alert: CrashAlert): AlertDominantType {
  const buckets: [string, number][] = [
    ["crash_system",         alert.crash_system],
    ["crash_js",             alert.crash_js],
    ["restart_loop",         alert.restart_loop],
    ["js_thread_freeze",     alert.js_thread_freeze ?? 0],
    ["gps_flood",            alert.gps_flood ?? 0],
    ["memory_pressure",      alert.memory_pressure ?? 0],
    ["native_module_missing",alert.native_module_missing ?? 0],
  ];
  const total = buckets.reduce((s, [, n]) => s + n, 0);
  const top = buckets.reduce((best, cur) => (cur[1] > best[1] ? cur : best), ["mixed", 0]);
  if (top[1] === total && total > 0) return top[0] as AlertDominantType;
  return "mixed";
}

export function getAlertAccentColor(dominant: string): string {
  const meta = CRASH_TYPE_META[dominant];
  return meta?.color ?? "#FF6B35";
}

export function getAlertDominantLabel(dominant: string): string {
  return CRASH_TYPE_META[dominant]?.label ?? "Misto";
}

export interface CrashAlertsResponse {
  alerts: CrashAlert[];
  threshold: number;
}

export interface CrashLogsResponse {
  logs: CrashLogRow[];
  total: number;
  page: number;
  limit: number;
  deviceStats: DeviceStat[];
  brandStats: BrandStat[];
}

export interface VersionStat {
  version: string;
  crash_system: number;
  crash_js: number;
  restart_loop: number;
  js_thread_freeze: number;
  gps_flood: number;
  memory_pressure: number;
  native_module_missing: number;
  background_kill?: number;
  total: number;
}

export interface DayTrend {
  day: string;
  crash_system: number;
  crash_js: number;
  restart_loop: number;
  js_thread_freeze: number;
  gps_flood: number;
  memory_pressure: number;
  native_module_missing: number;
  background_kill?: number;
}

export interface CrashStatsResponse {
  byType: {
    crash_system: number;
    crash_js: number;
    restart_loop: number;
    js_thread_freeze: number;
    gps_flood: number;
    memory_pressure: number;
    native_module_missing: number;
    appstate_transition: number;
    background_kill: number;
  };
  byVersion: VersionStat[];
  dailyTrend: DayTrend[];
  crashFreeRate24h: number | null;
  ramMedianCrashMb: number | null;
}

// High-frequency signal anomaly summary
export interface SignalFrequencyItem {
  signal_type: string;
  userId: string;
  nickname: string | null;
  sessionId: string | null;
  appVersion: string | null;
  platform: string | null;
  deviceModel: string | null;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  window_sec: number;
}

export interface SignalFrequencyResponse {
  hours: number;
  minCount: number;
  items: SignalFrequencyItem[];
}

export interface RestartLoopSummaryItem {
  userId: string;
  nickname: string | null;
  appVersion: string | null;
  platform: string | null;
  sessionCount: number;
  totalRestarts: number;
}

export interface RestartLoopSummaryResponse {
  summary: RestartLoopSummaryItem[];
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

export function formatDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : null;
  if (!end) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
