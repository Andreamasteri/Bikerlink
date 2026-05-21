import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface WaypointFormModalProps {
  visible: boolean;
  waypointName: string;
  setWaypointName: (text: string) => void;
  waypointDesc: string;
  setWaypointDesc: (text: string) => void;
  waypointType: string;
  setWaypointType: (type: string) => void;
  waypointTypes: any[];
  pendingCoord: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onSave: () => void;
}

export const WaypointFormModal: React.FC<WaypointFormModalProps> = ({
  visible,
  waypointName,
  setWaypointName,
  waypointDesc,
  setWaypointDesc,
  waypointType,
  setWaypointType,
  waypointTypes,
  pendingCoord,
  onClose,
  onSave,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dettagli Tappa</Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Nome *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Es. Ristorante da Mario"
                placeholderTextColor={Colors.textSecondary}
                value={waypointName}
                onChangeText={setWaypointName}
                maxLength={200}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Descrizione</Text>
              <TextInput
                style={[styles.modalInput, { height: 60 }]}
                placeholder="Opzionale"
                placeholderTextColor={Colors.textSecondary}
                value={waypointDesc}
                onChangeText={setWaypointDesc}
                multiline
              />

              <Text style={styles.fieldLabel}>Tipo</Text>
              <View style={styles.typeRow}>
                {waypointTypes.map((wt) => (
                  <TouchableOpacity
                    key={wt.value}
                    style={[
                      styles.typeChip,
                      waypointType === wt.value && { backgroundColor: wt.color + "33", borderColor: wt.color },
                    ]}
                    onPress={() => setWaypointType(wt.value)}
                  >
                    <MaterialCommunityIcons name={wt.icon} size={16} color={wt.color} />
                    <Text style={[styles.typeChipText, waypointType === wt.value && { color: wt.color }]}>
                      {wt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {pendingCoord && (
                <Text style={styles.coordPreview}>
                  {pendingCoord.latitude.toFixed(6)}, {pendingCoord.longitude.toFixed(6)}
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={onClose}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={onSave}>
                <Ionicons name="checkmark" size={22} color="#fff" />
                <Text style={styles.modalSaveBtnText}>Aggiungi</Text>
              </TouchableOpacity>
            </View>
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
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" as const, color: Colors.text, marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginTop: 4 },
  typeChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  typeChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" as const },
  coordPreview: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 12,
  },
  modalActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  modalSaveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 6,
  },
  modalSaveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" as const },
});
