import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { DeviceMotion } from "expo-sensors";
import type { DeviceMotionMeasurement } from "expo-sensors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Subscription = ReturnType<typeof DeviceMotion.addListener>;

type ToggleKey = "accelG" | "brakeG" | "lateralG" | "tiltAngle";

const TOGGLE_DEFS: { key: ToggleKey; label: string; description: string; unit: string }[] = [
  {
    key: "accelG",
    label: "Accelerazione G",
    description: "acceleration.y quando positivo (accelerazione in avanti)",
    unit: "G",
  },
  {
    key: "brakeG",
    label: "Frenata G",
    description: "acceleration.y quando negativo (mostrato come positivo)",
    unit: "G",
  },
  {
    key: "lateralG",
    label: "G Laterale",
    description: "acceleration.x (forza in curva)",
    unit: "G",
  },
  {
    key: "tiltAngle",
    label: "Angolo Inclinazione",
    description: "rotation.gamma in gradi",
    unit: "°",
  },
];

type RawValues = {
  ax: number; ay: number; az: number;
  igx: number; igy: number; igz: number;
  rAlpha: number; rBeta: number; rGamma: number;
  orientation: number;
};

function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

function computeToggleValue(key: ToggleKey, raw: RawValues): number | null {
  switch (key) {
    case "accelG":
      return raw.ay > 0 ? raw.ay : null;
    case "brakeG":
      return raw.ay < 0 ? Math.abs(raw.ay) : null;
    case "lateralG":
      return raw.ax;
    case "tiltAngle": {
      const deg = (raw.rGamma * 180) / Math.PI;
      return deg;
    }
  }
}

function TiltCard({ isActive, isRunning, tiltDeg }: {
  isActive: boolean;
  isRunning: boolean;
  tiltDeg: number | null;
}) {
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

export default function SensorsFinal() {
  const insets = useSafeAreaInsets();

  const [raw, setRaw] = useState<RawValues>({
    ax: 0, ay: 0, az: 0,
    igx: 0, igy: 0, igz: 0,
    rAlpha: 0, rBeta: 0, rGamma: 0,
    orientation: 0,
  });
  const [active, setActive] = useState<Record<ToggleKey, boolean>>({
    accelG: false,
    brakeG: false,
    lateralG: false,
    tiltAngle: false,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const subRef = useRef<Subscription | null>(null);

  const anyActive = Object.values(active).some(Boolean);

  const startListener = useCallback(() => {
    if (subRef.current) return;
    DeviceMotion.setUpdateInterval(100);
    subRef.current = DeviceMotion.addListener((data: DeviceMotionMeasurement) => {
      setRaw({
        ax: data.acceleration?.x ?? 0,
        ay: data.acceleration?.y ?? 0,
        az: data.acceleration?.z ?? 0,
        igx: data.accelerationIncludingGravity?.x ?? 0,
        igy: data.accelerationIncludingGravity?.y ?? 0,
        igz: data.accelerationIncludingGravity?.z ?? 0,
        rAlpha: data.rotation?.alpha ?? 0,
        rBeta: data.rotation?.beta ?? 0,
        rGamma: data.rotation?.gamma ?? 0,
        orientation: data.orientation ?? 0,
      });
    });
    setIsRunning(true);
  }, []);

  const stopListener = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setIsRunning(false);
  }, []);

  useEffect(() => {
    DeviceMotion.isAvailableAsync().then((v) => setAvailable(v)).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (anyActive && available) {
      startListener();
    } else if (!anyActive) {
      stopListener();
    }
  }, [anyActive, available, startListener, stopListener]);

  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
    };
  }, []);

  function toggleKey(key: ToggleKey) {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const rawRows: { label: string; value: string }[] = [
    { label: "acceleration.x", value: fmt(raw.ax) },
    { label: "acceleration.y", value: fmt(raw.ay) },
    { label: "acceleration.z", value: fmt(raw.az) },
    { label: "accelerationIncludingGravity.x", value: fmt(raw.igx) },
    { label: "accelerationIncludingGravity.y", value: fmt(raw.igy) },
    { label: "accelerationIncludingGravity.z", value: fmt(raw.igz) },
    { label: "rotation.alpha", value: fmt(raw.rAlpha) },
    { label: "rotation.beta", value: fmt(raw.rBeta) },
    { label: "rotation.gamma", value: fmt(raw.rGamma) },
    { label: "orientation", value: String(raw.orientation) },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 24,
          paddingTop: Platform.OS === "web" ? 67 : 16,
        },
      ]}
    >
      {available === false && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={16} color="#FF9800" />
          <Text style={styles.warningText}>
            DeviceMotion non disponibile su questo dispositivo o piattaforma
          </Text>
        </View>
      )}

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: isRunning ? "#4CAF50" : Colors.textSecondary }]} />
        <Text style={styles.statusText}>
          {isRunning ? "DeviceMotion in ascolto" : "In attesa — attiva almeno una casella"}
        </Text>
      </View>

      {/* Raw values panel */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Valori Grezzi DeviceMotion</Text>
        {!isRunning && (
          <Text style={styles.rawHint}>
            Attiva almeno una metrica qui sotto per avviare il flusso dati
          </Text>
        )}
        <View style={styles.rawPanel}>
          {rawRows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.rawRow, i < rawRows.length - 1 && styles.rawRowBorder]}
            >
              <Text style={styles.rawLabel}>{row.label}</Text>
              <Text style={styles.rawValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Toggle metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Metriche Elaborazione</Text>
        {TOGGLE_DEFS.map((def) => {
          const isActive = active[def.key];
          const liveVal = isActive && isRunning ? computeToggleValue(def.key, raw) : null;
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

              {isTilt && (
                <TiltCard isActive={isActive} isRunning={isRunning} tiltDeg={liveVal} />
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF9800" + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FF9800" + "55",
    padding: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#FF9800",
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
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
  rawHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  rawPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  rawRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rawRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rawLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  rawValue: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    minWidth: 90,
    textAlign: "right",
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
});

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
