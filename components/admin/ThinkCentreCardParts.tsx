import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface ErrorEvent {
  timestamp: number;
  error: string;
}

export interface AreaServiceHealth {
  code: string;
  nome: string;
  tier: "core" | "on-demand";
  enabled: boolean;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
  history: ErrorEvent[];
}

export interface HealthEvent {
  id: string;
  serviceKey: string | null;
  transitionFrom: string;
  transitionTo: string;
  occurredAt: string;
}

const TRANSITION_COLOR: Record<string, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  ok: "#22c55e",
  ko: "#ef4444",
  idle: "#6b7280",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatIso(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusDot({ status }: { status: string }) {
  const color = TRANSITION_COLOR[status] ?? "#6b7280";
  return <View style={[styles.eventDot, { backgroundColor: color }]} />;
}

export function ErrorHistory({ history }: { history: ErrorEvent[] }) {
  const [open, setOpen] = useState(false);

  if (!history || history.length === 0) return null;

  return (
    <View style={styles.historyContainer}>
      <TouchableOpacity
        style={styles.historyToggle}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-history-toggle"
      >
        <Ionicons name="time-outline" size={11} color="#f59e0b" style={styles.historyIcon} />
        <Text style={styles.historyToggleText}>Ultimi errori ({history.length})</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={11} color="#f59e0b" />
      </TouchableOpacity>

      {open && (
        <View style={styles.historyList}>
          {history.map((ev, idx) => (
            <View key={idx} style={styles.historyItem}>
              <Text style={styles.historyTimestamp}>{formatTimestamp(ev.timestamp)}</Text>
              <Text style={styles.historyError} numberOfLines={3}>{ev.error}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function EventLog({ events }: { events: HealthEvent[] }) {
  const [open, setOpen] = useState(false);

  if (!events || events.length === 0) return null;

  return (
    <View style={styles.eventLogContainer}>
      <TouchableOpacity
        style={styles.eventLogToggle}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-event-log-toggle"
      >
        <Ionicons name="pulse-outline" size={13} color="#60a5fa" style={styles.eventLogIcon} />
        <Text style={styles.eventLogToggleText}>Storico transizioni ({events.length})</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color="#60a5fa" />
      </TouchableOpacity>

      {open && (
        <View style={styles.eventList}>
          {events.map((ev) => (
            <View key={ev.id} style={styles.eventRow}>
              <Text style={styles.eventTime}>{formatIso(ev.occurredAt)}</Text>
              <View style={styles.eventTransition}>
                <StatusDot status={ev.transitionFrom} />
                <Text style={styles.eventState}>{ev.transitionFrom}</Text>
                <Ionicons name="arrow-forward" size={10} color="#6b7280" />
                <StatusDot status={ev.transitionTo} />
                <Text style={styles.eventState}>{ev.transitionTo}</Text>
              </View>
              {ev.serviceKey ? (
                <Text style={styles.eventService}>{ev.serviceKey}</Text>
              ) : (
                <Text style={[styles.eventService, { color: "#60a5fa" }]}>globale</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function areaColor(a: AreaServiceHealth): string {
  if (!a.enabled) return "#6b7280";
  return a.ok ? "#22c55e" : "#ef4444";
}

function areaStatusLabel(a: AreaServiceHealth): string {
  if (!a.enabled) return "Non abilitata";
  if (a.ok) return a.latencyMs != null ? `Online · ${a.latencyMs} ms` : "Online";
  return a.error ? `Offline · ${a.error}` : "Offline";
}

/**
 * Sotto-gruppo collassabile delle 7 istanze GraphHopper per-area.
 * Header aggregato: contatore aree online/totale abilitate + colore
 * verde (tutte le abilitate OK) / giallo (parziale) / rosso (nessuna) / grigio
 * (nessuna abilitata). Il fingerprint del token è a livello di blocco (token
 * unico per tutte le aree).
 */
export function GraphHopperBlock({
  areas,
  fingerprint,
  url,
  tokenMissing,
}: {
  areas: AreaServiceHealth[];
  fingerprint: string | null;
  url: string | null;
  tokenMissing?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const enabled = areas.filter((a) => a.enabled);
  const onlineCount = enabled.filter((a) => a.ok).length;
  const aggColor =
    enabled.length === 0
      ? "#6b7280"
      : onlineCount === enabled.length
        ? "#22c55e"
        : onlineCount === 0
          ? "#ef4444"
          : "#f59e0b";

  const showFingerprint = fingerprint != null;
  const fpOk = showFingerprint && onlineCount > 0;

  return (
    <View style={styles.ghBlock}>
      <TouchableOpacity
        style={styles.ghHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-gh-block-header"
      >
        <MaterialCommunityIcons name="map-marker-path" size={18} color={aggColor} style={styles.ghHeaderIcon} />
        <View style={styles.ghHeaderText}>
          <Text style={styles.ghTitle}>GraphHopper</Text>
          <Text style={styles.ghSubtitle}>
            {areas.length} aree
            {url ? ` · ${url}` : ""}
          </Text>
        </View>
        <Text style={styles.ghCount}>
          {onlineCount}/{enabled.length}
        </Text>
        <View style={[styles.ghDot, { backgroundColor: aggColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.ghList}>
          {areas.map((a) => (
            <View key={a.code} style={styles.ghRow}>
              <View style={[styles.ghDot, { backgroundColor: areaColor(a) }]} />
              <View style={styles.ghRowText}>
                <View style={styles.ghRowTop}>
                  <Text style={styles.ghAreaName}>{a.nome}</Text>
                  <View
                    style={[
                      styles.tierBadge,
                      a.tier === "core" ? styles.tierBadgeCore : styles.tierBadgeOnDemand,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierBadgeText,
                        a.tier === "core" ? styles.tierBadgeTextCore : styles.tierBadgeTextOnDemand,
                      ]}
                    >
                      {a.tier}
                    </Text>
                  </View>
                  {!a.enabled && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>Non abilitata</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.ghAreaStatus}>{areaStatusLabel(a)}</Text>
                {a.enabled && !a.ok && a.history?.length > 0 && (
                  <ErrorHistory history={a.history} />
                )}
              </View>
            </View>
          ))}

          {showFingerprint && (
            <View style={styles.ghFingerprintRow}>
              <Text style={styles.ghFingerprint} numberOfLines={1}>
                token Replit: {fingerprint}…
              </Text>
              {fpOk && (
                <Ionicons name="checkmark-circle" size={11} color="#22c55e" style={styles.tokenOkIcon} />
              )}
            </View>
          )}
          {!showFingerprint && (
            <Text style={styles.ghFingerprint}>
              token Replit: {tokenMissing ? "non configurato" : "—"}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historyContainer: { marginTop: 6 },
  historyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  historyIcon: { marginRight: 1 },
  historyToggleText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#f59e0b" },
  historyList: {
    marginTop: 6,
    gap: 5,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(245, 158, 11, 0.25)",
  },
  historyItem: { gap: 1, paddingLeft: 6 },
  historyTimestamp: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#6b7280", letterSpacing: 0.3 },
  historyError: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#9ca3af", lineHeight: 14 },
  eventLogContainer: { marginTop: 4 },
  eventLogToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.2)",
  },
  eventLogIcon: { marginRight: 1 },
  eventLogToggleText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#60a5fa" },
  eventList: {
    marginTop: 8,
    gap: 4,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(96, 165, 250, 0.2)",
  },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 6, paddingVertical: 2 },
  eventTime: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#6b7280", letterSpacing: 0.2, minWidth: 64 },
  eventTransition: { flexDirection: "row", alignItems: "center", gap: 3, flex: 1 },
  eventDot: { width: 6, height: 6, borderRadius: 3 },
  eventState: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  eventService: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#9ca3af", letterSpacing: 0.2 },

  ghBlock: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(148, 163, 184, 0.04)",
    overflow: "hidden",
  },
  ghHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ghHeaderIcon: { marginRight: 2 },
  ghHeaderText: { flex: 1 },
  ghTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  ghSubtitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  ghCount: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.3 },
  ghDot: { width: 9, height: 9, borderRadius: 5 },
  ghList: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.12)",
    paddingTop: 8,
  },
  ghRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  ghRowText: { flex: 1, gap: 2 },
  ghRowTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ghAreaName: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  ghAreaStatus: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, borderWidth: 1 },
  tierBadgeCore: { backgroundColor: "rgba(59, 130, 246, 0.12)", borderColor: "rgba(59, 130, 246, 0.35)" },
  tierBadgeOnDemand: { backgroundColor: "rgba(148, 163, 184, 0.1)", borderColor: "rgba(148, 163, 184, 0.3)" },
  tierBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 0.4 },
  tierBadgeTextCore: { color: "#60a5fa" },
  tierBadgeTextOnDemand: { color: "#9ca3af" },
  disabledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(107, 114, 128, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(107, 114, 128, 0.3)",
  },
  disabledBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: "#9ca3af", letterSpacing: 0.3 },
  ghFingerprintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ghFingerprint: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#6b7280", letterSpacing: 0.2 },
  tokenOkIcon: { marginLeft: 1 },
});
