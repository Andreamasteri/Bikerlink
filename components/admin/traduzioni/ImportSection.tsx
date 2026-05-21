import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StepStatus } from "./StepCard";

interface ImportSectionProps {
  importStatus: StepStatus;
  importFileName: string;
  importResult: string;
  onImportPress: () => void;
  t: (key: string) => string;
}

export function ImportSection({
  importStatus,
  importFileName,
  importResult,
  onImportPress,
  t,
}: ImportSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.stepBadge,
            importStatus === "success" && styles.stepBadgeSuccess,
            importStatus === "error" && styles.stepBadgeError,
          ]}
        >
          <Text style={styles.stepBadgeText}>3</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Importa DOCX tradotto</Text>
          <Text style={styles.cardDesc}>
            Carica il file Word tradotto: le celle non vuote sovrascrivono i valori esistenti in
            lib/i18n/. Le celle vuote vengono ignorate.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, importStatus === "loading" && styles.buttonDisabled]}
        onPress={onImportPress}
        disabled={importStatus === "loading"}
        activeOpacity={0.7}
      >
        {importStatus === "loading" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="file-upload-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Seleziona file .docx</Text>
          </>
        )}
      </TouchableOpacity>

      {importFileName ? (
        <Text style={styles.importFileName} numberOfLines={1}>
          File: {importFileName}
        </Text>
      ) : null}

      {importResult ? (
        <View
          style={[
            styles.resultBox,
            importStatus === "success" && styles.resultBoxSuccess,
            importStatus === "error" && styles.resultBoxError,
          ]}
        >
          <MaterialCommunityIcons
            name={
              importStatus === "success" ? "check-circle-outline" : "alert-circle-outline"
            }
            size={16}
            color={importStatus === "success" ? "#4CAF50" : "#F44336"}
          />
          <Text
            style={[
              styles.resultText,
              importStatus === "success" ? styles.resultTextSuccess : styles.resultTextError,
            ]}
          >
            {importResult}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderText: { flex: 1 },
  stepBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  stepBadgeSuccess: { backgroundColor: "#4CAF50" },
  stepBadgeError: { backgroundColor: "#F44336" },
  stepBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  cardDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 16 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  importFileName: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  resultBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.background,
  },
  resultBoxSuccess: { backgroundColor: "#4CAF5015" },
  resultBoxError: { backgroundColor: "#F4433615" },
  resultText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  resultTextSuccess: { color: "#4CAF50" },
  resultTextError: { color: "#F44336" },
});
