import React from "react";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, TouchableOpacity as RNTouchableOpacity, TextInput as RNTextInput, ActivityIndicator as RNActivityIndicator } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = RNStyleSheet.create({
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  settingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: { padding: 4 },
  settingLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceLight },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
});

interface Setting {
  key: string;
  label: string;
  placeholder: string;
}

interface AppSettingsSectionProps {
  settings: Setting[];
  editingKey: string | null;
  editValue: string;
  setEditValue: (val: string) => void;
  startEditing: (key: string) => void;
  cancelEditing: () => void;
  handleSave: () => void;
  isSaving: boolean;
  getSettingValue: (key: string) => string;
  handleUploadEula: () => void;
  isUploadingEula: boolean;
}

export function AppSettingsSection({
  settings,
  editingKey,
  editValue,
  setEditValue,
  startEditing,
  cancelEditing,
  handleSave,
  isSaving,
  getSettingValue,
  handleUploadEula,
  isUploadingEula,
}: AppSettingsSectionProps) {
  const t = useT();

  return (
    <RNView>
      <RNView style={styles.sectionHeaderRow}>
        <IoniconsSet name="settings" size={20} color={Colors.accent} />
        <RNText style={styles.sectionTitle}>{t("admin.appSettings")}</RNText>
      </RNView>

      {settings.map((setting) => (
        <RNView key={setting.key} style={styles.settingCard}>
          <RNView style={styles.settingHeader}>
            <RNText style={styles.settingLabel}>{setting.label}</RNText>
            <RNView style={styles.settingActions}>
              {setting.key === "eula_text" && editingKey !== setting.key && (
                <RNTouchableOpacity
                  style={styles.uploadBtn}
                  onPress={handleUploadEula}
                  disabled={isUploadingEula}
                >
                  {isUploadingEula ? (
                    <RNActivityIndicator size="small" color={Colors.accent} />
                  ) : (
                    <IoniconsSet name="cloud-upload" size={20} color={Colors.accent} />
                  )}
                </RNTouchableOpacity>
              )}
              {editingKey !== setting.key && (
                <RNTouchableOpacity onPress={() => startEditing(setting.key)}>
                  <IoniconsSet name="create" size={20} color={Colors.accent} />
                </RNTouchableOpacity>
              )}
            </RNView>
          </RNView>
          {editingKey === setting.key ? (
            <RNView>
              <RNTextInput
                style={styles.input}
                placeholder={setting.placeholder}
                placeholderTextColor={Colors.textSecondary}
                value={editValue}
                onChangeText={setEditValue}
                multiline={setting.key === "eula_text"}
                numberOfLines={setting.key === "eula_text" ? 6 : 1}
              />
              <RNView style={styles.editActions}>
                <RNTouchableOpacity style={styles.cancelBtn} onPress={cancelEditing}>
                  <RNText style={styles.cancelBtnText}>Annulla</RNText>
                </RNTouchableOpacity>
                <RNTouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  <RNText style={styles.saveBtnText}>{isSaving ? "..." : t("admin.saveBtn")}</RNText>
                </RNTouchableOpacity>
              </RNView>
            </RNView>
          ) : (
            <RNText style={styles.settingValue}>
              {getSettingValue(setting.key) || setting.placeholder}
            </RNText>
          )}
        </RNView>
      ))}
    </RNView>
  );
}
