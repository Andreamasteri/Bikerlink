import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface ErrorEvent {
  timestamp: number;
  error: string;
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
});
