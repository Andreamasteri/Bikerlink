// Task #2533 — Lista problemi del watchdog.
// Task #902 — pulsante "Fix ⚡" per i problemi HIGH/CRITICAL.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
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

export function ProblemsList({
  problems,
  onQuickPropose,
}: {
  problems: Problem[];
  onQuickPropose?: (problemId: string) => void;
}) {
  // Task #902 — traccia quale riga è in attesa di risposta AI.
  const [actingId, setActingId] = useState<string | null>(null);

  if (!problems.length) {
    return <Text style={styles.empty}>Nessun problema rilevato.</Text>;
  }

  const handleQuickPropose = async (id: string) => {
    if (!onQuickPropose || actingId !== null) return;
    setActingId(id);
    try {
      await onQuickPropose(id);
    } finally {
      setActingId(null);
    }
  };

  return (
    <View>
      {problems.map((p) => {
        const signalType = extractCrashSignalType(p.id);
        const isActionable = p.severity === "high" || p.severity === "critical";
        const isBusy = actingId === p.id;
        const isDisabled = actingId !== null;
        return (
          <View key={p.id} style={[styles.row, { borderLeftColor: SEV_COLOR[p.severity] }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={[styles.sev, { color: SEV_COLOR[p.severity] }]}>
                  {p.severity.toUpperCase()}
                </Text>
                {signalType ? (
                  <CrashTypeBadge type={signalType} />
                ) : (
                  <Text style={styles.source}>{p.source}</Text>
                )}
              </View>
              {isActionable && onQuickPropose ? (
                <TouchableOpacity
                  style={[styles.fixBtn, isDisabled && styles.fixBtnDisabled]}
                  onPress={() => { void handleQuickPropose(p.id); }}
                  disabled={isDisabled}
                  activeOpacity={0.7}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#fff" style={styles.fixSpinner} />
                  ) : (
                    <Text style={styles.fixBtnText}>Fix ⚡</Text>
                  )}
                </TouchableOpacity>
              ) : null}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sev: { fontWeight: "700" as const, fontSize: 11 },
  source: { color: "#9ca3af", fontSize: 11 },
  title: { color: "#f3f4f6", fontSize: 14, fontWeight: "600" as const },
  detail: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  sugg: { color: "#60a5fa", fontSize: 12, marginTop: 4, fontStyle: "italic" as const },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 16 },
  // Task #902 — pulsante "Fix ⚡"
  fixBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#374151", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, marginLeft: 8, minWidth: 58, justifyContent: "center",
  },
  fixBtnDisabled: { opacity: 0.45 },
  fixBtnText: { color: "#f3f4f6", fontSize: 12, fontWeight: "700" as const },
  fixSpinner: { width: 16, height: 16 },
});
