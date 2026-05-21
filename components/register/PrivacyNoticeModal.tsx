import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface PrivacyNoticeModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PrivacyNoticeModal: React.FC<PrivacyNoticeModalProps> = ({
  visible,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.privacyModalOverlay}>
        <View style={styles.privacyModalCard}>
          <Ionicons
            name="shield-checkmark"
            size={48}
            color={Colors.accent}
            style={{ marginBottom: 16 }}
          />
          <Text style={styles.privacyModalTitle}>BikerLink</Text>
          <Text style={styles.privacyModalBody}>{t("register.privacyNotice")}</Text>
          <Text style={styles.privacyModalHighlight}>
            <Text style={styles.privacyModalHighlightText}>
              App discreta. Privacy al primo posto.
            </Text>
          </Text>
          <TouchableOpacity style={styles.privacyModalButton} onPress={onClose}>
            <Text style={styles.privacyModalButtonText}>Ho capito, prosegui</Text>
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
  privacyModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 36,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  privacyModalTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  privacyModalBody: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 20,
  },
  privacyModalHighlight: {
    marginBottom: 28,
  },
  privacyModalHighlightText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    fontStyle: "italic",
    textDecorationLine: "underline",
    textAlign: "center",
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
});
