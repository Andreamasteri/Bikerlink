import React from "react";
import { View, Text, TextInput, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ApkSectionProps {
  apkData: { url: string } | undefined;
  apkEditing: boolean;
  apkInputUrl: string;
  setApkInputUrl: (v: string) => void;
  setApkEditing: (v: boolean) => void;
  onEdit: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function ApkSection({
  apkData,
  apkEditing,
  apkInputUrl,
  setApkInputUrl,
  setApkEditing,
  onEdit,
  onSave,
  isSaving,
}: ApkSectionProps) {
  return (
    <>
      {apkEditing && (
        <TextInput
          style={apkBtnStyles.input}
          value={apkInputUrl}
          onChangeText={setApkInputUrl}
          placeholder="https://expo.dev/artifacts/..."
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      )}
      <View style={apkBtnStyles.row}>
        {!apkEditing && apkData?.url ? (
          <TouchableOpacity
            style={apkBtnStyles.btn}
            onPress={() => Linking.openURL(apkData.url)}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={16} color="#fff" />
            <Text style={apkBtnStyles.label}>Scarica TC Terminal APK</Text>
          </TouchableOpacity>
        ) : null}
        {!apkEditing && (
          <TouchableOpacity
            style={apkBtnStyles.editBtn}
            onPress={onEdit}
            activeOpacity={0.7}
          >
            <Ionicons name="link-outline" size={16} color="#fff" />
            <Text style={apkBtnStyles.label}>
              {apkData?.url ? "Modifica URL" : "Imposta URL"}
            </Text>
          </TouchableOpacity>
        )}
        {apkEditing && (
          <>
            <TouchableOpacity
              style={[apkBtnStyles.saveBtn, isSaving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
              )}
              <Text style={apkBtnStyles.label}>Salva</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={apkBtnStyles.cancelBtn}
              onPress={() => setApkEditing(false)}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <Ionicons name="close-outline" size={16} color="#d1d5db" />
              <Text style={apkBtnStyles.cancelLabel}>Annulla</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

const apkBtnStyles = {
  btn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    backgroundColor: "#22c55e",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    backgroundColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cancelLabel: {
    color: "#d1d5db",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  row: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#f9fafb",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 10,
    marginTop: 8,
  },
};
