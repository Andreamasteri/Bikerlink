// Task #2533 — Card proposte AI rischiose in attesa di approvazione admin.
// Task #158 — proposte chiare: badge tipo azione, descrizione collassabile,
// timestamp relativo, badge "Vecchia" (>48h), actionLabel sul bottone Accetta.
import React, { useState } from "react";
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

// Task #158 — campi di classificazione salvati nei details della proposta.
export type ProposalActionType = "auto" | "manual" | "info";

interface ProposalDetails {
  title?: string; reasoning?: string; riskLevel?: string;
  action?: { kind?: string; target?: string };
  rollbackHint?: string; persona?: string;
  actionType?: ProposalActionType;
  actionLabel?: string;
}

const RISK_COLOR: Record<string, string> = {
  low: "#22c55e", medium: "#f97316", high: "#ef4444",
};

const ACTION_TYPE_STYLE: Record<ProposalActionType, { color: string; label: string }> = {
  auto: { color: "#22c55e", label: "AUTO" },
  manual: { color: "#f59e0b", label: "MANUALE" },
  info: { color: "#9ca3af", label: "INFO" },
};

const OLD_THRESHOLD_MS = 48 * 60 * 60 * 1000;
const DESC_TRUNCATE = 120;
const TITLE_MAX = 80;

/** Timestamp relativo compatto in italiano ("adesso", "X min fa", "X ore fa", "X giorni fa"). */
export function relativeTimeIt(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMin = Math.max(0, Math.floor((now - t) / 60_000));
  if (diffMin < 1) return "adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH === 1 ? "1 ora fa" : `${diffH} ore fa`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? "1 giorno fa" : `${diffD} giorni fa`;
}

