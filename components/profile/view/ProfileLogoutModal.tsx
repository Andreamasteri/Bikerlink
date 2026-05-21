import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProfileLogoutModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

export const ProfileLogoutModal: React.FC<ProfileLogoutModalProps> = ({
  visible,
  onClose,
  onConfirm,
  t,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalContent}>
          <Ionicons name="log-out" size={32} color={Colors.accentRed} />
          <Text style={styles.modalTitle}>{t("profile.logoutConfirmDesc")}</Text>
          <View style={styles.modalButtons}>
            <Pressable style={styles.modalBtnCancel} onPress={onClose}>
              <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={styles.modalBtnConfirm}
              onPress={() => {
                onClose();
                onConfirm();
              }}
            >
              <Text style={styles.modalBtnConfirmText}>{t("profile.logout")}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: 300,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: Colors.accentRed,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  modalBtnConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
