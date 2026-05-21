import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface EmailConfirmModalProps {
  visible: boolean;
  email: string;
  onConfirm: () => void;
  onEdit: () => void;
}

export const EmailConfirmModal: React.FC<EmailConfirmModalProps> = ({
  visible,
  email,
  onConfirm,
  onEdit,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onEdit}
    >
      <View style={styles.privacyModalOverlay}>
        <View style={styles.emailConfirmCard}>
          <Ionicons
            name="mail"
            size={40}
            color={Colors.accent}
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.emailConfirmTitle}>Sei sicuro sia corretto?</Text>
          <Text style={styles.emailConfirmEmail}>{email.trim()}</Text>
          <TouchableOpacity style={styles.privacyModalButton} onPress={onConfirm}>
            <Text style={styles.privacyModalButtonText}>Sì, è questo ✓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emailConfirmEditBtn} onPress={onEdit}>
            <Text style={styles.emailConfirmEditText}>Correggi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  privacyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emailConfirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
  },
  emailConfirmTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 14,
  },
  emailConfirmEmail: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  privacyModalButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: "100%",
    alignItems: "center",
  },
  privacyModalButtonText: {
    color: Colors.background,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emailConfirmEditBtn: {
    marginTop: 16,
    padding: 8,
  },
  emailConfirmEditText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
});
