import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, ScrollView, Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface EasterEgg {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  points: number;
  isActive: boolean;
}

export default function AdminEasterEggs() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [editingEgg, setEditingEgg] = useState<EasterEgg | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formRadius, setFormRadius] = useState("100");
  const [formPoints, setFormPoints] = useState("10");

  const { data: eggs = [], isLoading } = useQuery<EasterEgg[]>({
    queryKey: ["/api/admin/easter-eggs"],
  });

  const { data: statsMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/easter-eggs-stats"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/easter-eggs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/easter-eggs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
      closeModal();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/easter-eggs/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/easter-eggs/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] }),
  });

  function closeModal() {
    setShowModal(false);
    setEditingEgg(null);
    setFormName("");
    setFormDescription("");
    setFormLat("");
    setFormLng("");
    setFormRadius("100");
    setFormPoints("10");
  }

  function openCreate() {
    setEditingEgg(null);
    setFormName("");
    setFormDescription("");
    setFormLat("");
    setFormLng("");
    setFormRadius("100");
    setFormPoints("10");
    setShowModal(true);
  }

  function openEdit(egg: EasterEgg) {
    setEditingEgg(egg);
    setFormName(egg.name);
    setFormDescription(egg.description || "");
    setFormLat(String(egg.latitude));
    setFormLng(String(egg.longitude));
    setFormRadius(String(egg.radius));
    setFormPoints(String(egg.points));
    setShowModal(true);
  }

  function handleSubmit() {
    const payload = {
      name: formName,
      description: formDescription || undefined,
      latitude: parseFloat(formLat),
      longitude: parseFloat(formLng),
      radius: parseInt(formRadius) || 100,
      points: parseInt(formPoints) || 10,
    };

    if (editingEgg) {
      updateMutation.mutate({ id: editingEgg.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(egg: EasterEgg) {
    Alert.alert("Elimina Easter Egg", `Eliminare "${egg.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(egg.id) },
    ]);
  }

  const activeCount = eggs.filter((e) => e.isActive).length;
  const totalCollections = Object.values(statsMap).reduce((sum, c) => sum + c, 0);
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = formName && formLat && formLng && parseFloat(formLat) && parseFloat(formLng);

  function renderEgg({ item }: { item: EasterEgg }) {
    const collections = (statsMap as Record<string, number>)[item.id] || 0;
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Ionicons name="gift" size={18} color="#FFD700" />
            <Text style={styles.name}>{item.name}</Text>
          </View>
          {item.description && <Text style={styles.detail}>{item.description}</Text>}
          <Text style={styles.coords}>
            {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} | r:{item.radius}m | {item.points} pts
          </Text>
          <View style={styles.statsRow}>
            <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.success + "33" : Colors.accentRed + "33" }]}>
              <Text style={[styles.badgeText, { color: item.isActive ? Colors.success : Colors.accentRed }]}>
                {item.isActive ? "Attivo" : "Disattivo"}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
              <Ionicons name="people" size={11} color={Colors.accent} />
              <Text style={[styles.badgeText, { color: Colors.accent }]}> {collections} raccolte</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => openEdit(item)}>
            <Ionicons name="create-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}>
            <Ionicons name={item.isActive ? "eye-off-outline" : "eye-outline"} size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={22} color={Colors.accentRed} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{eggs.length}</Text>
          <Text style={styles.summaryLabel}>Totali</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: Colors.success }]}>{activeCount}</Text>
          <Text style={styles.summaryLabel}>Attivi</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: Colors.accent }]}>{totalCollections}</Text>
          <Text style={styles.summaryLabel}>Raccolte</Text>
        </View>
      </View>

      <FlatList
        data={eggs}
        keyExtractor={(item) => item.id}
        renderItem={renderEgg}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingHorizontal: 16 }}
        ListEmptyComponent={
          isLoading ? (
            <Text style={styles.emptyText}>Caricamento...</Text>
          ) : (
            <Text style={styles.emptyText}>Nessun Easter Egg creato</Text>
          )
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingEgg ? "Modifica Easter Egg" : "Nuovo Easter Egg"}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TextInput
                style={styles.input}
                placeholder="Nome *"
                placeholderTextColor={Colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
              />
              <TextInput
                style={styles.input}
                placeholder="Descrizione"
                placeholderTextColor={Colors.textSecondary}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Latitudine *"
                  placeholderTextColor={Colors.textSecondary}
                  value={formLat}
                  onChangeText={setFormLat}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Longitudine *"
                  placeholderTextColor={Colors.textSecondary}
                  value={formLng}
                  onChangeText={setFormLng}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Raggio (m)"
                  placeholderTextColor={Colors.textSecondary}
                  value={formRadius}
                  onChangeText={setFormRadius}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Punti"
                  placeholderTextColor={Colors.textSecondary}
                  value={formPoints}
                  onChangeText={setFormPoints}
                  keyboardType="numeric"
                />
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                disabled={!canSubmit || isPending}
                onPress={handleSubmit}
              >
                <Text style={styles.submitBtnText}>
                  {isPending ? "Salvataggio..." : editingEgg ? "Salva Modifiche" : "Crea Easter Egg"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryNumber: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
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
  info: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  detail: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  coords: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  actions: { flexDirection: "column", gap: 14, marginLeft: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: "row", gap: 12 },
  halfInput: { flex: 1 },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
});
