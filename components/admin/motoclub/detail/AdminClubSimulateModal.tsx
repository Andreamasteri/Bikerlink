import React from "react";
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator,
} from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AdminClubSimulateModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
  setMessage: (val: string) => void;
  count: number;
  setCount: (val: number) => void;
  isPending: boolean;
}

export const AdminClubSimulateModal: React.FC<AdminClubSimulateModalProps> = ({
  visible,
  onClose,
  onConfirm,
  message,
  setMessage,
  count,
  setCount,
  isPending,
}) => {
  const t = useT();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t("admin.simulateChatActivity")}</Text>
          <Text style={styles.modalSub}>
            I fake member del club invieranno messaggi nella chat comune.
          </Text>

          <Text style={styles.modalLabel}>Messaggio (opzionale)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Es: #weekend giro domenica?"
            placeholderTextColor={Colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={200}
          />

          <Text style={styles.modalLabel}>Numero di messaggi</Text>
          <View style={styles.countRow}>
            {[1, 2, 3, 5, 10].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.countBtn, count === n && styles.countBtnActive]}
                onPress={() => setCount(n)}
              >
                <Text style={[styles.countBtnText, count === n && styles.countBtnTextActive]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={onClose}
            >
              <Text style={styles.modalCancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirm, isPending && { opacity: 0.6 }]}
              onPress={onConfirm}
              disabled={isPending}
            >
              {isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalConfirmText}>Invia</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  modalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modalLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 70,
    textAlignVertical: "top",
  },
  countRow: {
    flexDirection: "row",
    gap: 8,
  },
  countBtn: {
    width: 44,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  countBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "22",
  },
  countBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  countBtnTextActive: {
    color: Colors.accent,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  modalCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
  },
  modalConfirmText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