interface Props {
  proposals: WatchdogLog[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  busyId?: string | null;
  /** Task #890 — problemi high/critical dall'ultimo snapshot, per decidere se
   *  mostrare il placeholder "Genera proposte" quando pendingProposals è vuoto. */
  activeHighProblems?: number;
  /** Task #890 — callback del pulsante "Genera proposte ora" nello stato vuoto. */
  onProposeNow?: () => void;
  proposingNow?: boolean;
}

function ProposalRow({ p, onAccept, onReject, busy }: {
  p: WatchdogLog; onAccept: (id: string) => void; onReject: (id: string) => void; busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const det = (p.details ?? {}) as ProposalDetails;
  const risk = det.riskLevel ?? "medium";
  const color = RISK_COLOR[risk] ?? "#9ca3af";
  // Task #25 — proposta a firma Horus (proposer di routing dedicato).
  const isHorus = det.persona === "horus";

  const actionType = ACTION_TYPE_STYLE[det.actionType ?? "info"] ?? ACTION_TYPE_STYLE.info;
  const rawTitle = det.title ?? p.summary ?? "Proposta";
  const title = rawTitle.length > TITLE_MAX ? `${rawTitle.slice(0, TITLE_MAX - 1)}…` : rawTitle;
  const reasoning = det.reasoning ?? "";
  const needsTruncate = reasoning.length > DESC_TRUNCATE;
  const shownReasoning = expanded || !needsTruncate ? reasoning : `${reasoning.slice(0, DESC_TRUNCATE)}…`;
  const createdMs = Date.parse(p.createdAt);
  const isOld = !Number.isNaN(createdMs) && Date.now() - createdMs > OLD_THRESHOLD_MS;

  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.risk, { color }]}>RISCHIO {risk.toUpperCase()}</Text>
          <View style={[styles.typeBadge, { borderColor: actionType.color }]}>
            <Text style={[styles.typeBadgeText, { color: actionType.color }]}>{actionType.label}</Text>
          </View>
          {isOld ? (
            <View style={styles.oldBadge}>
              <Text style={styles.oldBadgeText}>Vecchia</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {isHorus ? <Text style={styles.horusBadge}>🦅 Horus</Text> : null}
          <Text style={styles.action}>{det.action?.kind ?? "?"}</Text>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {p.createdAt ? <Text style={styles.timestamp}>{relativeTimeIt(p.createdAt)}</Text> : null}
      {shownReasoning ? <Text style={styles.reasoning}>{shownReasoning}</Text> : null}
      {needsTruncate ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.showMore}>{expanded ? "mostra meno" : "mostra di più"}</Text>
        </TouchableOpacity>
      ) : null}
      {det.rollbackHint ? <Text style={styles.rollback}>Rollback: {det.rollbackHint}</Text> : null}
      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={color} />
        ) : (
          <>
            <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => onReject(p.id)}>
              <Text style={styles.btnText}>Rifiuta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.accept, { backgroundColor: color }]} onPress={() => onAccept(p.id)}>
              <Text style={styles.btnText}>{det.actionLabel ?? "Accetta"}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export function ProposalsCard({ proposals, onAccept, onReject, busyId, activeHighProblems, onProposeNow, proposingNow }: Props) {
  // Task #890 — se non ci sono proposte pendenti ma ci sono problemi HIGH/CRITICAL
  // attivi, mostra uno stato vuoto esplicito con CTA invece di sparire del tutto.
  if (!proposals.length) {
    if (activeHighProblems && activeHighProblems > 0 && onProposeNow) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nessuna proposta pendente</Text>
          <Text style={styles.emptyBody}>
            {activeHighProblems} {activeHighProblems === 1 ? "problema" : "problemi"} HIGH/CRITICAL attivi —
            premi il pulsante per chiedere all&apos;AI di analizzarli e generare nuove proposte.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={onProposeNow}
            disabled={proposingNow}
            activeOpacity={0.7}
          >
            {proposingNow ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : null}
            <Text style={styles.emptyBtnText}>
              {proposingNow ? "Generazione…" : "Genera proposte ora"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <Text style={styles.empty}>Nessuna proposta AI pendente.</Text>;
  }
  return (
    <View>
      {proposals.map((p) => (
        <ProposalRow key={p.id} p={p} onAccept={onAccept} onReject={onReject} busy={busyId === p.id} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#1f2937", borderRadius: 10, padding: 12,
    marginBottom: 8, borderLeftWidth: 3,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, flexWrap: "wrap" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  risk: { fontWeight: "700" as const, fontSize: 11 },
  typeBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" as const },
  oldBadge: { backgroundColor: "#7f1d1d", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  oldBadgeText: { color: "#fca5a5", fontSize: 10, fontWeight: "700" as const },
  horusBadge: { color: "#c4b5fd", fontSize: 11, fontWeight: "700" as const },
  action: { color: "#9ca3af", fontSize: 11 },
  title: { color: "#f3f4f6", fontWeight: "600" as const, marginBottom: 2 },
  timestamp: { color: "#6b7280", fontSize: 11, marginBottom: 4 },
  reasoning: { color: "#9ca3af", fontSize: 12, marginBottom: 4 },
  showMore: { color: "#60a5fa", fontSize: 12, fontWeight: "600" as const, marginBottom: 4 },
  rollback: { color: "#60a5fa", fontSize: 11, fontStyle: "italic" as const, marginBottom: 6 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  accept: { backgroundColor: "#22c55e" },
  reject: { backgroundColor: "#4b5563" },
  btnText: { color: "#fff", fontWeight: "700" as const, fontSize: 13 },
  empty: { color: "#9ca3af", textAlign: "center" as const, padding: 16 },
  // Task #890 — stato vuoto con CTA quando ci sono problemi HIGH ma 0 proposte pendenti.
  emptyCard: {
    backgroundColor: "#111827", borderRadius: 12, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: "#374151", alignItems: "center" as const,
  },
  emptyTitle: { color: "#f3f4f6", fontWeight: "700" as const, fontSize: 14, marginBottom: 6 },
  emptyBody: { color: "#9ca3af", fontSize: 12, textAlign: "center" as const, lineHeight: 18, marginBottom: 14 },
  emptyBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
    backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700" as const, fontSize: 13 },
});
