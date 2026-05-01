import React, {
  Component,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/language-context";
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

export type SensorKey =
  | "accelerometer"
  | "gyroscope"
  | "magnetometer"
  | "magnetometerUncalibrated"
  | "barometer"
  | "deviceMotion"
  | "pedometer"
  | "lightSensor";

export type SensorDefinition = {
  key: SensorKey;
  name: string;
  platform: "android" | "ios" | "cross";
  defaultConfig: string;
};

type LogType = "success" | "error" | "warning" | "info";
type LogEntry = { id: string; type: LogType; message: string; timestamp: string };

const LOG_ICONS: Record<LogType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};
const LOG_COLORS: Record<LogType, string> = {
  success: Colors.success,
  error: Colors.error,
  warning: Colors.warning,
  info: Colors.accent,
};

function nowHMS(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function xyzFormat(d: { x: number; y: number; z: number }): string {
  return `x: ${d.x.toFixed(4)}, y: ${d.y.toFixed(4)}, z: ${d.z.toFixed(4)}`;
}

async function requestSensorPermission(
  key: SensorKey
): Promise<{ granted: boolean; required: boolean; canAskAgain?: boolean }> {
  switch (key) {
    case "pedometer":
      if (Platform.OS === "web") return { granted: true, required: false };
      const { status, canAskAgain } = await Pedometer.requestPermissionsAsync();
      return { granted: status === "granted", required: true, canAskAgain };
    default:
      return { granted: true, required: false };
  }
}

async function checkSensorAvailable(key: SensorKey): Promise<boolean> {
  switch (key) {
    case "accelerometer": return Accelerometer.isAvailableAsync();
    case "gyroscope": return Gyroscope.isAvailableAsync();
    case "magnetometer": return Magnetometer.isAvailableAsync();
    case "magnetometerUncalibrated": return MagnetometerUncalibrated.isAvailableAsync();
    case "barometer": return Barometer.isAvailableAsync();
    case "deviceMotion": return DeviceMotion.isAvailableAsync();
    case "pedometer": return Pedometer.isAvailableAsync();
    case "lightSensor": return LightSensor.isAvailableAsync();
    default: return false;
  }
}

function startSensorSub(
  key: SensorKey,
  cfg: Record<string, number>,
  onData: (s: string) => void
): Subscription | null {
  const interval = cfg.interval ?? 500;
  switch (key) {
    case "accelerometer":
      Accelerometer.setUpdateInterval(interval);
      return Accelerometer.addListener((d) => onData(xyzFormat(d)));
    case "gyroscope":
      Gyroscope.setUpdateInterval(interval);
      return Gyroscope.addListener((d) => onData(xyzFormat(d)));
    case "magnetometer":
      Magnetometer.setUpdateInterval(interval);
      return Magnetometer.addListener((d) => onData(xyzFormat(d)));
    case "magnetometerUncalibrated":
      MagnetometerUncalibrated.setUpdateInterval(interval);
      return MagnetometerUncalibrated.addListener((d) =>
        onData(
          `x:${d.x.toFixed(3)} y:${d.y.toFixed(3)} z:${d.z.toFixed(3)} | bias x:${d.biasX?.toFixed(3) ?? "—"} y:${d.biasY?.toFixed(3) ?? "—"} z:${d.biasZ?.toFixed(3) ?? "—"}`
        )
      );
    case "barometer":
      Barometer.setUpdateInterval(interval);
      return Barometer.addListener((d) =>
        onData(
          `pressure: ${d.pressure?.toFixed(2) ?? "—"} hPa${d.relativeAltitude != null ? ` | alt: ${d.relativeAltitude.toFixed(1)} m` : ""}`
        )
      );
    case "deviceMotion":
      DeviceMotion.setUpdateInterval(interval);
      return DeviceMotion.addListener((d) => {
        const a = d.acceleration;
        onData(
          a
            ? `accel  x:${(a.x ?? 0).toFixed(3)} y:${(a.y ?? 0).toFixed(3)} z:${(a.z ?? 0).toFixed(3)}`
            : "acceleration: (nessun dato)"
        );
      });
    case "pedometer":
      return Pedometer.watchStepCount((d) => onData(`passi: ${d.steps}`));
    case "lightSensor":
      LightSensor.setUpdateInterval(interval);
      return LightSensor.addListener((d) => onData(`illuminance: ${d.illuminance.toFixed(1)} lux`));
    default:
      return null;
  }
}

type BoundaryState = { crashed: boolean; errorMessage: string };
type BoundaryProps = { children: React.ReactNode; onCrash: (msg: string) => void };

class SensorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { crashed: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    this.props.onCrash(error.message);
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={bs.container}>
          <Text style={bs.icon}>💥</Text>
          <Text style={bs.title}>Crash catturato dall'ErrorBoundary</Text>
          <Text style={bs.msg}>{this.state.errorMessage}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const bs = StyleSheet.create({
  container: { padding: 16, alignItems: "center", gap: 8 },
  icon: { fontSize: 28 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.error, textAlign: "center" },
  msg: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
});

function PlatformBadge({ platform }: { platform: "android" | "ios" | "cross" }) {
  const COLOR = platform === "android" ? "#3ddc84" : platform === "ios" ? "#007aff" : Colors.textSecondary;
  const LABEL = platform === "android" ? "Solo Android" : platform === "ios" ? "Solo iOS" : "Android · iOS";
  return (
    <View style={[ss.platformBadge, { backgroundColor: COLOR + "22" }]}>
      <Text style={[ss.platformBadgeText, { color: COLOR }]}>{LABEL}</Text>
    </View>
  );
}

function SensorBody({ def }: { def: SensorDefinition }) {
  const t = useT();
  const [configStr, setConfigStr] = useState(def.defaultConfig);
  const [notes, setNotes] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [liveData, setLiveData] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const subRef = useRef<Subscription | null>(null);
  const notesDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(`sensor_config_${def.key}`)
      .then((v) => { if (v) setConfigStr(v); })
      .catch(() => {});
    AsyncStorage.getItem(`sensor_notes_${def.key}`)
      .then((v) => { if (v) setNotes(v); })
      .catch(() => {});
    return () => {
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [def.key]);

  const addLog = useCallback((type: LogType, message: string) => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      type,
      message,
      timestamp: nowHMS(),
    };
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const handleNotesChange = useCallback(
    (text: string) => {
      setNotes(text);
      if (notesDebounce.current) clearTimeout(notesDebounce.current);
      notesDebounce.current = setTimeout(() => {
        AsyncStorage.setItem(`sensor_notes_${def.key}`, text).catch(() => {});
      }, 500);
    },
    [def.key]
  );

  const handleStart = useCallback(async () => {
    if (isRunning || isStarting) return;
    setIsStarting(true);

    let cfg: Record<string, number> = {};
    try {
      cfg = JSON.parse(configStr);
    } catch {
      addLog("error", "Config JSON non valida — es. {\"interval\": 500}");
      setIsStarting(false);
      return;
    }

    addLog("info", t("admin.sensorCheckAvail"));
    let available = false;
    try {
      available = await checkSensorAvailable(def.key);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog("error", `Errore verifica disponibilità: ${msg}`);
      setIsStarting(false);
      return;
    }

    if (!available) {
      addLog("error", "Sensore non disponibile su questo dispositivo o piattaforma");
      setIsStarting(false);
      return;
    }

    try {
      const perm = await requestSensorPermission(def.key);
      if (perm.required) {
        addLog("info", "Richiesta permesso sensore…");
      }
      if (!perm.granted) {
        const canAsk = perm.canAskAgain !== false;
        const settingsMsg = "Vai in Impostazioni → Privacy → Movimento e fitness e abilita BikerLink.";
        addLog(
          "error",
          def.key === "pedometer"
            ? canAsk
              ? `Permesso Motion Access negato. ${settingsMsg}`
              : `Permesso già negato in precedenza (non ripetibile). ${settingsMsg}`
            : "Permesso negato per questo sensore."
        );
        if (!canAsk && Platform.OS !== "web") {
          addLog("info", "Premi 'Apri Impostazioni' per abilitare il permesso manualmente.");
        }
        setIsStarting(false);
        return;
      }
      if (perm.required) {
        addLog("success", "Permesso concesso");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog("error", `Errore richiesta permesso: ${msg}`);
      setIsStarting(false);
      return;
    }

    try {
      const sub = startSensorSub(def.key, cfg, (formatted) => setLiveData(formatted));
      if (!sub) {
        addLog("error", "Impossibile avviare la subscription");
        setIsStarting(false);
        return;
      }
      subRef.current = sub;
      setIsRunning(true);
      await AsyncStorage.setItem(`sensor_config_${def.key}`, configStr).catch(() => {});
      addLog("success", `Sensore avviato — config: ${configStr}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog("error", `Errore avvio sensore: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  }, [isRunning, isStarting, configStr, def.key, addLog]);

  const handleStop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setIsRunning(false);
    setLiveData(null);
    addLog("success", "Sensore fermato");
  }, [addLog]);

  return (
    <>
      <View style={ss.configSection}>
        <Text style={ss.sectionLabel}>Config (JSON)</Text>
        <TextInput
          style={ss.configInput}
          value={configStr}
          onChangeText={setConfigStr}
          placeholder='{"interval": 500}'
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isRunning}
          multiline={false}
        />
        <Text style={ss.configHint}>
          {def.key === "pedometer"
            ? "Pedometer non usa interval. Il campo {} è corretto."
            : "interval: ms tra le letture (es. 100–2000). Modificabile solo quando il sensore è fermo."}
        </Text>
      </View>

      <View style={ss.btnRow}>
        <TouchableOpacity
          style={[ss.btn, (isRunning || isStarting) ? ss.btnDisabled : ss.btnPrimary]}
          onPress={handleStart}
          disabled={isRunning || isStarting}
          activeOpacity={0.7}
        >
          <Ionicons name={isStarting ? "hourglass-outline" : "play"} size={16} color={(isRunning || isStarting) ? Colors.textSecondary : "#fff"} />
          <Text style={[ss.btnText, (isRunning || isStarting) && ss.btnTextDisabled]}>
            {isStarting ? "Avvio..." : "Avvia sensore"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ss.btn, !isRunning ? ss.btnDisabled : ss.btnStop]}
          onPress={handleStop}
          disabled={!isRunning}
          activeOpacity={0.7}
        >
          <Ionicons name="stop" size={16} color={!isRunning ? Colors.textSecondary : "#fff"} />
          <Text style={[ss.btnText, !isRunning && ss.btnTextDisabled]}>Ferma</Text>
        </TouchableOpacity>
      </View>

      {isRunning && (
        <View style={ss.statusRow}>
          <View style={ss.runningDot} />
          <Text style={ss.statusText}>In ascolto…</Text>
        </View>
      )}

      {liveData !== null && (
        <View style={ss.dataBox}>
          <Text style={ss.dataLabel}>Dati live</Text>
          <Text style={ss.dataValue}>{liveData}</Text>
        </View>
      )}

      <View style={ss.logSection}>
        <View style={ss.logHeader}>
          <Text style={ss.sectionLabel}>Log diagnostica</Text>
          <TouchableOpacity onPress={() => setLogs([])} style={ss.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={Colors.textSecondary} />
            <Text style={ss.clearText}>Svuota</Text>
          </TouchableOpacity>
        </View>
        {logs.length === 0 ? (
          <Text style={ss.logEmpty}>Nessun evento — premi Avvia per iniziare</Text>
        ) : (
          logs.map((e) => (
            <View key={e.id} style={ss.logEntry}>
              <Text style={ss.logTime}>{e.timestamp}</Text>
              <Text style={ss.logIcon}>{LOG_ICONS[e.type]}</Text>
              <Text style={[ss.logMsg, { color: LOG_COLORS[e.type] }]}>{e.message}</Text>
            </View>
          ))
        )}
      </View>

      <View style={ss.notesSection}>
        <Text style={ss.sectionLabel}>Note</Text>
        <TextInput
          style={ss.notesInput}
          value={notes}
          onChangeText={handleNotesChange}
          placeholder="Annotazioni personali (salvate automaticamente)…"
          placeholderTextColor={Colors.textSecondary}
          multiline
          textAlignVertical="top"
        />
      </View>
    </>
  );
}

export function SensorScreen({ def }: { def: SensorDefinition }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [crashed, setCrashed] = useState(false);
  const [crashMsg, setCrashMsg] = useState("");

  const handleCrash = useCallback((msg: string) => {
    setCrashed(true);
    setCrashMsg(msg);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          ss.content,
          {
            paddingBottom: insets.bottom + 32,
            paddingTop: Platform.OS === "web" ? 67 : 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={ss.headerCard}>
          <Ionicons name="hardware-chip-outline" size={24} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={ss.sensorName}>{def.name}</Text>
            <PlatformBadge platform={def.platform} />
          </View>
        </View>

        {def.platform !== "cross" && (
          <View style={ss.platformWarning}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} />
            <Text style={ss.platformWarningText}>
              {def.platform === "android"
                ? t("admin.sensorAvailAndroid")
                : t("admin.sensorAvailIos")}
            </Text>
          </View>
        )}

        <SensorBoundary onCrash={handleCrash}>
          {crashed ? (
            <View style={bs.container}>
              <Text style={bs.icon}>💥</Text>
              <Text style={bs.title}>Crash catturato dall'ErrorBoundary</Text>
              <Text style={bs.msg}>{crashMsg}</Text>
            </View>
          ) : (
            <SensorBody def={def} />
          )}
        </SensorBoundary>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ss = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  sensorName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  platformBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  platformBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  platformWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.warning + "11",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "33",
    padding: 10,
  },
  platformWarningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  configSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  configInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  configHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnPrimary: {
    backgroundColor: Colors.accent,
  },
  btnStop: {
    backgroundColor: Colors.error,
  },
  btnDisabled: {
    backgroundColor: Colors.border,
  },
  btnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  btnTextDisabled: {
    color: Colors.textSecondary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.success,
  },
  dataBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  dataLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dataValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 20,
  },
  logSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clearText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  logEmpty: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  logEntry: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 3,
  },
  logTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    width: 54,
    flexShrink: 0,
  },
  logIcon: {
    fontSize: 12,
    flexShrink: 0,
  },
  logMsg: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  notesSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  notesInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 100,
    lineHeight: 20,
  },
});
