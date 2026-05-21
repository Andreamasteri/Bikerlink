import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AdRotationSectionProps {
  duration: string;
  onDurationChange: (text: string) => void;
  mode: "sequential" | "random";
  onModeChange: (mode: "sequential" | "random") => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function AdRotationSection({
  duration,
  onDurationChange,
  mode,
  onModeChange,
  onSave,
  onCancel,
  isPending,
}: AdRotationSectionProps) {
  const t = useT();

  return (
    <View style={styles.container}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t("admin.rotationSettings")}</Text>
        <TouchableOpacity onPress={onCancel}>
          <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.settingsLabel}>{t("admin.displayDuration")}</Text>
      <TextInput
        style={styles.input}
        placeholder="Secondi (default 10)"
        placeholderTextColor={Colors.textSecondary}
        value={duration}
        onChangeText={onDurationChange}
        keyboardType="number-pad"
      />

      <Text style={styles.settingsLabel}>{t("admin.rotationMode")}</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[
            styles.modeBtn,
            mode === "sequential" && { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
          ]}
          onPress={() => onModeChange("sequential")}
        >
          <MaterialIcons
            name="repeat"
            size={20}
            color={mode === "sequential" ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.modeBtnText, mode === "sequential" && { color: Colors.accent }]}>
            {t("admin.sequential")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeBtn,
            mode === "random" && { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
          ]}
          onPress={() => onModeChange("random")}
        >
          <Ionicons
            name="shuffle"
            size={20}
            color={mode === "random" ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.modeBtnText, mode === "random" && { color: Colors.accent }]}>
            {t("admin.random")}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: Colors.accent }]}
        onPress={onSave}
        disabled={isPending}
      >
        <Text style={styles.submitBtnText}>{t("common.save")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  settingsLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
});
