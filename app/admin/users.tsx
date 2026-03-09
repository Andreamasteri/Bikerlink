import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  userType: string;
  role: string;
  status: string;
  createdAt: string;
  isFake?: boolean;
}

export default function AdminUsers() {
  const rawInsets = useSafeAreaInsets();
  const insets = Platform.OS === "web"
    ? { top: 67, bottom: 34, left: rawInsets.left, right: rawInsets.right }
    : rawInsets;

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [searchText, setSearchText] = useState("");
  const [hideFake, setHideFake] = useState(false);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const emailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/email`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      Alert.alert("Successo", "Email aggiornata");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'email"),
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
      return res.json();
    },
    onSuccess: () => {
      Alert.alert("Successo", "Password aggiornata");
      setEditPassword("");
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare la password"),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      Alert.alert("Successo", "Profilo eliminato");
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il profilo"),
  });

  const filteredUsers = users.filter((u) => {
    if (hideFake && u.isFake === true) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return u.nickname.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  function openEditModal(user: AdminUser) {
    setSelectedUser(user);
    setEditEmail(user.email);
    setEditPassword("");
    setEditModalVisible(true);
  }

  function handleSaveEmail() {
    if (!selectedUser) return;
    if (!editEmail || !editEmail.includes("@")) {
      Alert.alert("Errore", "Inserisci un'email valida");
      return;
    }
    emailMutation.mutate({ id: selectedUser.id, email: editEmail });
  }

  function handleSavePassword() {
    if (!selectedUser) return;
    if (!editPassword || editPassword.length < 6) {
      Alert.alert("Errore", "La password deve avere almeno 6 caratteri");
      return;
    }
    passwordMutation.mutate({ id: selectedUser.id, password: editPassword });
  }

  function handleStatusChange(user: AdminUser) {
    const options = ["active", "suspended", "blocked"].filter((s) => s !== user.status);
    Alert.alert("Cambia stato", `Utente: ${user.nickname}`, [
      ...options.map((status) => ({
        text: status.charAt(0).toUpperCase() + status.slice(1),
        onPress: () => statusMutation.mutate({ id: user.id, status }),
      })),
      { text: "Annulla", style: "cancel" as const },
    ]);
  }

  function handleMakeModerator(user: AdminUser) {
    Alert.alert(
      "Rendi Moderatore",
      `Vuoi rendere ${user.nickname} un moderatore?`,
      [
        { text: "Annulla", style: "cancel" as const },
        {
          text: "Conferma",
          onPress: () => roleMutation.mutate({ id: user.id, role: "moderator" }),
        },
      ]
    );
  }

  function handleDeleteUser(user: AdminUser) {
    Alert.alert(
      "Elimina profilo",
      `Sei sicuro di voler eliminare il profilo di ${user.nickname}?`,
      [
        { text: "Annulla", style: "cancel" as const },
        {
          text: "Elimina",
          style: "destructive" as const,
          onPress: () => {
            Alert.alert(
              "Conferma eliminazione",
              "Questa azione è irreversibile. Procedere?",
              [
                { text: "Annulla", style: "cancel" as const },
                {
                  text: "Elimina definitivamente",
                  style: "destructive" as const,
                  onPress: () => deleteMutation.mutate({ id: user.id }),
                },
              ]
            );
          },
        },
      ]
    );
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active": return Colors.success;
      case "suspended": return Colors.warning;
      case "blocked": return Colors.error;
      default: return Colors.textSecondary;
    }
  }

  function getRoleColor(role: string) {
    switch (role) {
      case "admin": return Colors.accent;
      case "moderator": return Colors.maleIcon;
      default: return Colors.textSecondary;
    }
  }

  function renderUser({ item }: { item: AdminUser }) {
    return (
      <View style={styles.card}>
        <View style={styles.userInfo}>
          {item.isFake === true && (
            <Text style={{ fontSize: 10, fontWeight: "bold" as const, color: "#FF00FF" }}>FAKE</Text>
          )}
          <Text style={styles.nickname}>{item.nickname}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
              <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getRoleColor(item.role) + "33" }]}>
              <Text style={[styles.badgeText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.surfaceLight }]}>
              <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{item.userType}</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleStatusChange(item)} style={styles.actionBtn}>
            <Ionicons name="ban-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          {item.role === "user" && (
            <TouchableOpacity onPress={() => handleMakeModerator(item)} style={styles.actionBtn}>
              <Ionicons name="shield-checkmark-outline" size={22} color={Colors.maleIcon} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleDeleteUser(item)} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={[styles.searchContainer, { flex: 1, margin: 0 }]}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca per nickname o email..."
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={setSearchText}
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.fakeToggle, hideFake && { backgroundColor: "#FF00FF33", borderColor: "#FF00FF" }]}
          onPress={() => setHideFake(!hideFake)}
        >
          <Text style={[styles.fakeToggleText, hideFake && { color: "#FF00FF" }]}>
            {hideFake ? "Mostra fake" : "Nascondi fake"}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente</Text>}
        />
      )}

      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Modifica: {selectedUser?.nickname}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email"
                  placeholderTextColor="#666"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveEmail}
                  disabled={emailMutation.isPending}
                >
                  <Text style={styles.saveBtnText}>
                    {emailMutation.isPending ? "..." : "Salva"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Nuova Password</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder="Min. 6 caratteri"
                  placeholderTextColor="#666"
                  secureTextEntry
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSavePassword}
                  disabled={passwordMutation.isPending}
                >
                  <Text style={styles.saveBtnText}>
                    {passwordMutation.isPending ? "..." : "Imposta"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Ruolo attuale</Text>
                <Text style={[styles.infoValue, { color: getRoleColor(selectedUser?.role || "") }]}>
                  {selectedUser?.role}
                </Text>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Stato attuale</Text>
                <Text style={[styles.infoValue, { color: getStatusColor(selectedUser?.status || "") }]}>
                  {selectedUser?.status}
                </Text>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Tipo</Text>
                <Text style={styles.infoValue}>{selectedUser?.userType}</Text>
              </View>

              <View style={styles.quickActions}>
                {selectedUser?.role === "user" && (
                  <TouchableOpacity
                    style={styles.quickActionBtn}
                    onPress={() => { setEditModalVisible(false); if (selectedUser) handleMakeModerator(selectedUser); }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={20} color={Colors.maleIcon} />
                    <Text style={styles.quickActionText}>Rendi Moderatore</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={() => { setEditModalVisible(false); if (selectedUser) handleStatusChange(selectedUser); }}
                >
                  <Ionicons name="ban-outline" size={20} color={Colors.warning} />
                  <Text style={styles.quickActionText}>Cambia Stato</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: Colors.error }]}
                  onPress={() => { setEditModalVisible(false); if (selectedUser) handleDeleteUser(selectedUser); }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.quickActionText, { color: Colors.error }]}>Elimina</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  fakeToggle: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fakeToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userInfo: { flex: 1 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  email: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  actions: { flexDirection: "column", gap: 10 },
  actionBtn: { padding: 4 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
});
