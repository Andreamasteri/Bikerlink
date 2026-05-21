import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceMotion } from "expo-sensors";
import type { DeviceMotionMeasurement } from "expo-sensors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

import { SensorDataCard } from "@/components/admin/sensors/SensorDataCard";
import { SensorFilters, type ToggleKey, type GKey } from "@/components/admin/sensors/SensorFilters";
import { SensorSummary, type GSession } from "@/components/admin/sensors/SensorSummary";

const SESSIONS_STORAGE_KEY = "g_peak_sessions";
const MAX_SESSIONS = 50;

type Subscription = ReturnType<typeof DeviceMotion.addListener>;

const G_KEYS: GKey[] = ["accelG", "brakeG", "lateralG"];

const G_MS2 = 9.81;

const TOGGLE_DEFS: { key: ToggleKey; label: string; description: string; unit: string }[] = [
  {
    key: "accelG",
    label: "Accelerazione G",
    description: "acc.y ÷ 9.81 — positivo (in avanti). Soglia min: 0.05 G",
    unit: "G",
  },
  {
    key: "brakeG",
    label: "Frenata G",
    description: "acc.y ÷ 9.81 — negativo (frenata). Soglia min: 0.05 G",
    unit: "G",
  },
  {
    key: "lateralG",
    label: "G Laterale",
    description: "acc.x ÷ 9.81 — forza in curva. Zona morta: ±0.1 G",
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

function computeToggleValueStatic(key: ToggleKey, raw: RawValues): number | null {
  switch (key) {
    case "accelG": {
      const g = raw.ay / G_MS2;
      return g >= 0.05 ? g : null;
    }
    case "brakeG": {
      const g = raw.ay / G_MS2;
      return g <= -0.05 ? Math.abs(g) : null;
    }
    case "lateralG": {
      const g = raw.ax / G_MS2;
      return Math.abs(g) >= 0.1 ? g : null;
    }
    case "tiltAngle": {
      const deg = (raw.rGamma * 180) / Math.PI;
      return deg;
    }
  }
}

export default function SensorsFinal() {
  const t = useT();
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

  const [peaks, setPeaks] = useState<Partial<Record<GKey, number>>>({});
  const [sessions, setSessions] = useState<GSession[]>([]);

  const subRef = useRef<Subscription | null>(null);
  const peaksRef = useRef<Partial<Record<GKey, number>>>({});
  const sessionsRef = useRef<GSession[]>([]);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const prevAnyActiveRef = useRef<boolean>(false);
  const sessionFinalizedRef = useRef<boolean>(true);
  const sessionHasGActiveRef = useRef<boolean>(false);

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

  const saveSession = useCallback(
    (peaksSnapshot: Partial<Record<GKey, number>>, startedAt: string) => {
      const session: GSession = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        startedAt,
        endedAt: new Date().toISOString(),
        peaks: peaksSnapshot,
      };
      const updated = [session, ...sessionsRef.current].slice(0, MAX_SESSIONS);
      sessionsRef.current = updated;
      AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      setSessions(updated);
    },
    []
  );

  useEffect(() => {
    DeviceMotion.isAvailableAsync().then((v) => setAvailable(v)).catch(() => setAvailable(false));
    AsyncStorage.getItem(SESSIONS_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const raw = JSON.parse(stored);
          if (Array.isArray(raw)) {
            const VALID_G_KEYS = new Set<string>(["accelG", "brakeG", "lateralG"]);
            const valid = raw.filter((s): s is GSession => {
              if (
                s == null ||
                typeof s.id !== "string" ||
                typeof s.startedAt !== "string" ||
                typeof s.endedAt !== "string" ||
                s.peaks == null ||
                typeof s.peaks !== "object" ||
                Array.isArray(s.peaks)
              ) {
                return false;
              }
              const peakEntries = Object.entries(s.peaks as Record<string, unknown>);
              return peakEntries.every(
                ([k, v]) => VALID_G_KEYS.has(k) && typeof v === "number" && Number.isFinite(v) && v >= 0
              );
            });
            sessionsRef.current = valid;
            setSessions(valid);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const wasActive = prevAnyActiveRef.current;
    prevAnyActiveRef.current = anyActive;

    if (anyActive) {
      if (!wasActive) {
        peaksRef.current = {};
        setPeaks({});
        sessionStartRef.current = new Date().toISOString();
        sessionFinalizedRef.current = false;
        sessionHasGActiveRef.current = false;
      }
      if (available) {
        startListener();
      }
    } else {
      if (wasActive && !sessionFinalizedRef.current && sessionHasGActiveRef.current) {
        sessionFinalizedRef.current = true;
        saveSession({ ...peaksRef.current }, sessionStartRef.current);
      } else if (wasActive) {
        sessionFinalizedRef.current = true;
      }
      stopListener();
    }
  }, [anyActive, available, startListener, stopListener, saveSession]);

  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
      if (prevAnyActiveRef.current && !sessionFinalizedRef.current && sessionHasGActiveRef.current) {
        sessionFinalizedRef.current = true;
        saveSession({ ...peaksRef.current }, sessionStartRef.current);
      }
    };
  }, [saveSession]);

  useEffect(() => {
    if (!isRunning) return;
    if (G_KEYS.some((k) => active[k])) {
      sessionHasGActiveRef.current = true;
    }
    setPeaks((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of G_KEYS) {
        if (!active[key]) continue;
        const val = computeToggleValueStatic(key, raw);
        if (val != null) {
          const magnitude = Math.abs(val);
          const current = prev[key] ?? 0;
          if (magnitude > current) {
            next[key] = magnitude;
            changed = true;
          }
        }
      }
      const result = changed ? next : prev;
      peaksRef.current = result;
      return result;
    });
  }, [raw, isRunning, active]);

  function toggleKey(key: ToggleKey) {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function deleteSession(id: string) {
    const updated = sessionsRef.current.filter((s) => s.id !== id);
    sessionsRef.current = updated;
    setSessions(updated);
    AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }

  function clearAllSessions() {
    Alert.alert(
      "Cancella cronologia",
      t("admin.deleteAllSessions"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.deleteAll"),
          style: "destructive",
          onPress: () => {
            sessionsRef.current = [];
            setSessions([]);
            AsyncStorage.removeItem(SESSIONS_STORAGE_KEY).catch(() => {});
          },
        },
      ]
    );
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
          paddingTop: 16,
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
      <SensorDataCard isRunning={isRunning} rawRows={rawRows} />

      {/* Toggle metrics */}
      <SensorFilters
        toggleDefs={TOGGLE_DEFS}
        active={active}
        isRunning={isRunning}
        peaks={peaks}
        computeToggleValue={(key) => computeToggleValueStatic(key, raw)}
        toggleKey={toggleKey}
        resetPeak={(key) => {
          setPeaks((prev) => {
            const next = { ...prev };
            delete next[key];
            peaksRef.current = next;
            return next;
          });
        }}
      />

      {/* Session history */}
      <SensorSummary
        sessions={sessions}
        onClearAll={clearAllSessions}
        onDeleteSession={deleteSession}
      />
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
});
