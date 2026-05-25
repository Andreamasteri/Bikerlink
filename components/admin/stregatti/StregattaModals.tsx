import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface StregattaModalsProps {
  massSeedConfirmVisible: boolean;
  setMassSeedConfirmVisible: (visible: boolean) => void;
  deleteAllConfirmVisible: boolean;
  setDeleteAllConfirmVisible: (visible: boolean) => void;
  deleteSingleTarget: { id: string; nickname: string } | null;
  setDeleteSingleTarget: (target: { id: string; nickname: string } | null) => void;
  totalCount: number;
  onStartMassSeed: () => void;
  onConfirmDeleteAll: () => void;
  onConfirmDeleteSingle: (id: string) => void;
}

export const StregattaModals: React.FC<StregattaModalsProps> = ({
  massSeedConfirmVisible,
  setMassSeedConfirmVisible,
  deleteAllConfirmVisible,
  setDeleteAllConfirmVisible,
  deleteSingleTarget,
  setDeleteSingleTarget,
  totalCount,
  onStartMassSeed,
  onConfirmDeleteAll,
  onConfirmDeleteSingle,
}) => {
  const t = useT();

  return (
    <>
      <Modal visible={massSeedConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pwdModalContainer}>
            <Text style={styles.pwdModalTitle}>Generazione Massiva</Text>
            <Text style={styles.pwdModalDesc}>{t("admin.generateStregatti")}</Text>
            <View style={styles.pwdModalButtons}>
              <TouchableOpacity style={[styles.pwdBtn, styles.pwdBtnCancel]} onPress={() => setMassSeedConfirmVisible(false)}>
                <Text style={styles.pwdBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pwdBtn, styles.pwdBtnConfirm]} onPress={() => { setMassSeedConfirmVisible(false); onStartMassSeed(); }}>
                <Text style={styles.pwdBtnText}>Genera</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteAllConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Elimina tutti?</Text>
            <Text style={styles.confirmDesc}>Eliminare tutti i {totalCount} stregatti?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setDeleteAllConfirmVisible(false)}>
                <Text style={styles.confirmCancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={onConfirmDeleteAll}>
                <Text style={styles.confirmDeleteBtnText}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteSingleTarget} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Elimina utente?</Text>
            <Text style={styles.confirmDesc}>Eliminare "{deleteSingleTarget?.nickname}"?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setDeleteSingleTarget(null)}>
                <Text style={styles.confirmCancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={() => onConfirmDeleteSingle(deleteSingleTarget!.id)}>
                <Text style={styles.confirmDeleteBtnText}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  pwdModalContainer: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: "85%", gap: 16 },
  pwdModalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" },
  pwdModalDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  pwdInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  pwdModalButtons: { flexDirection: "row", gap: 10 },
  pwdBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  pwdBtnCancel: { backgroundColor: Colors.border },
  pwdBtnConfirm: { backgroundColor: Colors.accent },
  pwdBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  confirmBox: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: "85%", alignItems: "center" },
  confirmTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, marginBottom: 8 },
  confirmDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 },
  confirmBtns: { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  confirmCancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  confirmDeleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" },
  confirmDeleteBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  errorText: { color: Colors.error, fontSize: 12 },
});
