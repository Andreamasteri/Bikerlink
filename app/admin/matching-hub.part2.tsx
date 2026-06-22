/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./_matching-hub.styles";

interface MusicAffinityRunSnapshot {
  timestamp: string;
  matchCount: number;
  skippedBelowThreshold: number;
  usersBlockedBySoglia: number;
  usersProcessed: number;
  usersSkipped: number;
  cap: number;
  capReached: boolean;
  skipReasons: { capReached: number; noCandidate: number };
}

export function MusicAffinityStatsContent({ musicStats }: { musicStats: any }) {
  if (!musicStats) return null;
  return (
    <View style={styles.musicCard}>
      <View style={styles.musicRow}>
        <View style={styles.musicKpi}>
          <Text style={styles.musicKpiValue}>{musicStats.usersWithEmbedding ?? "—"}</Text>
          <Text style={styles.musicKpiLabel}>Embedding</Text>
        </View>
        <View style={styles.musicKpi}>
          <Text style={[styles.musicKpiValue, { color: (musicStats.coveragePct ?? 0) < 50 ? Colors.warning : Colors.success }]}>
            {musicStats.coveragePct}%
          </Text>
          <Text style={styles.musicKpiLabel}>Copertura</Text>
        </View>
        <View style={styles.musicKpi}>
          <Text style={styles.musicKpiValue}>{musicStats.totalMatchesInDb ?? "—"}</Text>
          <Text style={styles.musicKpiLabel}>Match DB</Text>
        </View>
      </View>
      {musicStats.lastRun ? (
        <View style={styles.musicLastRunBox}>
          <View style={styles.musicRunRow}>
            <MaterialCommunityIcons
              name={musicStats.lastRun.capReached ? "alert-circle-outline" : "check-circle-outline"}
              size={14}
              color={musicStats.lastRun.capReached ? Colors.warning : Colors.success}
            />
            <Text style={[styles.musicRunText, musicStats.lastRun.capReached && { color: Colors.warning }]}>
              Ultimo run{musicStats.lastRun.capReached ? " · CAP RAGGIUNTO" : ""}
            </Text>
            <Text style={styles.musicRunTimestamp}>
              {new Date(musicStats.lastRun.timestamp).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          <View style={styles.musicRunKpiRow}>
            <View style={styles.musicRunKpi}>
              <Text style={styles.musicRunKpiVal}>{musicStats.lastRun.matchCount}</Text>
              <Text style={styles.musicRunKpiLbl}>match</Text>
            </View>
            <View style={styles.musicRunKpi}>
              <Text style={[styles.musicRunKpiVal, musicStats.lastRun.skippedBelowThreshold > 0 && { color: Colors.warning }]}>
                {musicStats.lastRun.skippedBelowThreshold}
              </Text>
              <Text style={styles.musicRunKpiLbl}>sotto soglia</Text>
            </View>
            <View style={styles.musicRunKpi}>
              <Text style={styles.musicRunKpiVal}>{musicStats.lastRun.usersProcessed}</Text>
              <Text style={styles.musicRunKpiLbl}>processati</Text>
            </View>
            <View style={styles.musicRunKpi}>
              <Text style={[styles.musicRunKpiVal, musicStats.lastRun.usersSkipped > 0 && { color: Colors.warning }]}>
                {musicStats.lastRun.usersSkipped}
              </Text>
              <Text style={styles.musicRunKpiLbl}>saltati</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.musicRunRow}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.musicRunText}>Nessun run completato in questa sessione</Text>
        </View>
      )}
      {musicStats.recentRuns.length > 1 && (
        <View style={styles.musicHistoryBox}>
          <Text style={styles.musicHistoryTitle}>Ultimi run</Text>
          {musicStats.recentRuns.slice(0, 5).map((run: MusicAffinityRunSnapshot, idx: number) => (
            <View key={idx} style={styles.musicHistoryRow}>
              <MaterialCommunityIcons
                name={run.capReached ? "alert-circle-outline" : "check-circle-outline"}
                size={12}
                color={run.capReached ? Colors.warning : Colors.textSecondary}
              />
              <Text style={styles.musicHistoryTime}>
                {new Date(run.timestamp).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={styles.musicHistoryStat}>{run.matchCount} match</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
