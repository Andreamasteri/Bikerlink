import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StatCard } from "./StatCard";

interface MapMatchingStats {
  pending: number;
  retry: number;
  matched: number;
  unmatchable: number;
  exhausted?: number;
  segments: number;
  lastRun: string | null;
  isRunning: boolean;
  ghConfigured: boolean;
}

interface MapMatchingSectionProps {
  stats: MapMatchingStats | undefined;
  onRunJob: () => void;
  onRematch: () => void;
  onDrain: () => void;
  isRunning: boolean;
  isRematching: boolean;
  isDraining: boolean;
  formatLastRun: (iso: string | null | undefined) => string;
}

export function MapMatchingSection({
  stats,
  onRunJob,
  onRematch,
  onDrain,
  isRunning,
  isRematching,
  isDraining,
  formatLastRun,
}: MapMatchingSectionProps) {
  const hasUnmatchable = ((stats?.unmatchable ?? 0) + (stats?.exhausted ?? 0)) > 0;
  const hasStuckRetry = (stats?.retry ?? 0) > 0;
  return (
    <View style={styles.section}>
      <View style={styles.mmHeader}>
        <MaterialCommunityIcons name="map-marker-check" size={18} color="#f59e0b" />
        <Text style={styles.sectionTitle}>Map Matching OSM</Text>
      </View>
      <Text style={styles.settingDesc}>
        Pipeline notturna (02:00) che associa i punti GPS ai segmenti stradali OSM tramite GraphHopper.
      </Text>

      {stats && (
        <View style={styles.statsGrid}>
          <StatCard
            label="Campioni in attesa"
            value={stats.pending.toLocaleString("it-IT")}
            icon="timer-sand"
            color="#f59e0b"
          />
          <StatCard
            label="Da ritentare"
            value={stats.retry.toLocaleString("it-IT")}
            icon="reload-alert"
            color="#eab308"
          />
          <StatCard
            label="Campioni matchati"
            value={stats.matched.toLocaleString("it-IT")}
            icon="check-circle"
            color="#22c55e"
          />
          <StatCard
            label="Non matchabili"
            value={stats.unmatchable.toLocaleString("it-IT")}
            icon="map-marker-off"
            color="#ef4444"
          />
          <StatCard
            label="Tentativi esauriti"
            value={(stats.exhausted ?? 0).toLocaleString("it-IT")}
            icon="alert-octagon-outline"
            color="#a855f7"
          />
          <StatCard
            label="Segmenti OSM noti"
            value={stats.segments.toLocaleString("it-IT")}
            icon="road"
            color="#3b82f6"
          />
        </View>
      )}

      <View style={styles.mmMeta}>
        <View style={styles.mmMetaRow}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.mmMetaText}>
            Ultima esecuzione: {formatLastRun(stats?.lastRun)}
          </Text>
        </View>
        <View style={styles.mmMetaRow}>
          <MaterialCommunityIcons
            name={stats?.ghConfigured ? "check-circle-outline" : "alert-circle-outline"}
            size={14}
            color={stats?.ghConfigured ? "#22c55e" : "#ef4444"}
          />
          <Text style={[styles.mmMetaText, { color: stats?.ghConfigured ? "#22c55e" : "#ef4444" }]}>
            {stats?.ghConfigured
              ? "GraphHopper configurato"
              : "GraphHopper non configurato (impostare GRAPHHOPPER_URL)"}
          </Text>
        </View>
        {stats?.isRunning && (
          <View style={styles.mmMetaRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={[styles.mmMetaText, { color: Colors.accent }]}>
              Job in esecuzione…
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.runJobBtn,
          (isRunning || stats?.isRunning || !stats?.ghConfigured) && { opacity: 0.5 },
        ]}
        onPress={onRunJob}
        disabled={isRunning || stats?.isRunning || !stats?.ghConfigured}
        activeOpacity={0.8}
      >
        {isRunning ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <MaterialCommunityIcons name="play-circle" size={18} color="#000" />
        )}
        <Text style={styles.runJobBtnText}>Esegui ora</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.rematchBtn,
          (isRematching || isRunning || stats?.isRunning || !hasUnmatchable) && { opacity: 0.5 },
        ]}
        onPress={onRematch}
        disabled={isRematching || isRunning || stats?.isRunning || !hasUnmatchable}
        activeOpacity={0.8}
      >
        {isRematching ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <MaterialCommunityIcons name="reload" size={18} color={Colors.accent} />
        )}
        <Text style={styles.rematchBtnText}>
          Riprova non matchabili
          {hasUnmatchable ? ` (${((stats?.unmatchable ?? 0) + (stats?.exhausted ?? 0)).toLocaleString("it-IT")})` : ""}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.rematchBtn,
          (isDraining || isRematching || isRunning || stats?.isRunning || !hasStuckRetry) && { opacity: 0.5 },
        ]}
        onPress={onDrain}
        disabled={isDraining || isRematching || isRunning || stats?.isRunning || !hasStuckRetry}
        activeOpacity={0.8}
      >
        {isDraining ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <MaterialCommunityIcons name="broom" size={18} color={Colors.accent} />
        )}
        <Text style={styles.rematchBtnText}>
          Drena backlog bloccato
        </Text>
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
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 14,
  },
  runJobBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#000",
  },
  rematchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
  },
  rematchBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
});
