import React, { Component, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Subscription } from "expo-sensors";
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  MagnetometerUncalibrated,
  Barometer,
  DeviceMotion,
  Pedometer,
  LightSensor,
} from "expo-sensors";
import Colors from "@/constants/colors";

type LogType = "success" | "error" | "warning";

type LogEntry = {
  id: string;
  sensor: string;
  type: LogType;
  message: string;
  timestamp: string;
};

type SensorDef = {
  name: string;
  key: string;
  platformOnly?: "ios" | "android";
};

const SENSORS: SensorDef[] = [
  { name: "Accelerometer", key: "accelerometer" },
  { name: "Gyroscope", key: "gyroscope" },
  { name: "Magnetometer", key: "magnetometer" },
  { name: "MagnetometerUncalibrated", key: "magnetometerUncalibrated", platformOnly: "android" },
  { name: "Barometer", key: "barometer" },
  { name: "DeviceMotion", key: "deviceMotion" },
  { name: "Pedometer", key: "pedometer" },
  { name: "LightSensor", key: "lightSensor", platformOnly: "android" },
];

function xyzFormat(d: { x: number; y: number; z: number }): string {
  return `x: ${d.x.toFixed(3)}, y: ${d.y.toFixed(3)}, z: ${d.z.toFixed(3)}`;
}

function checkSensorAvailable(key: string): Promise<boolean> {
  switch (key) {
    case "accelerometer": return Accelerometer.isAvailableAsync();
    case "gyroscope": return Gyroscope.isAvailableAsync();
    case "magnetometer": return Magnetometer.isAvailableAsync();
    case "magnetometerUncalibrated": return MagnetometerUncalibrated.isAvailableAsync();
    case "barometer": return Barometer.isAvailableAsync();
    case "deviceMotion": return DeviceMotion.isAvailableAsync();
    case "pedometer": return Pedometer.isAvailableAsync();
    case "lightSensor": return LightSensor.isAvailableAsync();
    default: return Promise.resolve(false);
  }
}

function startSensorSubscription(
  key: string,
  onData: (formatted: string) => void,
): Subscription | null {
  switch (key) {
    case "accelerometer":
      Accelerometer.setUpdateInterval(500);
      return Accelerometer.addListener((d) => onData(xyzFormat(d)));
    case "gyroscope":
      Gyroscope.setUpdateInterval(500);
      return Gyroscope.addListener((d) => onData(xyzFormat(d)));
    case "magnetometer":
      Magnetometer.setUpdateInterval(500);
      return Magnetometer.addListener((d) => onData(xyzFormat(d)));
    case "magnetometerUncalibrated":
      MagnetometerUncalibrated.setUpdateInterval(500);
      return MagnetometerUncalibrated.addListener((d) =>
        onData(`x: ${d.x.toFixed(3)}, y: ${d.y.toFixed(3)}, z: ${d.z.toFixed(3)}, bx: ${d.biasX?.toFixed(3) ?? "—"}, by: ${d.biasY?.toFixed(3) ?? "—"}, bz: ${d.biasZ?.toFixed(3) ?? "—"}`)
      );
    case "barometer":
      Barometer.setUpdateInterval(500);
      return Barometer.addListener((d) =>
        onData(`pressure: ${d.pressure?.toFixed(2) ?? "—"} hPa${d.relativeAltitude != null ? `, alt: ${d.relativeAltitude.toFixed(1)} m` : ""}`)
      );
    case "deviceMotion":
      DeviceMotion.setUpdateInterval(500);
      return DeviceMotion.addListener((d) => {
        const a = d.acceleration;
        if (a) {
          onData(`accel: { x: ${(a.x ?? 0).toFixed(3)}, y: ${(a.y ?? 0).toFixed(3)}, z: ${(a.z ?? 0).toFixed(3)} }`);
        } else {
          onData("accel: (nessun dato)");
        }
      });
    case "pedometer":
      return Pedometer.watchStepCount((d) => onData(`steps: ${d.steps}`));
    case "lightSensor":
      LightSensor.setUpdateInterval(500);
      return LightSensor.addListener((d) => onData(`illuminance: ${d.illuminance.toFixed(1)} lux`));
    default:
      return null;
  }
}

