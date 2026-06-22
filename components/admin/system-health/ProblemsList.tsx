// Task #2533 — Lista problemi del watchdog.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CrashTypeBadge } from "@/components/admin/crash-logs/CrashLogTypes";

export interface Problem {
  id: string;
  severity: "info" | "warn" | "high" | "critical";
  source: string;
  title: string;
  detail?: string;
  suggestion?: string;
}

const SEV_COLOR: Record<Problem["severity"], string> = {
  info: "#3b82f6", warn: "#eab308", high: "#f97316", critical: "#ef4444",
};

function extractCrashSignalType(id: string): string | null {
  // id format: "app.crash_signal.{signal_type}"
  const prefix = "app.crash_signal.";
  if (id.startsWith(prefix)) return id.slice(prefix.length);
  return null;
}

export function ProblemsList({ problems }: { problems: Problem[] }) {
  if (!problems.length) {
    return <Text style={styles.empty}>Nessun problema rilevato.</Text>;
  }
  return (
    <View>
      {problems.map((p) => {
        const signalType = extractCrashSignalType(p.id);
        return (
          <View key={p.id} style={[styles.row, { borderLeftColor: SEV_COLOR[p.severity] }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.sev, { color: SEV_COLOR[p.severity] }]}>
                {p.severity.toUpperCase()}
              </Text>
              {signalType ? (
                <CrashTypeBadge type={signalType} />
              ) : (
                <Text style={styles.source}>{p.source}</Text>
              )}
            </View>
            <Text style={styles.title}>{p.title}</Text>
            {p.detail ? <Text style={styles.detail} numberOfLines={2}>{p.detail}</Text> : null}
            {p.suggestion ? <Text style={styles.sugg}>→ {p.suggestion}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#1f2937", borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 3,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sev: { fontWeight: "700" as const, fontSize: 11 },
  source: { color: "#9ca3af", fontSize: 11 },
  title: { color: "#f3f4f6", fontSize: 14, fontWeight: "600" as const },
  detail: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  sugg: { color: "#60a5fa", fontSize: 12, marginTop: 4, fontStyle: "italic" as const },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 16 },
});
