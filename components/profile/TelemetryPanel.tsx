// LARGE-FILE-LOCKED — limite: 699
// Aggiungi nuove funzionalità in: components/profile/TelemetryPanel.next.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
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
import { CalibrationBanner } from "@/components/CalibrationBanner";

const LAP_TARGETS_KM = [10, 30, 50, 100];

type TelemetryStats = {
  km_collected: number;
  sample_count: number;
  session_count: number;
  sensor_only_count?: number;
  progress_pct: number;
  target_km: number;
  track_km: number;
  ideal_lap_km: number;
};

type Props = {
  telemetryStats: TelemetryStats;
};

export default function TelemetryPanel({ telemetryStats }: Props) {
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [idealLapResetKey, setIdealLapResetKey] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedLaps, setSelectedLaps] = useState<string[]>([]);
  const [alwaysActive, setAlwaysActive] = useState(getTelemetryAlwaysActive());
  const [isCalibrated, setIsCalibrated] = useState<boolean | null>(null);
  const [showCalibWizard, setShowCalibWizard] = useState(false);

  useEffect(() => {
    loadTelemetryAlwaysActive().then(setAlwaysActive).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMountCalibration()
      .then((c) => {
        if (!cancelled) setIsCalibrated(!!c);
      })
      .catch(() => {
        if (!cancelled) setIsCalibrated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showCalibWizard]);

  const toggleAlwaysActive = async (value: boolean) => {
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
              Raccoglie senza interruzioni, ignorando i blocchi.
            </Text>
          </View>
          <Switch
            value={alwaysActive}
            onValueChange={toggleAlwaysActive}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
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
                Alert.alert(
                  "Come raccogliere telemetria",
                  "• Avvia il tracking GPS durante un'uscita in moto reale.\n\n• I km vengono contati solo con movimento reale rilevato dai sensori — non durante soste o tragitti a piedi.\n\n• Il target è 1000 km totali raccolti per sbloccare le funzionalità avanzate di analisi.",
                  [{ text: "Capito", style: "default" }]
                );
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
            {telemetryStats.session_count} {telemetryStats.session_count === 1 ? "sessione" : "sessioni"}
          </Text>
        </View>
        {(telemetryStats.sensor_only_count ?? 0) > 0 && (
          <View style={styles.trackKmRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="warning-outline" size={13} color={Colors.warning} />
              <Text style={[styles.trackKmLabel, { color: Colors.warning }]}>{"Campioni senza GPS"}</Text>
            </View>
            <Text style={[styles.trackKmValue, { color: Colors.warning }]}>{telemetryStats.sensor_only_count}</Text>
          </View>
        )}
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
            {isCalibrated !== null && (
              <CalibrationBanner
                isCalibrated={isCalibrated}
                onCalibrate={() => setShowCalibWizard(true)}
              />
            )}

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
              <View style={styles.savedLapsSection}>
                <View style={styles.savedLapsHeader}>
                  <Text style={styles.savedLapsTitle}>
                    Giri Salvati ({idealLapsData.laps.length})
                  </Text>
                  <TouchableOpacity
                    style={[styles.compareModeBtn, compareMode && styles.compareModeBtnActive]}
                    onPress={() => {
                      setCompareMode((v) => !v);
                      setSelectedLaps([]);
                    }}
                  >
                    <Ionicons
                      name="git-compare-outline"
                      size={12}
                      color={compareMode ? "#fff" : Colors.accent}
                    />
                    <Text style={[styles.compareModeBtnText, compareMode && styles.compareModeBtnTextActive]}>
                      {compareMode ? "Fine" : "Confronta"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {compareMode && selectedLaps.length === 2 && (() => {
                  const lapA = idealLapsData.laps.find((l) => l.sessionId === selectedLaps[0]);
                  const lapB = idealLapsData.laps.find((l) => l.sessionId === selectedLaps[1]);
                  if (!lapA || !lapB) return null;
                  const better = (a: number | null, b: number | null) => {
                    if (a == null && b == null) return null;
                    if (a == null) return "b";
                    if (b == null) return "a";
                    return a > b ? "a" : a < b ? "b" : "tie";
                  };
                  const speedWinner = better(lapA.maxSpeedKmh, lapB.maxSpeedKmh);
                  const leanWinner = better(lapA.maxLeanDeg, lapB.maxLeanDeg);
                  const gWinner = better(lapA.maxGforce, lapB.maxGforce);
                  const statRow = (label: string, aVal: string, bVal: string, winner: string | null) => (
                    <View style={styles.compareRow} key={label}>
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
                      {statRow("Vel. max", lapA.maxSpeedKmh != null ? `${lapA.maxSpeedKmh} km/h` : "—", lapB.maxSpeedKmh != null ? `${lapB.maxSpeedKmh} km/h` : "—", speedWinner)}
                      {statRow("Piega max", lapA.maxLeanDeg != null ? `${lapA.maxLeanDeg}°` : "—", lapB.maxLeanDeg != null ? `${lapB.maxLeanDeg}°` : "—", leanWinner)}
                      {statRow("G-force max", lapA.maxGforce != null ? `${lapA.maxGforce} g` : "—", lapB.maxGforce != null ? `${lapB.maxGforce} g` : "—", gWinner)}
                      {statRow("Campioni", String(lapA.sampleCount), String(lapB.sampleCount), null)}
                    </View>
                  );
                })()}

                {compareMode && selectedLaps.length < 2 && (
                  <Text style={styles.compareHint}>
                    {selectedLaps.length === 0 ? "Seleziona 2 giri per confrontarli" : "Seleziona un altro giro"}
                  </Text>
                )}

                {idealLapsData.laps.map((lap) => {
                  const isSelected = selectedLaps.includes(lap.sessionId);
                  const date = new Date(lap.startedAt);
                  const dateStr = date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
                  const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <TouchableOpacity
                      key={lap.sessionId}
                      style={[styles.savedLapCard, isSelected && styles.savedLapCardSelected]}
                      activeOpacity={compareMode ? 0.7 : 1}
                      onPress={compareMode ? () => {
                        setSelectedLaps((prev) => {
                          if (prev.includes(lap.sessionId)) return prev.filter((id) => id !== lap.sessionId);
                          if (prev.length >= 2) return [prev[1], lap.sessionId];
                          return [...prev, lap.sessionId];
                        });
                      } : undefined}
                      onLongPress={!compareMode ? () => {
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
                      } : undefined}
                    >
                      <View style={styles.savedLapCardLeft}>
                        {compareMode && (
                          <View style={[styles.lapCheckbox, isSelected && styles.lapCheckboxSelected]}>
                            {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                          </View>
                        )}
                        <View>
                          <Text style={styles.savedLapNum} numberOfLines={1}>{lap.lapName ?? `Giro ${lap.lapNumber}`}</Text>
                          <Text style={styles.savedLapDate}>{dateStr} {timeStr}</Text>
                        </View>
                      </View>
                      <View style={styles.savedLapStats}>
                        <View style={styles.savedLapStatItem}>
                          <Ionicons name="speedometer-outline" size={11} color={Colors.accent} />
                          <Text style={styles.savedLapStatVal}>
                            {lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh}` : "—"}
                          </Text>
                          <Text style={styles.savedLapStatUnit}>km/h</Text>
                        </View>
                        <View style={styles.savedLapStatItem}>
                          <MaterialCommunityIcons name="rotate-3d-variant" size={11} color="#f39c12" />
                          <Text style={styles.savedLapStatVal}>
                            {lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}
                          </Text>
                        </View>
                        <View style={styles.savedLapStatItem}>
                          <MaterialCommunityIcons name="gauge" size={11} color="#9b59b6" />
                          <Text style={styles.savedLapStatVal}>
                            {lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}
                          </Text>
                        </View>
                        <Text style={styles.savedLapSamples}>{lap.sampleCount} c.</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
      {showCalibWizard && (
        <MountCalibWizard
          onComplete={() => {
            setIsCalibrated(true);
            setShowCalibWizard(false);
          }}
          onDismiss={() => setShowCalibWizard(false)}
        />
      )}
    </View>
  );
}

import { styles } from "./TelemetryPanel.styles";
