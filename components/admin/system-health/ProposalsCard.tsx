// Task #2533 — Card proposte AI rischiose in attesa di approvazione admin.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";

export interface WatchdogLog {
  id: string;
  kind: string;
  scope?: string | null;
  status: string;
  summary?: string | null;
  details?: unknown;
  createdAt: string;
}

const RISK_COLOR: Record<string, string> = {
  low: "#22c55e", medium: "#f97316", high: "#ef4444",
};

interface Props {
  proposals: WatchdogLog[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  busyId?: string | null;
}

export function ProposalsCard({ proposals, onAccept, onReject, busyId }: Props) {
  if (!proposals.length) {
    return <Text style={styles.empty}>Nessuna proposta AI pendente.</Text>;
  }
  return (
    <View>
      {proposals.map((p) => {
        const det = (p.details ?? {}) as {
          title?: string; reasoning?: string; riskLevel?: string;
          action?: { kind?: string; target?: string };
          rollbackHint?: string; persona?: string;
        };
        const risk = det.riskLevel ?? "medium";
        const color = RISK_COLOR[risk] ?? "#9ca3af";
        // Task #25 — proposta a firma Horus (proposer di routing dedicato).
        const isHorus = det.persona === "horus";
        return (
          <View key={p.id} style={[styles.row, { borderLeftColor: color }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.risk, { color }]}>RISCHIO {risk.toUpperCase()}</Text>
              <View style={styles.headerRight}>
                {isHorus ? <Text style={styles.horusBadge}>🦅 Horus</Text> : null}
                <Text style={styles.action}>{det.action?.kind ?? "?"}</Text>
              </View>
            </View>
            <Text style={styles.title}>{det.title ?? p.summary ?? "Proposta"}</Text>
            {det.reasoning ? <Text style={styles.reasoning}>{det.reasoning}</Text> : null}
            {det.rollbackHint ? <Text style={styles.rollback}>Rollback: {det.rollbackHint}</Text> : null}
            <View style={styles.actions}>
              {busyId === p.id ? (
                <ActivityIndicator color={color} />
              ) : (
                <>
                  <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => onReject(p.id)}>
                    <Text style={styles.btnText}>Rifiuta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.accept, { backgroundColor: color }]} onPress={() => onAccept(p.id)}>
                    <Text style={styles.btnText}>Accetta</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#1f2937", borderRadius: 10, padding: 12,
    marginBottom: 8, borderLeftWidth: 3,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  risk: { fontWeight: "700" as const, fontSize: 11 },
  horusBadge: { color: "#c4b5fd", fontSize: 11, fontWeight: "700" as const },
  action: { color: "#9ca3af", fontSize: 11 },
  title: { color: "#f3f4f6", fontWeight: "600" as const, marginBottom: 4 },
  reasoning: { color: "#9ca3af", fontSize: 12, marginBottom: 4 },
  rollback: { color: "#60a5fa", fontSize: 11, fontStyle: "italic" as const, marginBottom: 6 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  accept: { backgroundColor: "#22c55e" },
  reject: { backgroundColor: "#4b5563" },
  btnText: { color: "#fff", fontWeight: "700" as const, fontSize: 13 },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 16 },
});
