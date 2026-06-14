import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type CrashType = "crash_system" | "crash_js" | "restart_loop";

export function CrashTypeBadge({ type }: { type: CrashType }) {
  const isJs = type === "crash_js";
  const isLoop = type === "restart_loop";
  const bg = isJs ? "#FF444422" : isLoop ? "#9B59B622" : "#FF6B3522";
  const color = isJs ? "#FF4444" : isLoop ? "#9B59B6" : "#FF6B35";
  return (
    <View style={[badgeStyles.badge, { backgroundColor: bg }]}>
      <MaterialCommunityIcons
        name={isJs ? "code-braces" : isLoop ? "restart" : "phone-alert"}
        size={12}
        color={color}
      />
      <Text style={[badgeStyles.text, { color }]}>
        {isJs ? "JS Error" : isLoop ? "Restart Loop" : "Sistema"}
      </Text>
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
  crashType: CrashType;
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
}

export type AlertDominantType = "restart_loop" | "crash_js" | "crash_system" | "mixed";

export function getAlertDominantType(alert: CrashAlert): AlertDominantType {
  if (alert.restart_loop === alert.cnt) return "restart_loop";
  if (alert.crash_js === alert.cnt) return "crash_js";
  if (alert.crash_system === alert.cnt) return "crash_system";
  return "mixed";
}

export function getAlertAccentColor(dominant: AlertDominantType): string {
  switch (dominant) {
    case "restart_loop": return "#9B59B6";
    case "crash_js":     return "#FF4444";
    case "crash_system": return "#FF6B35";
    default:             return "#FF6B35";
  }
}

export function getAlertDominantLabel(dominant: AlertDominantType): string {
  switch (dominant) {
    case "restart_loop": return "Restart Loop";
    case "crash_js":     return "JS Error";
    case "crash_system": return "Sistema";
    default:             return "Misto";
  }
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
  total: number;
}

export interface DayTrend {
  day: string;
  crash_system: number;
  crash_js: number;
  restart_loop: number;
}

export interface CrashStatsResponse {
  byType: { crash_system: number; crash_js: number; restart_loop: number };
  byVersion: VersionStat[];
  dailyTrend: DayTrend[];
  crashFreeRate24h: number | null;
  ramMedianCrashMb: number | null;
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
