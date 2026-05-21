import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface GiftModalProps {
  visible: boolean;
  message: string;
  code: string;
  onClose: () => void;
}

export const GiftModal: React.FC<GiftModalProps> = ({
  visible,
  message,
  code,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.giftModalOverlay}>
        <View style={styles.giftModalCard}>
          <Ionicons
            name="gift"
            size={56}
            color={Colors.accent}
            style={{ marginBottom: 16 }}
          />
          <Text style={styles.giftModalTitle}>🎁 Omaggio sbloccato!</Text>
          <Text style={styles.giftModalMessage}>{message}</Text>
          <View style={styles.giftModalCodeBox}>
            <Text style={styles.giftModalCodeLabel}>Il tuo codice</Text>
            <Text style={styles.giftModalCode}>{code}</Text>
          </View>
          <TouchableOpacity style={styles.giftModalButton} onPress={onClose}>
            <Text style={styles.giftModalButtonText}>Ho capito!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  giftModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  giftModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
  },
  giftModalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  giftModalMessage: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  giftModalCodeBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 28,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  giftModalCodeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  giftModalCode: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    letterSpacing: 4,
  },
  giftModalButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  giftModalButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
