import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useIdealLapRecorder } from "@/hooks/useIdealLapRecorder";
import { Alert } from "react-native";

type LapSlotProps = {
  index: number;
  onSaved: () => void;
};

export default function IdealLapSlot({ index, onSaved }: LapSlotProps) {
  const { lapState, sampleCount, saving, start, stop, save } = useIdealLapRecorder(index);

  const handleSave = async () => {
    try {
      await save();
      onSaved();
    } catch {
      Alert.alert("Errore", "Impossibile salvare il giro. Riprova.");
    }
  };

  const statusLabel =
    lapState === "recording"
      ? `● ${sampleCount} camp.`
      : lapState === "ready_to_save"
      ? `${sampleCount} camp. pronti`
      : lapState === "saved"
      ? "✓ Salvato"
      : "";

  const statusColor =
    lapState === "recording"
      ? "#e74c3c"
      : lapState === "ready_to_save"
      ? Colors.accent
      : lapState === "saved"
      ? "#27ae60"
      : Colors.textSecondary;

  const isRecording = lapState === "recording";
  const isReadyToSave = lapState === "ready_to_save";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Giro {index + 1}</Text>
        {statusLabel ? (
          <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, (isRecording || isReadyToSave) && styles.btnDisabled]}
          onPress={start}
          disabled={isRecording || isReadyToSave}
        >
          <Ionicons name="play" size={12} color={isRecording || isReadyToSave ? Colors.textSecondary : "#fff"} />
          <Text style={[styles.btnText, (isRecording || isReadyToSave) && styles.btnTextDisabled]}>
            Start
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnStop, !isRecording && styles.btnDisabled]}
          onPress={stop}
          disabled={!isRecording}
        >
          <Ionicons name="stop" size={12} color={isRecording ? "#fff" : Colors.textSecondary} />
          <Text style={[styles.btnText, !isRecording && styles.btnTextDisabled]}>Stop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSave, !isReadyToSave && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!isReadyToSave || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={12} color={isReadyToSave ? "#fff" : Colors.textSecondary} />
          )}
          <Text style={[styles.btnText, !isReadyToSave && styles.btnTextDisabled]}>Salva</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  status: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  buttons: {
    flexDirection: "row",
    gap: 6,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingVertical: 6,
  },
  btnStop: {
    backgroundColor: "#e74c3c",
  },
  btnSave: {
    backgroundColor: "#27ae60",
  },
  btnDisabled: {
    backgroundColor: Colors.border,
  },
  btnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  btnTextDisabled: {
    color: Colors.textSecondary,
  },
});
