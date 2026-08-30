// Task #2533 — Lista problemi del watchdog.
// Il watchdog osserva e indirizza: non deve fingere di applicare fix.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
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
  const prefix = "app.crash_signal.";
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

export function ProblemsList({ problems, onOpenProblem }: {
  problems: Problem[];
  /** Apre l'area amministrativa che possiede il problema. */
  onOpenProblem?: (problem: Problem) => void;
}) {
  if (!problems.length) return <Text style={styles.empty}>Nessun problema rilevato.</Text>;

  return (
    <View>
      {problems.map((p) => {
        const signalType = extractCrashSignalType(p.id);
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.row, { borderLeftColor: SEV_COLOR[p.severity] }]}
            onPress={() => onOpenProblem?.(p)}
            disabled={!onOpenProblem}
            activeOpacity={0.72}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={[styles.sev, { color: SEV_COLOR[p.severity] }]}>{p.severity.toUpperCase()}</Text>
                {signalType ? <CrashTypeBadge type={signalType} /> : <Text style={styles.source}>{p.source}</Text>}
              </View>
              {onOpenProblem ? <Text style={styles.openChevron}>›</Text> : null}
            </View>
            <Text style={styles.title}>{p.title}</Text>
            {p.detail ? <Text style={styles.detail} numberOfLines={2}>{p.detail}</Text> : null}
            {p.suggestion ? <Text style={styles.sugg}>→ {p.suggestion}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "#1f2937", borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sev: { fontWeight: "700" as const, fontSize: 11 },
  source: { color: "#9ca3af", fontSize: 11 },
  title: { color: "#f3f4f6", fontSize: 14, fontWeight: "600" as const },
  detail: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  sugg: { color: "#60a5fa", fontSize: 12, marginTop: 4, fontStyle: "italic" as const },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 16 },
  openChevron: { color: "#94a3b8", fontSize: 26, lineHeight: 20, fontWeight: "600" as const },
});
