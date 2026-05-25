import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { AdminUser } from "./UserCard";

interface UserEditModalProps {
  visible: boolean;
  onClose: () => void;
  user: AdminUser | null;
  editEmail: string;
  setEditEmail: (email: string) => void;
  editPassword: string;
  setEditPassword: (password: string) => void;
  onSaveEmail: () => void;
  onSavePassword: () => void;
  onStatusChange: (user: AdminUser) => void;
  onMakeModerator: (user: AdminUser) => void;
  onDeleteUser: (user: AdminUser) => void;
  getStatusColor: (status: string) => string;
}

export const UserEditModal: React.FC<UserEditModalProps> = ({
  visible,
  onClose,
  user,
  editEmail,
  setEditEmail,
  editPassword,
  setEditPassword,
  onSaveEmail,
  onSavePassword,
  onStatusChange,
  onMakeModerator,
  onDeleteUser,
  getStatusColor,
}) => {
  const mapTesterMutation = useMutation({
    mutationFn: async (vars: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/maps/users/${vars.id}/map-tester`, { enabled: vars.enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare flag Map Tester"),
  });

  if (!user) return null;
  const mapTesterValue = !!(user as AdminUser & { mapTester?: boolean }).mapTester;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Gestisci Utente</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Modifica Email</Text>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={onSaveEmail}>
                <Text style={styles.saveBtnText}>Salva</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Reimposta Password</Text>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={editPassword}
                onChangeText={setEditPassword}
                placeholder="Nuova password"
                secureTextEntry
              />
              <TouchableOpacity style={styles.saveBtn} onPress={onSavePassword}>
                <Text style={styles.saveBtnText}>Cambia</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.infoSection, { marginTop: 24 }]}>
              <Text style={styles.infoLabel}>Stato Attuale</Text>
              <Text style={[styles.infoValue, { color: getStatusColor(user.status) }]}>
                {user.status}
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>Tipo</Text>
              <Text style={styles.infoValue}>{user.userType}</Text>
            </View>

            <View style={[styles.infoSection, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.infoLabel}>Map Tester</Text>
                <Text style={[styles.infoValue, { fontSize: 12 }]}>Accesso ai renderer/routing sperimentali quando rollout = &quot;tester&quot;.</Text>
              </View>
              <Switch
                value={mapTesterValue}
                disabled={mapTesterMutation.isPending}
                onValueChange={(v) => mapTesterMutation.mutate({ id: user.id, enabled: v })}
              />
            </View>

            <View style={styles.quickActions}>
              {user.role === "user" && (
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={() => {
                    onClose();
                    onMakeModerator(user);
                  }}
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={Colors.maleIcon} />
                  <Text style={styles.quickActionText}>Rendi Moderatore</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => {
                  onClose();
                  onStatusChange(user);
                }}
              >
                <Ionicons name="ban-outline" size={20} color={Colors.warning} />
                <Text style={styles.quickActionText}>Cambia Stato</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickActionBtn, { borderColor: Colors.error }]}
                onPress={() => {
                  onClose();
                  onDeleteUser(user);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
                <Text style={[styles.quickActionText, { color: Colors.error }]}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  modalBody: {
    gap: 4,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#0D0D0D",
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginTop: 4,
  },
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.text,
    textAlign: "center" as const,
  },
});
