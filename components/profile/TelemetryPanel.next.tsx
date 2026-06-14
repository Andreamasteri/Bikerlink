import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  Animated,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import IdealLapSlot from "./IdealLapSlot";
import type { IdealLap } from "./types";
import {
  getTelemetryAlwaysActive,
  loadTelemetryAlwaysActive,
  setTelemetryAlwaysActive,
} from "@/lib/telemetry-prefs";
import {
  MountCalibWizard,
  loadMountCalibration,
} from "@/components/MountCalibWizard";
import {
  loadRelaxedMountMode,
  setRelaxedMountMode,
} from "@/hooks/useMotorcycleDetector";
import { TelemetryInfoModal } from "./TelemetryInfoModal";
import { useAutoTelemetry } from "@/lib/auto-telemetry-context";

const LAP_TARGETS_KM = [10, 30, 50, 100];

// ── GateDots ─────────────────────────────────────────────────────────────────
// 3 piccoli pallini discreti che mostrano lo stato dei 3 gate dell'auto-telemetria.
// Visibili sempre sotto il contatore km (non solo quando espanso).

function GateDots({
  toggle,
  calibrated,
  riding,
  onCalibratePress,
}: {
  toggle: boolean;
  calibrated: boolean;
  riding: boolean;
  onCalibratePress: () => void;
}) {
  const dot1Color = toggle ? "#27ae60" : Colors.textSecondary;
  const dot2Color = calibrated ? "#27ae60" : "#e67e22";
  const dot3Color = riding ? "#27ae60" : "#e74c3c";

  const handleDotPress = (gate: 1 | 2 | 3) => {
    if (gate === 1 && toggle) return;
    if (gate === 2 && calibrated) return;
    if (gate === 3 && riding) return;
    if (gate === 1) {
      Alert.alert("Toggle spento", "Attiva 'Telemetria sempre attiva' per abilitare la raccolta automatica.");
    } else if (gate === 2) {
      Alert.alert(
        "Non calibrato",
        "Esegui la calibrazione supporto per permettere al rilevamento automatico di riconoscere che il telefono è montato sulla moto.",
        [
          { text: "Annulla", style: "cancel" },
          { text: "Calibra ora", onPress: onCalibratePress },
        ]
      );
    } else {
      Alert.alert(
        "Moto non rilevata",
        "Monta il telefono e supera i 20 km/h per almeno 3 secondi, oppure attiva la modalità rilassata ('Non uso un supporto fisso') per ignorare il check orientamento."
      );
    }
  };

  return (
    <View style={gateStyles.row}>
      <TouchableOpacity onPress={() => handleDotPress(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[gateStyles.dot, { backgroundColor: dot1Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(2)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[gateStyles.dot, { backgroundColor: dot2Color }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDotPress(3)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={[gateStyles.dot, { backgroundColor: dot3Color }]} />
      </TouchableOpacity>
    </View>
  );
}

const gateStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

type TelemetryStats = {
  km_collected: number;
  sample_count: number;
  session_count: number;
  progress_pct: number;
  target_km: number;
  track_km: number;
  ideal_lap_km: number;
};

type Props = { telemetryStats: TelemetryStats };

function AutoRidingIndicator() {
  const pulse = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <View style={autoStyles.row}>
      <Animated.View style={[autoStyles.dot, { opacity: pulse }]} />
      <Text style={autoStyles.label}>Telemetria in corso</Text>
    </View>
  );
}

const autoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.accent + "1a",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
});

export default function TelemetryPanel({ telemetryStats }: Props) {
  const { isAutoRiding, isCalibrated: ctxCalibrated, alwaysActive: ctxAlwaysActive } = useAutoTelemetry();

  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [idealLapResetKey, setIdealLapResetKey] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedLaps, setSelectedLaps] = useState<string[]>([]);
  const [alwaysActive, setAlwaysActive] = useState(getTelemetryAlwaysActive());
  const [isCalibrated, setIsCalibrated] = useState<boolean | null>(null);
  const [showCalibWizard, setShowCalibWizard] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [relaxedMode, setRelaxedMode] = useState(false);

  useEffect(() => {
    loadTelemetryAlwaysActive().then(setAlwaysActive).catch(() => {});
    loadRelaxedMountMode().then(setRelaxedMode).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMountCalibration()
      .then((c) => { if (!cancelled) setIsCalibrated(!!c); })
      .catch(() => { if (!cancelled) setIsCalibrated(false); });
    return () => { cancelled = true; };
  }, [showCalibWizard]);

  const toggleAlwaysActive = async (value: boolean) => {
    if (value && isCalibrated === false) {
      Alert.alert(
        "Calibrazione richiesta",
        "Per attivare la raccolta automatica devi prima calibrare il supporto del telefono sulla moto.",
        [
          { text: "Annulla", style: "cancel" },
          { text: "Calibra ora", onPress: () => setShowCalibWizard(true) },
        ]
      );
      return;
    }
    setAlwaysActive(value);
    await setTelemetryAlwaysActive(value);
  };

  const { data: idealLapsData } = useQuery<{ laps: IdealLap[] }>({
    queryKey: ["/api/telemetry/ideal-laps"],
    enabled: telemetryExpanded,
    staleTime: 30_000,
  });

  return (
    <View style={styles.section}>
      <View style={styles.telemetryCard}>
        <View style={[styles.settingRow, styles.settingRowTop]}>
          <View style={styles.settingTextCol}>
            <Text style={styles.settingTitle}>Telemetria sempre attiva</Text>
            <Text style={styles.settingSubtitle}>
              {alwaysActive && isCalibrated
                ? "Raccolta automatica attiva — rilevamento in moto ON"
                : alwaysActive && isCalibrated === false
                ? "Calibra il supporto per attivare il rilevamento automatico"
                : "Raccoglie solo durante il tracking manuale."}
            </Text>
          </View>
          <Switch
            value={alwaysActive}
            onValueChange={toggleAlwaysActive}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {isAutoRiding && <AutoRidingIndicator />}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setTelemetryExpanded((v) => !v)}
          style={styles.telemetryHeader}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="speedometer-outline" size={16} color={Colors.accent} />
            <Text style={styles.telemetryTitle}>Telemetria raccolta</Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e.stopPropagation();
                setShowInfoModal(true);
              }}
            >
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.telemetryPct}>{telemetryStats.progress_pct}%</Text>
            <Ionicons
              name={telemetryExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={Colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.telemetryBarBg}>
          <View
            style={[
              styles.telemetryBarFill,
              { width: (`${Math.max(0, Math.min(100, telemetryStats.progress_pct))}%`) as `${number}%` },
            ]}
          />
        </View>
        <View style={styles.telemetryFooter}>
          <Text style={styles.telemetryKm}>
            {telemetryStats.km_collected.toFixed(1)} km
            <Text style={styles.telemetryTarget}> / {telemetryStats.target_km} km</Text>
          </Text>
          <Text style={styles.telemetrySessions}>
            {telemetryStats.session_count}{" "}
            {telemetryStats.session_count === 1 ? "sessione" : "sessioni"}
          </Text>
        </View>

        <GateDots
          toggle={ctxAlwaysActive}
          calibrated={ctxCalibrated}
          riding={isAutoRiding}
          onCalibratePress={() => setShowCalibWizard(true)}
        />

        {telemetryStats.track_km > 0 && (
          <View style={styles.trackKmRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="flag-outline" size={13} color="#e67e22" />
              <Text style={styles.trackKmLabel}>Km in pista</Text>
            </View>
            <Text style={styles.trackKmValue}>{telemetryStats.track_km.toFixed(1)} km</Text>
          </View>
        )}

        {telemetryStats.ideal_lap_km > 0 && (
          <View style={styles.trackKmRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="navigate-outline" size={13} color="#8e44ad" />
              <Text style={[styles.trackKmLabel, { color: "#8e44ad" }]}>Km Giro Ideale</Text>
            </View>
            <Text style={[styles.trackKmValue, { color: "#8e44ad" }]}>{telemetryStats.ideal_lap_km.toFixed(1)} km</Text>
          </View>
        )}

        {telemetryExpanded && (
          <View style={styles.telemetryExpanded}>
            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => setShowCalibWizard(true)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingTitle}>Calibrazione supporto</Text>
                <View style={styles.calibBadgeRow}>
                  <Ionicons
                    name={isCalibrated ? "checkmark-circle" : "alert-circle-outline"}
                    size={13}
                    color={isCalibrated ? "#27ae60" : "#e67e22"}
                  />
                  <Text style={[styles.calibBadgeText, { color: isCalibrated ? "#27ae60" : "#e67e22" }]}>
                    {isCalibrated === null ? "Verifica…" : isCalibrated ? "Calibrato" : "Non calibrato"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingTitle}>Non uso un supporto fisso</Text>
                <Text style={styles.settingSubtitle}>
                  Attiva la telemetria basandosi solo sulla velocità GPS (≥ 20 km/h per 3s)
                </Text>
              </View>
              <Switch
                value={relaxedMode}
                onValueChange={async (v) => {
                  setRelaxedMode(v);
                  await setRelaxedMountMode(v);
                }}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.telemetryExpandedHeader}>
              <Text style={styles.telemetryExpandedTitle}>Giri Ideali</Text>
              <TouchableOpacity
                style={styles.telemetryResetBtn}
                onPress={() => {
                  Alert.alert(
                    "Azzera telemetria",
                    "Sei sicuro di voler cancellare tutti i km raccolti verso il target 1000 km? I Giri Ideali salvati non verranno eliminati.",
                    [
                      { text: "Annulla", style: "cancel" },
                      {
                        text: "Azzera",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await apiRequest("DELETE", "/api/telemetry/reset");
                            queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
                            setIdealLapResetKey((k) => k + 1);
                          } catch {
                            Alert.alert("Errore", "Impossibile azzerare la telemetria.");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                <Text style={styles.telemetryResetBtnText}>Reset km</Text>
              </TouchableOpacity>
            </View>

            {[0, 1, 2, 3].map((i) => (
              <IdealLapSlot
                key={`${idealLapResetKey}-${i}`}
                index={i}
                targetKm={LAP_TARGETS_KM[i]}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
                }}
              />
            ))}

            {idealLapsData && idealLapsData.laps.length > 0 && (
              <SavedLapsSection
                laps={idealLapsData.laps}
                compareMode={compareMode}
                selectedLaps={selectedLaps}
                onCompareToggle={() => { setCompareMode((v) => !v); setSelectedLaps([]); }}
                onSelectLap={(id) => {
                  setSelectedLaps((prev) => {
                    if (prev.includes(id)) return prev.filter((x) => x !== id);
                    if (prev.length >= 2) return [prev[1], id];
                    return [...prev, id];
                  });
                }}
              />
            )}
          </View>
        )}
      </View>

      {showCalibWizard && (
        <MountCalibWizard
          onComplete={() => { setIsCalibrated(true); setShowCalibWizard(false); }}
          onDismiss={() => setShowCalibWizard(false)}
        />
      )}
      <TelemetryInfoModal visible={showInfoModal} onClose={() => setShowInfoModal(false)} />
    </View>
  );
}

function SavedLapsSection({
  laps,
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
            onLongPress={!compareMode ? () => {
              Alert.alert(
                `Elimina ${lap.lapName ?? `Giro ${lap.lapNumber}`}`,
                "Vuoi eliminare questo giro ideale salvato?",
                [
                  { text: "Annulla", style: "cancel" },
                  {
                    text: "Elimina", style: "destructive",
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
            } : undefined}
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
  section: { paddingHorizontal: 16, marginTop: 4 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  settingRowTop: { borderTopWidth: 0, paddingTop: 0, marginBottom: 4 },
  settingTextCol: { flex: 1, gap: 2 },
  settingTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  settingSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  calibBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  calibBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  telemetryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.accent + "33" },
  telemetryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  telemetryTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  telemetryPct: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accent },
  telemetryBarBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  telemetryBarFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  telemetryFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  telemetryKm: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.text },
  telemetryTarget: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  telemetrySessions: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  trackKmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  trackKmLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#e67e22" },
  trackKmValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#e67e22" },
  telemetryExpanded: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, gap: 10 },
  telemetryExpandedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  telemetryExpandedTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  telemetryResetBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: "#e74c3c44", backgroundColor: "#e74c3c11" },
  telemetryResetBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#e74c3c" },
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
});
