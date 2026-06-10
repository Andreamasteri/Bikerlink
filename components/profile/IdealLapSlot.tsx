import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useIdealLapRecorder } from "@/hooks/useIdealLapRecorder";

type LapSlotProps = {
  index: number;
  targetKm: number;
  onSaved: () => void;
};

export default function IdealLapSlot({ index, targetKm, onSaved }: LapSlotProps) {
  const { lapState, sampleCount, distanceKm, saving, start, stop, save } =
    useIdealLapRecorder(index, targetKm);

  const defaultName = `Giro ${index + 1}`;
  const [name, setName] = useState(defaultName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(defaultName);

  const storageKey = `idealLapSlotName_${index}`;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((v) => {
        if (!cancelled && v && v.trim()) {
          setName(v);
          setDraft(v);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };

  const commitEdit = async () => {
    const next = draft.trim() || defaultName;
    setName(next);
    setEditing(false);
    try {
      await AsyncStorage.setItem(storageKey, next);
    } catch {
      // best-effort
    }
  };

  const handleSave = async () => {
    try {
      await save(name);
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

  const progress = Math.min(1, targetKm > 0 ? distanceKm / targetKm : 0);

  return (
    <View style={styles.container}>
      <View style={styles.telemetryBadge}>
        <Ionicons name="checkmark-circle" size={11} color="#27ae60" />
        <Text style={styles.telemetryBadgeText}>Incluso nella telemetria totale</Text>
      </View>
      <View style={styles.header}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commitEdit}
            onSubmitEditing={commitEdit}
            autoFocus
            maxLength={40}
            style={styles.titleInput}
            placeholder={defaultName}
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity
            style={styles.titleRow}
            onPress={startEdit}
            disabled={isRecording}
          >
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            <Ionicons name="pencil" size={11} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        {statusLabel ? (
          <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
        ) : null}
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {distanceKm.toFixed(1)} / {targetKm} km
        </Text>
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
  telemetryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  telemetryBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#27ae60",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  title: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  titleInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  status: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  progressText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    minWidth: 72,
    textAlign: "right",
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
