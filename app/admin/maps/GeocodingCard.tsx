import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface NominatimHealth {
  configured: boolean;
  url: string;
  latencyMs: number | null;
  ok: boolean;
}

interface GeocodingCardProps {
  nominatim: NominatimHealth;
}

export function GeocodingCard({ nominatim }: GeocodingCardProps) {
  const { configured, url, latencyMs, ok } = nominatim;

  const color = ok ? Colors.success : Colors.error;
  const icon: "checkmark-circle" | "alert-circle" = ok ? "checkmark-circle" : "alert-circle";
  const statusText = ok ? "raggiungibile" : "non raggiungibile";
  const sourceLabel = configured ? "self-hosted" : "pubblico (fallback)";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="search-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Geocoding</Text>
      </View>

      <View style={styles.statusRow}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.statusText, { color }]}>{statusText}</Text>
        <Text style={styles.sourceLabel}>· {sourceLabel}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.url} numberOfLines={1}>{url}</Text>
        {latencyMs != null && (
          <Text style={styles.latency}>{latencyMs} ms</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sourceLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  url: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  latency: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
