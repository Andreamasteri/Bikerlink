import React from "react";
import { View, Text, StyleSheet, Modal, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface PurgeConfirmationModalProps {
  visible: boolean;
  purgeConfirmText: string;
  setPurgeConfirmText: (text: string) => void;
  onClose: () => void;
  onExecute: () => void;
  t: (key: string) => string;
}

export const PurgeConfirmationModal: React.FC<PurgeConfirmationModalProps> = ({
  visible,
  purgeConfirmText,
  setPurgeConfirmText,
  onClose,
  onExecute,
  t,
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
        <View style={styles.modalBox}>
          <Ionicons name="nuclear-outline" size={32} color="#FF4444" />
          <Text style={styles.modalTitle}>Conferma purga</Text>
          <Text style={styles.modalBody}>
            {t("admin.deleteAllUsersConfirm")}{"\n\n"}
            Scrivi <Text style={{ color: "#FF4444", fontFamily: "Inter_700Bold" }}>PURGA</Text> nel campo qui sotto per confermare.
          </Text>
          <TextInput
            style={styles.modalInput}
            value={purgeConfirmText}
            onChangeText={setPurgeConfirmText}
            placeholder="PURGA"
            placeholderTextColor={Colors.textMuted ?? "#666"}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: Colors.surface }]}
              onPress={onClose}
            >
              <Text style={[styles.modalBtnText, { color: Colors.text }]}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalBtn,
                { backgroundColor: purgeConfirmText.trim().toUpperCase() === "PURGA" ? "#CC0000" : "#555" },
              ]}
              onPress={onExecute}
            >
              <Text style={styles.modalBtnText}>Elimina tutto</Text>
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
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#FF4444",
  },
  modalTitle: {
    color: "#FF4444",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  modalBody: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: Colors.background,
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: "#FF4444",
    width: "100%",
    textAlign: "center",
    letterSpacing: 2,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
