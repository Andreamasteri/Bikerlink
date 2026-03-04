import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface InvitationCode {
  id: string;
  code: string;
  description: string | null;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function InvitationCodesScreen() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<InvitationCode | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMaxUses, setFormMaxUses] = useState("1");
  const [formIsActive, setFormIsActive] = useState(true);

  const { data, isLoading } = useQuery<{ codes: InvitationCode[] }>({
    queryKey: ["/api/admin/invitation-codes"],
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/invitation-codes", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitation-codes"] });
      resetForm();
    },
    onError: (err: any) => Alert.alert("Errore", err.message || "Errore nella creazione"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PUT", `/api/admin/invitation-codes/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitation-codes"] });
      resetForm();
    },
    onError: (err: any) => Alert.alert("Errore", err.message || "Errore nell'aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/invitation-codes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/invitation-codes"] }),
    onError: (err: any) => Alert.alert("Errore", err.message || "Errore nell'eliminazione"),
  });

  const resetForm = () => {
    setShowModal(false);
    setEditingCode(null);
    setFormCode("");
    setFormDescription("");
    setFormMaxUses("1");
    setFormIsActive(true);
  };

  const openEdit = (item: InvitationCode) => {
    setEditingCode(item);
    setFormCode(item.code);
    setFormDescription(item.description || "");
    setFormMaxUses(String(item.maxUses));
    setFormIsActive(item.isActive);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formCode.trim()) {
      Alert.alert("Errore", "Il codice è obbligatorio");
      return;
    }
    const body = {
      code: formCode.trim(),
      description: formDescription.trim() || undefined,
      maxUses: parseInt(formMaxUses) || 1,
      isActive: formIsActive,
    };
    if (editingCode) {
      updateMutation.mutate({ id: editingCode.id, ...body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDelete = (item: InvitationCode) => {
    Alert.alert("Conferma", `Eliminare il codice "${item.code}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
    ]);
  };

  const handleToggleActive = (item: InvitationCode) => {
    updateMutation.mutate({ id: item.id, isActive: !item.isActive });
  };

  const codes = data?.codes || [];

  const renderItem = ({ item }: { item: InvitationCode }) => {
    const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
    const isExhausted = item.currentUses >= item.maxUses;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.codeText}>{item.code}</Text>
          <View style={styles.cardActions}>
            <Pressable onPress={() => handleToggleActive(item)}>
              <Ionicons
                name={item.isActive ? "checkmark-circle" : "close-circle"}
                size={24}
                color={item.isActive ? Colors.success : Colors.error}
              />
            </Pressable>
            <Pressable onPress={() => openEdit(item)}>
              <Ionicons name="create-outline" size={22} color={Colors.accent} />
            </Pressable>
            <Pressable onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={22} color={Colors.accentRed} />
            </Pressable>
          </View>
        </View>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
        <View style={styles.statsRow}>
          <Text style={styles.stat}>Usi: {item.currentUses}/{item.maxUses}</Text>
          {isExpired && <Text style={[styles.stat, { color: Colors.error }]}>Scaduto</Text>}
          {isExhausted && !isExpired && <Text style={[styles.stat, { color: Colors.warning }]}>Esaurito</Text>}
          {!item.isActive && <Text style={[styles.stat, { color: Colors.error }]}>Disattivato</Text>}
        </View>
        <Text style={styles.dateText}>
          Creato: {new Date(item.createdAt).toLocaleDateString("it-IT")}
          {item.expiresAt ? ` | Scade: ${new Date(item.expiresAt).toLocaleDateString("it-IT")}` : ""}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={codes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 80 }]}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun codice invito creato</Text>}
      />

      <Pressable style={[styles.fab, { bottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCode ? "Modifica Codice" : "Nuovo Codice"}</Text>
              <Pressable onPress={resetForm}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Codice *</Text>
            <TextInput
              style={styles.input}
              value={formCode}
              onChangeText={setFormCode}
              placeholder="Es. BIKERLINK2024"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
              editable={!editingCode}
            />

            <Text style={styles.fieldLabel}>Descrizione</Text>
            <TextInput
              style={styles.input}
              value={formDescription}
              onChangeText={setFormDescription}
              placeholder="Descrizione opzionale"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>Utilizzi massimi</Text>
            <TextInput
              style={styles.input}
              value={formMaxUses}
              onChangeText={setFormMaxUses}
              placeholder="1"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />

            <Pressable style={styles.toggleRow} onPress={() => setFormIsActive(!formIsActive)}>
              <Ionicons
                name={formIsActive ? "checkmark-circle" : "close-circle"}
                size={24}
                color={formIsActive ? Colors.success : Colors.error}
              />
              <Text style={styles.toggleLabel}>{formIsActive ? "Attivo" : "Disattivato"}</Text>
            </Pressable>

            <Pressable
              style={styles.saveButton}
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.saveButtonText}>{editingCode ? "Aggiorna" : "Crea"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  list: { padding: 16, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  codeText: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.accent, letterSpacing: 1 },
  cardActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  statsRow: { flexDirection: "row", gap: 12 },
  stat: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, justifyContent: "center", alignItems: "center", elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  toggleLabel: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.text },
  saveButton: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 8 },
  saveButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
