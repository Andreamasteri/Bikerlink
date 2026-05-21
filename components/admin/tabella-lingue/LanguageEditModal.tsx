import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type EditModalData = {
  key: string;
  lang: string;
  langLabel: string;
  position: string;
  itValue: string;
  currentValue: string;
};

interface LanguageEditModalProps {
  visible: boolean;
  data: EditModalData | null;
  draftValue: string;
  onDraftValueChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}

export const LanguageEditModal: React.FC<LanguageEditModalProps> = ({
  visible,
  data,
  draftValue,
  onDraftValueChange,
  onClose,
  onSave,
  saving,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {data?.langLabel} — {data?.position || data?.key}
              </Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {data?.key}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalItRow}>
            <Text style={styles.modalItLabel}>Italiano (riferimento):</Text>
            <Text style={styles.modalItValue}>{data?.itValue || "—"}</Text>
          </View>

          <Text style={styles.modalInputLabel}>Traduzione {data?.langLabel}:</Text>
          <TextInput
            style={styles.modalInput}
            value={draftValue}
            onChangeText={onDraftValueChange}
            multiline
            autoFocus
            placeholder="Inserisci la traduzione..."
            placeholderTextColor={Colors.textSecondary}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || !draftValue.trim()) && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving || !draftValue.trim()}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 480,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 10,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  modalItRow: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  modalItLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  modalItValue: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  modalInputLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.accent,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
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
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
