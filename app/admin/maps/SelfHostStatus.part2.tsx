/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./SelfHostStatus.styles";

export function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ErrorTypeIcon({ type, size = 14 }: { type: any; size?: number }) {
  if (type === "tunnel_down") return <Ionicons name="cloud-offline-outline" size={size} color={Colors.error} />;
  if (type === "profile_missing") return <Ionicons name="settings-outline" size={size} color="#f59e0b" />;
  if (type === "routing_error") return <Ionicons name="warning-outline" size={size} color={Colors.error} />;
  return <Ionicons name="checkmark-circle" size={size} color={Colors.success} />;
}

export function ErrorTypeLabel({ type }: { type: any }) {
  const labels: any = {
    tunnel_down: "Tunnel DuckDNS non raggiungibile",
    profile_missing: "Profilo motorcycle mancante",
    routing_error: "Errore di routing",
    ok: "Operativo",
  };
  return <Text style={styles.errorTypeLabel}>{labels[type]}</Text>;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}
