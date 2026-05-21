import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StatCard } from "./StatCard";

interface CurvyScoreStats {
  totalSegments: number;
  withScore: number;
  withoutScore: number;
  coveragePct: number;
  avgScore: number | null;
  lastRun: string | null;
  isRunning: boolean;
}

interface CurvyScoreSectionProps {
  stats: CurvyScoreStats | undefined;
  onRunJob: () => void;
  isRunning: boolean;
  formatLastRun: (iso: string | null | undefined) => string;
}

export function CurvyScoreSection({
  stats,
  onRunJob,
  isRunning,
  formatLastRun,
}: CurvyScoreSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.mmHeader}>
        <MaterialCommunityIcons name="sine-wave" size={18} color="#8b5cf6" />
        <Text style={styles.sectionTitle}>Curvy Score (Fase 3)</Text>
      </View>
      <Text style={styles.settingDesc}>
        Job settimanale (domenica 03:00) che calcola il curvy_score di ogni segmento OSM
        dalla telemetria di piega e G-force dei biker.
      </Text>

      {stats && (
        <>
          <View style={styles.statsGrid}>
            <StatCard
              label="Segmenti con score"
              value={stats.withScore.toLocaleString("it-IT")}
              icon="check-circle"
              color="#22c55e"
            />
            <StatCard
              label="Segmenti senza score"
              value={stats.withoutScore.toLocaleString("it-IT")}
              icon="timer-sand"
              color="#f59e0b"
            />
            <StatCard
              label="Copertura"
              value={`${stats.coveragePct.toFixed(1)}%`}
              icon="chart-pie"
              color="#8b5cf6"
            />
            {stats.avgScore !== null && (
              <StatCard
                label="Score medio"
                value={stats.avgScore.toFixed(2)}
                icon="sine-wave"
                color="#06b6d4"
              />
            )}
          </View>

          <View style={[styles.progressBg, { marginTop: 12 }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(stats.coveragePct, 100)}%` as `${number}%`,
                  backgroundColor: stats.coveragePct >= 80 ? "#22c55e" : "#8b5cf6",
                },
              ]}
            />
          </View>
        </>
      )}

      <View style={styles.mmMeta}>
        <View style={styles.mmMetaRow}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.mmMetaText}>
            Ultima esecuzione: {formatLastRun(stats?.lastRun)}
          </Text>
        </View>
        {stats?.isRunning && (
          <View style={styles.mmMetaRow}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={[styles.mmMetaText, { color: "#8b5cf6" }]}>
              Job in esecuzione…
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.runJobBtn,
          { backgroundColor: "#8b5cf6" },
          (isRunning || stats?.isRunning) && { opacity: 0.5 },
        ]}
        onPress={onRunJob}
        disabled={isRunning || stats?.isRunning}
        activeOpacity={0.8}
      >
        {isRunning ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialCommunityIcons name="play-circle" size={18} color="#fff" />
        )}
        <Text style={[styles.runJobBtnText, { color: "#fff" }]}>Esegui ora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 12,
  },
  settingDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  statsGrid: {
    gap: 10,
  },
  mmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  mmMeta: {
    marginTop: 12,
    gap: 6,
  },
  mmMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mmMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  runJobBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 14,
  },
  runJobBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  progressBg: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
});
