import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearAllText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.error,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  sessionMeta: {
    gap: 2,
  },
  sessionDate: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  sessionDuration: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  sessionDeleteBtn: {
    padding: 2,
  },
  sessionPeaks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sessionPeakChip: {
    backgroundColor: Colors.accent + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  sessionPeakKey: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sessionPeakValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sessionNoPeaks: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});

export type GKey = "accelG" | "brakeG" | "lateralG";

export interface GSession {
  id: string;
  startedAt: string;
  endedAt: string;
  peaks: Partial<Record<GKey, number>>;
}

const G_KEY_LABELS: Record<GKey, string> = {
  accelG: "Accel",
  brakeG: "Frenata",
  lateralG: "Laterale",
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  try {
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    const totalSec = Math.round(diffMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  } catch {
    return "";
  }
}

function SessionCard({ session, onDelete }: { session: GSession; onDelete: () => void }) {
  const hasPeaks = Object.keys(session.peaks).length > 0;
  const duration = formatDuration(session.startedAt, session.endedAt);

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDate}>{formatDateTime(session.startedAt)}</Text>
          {duration ? (
            <Text style={styles.sessionDuration}>{duration}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.sessionDeleteBtn}
        >
          <Ionicons name="trash-outline" size={15} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {hasPeaks ? (
        <View style={styles.sessionPeaks}>
          {(Object.keys(session.peaks) as GKey[]).map((key) => (
            <View key={key} style={styles.sessionPeakChip}>
              <Text style={styles.sessionPeakKey}>{G_KEY_LABELS[key]}</Text>
              <Text style={styles.sessionPeakValue}>
                {session.peaks[key]!.toFixed(2)} G
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sessionNoPeaks}>Nessun picco registrato</Text>
      )}
    </View>
  );
}

export interface SensorSummaryProps {
  sessions: GSession[];
  onClearAll: () => void;
  onDeleteSession: (id: string) => void;
}

export function SensorSummary({ sessions, onClearAll, onDeleteSession }: SensorSummaryProps) {
  return (
    <View style={styles.section}>
      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>Sessioni Precedenti</Text>
        {sessions.length > 0 && (
          <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearAllText}>Cancella tutto</Text>
          </TouchableOpacity>
        )}
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={28} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>
            Nessuna sessione salvata.{"\n"}Attiva i sensori per registrare i picchi G.
          </Text>
        </View>
      ) : (
        sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onDelete={() => onDeleteSession(session.id)}
          />
        ))
      )}
    </View>
  );
}