function nowHMS(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type SensorBoundaryProps = {
  children: React.ReactNode;
  sensor: string;
  onCrash: (sensor: string, message: string) => void;
};
type SensorBoundaryState = { crashed: boolean; errorMessage: string };

class SensorErrorBoundary extends Component<SensorBoundaryProps, SensorBoundaryState> {
  state: SensorBoundaryState = { crashed: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): SensorBoundaryState {
    return { crashed: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    this.props.onCrash(this.props.sensor, error.message);
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={boundaryStyles.container}>
          <Text style={boundaryStyles.icon}>💥</Text>
          <Text style={boundaryStyles.errorText}>Crash catturato dall'ErrorBoundary</Text>
          <Text style={boundaryStyles.errorMsg}>{this.state.errorMessage}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const boundaryStyles = StyleSheet.create({
  container: { padding: 12, alignItems: "center" },
  icon: { fontSize: 22 },
  errorText: { color: Colors.error, fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 6 },
  errorMsg: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, textAlign: "center" },
});

type AddLogFn = (sensor: string, type: LogType, message: string) => void;

type SensorPanelInnerProps = {
  def: SensorDef;
  isOpen: boolean;
  addLog: AddLogFn;
};

function SensorPanelInner({ def, isOpen, addLog }: SensorPanelInnerProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [liveData, setLiveData] = useState<string | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const firstDataRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasListeningRef = useRef(false);

  const stopSub = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (def.platformOnly && Platform.OS !== def.platformOnly) {
      const label = def.platformOnly === "android" ? "Android" : "iOS";
      addLog(def.name, "error", `non disponibile — solo ${label}`);
      setAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ok = await checkSensorAvailable(def.key);
        if (cancelled) return;
        setAvailable(ok);
        if (ok) {
          addLog(def.name, "success", `disponibile su questo dispositivo`);
        } else {
          addLog(def.name, "error", `non disponibile su questo dispositivo`);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        addLog(def.name, "error", `errore verifica disponibilità: ${msg}`);
        setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      stopSub();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (wasListeningRef.current) {
        stopSub();
        addLog(def.name, "success", `subscription fermata correttamente`);
        wasListeningRef.current = false;
        setLiveData(null);
      }
      return;
    }

    if (available !== true) return;

    firstDataRef.current = false;

    try {
      subscriptionRef.current = startSensorSubscription(def.key, (formatted) => {
        setLiveData(formatted);
        if (!firstDataRef.current) {
          firstDataRef.current = true;
          addLog(def.name, "success", `primo dato ricevuto: { ${formatted} }`);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }
      });

      if (!subscriptionRef.current) {
        addLog(def.name, "error", `sensore non riconosciuto`);
        return;
      }

      wasListeningRef.current = true;
      addLog(def.name, "success", `subscription avviata con successo`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(def.name, "error", `errore avvio subscription: ${msg}`);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      if (!firstDataRef.current) {
        addLog(def.name, "warning", `timeout: nessun dato ricevuto entro 3 secondi`);
      }
    }, 3000);

    return () => {
      stopSub();
    };
  }, [isOpen, available]);

  const badgeColor = available === null ? Colors.textSecondary : available ? Colors.success : Colors.error;
  const badgeLabel = available === null ? "verifica..." : available ? "Disponibile" : "Non disponibile";

  return (
    <View style={sensorStyles.body}>
      <View style={sensorStyles.badgeRow}>
        <View style={[sensorStyles.badge, { backgroundColor: badgeColor + "22" }]}>
          <View style={[sensorStyles.dot, { backgroundColor: badgeColor }]} />
          <Text style={[sensorStyles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
        {def.platformOnly && (
          <View style={[sensorStyles.badge, { backgroundColor: Colors.warning + "22" }]}>
            <Text style={[sensorStyles.badgeText, { color: Colors.warning }]}>
              {def.platformOnly === "android" ? "Android only" : "iOS only"}
            </Text>
          </View>
        )}
      </View>
      {liveData !== null && (
        <View style={sensorStyles.dataBox}>
          <Text style={sensorStyles.dataLabel}>Dati live</Text>
          <Text style={sensorStyles.dataValue}>{liveData}</Text>
        </View>
      )}
    </View>
  );
}

type SensorPanelProps = {
  def: SensorDef;
  isOpen: boolean;
  onPress: () => void;
  addLog: AddLogFn;
};

function SensorPanel({ def, isOpen, onPress, addLog }: SensorPanelProps) {
  const handleCrash = useCallback((sensor: string, message: string) => {
    addLog(sensor, "error", `crash catturato dall'ErrorBoundary: ${message}`);
  }, [addLog]);

  return (
    <View style={sensorStyles.card}>
      <TouchableOpacity style={sensorStyles.header} onPress={onPress} activeOpacity={0.7}>
        <View style={sensorStyles.headerLeft}>
          <Ionicons
            name="hardware-chip-outline"
            size={22}
            color={isOpen ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[sensorStyles.title, isOpen && { color: Colors.accent }]}>{def.name}</Text>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={20}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      <SensorErrorBoundary sensor={def.name} onCrash={handleCrash}>
        <View style={isOpen ? undefined : sensorStyles.hidden}>
          <SensorPanelInner def={def} isOpen={isOpen} addLog={addLog} />
        </View>
      </SensorErrorBoundary>
    </View>
  );
}

const sensorStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  hidden: {
    height: 0,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  dataBox: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dataLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dataValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 18,
  },
});

const LOG_COLORS: Record<LogType, string> = {
  success: Colors.success,
  error: Colors.error,
  warning: Colors.warning,
};
const LOG_ICONS: Record<LogType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
};

type DiagnosticsLogProps = {
  logs: LogEntry[];
  onClear: () => void;
};

function DiagnosticsLog({ logs, onClear }: DiagnosticsLogProps) {
  const handleLongPress = useCallback((entry: LogEntry) => {
    const text = `[${entry.timestamp}] [${entry.sensor}] ${LOG_ICONS[entry.type]} ${entry.message}`;
    Clipboard.setStringAsync(text).catch(() => {});
  }, []);

  return (
    <View style={logStyles.container}>
      <View style={logStyles.header}>
        <Text style={logStyles.title}>Log Diagnostica</Text>
        <TouchableOpacity onPress={onClear} style={logStyles.clearBtn}>
          <Ionicons name="trash-outline" size={16} color={Colors.textSecondary} />
          <Text style={logStyles.clearText}>Svuota</Text>
        </TouchableOpacity>
      </View>
      {logs.length === 0 ? (
        <Text style={logStyles.empty}>Nessun evento registrato</Text>
      ) : (
        logs.map((entry) => (
          <Pressable
            key={entry.id}
            style={logStyles.entry}
            onLongPress={() => handleLongPress(entry)}
            delayLongPress={400}
          >
            <Text style={logStyles.entryTime}>{entry.timestamp}</Text>
            <Text style={logStyles.entryIcon}>{LOG_ICONS[entry.type]}</Text>
            <View style={logStyles.entryBody}>
              <Text style={[logStyles.entrySensor, { color: LOG_COLORS[entry.type] }]}>
                [{entry.sensor}]
              </Text>
              <Text style={logStyles.entryMsg}>{entry.message}</Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const logStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  empty: {
    padding: 16,
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  entry: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "55",
  },
  entryTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    minWidth: 52,
    paddingTop: 2,
  },
  entryIcon: {
    fontSize: 13,
    paddingTop: 1,
  },
  entryBody: {
    flex: 1,
    gap: 2,
  },
  entrySensor: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  entryMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 16,
  },
});

export default function AdminSensors() {
  const insets = useSafeAreaInsets();
  const [openSensor, setOpenSensor] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logCountRef = useRef(0);

  const addLog = useCallback((sensor: string, type: LogType, message: string) => {
    logCountRef.current += 1;
    const entry: LogEntry = {
      id: `${Date.now()}-${logCountRef.current}`,
      sensor,
      type,
      message,
      timestamp: nowHMS(),
    };
    setLogs((prev) => [entry, ...prev]);
  }, []);

  const handleSensorPress = useCallback((key: string) => {
    setOpenSensor((prev) => (prev === key ? null : key));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={[
        screenStyles.content,
        { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      <Text style={screenStyles.subtitle}>
        Diagnostica sensori del dispositivo — tocca una card per avviare il listener
      </Text>

      {SENSORS.map((def) => (
        <SensorPanel
          key={def.key}
          def={def}
          isOpen={openSensor === def.key}
          onPress={() => handleSensorPress(def.key)}
          addLog={addLog}
        />
      ))}

      <DiagnosticsLog logs={logs} onClear={clearLogs} />

      <Text style={screenStyles.hint}>Tieni premuto su una voce di log per copiarla negli appunti</Text>
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 0,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
});
