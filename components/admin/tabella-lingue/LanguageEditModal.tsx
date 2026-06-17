import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { TableRow, TABLE_LANGS } from "./types";

export type EditModalData = {
  key: string;
  lang: string;
  langLabel: string;
  position: string;
  itValue: string;
  currentValue: string;
};

interface LanguageRowEditModalProps {
  visible: boolean;
  row: TableRow | null;
  focusLang?: string;
  onClose: () => void;
  onSave: (updates: Record<string, string>) => Promise<void>;
  saving: boolean;
}

export const LanguageEditModal: React.FC<LanguageRowEditModalProps> = ({
  visible,
  row,
  focusLang,
  onClose,
  onSave,
  saving,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const focusRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (visible && row) {
      const initial: Record<string, string> = {};
      TABLE_LANGS.forEach((l) => {
        initial[l.code] = (row[l.code as keyof TableRow] as string) ?? "";
      });
      setDrafts(initial);
    }
  }, [visible, row]);

  const hasChanges = useMemo(() => {
    if (!row) return false;
    return TABLE_LANGS.some(
      (l) => drafts[l.code] !== ((row[l.code as keyof TableRow] as string) ?? "")
    );
  }, [drafts, row]);

  if (!row) return null;

  const handleSave = async () => {
    const updates: Record<string, string> = {};
    TABLE_LANGS.forEach((l) => {
      const orig = (row[l.code as keyof TableRow] as string) ?? "";
      if (drafts[l.code] !== orig) {
        updates[l.code] = drafts[l.code] ?? "";
      }
    });
    await onSave(updates);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {row.position || row.key}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>{row.key}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.itBlock}>
              <Text style={styles.fieldLabel}>IT — Italiano (riferimento)</Text>
              <Text style={styles.itText}>{row.it || "—"}</Text>
            </View>

            {TABLE_LANGS.map((l) => (
              <View key={l.code} style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{l.label}</Text>
                <TextInput
                  ref={l.code === focusLang ? focusRef : undefined}
                  style={styles.input}
                  value={drafts[l.code] ?? ""}
                  onChangeText={(v) => setDrafts((prev) => ({ ...prev, [l.code]: v }))}
                  multiline
                  autoFocus={l.code === (focusLang ?? TABLE_LANGS[0].code)}
                  placeholder={`Traduzione in ${l.label}...`}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            ))}
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Salva</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border ?? "#555",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    gap: 10,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  itBlock: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  itText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 70,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#2a2a2a",
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border ?? "#444",
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
