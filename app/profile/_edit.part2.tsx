import React from "react";
import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import Colors from "@/constants/colors";
import { makeStyles } from "@/components/profile/edit.styles";
const styles = makeStyles(Colors);

export function RevokeConsentModal({
  visible,
  onClose,
  onConfirm,
  t
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: (k: string) => string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={onClose}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Revoca consensi privacy</Text>
          <Text style={styles.modalBody}>
            Questa azione revocherà i consensi obbligatori per l'uso dell'app.
            Verrai disconnesso e il tuo account verrà programmato per la
            cancellazione automatica tra 30 giorni.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={onClose}
            >
              <Text style={styles.modalBtnCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnConfirm}
              onPress={onConfirm}
            >
              <Text style={styles.modalBtnConfirmText}>Revoca e disconnetti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
