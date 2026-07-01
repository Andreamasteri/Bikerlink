// Task #2533 — Griglia metriche numeriche del sistema.
import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  metrics: Record<string, number>;
}

const NICE_LABELS: Record<string, string> = {
  "db.db.ping_ms": "DB ping (ms)",
  "db.db.connections.active": "DB conn attive",
  "db.db.slow_queries": "Query lente",
  "db.db.size_mb": "DB size (MB)",
  "latency.latency.p50_ms": "API p50 (ms)",
  "latency.latency.p95_ms": "API p95 (ms)",
  "latency.latency.p99_ms": "API p99 (ms)",
  "error.http.5xx_per_min": "5xx/min",
  "error.client.crashes_1h": "Crash 1h",
  "scheduler.scheduler.last_run_min_ago": "Match scheduler (min fa)",
  "scheduler.scheduler.lock_age_min": "Lock scheduler (min)",
  "dragonfly.dragonfly.ping_ms": "DragonflyDB ping (ms)",
  "dragonfly.dragonfly.used_memory_mb": "DragonflyDB RAM (MB)",
  "db.db.bg_limiter.dropped_overflow": "Job bg scartati (coda piena)",
  "db.db.bg_limiter.dropped_timeout": "Job bg scartati (scaduti)",
};

export function MetricsGrid({ metrics }: { metrics: Props["metrics"] }) {
  const entries = Object.entries(metrics).filter(([k]) => NICE_LABELS[k]);
  if (!entries.length) return <Text style={styles.empty}>Nessuna metrica disponibile.</Text>;
  return (
    <View style={styles.grid}>
      {entries.map(([k, v]) => (
        <View key={k} style={styles.cell}>
          <Text style={styles.label}>{NICE_LABELS[k]}</Text>
          <Text style={styles.value}>{typeof v === "number" ? v.toFixed(v >= 100 ? 0 : 2) : "—"}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    flexBasis: "48%", backgroundColor: "#1f2937", borderRadius: 10,
    padding: 10, minWidth: 140,
  },
  label: { color: "#9ca3af", fontSize: 11, marginBottom: 4 },
  value: { color: "#f3f4f6", fontSize: 18, fontWeight: "700" as const },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 12 },
});
