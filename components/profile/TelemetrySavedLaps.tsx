import React from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import type { IdealLap } from "./types";

export function SavedLapsSection({
  laps: lapsProp,
  compareMode,
  selectedLaps,
  onCompareToggle,
  onSelectLap,
}: {
  laps: IdealLap[];
  compareMode: boolean;
  selectedLaps: string[];
  onCompareToggle: () => void;
  onSelectLap: (id: string) => void;
}) {
  // Defensive guard: the API could return a non-array shape (e.g. null or an
  // object); calling .map() on a non-array would crash. Normalise here so the
  // component is crash-safe regardless of what the parent passes.
  const laps: IdealLap[] = Array.isArray(lapsProp) ? lapsProp : [];

  const confirmDelete = (lap: IdealLap) => {
    Alert.alert(
      `Elimina ${lap.lapName ?? `Giro ${lap.lapNumber}`}`,
      "Vuoi eliminare questo giro ideale salvato?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("DELETE", `/api/telemetry/ideal-laps/${encodeURIComponent(lap.sessionId)}`);
              queryClient.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
            } catch {
              Alert.alert("Errore", "Impossibile eliminare il giro.");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.savedLapsSection}>
      <View style={styles.savedLapsHeader}>
        <Text style={styles.savedLapsTitle}>Giri Salvati ({laps.length})</Text>
        <TouchableOpacity
          style={[styles.compareModeBtn, compareMode && styles.compareModeBtnActive]}
          onPress={onCompareToggle}
        >
          <Ionicons name="git-compare-outline" size={12} color={compareMode ? "#fff" : Colors.accent} />
          <Text style={[styles.compareModeBtnText, compareMode && styles.compareModeBtnTextActive]}>
            {compareMode ? "Fine" : "Confronta"}
          </Text>
        </TouchableOpacity>
      </View>

      {compareMode && selectedLaps.length === 2 && <ComparePanel laps={laps} selectedLaps={selectedLaps} />}
      {compareMode && selectedLaps.length < 2 && (
        <Text style={styles.compareHint}>
          {selectedLaps.length === 0 ? "Seleziona 2 giri per confrontarli" : "Seleziona un altro giro"}
        </Text>
      )}

      {laps.map((lap) => {
        const isSelected = selectedLaps.includes(lap.sessionId);
        const date = new Date(lap.startedAt);
        const dateStr = date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
        const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        return (
          <TouchableOpacity
            key={lap.sessionId}
            style={[styles.savedLapCard, isSelected && styles.savedLapCardSelected]}
            activeOpacity={compareMode ? 0.7 : 1}
            onPress={compareMode ? () => onSelectLap(lap.sessionId) : undefined}
          >
            <View style={styles.savedLapCardLeft}>
              {compareMode && (
                <View style={[styles.lapCheckbox, isSelected && styles.lapCheckboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                </View>
              )}
              <View>
                <Text style={styles.savedLapNum} numberOfLines={1}>
                  {lap.lapName ?? `Giro ${lap.lapNumber}`}
                </Text>
                <Text style={styles.savedLapDate}>{dateStr} {timeStr}</Text>
              </View>
            </View>
            <View style={styles.savedLapStats}>
              <View style={styles.savedLapStatItem}>
                <Ionicons name="speedometer-outline" size={11} color={Colors.accent} />
                <Text style={styles.savedLapStatVal}>{lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh}` : "—"}</Text>
                <Text style={styles.savedLapStatUnit}>km/h</Text>
              </View>
              <View style={styles.savedLapStatItem}>
                <MaterialCommunityIcons name="rotate-3d-variant" size={11} color="#f39c12" />
                <Text style={styles.savedLapStatVal}>{lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}</Text>
              </View>
              <View style={styles.savedLapStatItem}>
                <MaterialCommunityIcons name="gauge" size={11} color="#9b59b6" />
                <Text style={styles.savedLapStatVal}>{lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}</Text>
              </View>
              <Text style={styles.savedLapSamples}>{lap.sampleCount} c.</Text>
              {!compareMode && (
                <TouchableOpacity
                  style={styles.savedLapDeleteBtn}
                  onPress={() => confirmDelete(lap)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID={`delete-lap-${lap.sessionId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Elimina ${lap.lapName ?? `Giro ${lap.lapNumber}`}`}
                >
                  <Ionicons name="trash-outline" size={14} color="#e74c3c" />
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ComparePanel({ laps, selectedLaps }: { laps: IdealLap[]; selectedLaps: string[] }) {
  const lapA = laps.find((l) => l.sessionId === selectedLaps[0]);
  const lapB = laps.find((l) => l.sessionId === selectedLaps[1]);
  if (!lapA || !lapB) return null;

  const better = (a: number | null, b: number | null) => {
    if (a == null && b == null) return null;
    if (a == null) return "b"; if (b == null) return "a";
    return a > b ? "a" : a < b ? "b" : "tie";
  };
  const speedW = better(lapA.maxSpeedKmh, lapB.maxSpeedKmh);
  const leanW = better(lapA.maxLeanDeg, lapB.maxLeanDeg);
  const gW = better(lapA.maxGforce, lapB.maxGforce);

  const Row = ({ label, aVal, bVal, winner }: { label: string; aVal: string; bVal: string; winner: string | null }) => (
    <View style={styles.compareRow}>
      <Text style={[styles.compareCell, winner === "a" && styles.compareCellWinner]}>{aVal}</Text>
      <Text style={styles.compareLabel}>{label}</Text>
      <Text style={[styles.compareCell, styles.compareCellRight, winner === "b" && styles.compareCellWinner]}>{bVal}</Text>
    </View>
  );

  return (
    <View style={styles.comparePanel}>
      <View style={styles.compareHeaderRow}>
        <Text style={styles.compareHeaderCell} numberOfLines={1}>{lapA.lapName ?? `Giro ${lapA.lapNumber}`}</Text>
        <Text style={styles.compareHeaderMid}>VS</Text>
        <Text style={[styles.compareHeaderCell, styles.compareHeaderRight]} numberOfLines={1}>{lapB.lapName ?? `Giro ${lapB.lapNumber}`}</Text>
      </View>
      <Row label="Vel. max" aVal={lapA.maxSpeedKmh != null ? `${lapA.maxSpeedKmh} km/h` : "—"} bVal={lapB.maxSpeedKmh != null ? `${lapB.maxSpeedKmh} km/h` : "—"} winner={speedW} />
      <Row label="Piega max" aVal={lapA.maxLeanDeg != null ? `${lapA.maxLeanDeg}°` : "—"} bVal={lapB.maxLeanDeg != null ? `${lapB.maxLeanDeg}°` : "—"} winner={leanW} />
      <Row label="G-force max" aVal={lapA.maxGforce != null ? `${lapA.maxGforce} g` : "—"} bVal={lapB.maxGforce != null ? `${lapB.maxGforce} g` : "—"} winner={gW} />
      <Row label="Campioni" aVal={String(lapA.sampleCount)} bVal={String(lapB.sampleCount)} winner={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  savedLapsSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, gap: 8 },
  savedLapsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  savedLapsTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  compareModeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent },
  compareModeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  compareModeBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  compareModeBtnTextActive: { color: "#fff" },
  compareHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", paddingVertical: 4 },
  comparePanel: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, gap: 6, borderWidth: 1, borderColor: Colors.accent + "44" },
  compareHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  compareHeaderCell: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.accent },
  compareHeaderMid: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.textSecondary, marginHorizontal: 4 },
  compareHeaderRight: { textAlign: "right" },
  compareRow: { flexDirection: "row", alignItems: "center" },
  compareCell: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.text },
  compareCellRight: { textAlign: "right" },
  compareCellWinner: { color: "#27ae60" },
  compareLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginHorizontal: 6, textAlign: "center", minWidth: 60 },
  savedLapCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  savedLapCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  savedLapCardLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  lapCheckbox: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  lapCheckboxSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  savedLapNum: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  savedLapDate: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 1 },
  savedLapStats: { flexDirection: "row", alignItems: "center", gap: 8 },
  savedLapStatItem: { flexDirection: "row", alignItems: "center", gap: 2 },
  savedLapStatVal: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.text },
  savedLapStatUnit: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  savedLapSamples: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  savedLapDeleteBtn: { padding: 4, marginLeft: 2 },
});
