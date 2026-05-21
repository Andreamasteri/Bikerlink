import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const tiltStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  box: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  boxLeft: {
    borderColor: "#F4433666",
    backgroundColor: "#F4433310",
  },
  boxRight: {
    borderColor: "#4CAF5066",
    backgroundColor: "#4CAF5010",
  },
  boxValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  boxValueLeft: {
    color: "#F44336",
  },
  boxValueRight: {
    color: "#4CAF50",
  },
  boxLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  center: {
    width: 40,
    alignItems: "center",
  },
  centerValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
});

interface TiltCardProps {
  isActive: boolean;
  isRunning: boolean;
  tiltDeg: number | null;
}

export function TiltCard({ isActive, isRunning, tiltDeg }: TiltCardProps) {
  if (!isActive) return null;

  const neutral = tiltDeg == null || (tiltDeg >= -1 && tiltDeg <= 1);
  const leanLeft = tiltDeg != null && tiltDeg < -1;
  const leanRight = tiltDeg != null && tiltDeg > 1;

  const leftText = leanLeft ? Math.abs(tiltDeg!).toFixed(1) + "°" : " -- ";
  const rightText = leanRight ? tiltDeg!.toFixed(1) + "°" : " -- ";
  const centerText = neutral ? "0" : " -- ";

  return (
    <View style={tiltStyles.row}>
      <View style={[tiltStyles.box, tiltStyles.boxLeft]}>
        <Text style={[tiltStyles.boxValue, tiltStyles.boxValueLeft]}>
          {isRunning ? leftText : "..."}
        </Text>
        <Text style={tiltStyles.boxLabel}>SX</Text>
      </View>

      <View style={tiltStyles.center}>
        <Text style={tiltStyles.centerValue}>
          {isRunning ? centerText : "..."}
        </Text>
      </View>

      <View style={[tiltStyles.box, tiltStyles.boxRight]}>
        <Text style={[tiltStyles.boxValue, tiltStyles.boxValueRight]}>
          {isRunning ? rightText : "..."}
        </Text>
        <Text style={tiltStyles.boxLabel}>DX</Text>
      </View>
    </View>
  );
}

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
  metricCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  metricCardActive: {
    borderColor: Colors.accent + "66",
    backgroundColor: Colors.accent + "0A",
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  metricTitleRow: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  metricLabelActive: {
    color: Colors.accent,
  },
  metricDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleActive: {
    backgroundColor: Colors.accent,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  liveValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  liveValue: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  liveUnit: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  liveValueNull: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  peakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  peakLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  peakResetBtn: {
    padding: 2,
  },
});

export type ToggleKey = "accelG" | "brakeG" | "lateralG" | "tiltAngle";
export type GKey = "accelG" | "brakeG" | "lateralG";

export interface SensorFiltersProps {
  toggleDefs: { key: ToggleKey; label: string; description: string; unit: string }[];
  active: Record<ToggleKey, boolean>;
  isRunning: boolean;
  peaks: Partial<Record<GKey, number>>;
  computeToggleValue: (key: ToggleKey) => number | null;
  toggleKey: (key: ToggleKey) => void;
  resetPeak: (key: GKey) => void;
}

export function SensorFilters({
  toggleDefs,
  active,
  isRunning,
  peaks,
  computeToggleValue,
  toggleKey,
  resetPeak,
}: SensorFiltersProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Metriche Elaborazione</Text>
      {toggleDefs.map((def) => {
        const isActive = active[def.key];
        const liveVal = isActive && isRunning ? computeToggleValue(def.key) : null;
        const isTilt = def.key === "tiltAngle";

        return (
          <View key={def.key} style={[styles.metricCard, isActive && styles.metricCardActive]}>
            <View style={styles.metricHeader}>
              <View style={styles.metricTitleRow}>
                <Text style={[styles.metricLabel, isActive && styles.metricLabelActive]}>
                  {def.label}
                </Text>
                <Text style={styles.metricDesc}>{def.description}</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, isActive && styles.toggleActive]}
                onPress={() => toggleKey(def.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleKnob, isActive && styles.toggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {isActive && !isTilt && (
              <View style={styles.liveValueRow}>
                {liveVal != null ? (
                  <>
                    <Text style={styles.liveValue}>{liveVal.toFixed(1)}</Text>
                    <Text style={styles.liveUnit}>{def.unit}</Text>
                  </>
                ) : (
                  <Text style={styles.liveValueNull}>
                    {isRunning ? " -- " : "in attesa..."}
                  </Text>
                )}
              </View>
            )}

            {isActive && !isTilt && (
              <View style={styles.peakRow}>
                <Text style={styles.peakLabel}>
                  Picco:{" "}
                  {peaks[def.key as GKey] != null
                    ? peaks[def.key as GKey]!.toFixed(1) + " " + def.unit
                    : "—"}
                </Text>
                {peaks[def.key as GKey] != null && (
                  <TouchableOpacity
                    style={styles.peakResetBtn}
                    onPress={() => resetPeak(def.key as GKey)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isTilt && (
              <TiltCard isActive={isActive} isRunning={isRunning} tiltDeg={liveVal} />
            )}
          </View>
        );
      })}
    </View>
  );
}
