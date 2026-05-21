import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type LogType = "success" | "error" | "warning" | "info";
export type LogEntry = { id: string; type: LogType; message: string; timestamp: string };

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

interface SensorTestSectionProps {
  configStr: string;
  setConfigStr: (val: string) => void;
  isRunning: boolean;
  isStarting: boolean;
  handleStart: () => void;
  handleStop: () => void;
  logs: LogEntry[];
  setLogs: (logs: LogEntry[]) => void;
  showOpenSettings: boolean;
  addLog: (type: LogType, message: string) => void;
  pedometerHint: boolean;
  sensorIntervalDesc: string;
}

export const SensorTestSection: React.FC<SensorTestSectionProps> = ({
  configStr,
  setConfigStr,
  isRunning,
  isStarting,
  handleStart,
  handleStop,
  logs,
  setLogs,
  showOpenSettings,
  addLog,
  pedometerHint,
  sensorIntervalDesc,
}) => {
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
          {pedometerHint ? "Nessun intervallo richiesto" : sensorIntervalDesc}
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

      <View style={ss.logSection}>
        <View style={ss.logHeader}>
          <Text style={ss.sectionLabel}>Log diagnostica</Text>
          <TouchableOpacity onPress={() => setLogs([])} style={ss.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={Colors.textSecondary} />
            <Text style={ss.clearText}>Svuota</Text>
          </TouchableOpacity>
        </View>
        {showOpenSettings && (
          <TouchableOpacity
            onPress={() => {
              Linking.openSettings().catch((err) => {
                addLog("error", `Impossibile aprire Impostazioni: ${err instanceof Error ? err.message : String(err)}`);
              });
            }}
            style={ss.openSettingsBtn}
            testID="open-settings-btn"
          >
            <Ionicons name="settings-outline" size={16} color="#fff" />
            <Text style={ss.openSettingsText}>Apri Impostazioni</Text>
          </TouchableOpacity>
        )}
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
    </>
  );
};

const ss = StyleSheet.create({
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
  openSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  openSettingsText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
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
