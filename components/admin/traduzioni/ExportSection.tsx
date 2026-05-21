import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { LangCheckbox } from "./LangCheckbox";

const LANGS = [
  { code: "en", label: "EN — Inglese" },
  { code: "de", label: "DE — Tedesco" },
  { code: "es", label: "ES — Spagnolo" },
  { code: "fr", label: "FR — Francese" },
  { code: "el", label: "EL — Greco" },
  { code: "tr", label: "TR — Turco" },
];

interface ExportSectionProps {
  exportLangs: string[];
  toggleExportLang: (code: string) => void;
  docxLoading: boolean;
  onDownload: () => void;
  docxResult: { ok: boolean; msg: string } | null;
  t: (key: string) => string;
}

export function ExportSection({
  exportLangs,
  toggleExportLang,
  docxLoading,
  onDownload,
  docxResult,
  t,
}: ExportSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>2</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Scarica tabella traduzioni</Text>
          <Text style={styles.cardDesc}>{t("admin.exportWordDesc")}</Text>
        </View>
      </View>

      <View style={styles.langPicker}>
        <Text style={styles.langPickerLabel}>Lingue da includere:</Text>
        {LANGS.map((l) => (
          <LangCheckbox
            key={l.code}
            label={l.label}
            checked={exportLangs.includes(l.code)}
            onToggle={() => toggleExportLang(l.code)}
          />
        ))}
      </View>

      <View style={styles.sectionDivider} />

      <TouchableOpacity
        style={[styles.button, docxLoading && styles.buttonDisabled]}
        onPress={onDownload}
        disabled={docxLoading}
        activeOpacity={0.7}
      >
        {docxLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="microsoft-word" size={18} color="#fff" />
            <Text style={styles.buttonText}>Scarica Tabella Word (.docx)</Text>
          </>
        )}
      </TouchableOpacity>

      {docxResult ? (
        <View style={[styles.inlineHint, docxResult.ok ? styles.inlineHintOk : styles.inlineHintErr]}>
          <MaterialCommunityIcons
            name={docxResult.ok ? "check-circle-outline" : "alert-circle-outline"}
            size={14}
            color={docxResult.ok ? "#4CAF50" : "#eb5757"}
          />
          <Text style={[styles.inlineHintText, { color: docxResult.ok ? "#4CAF50" : "#eb5757" }]}>
            {docxResult.msg}
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
  langPicker: { marginBottom: 12 },
  langPickerLabel: {
    fontSize: 12, color: Colors.textSecondary,
    fontFamily: "Inter_500Medium", marginBottom: 8,
  },
  sectionDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  inlineHint: {
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 6, flexDirection: "row", alignItems: "center", gap: 6,
  },
  inlineHintOk: { backgroundColor: "#4CAF5015" },
  inlineHintErr: { backgroundColor: "#eb575715" },
  inlineHintText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
});
