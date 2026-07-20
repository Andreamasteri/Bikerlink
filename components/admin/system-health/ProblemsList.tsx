// Task #2533 — Lista problemi del watchdog.
// Task #902 — pulsante "Fix ⚡" per i problemi HIGH/CRITICAL.
// Task #910 — safety timeout: actingId si azzera da solo se la promessa non si risolve.
// Task #923 — feedback inline post-Fix + badge "proposte già pending".
import React, { useState, useRef } from "react";
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

/** Stato del fix per una singola card: null = non ancora tentato. */
type FixResult = { count: number } | "none" | null;

export function ProblemsList({
  problems,
  onQuickPropose,
  pendingSignalIds,
}: {
  problems: Problem[];
  /** Restituisce il numero di proposte generate (0 = nessuna). */
  onQuickPropose?: (problemId: string) => Promise<number | undefined> | void;
  /** Task #923 — insieme di signalId che hanno già proposte pending in DB. */
  pendingSignalIds?: ReadonlySet<string>;
}) {
  // Task #902 — traccia quale riga è in attesa di risposta AI.
  const [actingId, setActingId] = useState<string | null>(null);
  // Task #923 — risultato post-Fix per ogni card (signalId → FixResult).
  const [fixResults, setFixResults] = useState<Record<string, FixResult>>({});
  // Task #910 — timer di sicurezza: se la promessa non si risolve entro
  // SAFETY_TIMEOUT_MS (leggermente oltre il timeout API di 90s), azzera
  // actingId automaticamente per evitare che il pulsante resti bloccato
  // in caso di body non-JSON, network hang, o errore non propagato.
  const SAFETY_TIMEOUT_MS = 95_000;
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!problems.length) {
    return <Text style={styles.empty}>Nessun problema rilevato.</Text>;
  }

  const handleQuickPropose = async (id: string) => {
    if (!onQuickPropose || actingId !== null) return;
    setActingId(id);
    safetyTimerRef.current = setTimeout(() => {
      setActingId(null);
      safetyTimerRef.current = null;
    }, SAFETY_TIMEOUT_MS);
    try {
      const count = await onQuickPropose(id);
      // Task #923 — salva il risultato per mostrare il banner inline.
      const result: FixResult = typeof count === "number" && count > 0
        ? { count }
        : "none";
      setFixResults((prev) => ({ ...prev, [id]: result }));
    } finally {
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      setActingId(null);
    }
  };

  const dismissResult = (id: string) => {
    setFixResults((prev) => ({ ...prev, [id]: null }));
  };

  return (
    <View>
      {problems.map((p) => {
        const signalType = extractCrashSignalType(p.id);
        const isActionable = p.severity === "high" || p.severity === "critical";
        const isBusy = actingId === p.id;
        const isDisabled = actingId !== null;
        // Task #923 — segnale con proposte già pending in DB.
        const hasPending = pendingSignalIds?.has(p.id) ?? false;
        const fixResult = fixResults[p.id] ?? null;

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
                hasPending ? (
                  // Task #923 — proposte già presenti: bottone disabled con testo diverso.
                  <View style={[styles.fixBtn, styles.fixBtnPending]}>
                    <Text style={styles.fixBtnPendingText}>⏳ Pending</Text>
                  </View>
                ) : (
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
                )
              ) : null}
            </View>
            <Text style={styles.title}>{p.title}</Text>
            {p.detail ? <Text style={styles.detail} numberOfLines={2}>{p.detail}</Text> : null}
            {p.suggestion ? <Text style={styles.sugg}>→ {p.suggestion}</Text> : null}

            {/* Task #923 — banner inline post-Fix */}
            {fixResult !== null && (
              <View style={[
                styles.fixBanner,
                fixResult === "none" ? styles.fixBannerNone : styles.fixBannerOk,
              ]}>
                <Text style={styles.fixBannerText}>
                  {fixResult === "none"
                    ? "Nessuna proposta automatica disponibile"
                    : `${fixResult.count} ${fixResult.count === 1 ? "proposta pronta" : "proposte pronte"} — scorri alle Proposte AI`}
                </Text>
                <TouchableOpacity onPress={() => dismissResult(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.fixBannerDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
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
  // Task #923 — stato "proposte già pending"
  fixBtnPending: { backgroundColor: "#1e3a5f", opacity: 0.8 },
  fixBtnPendingText: { color: "#93c5fd", fontSize: 12, fontWeight: "600" as const },
  // Task #923 — banner inline post-Fix
  fixBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 8, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
  },
  fixBannerOk: { backgroundColor: "#14532d" },
  fixBannerNone: { backgroundColor: "#374151" },
  fixBannerText: { color: "#d1fae5", fontSize: 12, flex: 1 },
  fixBannerDismiss: { color: "#9ca3af", fontSize: 12, marginLeft: 8 },
});
