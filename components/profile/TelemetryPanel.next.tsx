import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { GateDots } from "./TelemetryGateDots";
import { AutoRidingIndicator } from "./TelemetryAutoIndicator";
import { SavedLapsSection } from "./TelemetrySavedLaps";
import { useLocalSearchParams } from "expo-router";

const LAP_TARGETS_KM = [10, 30, 50, 100];

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

export default function TelemetryPanel({ telemetryStats }: Props) {
  const { isAutoRiding, isCalibrated: ctxCalibrated, alwaysActive: ctxAlwaysActive } = useAutoTelemetry();
  const { focusTelemetry } = useLocalSearchParams<{ focusTelemetry?: string }>();

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
    if (focusTelemetry === "1") setTelemetryExpanded(true);
  }, [focusTelemetry]);

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
});
