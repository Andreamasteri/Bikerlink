import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { SessionStats } from "@/components/admin/analytics/UserStatsContent";

function formatSessionDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

interface Props {
  sessionStats?: SessionStats;
}

export function UserSessionStatsBlock({ sessionStats }: Props) {
  if (!sessionStats) {
    return (
      <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>
        Nessuna sessione registrata.
      </Text>
    );
  }
  return (
    <>
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiNumber}>{sessionStats.totalSessions}</Text>
          <Text style={styles.kpiLabel}>Sessioni totali</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiNumber}>{formatSessionDuration(sessionStats.avgDurationSeconds)}</Text>
          <Text style={styles.kpiLabel}>Durata media</Text>
        </View>
      </View>
      {sessionStats.totalSessions > 0 && (
        <View style={styles.exitBlock}>
          {(
            [
              { key: "background", label: "Background", color: Colors.textSecondary },
              { key: "logout", label: "Logout", color: Colors.accent },
              { key: "crash", label: "Crash", color: Colors.error },
              { key: "unknown", label: "Sconosciuto", color: Colors.textSecondary },
            ] as const
          )
            .filter(({ key }) => (sessionStats.exitBreakdown[key] ?? 0) > 0)
            .map(({ key, label, color }) => {
              const count = sessionStats.exitBreakdown[key];
              const total = sessionStats.totalSessions;
              const pct = ((count / total) * 100).toFixed(1);
              return (
                <View key={key} style={styles.exitRow}>
                  <Text style={[styles.exitLabel, { color }]}>{label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(count / total) * 100}%` as `${number}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.exitCount}>
                    {count} <Text style={styles.exitPct}>({pct}%)</Text>
                  </Text>
                </View>
              );
            })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 10, marginTop: 4 },
  kpiBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kpiNumber: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  kpiLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: "center" },
  exitBlock: { gap: 8, marginTop: 4 },
  exitRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  exitLabel: { fontFamily: "Inter_500Medium", fontSize: 12, width: 80 },
  barTrack: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  exitCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, minWidth: 70, textAlign: "right" },
  exitPct: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
});
