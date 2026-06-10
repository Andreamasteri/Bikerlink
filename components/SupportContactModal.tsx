import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSupportSettings } from "@/lib/settings-context";

interface SupportContactModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SupportContactModal({ visible, onClose }: SupportContactModalProps) {
  const { email, whatsapp } = useSupportSettings();

  const handleEmail = () => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`);
    onClose();
  };

  const handleWhatsApp = () => {
    if (!whatsapp) return;
    const cleaned = whatsapp.replace(/\D/g, "");
    Linking.openURL(`https://wa.me/${cleaned}`);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <Text style={styles.title}>Supporto tecnico</Text>
          <Text style={styles.subtitle}>Scegli come contattarci</Text>

          {!!email && (
            <TouchableOpacity style={styles.option} onPress={handleEmail} testID="support-email-btn">
              <View style={styles.optionIcon}>
                <Ionicons name="mail-outline" size={24} color={Colors.accent} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>Invia email</Text>
                <Text style={styles.optionValue}>{email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}

          {!!whatsapp && (
            <TouchableOpacity style={styles.option} onPress={handleWhatsApp} testID="support-whatsapp-btn">
              <View style={[styles.optionIcon, styles.optionIconWhatsapp]}>
                <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>Scrivi su WhatsApp</Text>
                <Text style={styles.optionValue}>{whatsapp}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Annulla</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,107,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconWhatsapp: {
    backgroundColor: "rgba(37,211,102,0.12)",
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  optionValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
