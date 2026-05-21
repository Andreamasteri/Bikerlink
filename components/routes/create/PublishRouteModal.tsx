import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface PublishRouteModalProps {
  visible: boolean;
  isSettingVisibility: boolean;
  onChoice: (publish: boolean) => void;
  t: (key: string) => string;
}

export const PublishRouteModal: React.FC<PublishRouteModalProps> = ({
  visible,
  isSettingVisibility,
  onChoice,
  t,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogBox}>
          <MaterialCommunityIcons name="earth" size={40} color={Colors.accent} style={{ marginBottom: 12 }} />
          <Text style={styles.dialogTitle}>Vuoi pubblicare il tuo percorso?</Text>
          <Text style={styles.dialogSubtitle}>
            I percorsi pubblici sono visibili a tutti gli utenti. Puoi cambiare questa impostazione in qualsiasi momento.
          </Text>
          {isSettingVisibility ? (
            <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogBtnSecondary}
                onPress={() => onChoice(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.dialogBtnSecondaryText}>No, tienilo privato</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogBtnPrimary}
                onPress={() => onChoice(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="globe-outline" size={18} color="#fff" />
                <Text style={styles.dialogBtnPrimaryText}>{t("routes.publishConfirm")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  dialogBox: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center" as const,
  },
  dialogTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700" as const,
    textAlign: "center" as const,
    marginBottom: 10,
  },
  dialogSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: "center" as const,
    lineHeight: 20,
    marginBottom: 4,
  },
  dialogActions: {
    flexDirection: "column" as const,
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  dialogBtnPrimary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  dialogBtnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  dialogBtnSecondary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dialogBtnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
});
