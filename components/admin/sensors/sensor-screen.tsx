import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/language-context";
import {
  SensorKey,
  SensorDefinition,
  checkSensorAvailable,
  requestSensorPermission,
  startSensorSub,
} from "@/components/admin/sensors/sensorUtils";
import type { DeviceSensor } from "expo-sensors";
import Colors from "@/constants/colors";
import { SensorScreenHeader } from "@/components/admin/sensors/SensorScreenHeader";
import { SensorLiveReadings } from "@/components/admin/sensors/SensorLiveReadings";
import { SensorTestSection, LogEntry, LogType } from "@/components/admin/sensors/SensorTestSection";
import { SensorNotesSection } from "@/components/admin/sensors/SensorNotesSection";
import { SensorBoundary } from "@/components/admin/sensors/SensorBoundary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeviceSensor generic type from expo-sensors
type Subscription = ReturnType<DeviceSensor<any>["addListener"]>;

export { SensorKey, SensorDefinition };

function nowHMS(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const bs = StyleSheet.create({
  container: { padding: 16, alignItems: "center", gap: 8 },
  icon: { fontSize: 28 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.error, textAlign: "center" },
  msg: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
});

function SensorBody({ def }: { def: SensorDefinition }) {
  const t = useT();
  const [configStr, setConfigStr] = useState(def.defaultConfig);
  const [notes, setNotes] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [liveData, setLiveData] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showOpenSettings, setShowOpenSettings] = useState(false);
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
      const msg = e instanceof Error ? (e as Error).message : String(e);
      addLog("error", `Errore verifica disponibilità: ${msg}`);
      setIsStarting(false);
      return;
    }

    if (!available) {
      addLog("error", t("admin.sensorUnavailable"));
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
        const settingsMsg = canAsk
          ? "Vai in Impostazioni → Privacy → Movimento e fitness e abilita BikerLink."
          : "Apri Impostazioni → Privacy e sicurezza → Movimento e fitness → BikerLink e attiva l'interruttore.";
        addLog(
          "error",
          def.key === "pedometer"
            ? canAsk
              ? `${t("sensors.pedometerPermDenied")} ${settingsMsg}`
              : `${t("sensors.permPreviouslyDeniedShort")} ${settingsMsg}`
            : t("admin.sensorPermissionDenied")
        );
        if (def.key === "pedometer" && !canAsk) {
          addLog("info", "Premi 'Apri Impostazioni' qui sotto per abilitare il permesso manualmente.");
          setShowOpenSettings(true);
        }
        setIsStarting(false);
        return;
      }
      setShowOpenSettings(false);
      if (perm.required) {
        addLog("success", "Permesso concesso");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? (e as Error).message : String(e);
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
      const msg = e instanceof Error ? (e as Error).message : String(e);
      addLog("error", `Errore avvio sensore: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  }, [isRunning, isStarting, configStr, def.key, addLog, t]);

  const handleStop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setIsRunning(false);
    setLiveData(null);
    addLog("success", "Sensore fermato");
  }, [addLog]);

  return (
    <>
      <SensorTestSection
        configStr={configStr}
        setConfigStr={setConfigStr}
        isRunning={isRunning}
        isStarting={isStarting}
        handleStart={handleStart}
        handleStop={handleStop}
        logs={logs}
        setLogs={setLogs}
        showOpenSettings={showOpenSettings}
        addLog={addLog}
        pedometerHint={def.key === "pedometer"}
        sensorIntervalDesc={t("admin.sensorIntervalDesc")}
      />

      <SensorLiveReadings isRunning={isRunning} liveData={liveData} />

      <SensorNotesSection notes={notes} onChangeNotes={handleNotesChange} />
    </>
  );
}

export function SensorScreen({ def }: { def: SensorDefinition }) {
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
            paddingTop: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SensorScreenHeader def={def} />

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
});
