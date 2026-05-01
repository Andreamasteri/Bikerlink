import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,

  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceMotion } from "expo-sensors";
import type { DeviceMotionMeasurement } from "expo-sensors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const SESSIONS_STORAGE_KEY = "g_peak_sessions";
const MAX_SESSIONS = 50;

type Subscription = ReturnType<typeof DeviceMotion.addListener>;

type ToggleKey = "accelG" | "brakeG" | "lateralG" | "tiltAngle";
type GKey = "accelG" | "brakeG" | "lateralG";
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

export type GSession = {
  id: string;
  startedAt: string;
  endedAt: string;
  peaks: Partial<Record<GKey, number>>;
};

function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

function computeToggleValue(key: ToggleKey, raw: RawValues): number | null {
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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  try {
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    const totalSec = Math.round(diffMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  } catch {
    return "";
  }
}

const G_KEY_LABELS: Record<GKey, string> = {
  accelG: "Accel",
  brakeG: "Frenata",
  lateralG: "Laterale",
};

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

function SessionCard({ session, onDelete }: { session: GSession; onDelete: () => void }) {
  const hasPeaks = Object.keys(session.peaks).length > 0;
  const duration = formatDuration(session.startedAt, session.endedAt);

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDate}>{formatDateTime(session.startedAt)}</Text>
          {duration ? (
            <Text style={styles.sessionDuration}>{duration}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.sessionDeleteBtn}
        >
          <Ionicons name="trash-outline" size={15} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {hasPeaks ? (
        <View style={styles.sessionPeaks}>
          {(Object.keys(session.peaks) as GKey[]).map((key) => (
            <View key={key} style={styles.sessionPeakChip}>
              <Text style={styles.sessionPeakKey}>{G_KEY_LABELS[key]}</Text>
              <Text style={styles.sessionPeakValue}>
                {session.peaks[key]!.toFixed(2)} G
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sessionNoPeaks}>Nessun picco registrato</Text>
      )}
    </View>
  );
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
        const val = computeToggleValue(key, raw);
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
                      onPress={() =>
                        setPeaks((prev) => {
                          const next = { ...prev };
                          delete next[def.key as GKey];
                          peaksRef.current = next;
                          return next;
                        })
                      }
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

      {/* Session history */}
      <View style={styles.section}>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Sessioni Precedenti</Text>
          {sessions.length > 0 && (
            <TouchableOpacity onPress={clearAllSessions} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearAllText}>Cancella tutto</Text>
            </TouchableOpacity>
          )}
        </View>

        {sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={28} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              Nessuna sessione salvata.{"\n"}Attiva i sensori per registrare i picchi G.
            </Text>
          </View>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={() => deleteSession(session.id)}
            />
          ))
        )}
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
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearAllText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.error,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  sessionMeta: {
    gap: 2,
  },
  sessionDate: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  sessionDuration: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  sessionDeleteBtn: {
    padding: 2,
  },
  sessionPeaks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sessionPeakChip: {
    backgroundColor: Colors.accent + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  sessionPeakKey: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sessionPeakValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sessionNoPeaks: {
    fontSize: 13,
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
