import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Workshop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  isSynecoPartner: boolean;
  isApproved: boolean;
  latitude: number | null;
  longitude: number | null;
}

export default function AdminWorkshops() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");

  const { data: workshops = [], isLoading } = useQuery<Workshop[]>({
    queryKey: ["/api/admin/workshops"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/workshops", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workshops"] });
      setShowModal(false);
      resetForm();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/admin/workshops/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/workshops"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/workshops/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/workshops"] }),
  });

  function resetForm() {
    setFormName("");
    setFormAddress("");
    setFormPhone("");
    setFormEmail("");
  }

  function handleDelete(workshop: Workshop) {
    Alert.alert("Elimina officina", `Eliminare "${workshop.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(workshop.id) },
    ]);
  }

  function renderWorkshop({ item }: { item: Workshop }) {
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          {item.address && <Text style={styles.detail}>{item.address}</Text>}
          {item.phone && <Text style={styles.detail}>{item.phone}</Text>}
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: item.isApproved ? Colors.success + "33" : Colors.warning + "33" }]}>
              <Text style={[styles.badgeText, { color: item.isApproved ? Colors.success : Colors.warning }]}>
                {item.isApproved ? "Approvata" : "In attesa"}
              </Text>
            </View>
            {item.isSynecoPartner && (
              <View style={[styles.badge, { backgroundColor: Colors.accent + "33" }]}>
                <Text style={[styles.badgeText, { color: Colors.accent }]}>Syneco</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.actions}>
          {!item.isApproved && (
            <TouchableOpacity onPress={() => approveMutation.mutate(item.id)}>
              <MaterialIcons name="check-circle" size={24} color={Colors.success} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleDelete(item)}>
            <MaterialIcons name="delete" size={24} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={workshops}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkshop}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, padding: 16 }}
        ListEmptyComponent={
          isLoading
            ? <Text style={styles.emptyText}>Caricamento...</Text>
            : <Text style={styles.emptyText}>Nessuna officina</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <MaterialIcons name="add" size={28} color={Colors.background} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuova Officina</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <KeyboardAwareScrollViewCompat bottomOffset={20} keyboardShouldPersistTaps="handled">
                <TextInput style={styles.input} placeholder="Nome *" placeholderTextColor={Colors.textSecondary} value={formName} onChangeText={setFormName} />
                <TextInput style={styles.input} placeholder="Indirizzo" placeholderTextColor={Colors.textSecondary} value={formAddress} onChangeText={setFormAddress} />
                <TextInput style={styles.input} placeholder="Telefono" placeholderTextColor={Colors.textSecondary} value={formPhone} onChangeText={setFormPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={Colors.textSecondary} value={formEmail} onChangeText={setFormEmail} keyboardType="email-address" />
                <TouchableOpacity
                  style={[styles.submitBtn, !formName && styles.submitBtnDisabled]}
                  disabled={!formName || createMutation.isPending}
                  onPress={() => createMutation.mutate({ name: formName, address: formAddress || undefined, phone: formPhone || undefined, email: formEmail || undefined, isApproved: true, isSynecoPartner: false })}
                >
                  <Text style={styles.submitBtnText}>{createMutation.isPending ? "Salvataggio..." : "Crea Officina"}</Text>
                </TouchableOpacity>
              </KeyboardAwareScrollViewCompat>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  info: { flex: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  detail: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  actions: { flexDirection: "row", gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  fab: {
    position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
});
