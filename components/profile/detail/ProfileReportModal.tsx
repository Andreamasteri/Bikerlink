/**
 * Task #2530 — ProfileReportModal aggiornato con le 8 categorie segnalazione
 * standard. Il chiamante (app/profile/[id].tsx) può passare la categoria
 * selezionata al backend via `onReasonSelect(reason, category)`. Il payload
 * resta backward-compat: se il chiamante non passa la categoria, il backend
 * non-block.
 */
import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

export type ReportCategoryKey =
  | "aggressive"
  | "harassment"
  | "fake_profile"
  | "no_show"
  | "opportunist"
  | "group_misconduct"
  | "dangerous_riding"
  | "other";

// Esposto per i chiamanti che vogliono leggere la categoria dalla reason label.
export const REPORT_CATEGORY_OPTIONS: Array<{ key: ReportCategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "aggressive",       label: "Comportamento aggressivo",       icon: "flame-outline" },
  { key: "harassment",       label: "Molestia / contatti insistenti", icon: "alert-circle-outline" },
  { key: "fake_profile",     label: "Profilo falso / bot",            icon: "person-remove-outline" },
  { key: "no_show",          label: "Non si è presentato",            icon: "time-outline" },
  { key: "opportunist",      label: "Opportunista / scrocco",         icon: "cash-outline" },
  { key: "group_misconduct", label: "Comportamento in gruppo",        icon: "people-outline" },
  { key: "dangerous_riding", label: "Guida pericolosa",               icon: "warning-outline" },
  { key: "other",            label: "Altro",                          icon: "ellipsis-horizontal" },
];

export function reasonToCategory(reason: string): ReportCategoryKey | undefined {
  return REPORT_CATEGORY_OPTIONS.find((c) => c.label === reason)?.key;
}

interface ProfileReportModalProps {
  visible: boolean;
  onClose: () => void;
  profileName: string;
  reportSent: boolean;
  selectedReason: string;
  onReasonSelect: (reason: string) => void;
  reportDescription: string;
  onDescriptionChange: (text: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  insets: { bottom: number; top: number; left: number; right: number };
}

export const ProfileReportModal: React.FC<ProfileReportModalProps> = ({
  visible,
  onClose,
  profileName,
  reportSent,
  selectedReason,
  onReasonSelect,
  reportDescription,
  onDescriptionChange,
  onSubmit,
  isPending,
  insets,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <Pressable style={[styles.reportSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.menuHandle} />
          {reportSent ? (
            <View style={styles.reportSuccess}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              <Text style={styles.reportSuccessTitle}>Segnalazione inviata</Text>
              <Text style={styles.reportSuccessText}>{t("profile.reportSuccess")}</Text>
              <TouchableOpacity style={styles.reportCloseBtn} onPress={onClose}>
                <Text style={styles.reportCloseBtnText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.reportTitle}>Segnala {profileName}</Text>
              <Text style={styles.reportSubtitle}>
                Le segnalazioni sono private: il segnalato non vedrà chi le invia.
              </Text>
              <View style={styles.reasonList}>
                {REPORT_CATEGORY_OPTIONS.map((c) => {
                  const selected = selectedReason === c.label;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.reasonItem, selected && styles.reasonItemSelected]}
                      onPress={() => onReasonSelect(c.label)}
                      activeOpacity={0.7}
                      testID={`profile-report-cat-${c.key}`}
                    >
                      <Ionicons name={c.icon} size={18} color={selected ? Colors.accent : Colors.textSecondary} />
                      <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={styles.reportInput}
                placeholder="Descrizione opzionale..."
                placeholderTextColor={Colors.textSecondary}
                value={reportDescription}
                onChangeText={onDescriptionChange}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!selectedReason || isPending) && styles.reportSubmitBtnDisabled]}
                onPress={onSubmit}
                disabled={!selectedReason || isPending}
                activeOpacity={0.8}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.reportSubmitBtnText}>Invia segnalazione</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 16 },
  reportSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, maxHeight: "90%" },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 4 },
  reportSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  reasonList: { gap: 4, marginBottom: 14 },
  reasonItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  reasonItemSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  reasonText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  reasonTextSelected: { fontFamily: "Inter_500Medium", color: Colors.accent },
  reportInput: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, minHeight: 72, textAlignVertical: "top", marginBottom: 16 },
  reportSubmitBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  reportSuccess: { alignItems: "center", paddingVertical: 24, gap: 12 },
  reportSuccessTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  reportSuccessText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  reportCloseBtn: { backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: Colors.border, marginTop: 8 },
  reportCloseBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
});
