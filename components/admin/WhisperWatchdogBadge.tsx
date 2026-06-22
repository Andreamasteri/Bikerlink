import React from "react";
import { View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "@/components/admin/whisper-config.styles";

export type WatchdogStatus = "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";

export interface WhisperHealthData {
  agentOnline: boolean;
  status: WatchdogStatus;
  lastCode: number | null;
  lastCheck: string | null;
  lastRestart: string | null;
  lastRestartReason: string | null;
  reason?: string;
}

const WATCHDOG_COLORS: Record<WatchdogStatus, string> = {
  OK:      "#22C55E",
  DEGRADED:"#F59E0B",
  DOWN:    "#ef4444",
  UNKNOWN: "#6B7280",
};

const WATCHDOG_ICONS: Record<WatchdogStatus, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  OK:      "check-circle-outline",
  DEGRADED:"alert-circle-outline",
  DOWN:    "close-circle-outline",
  UNKNOWN: "help-circle-outline",
};

export function formatRelTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}s fa`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m fa`;
  return `${Math.floor(diff / 3600)}h fa`;
}

export function WhisperWatchdogBadge({ health, updatedAt }: { health: WhisperHealthData; updatedAt: number }) {
  const status  = health.status ?? "UNKNOWN";
  const color   = WATCHDOG_COLORS[status];
  const icon    = WATCHDOG_ICONS[status];

  return (
    <View style={[styles.watchdogCard, { borderColor: `${color}44`, backgroundColor: `${color}10` }]}>
      <View style={styles.watchdogRow}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
        <View style={{ flex: 1 }}>
          <View style={styles.watchdogTitleRow}>
            <Text style={[styles.watchdogStatus, { color }]}>Watchdog: {status}</Text>
            {!health.agentOnline && (
              <Text style={styles.watchdogOffline}> (agente offline)</Text>
            )}
          </View>
          {health.lastCheck && (
            <Text style={styles.watchdogMeta}>
              Ultimo check {formatRelTime(health.lastCheck)}
              {health.lastCode != null ? `  ·  HTTP ${health.lastCode}` : ""}
            </Text>
          )}
          {health.reason && !health.agentOnline && (
            <Text style={styles.watchdogMeta}>{health.reason}</Text>
          )}
        </View>
        <Text style={styles.watchdogRefresh}>
          {updatedAt ? formatRelTime(new Date(updatedAt).toISOString()) : "—"}
        </Text>
      </View>
      {health.lastRestart && (
        <View style={styles.watchdogRestartRow}>
          <MaterialCommunityIcons name="restart" size={13} color="#F59E0B" />
          <Text style={styles.watchdogRestartText}>
            Auto-restart {formatRelTime(health.lastRestart)}
            {health.lastRestartReason ? ` — ${health.lastRestartReason}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}
