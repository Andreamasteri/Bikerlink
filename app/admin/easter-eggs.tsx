import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, ScrollView } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
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
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formRadius, setFormRadius] = useState("100");
  const [formPoints, setFormPoints] = useState("10");

  const { data: eggs = [], isLoading } = useQuery<EasterEgg[]>({
    queryKey: ["/api/admin/easter-eggs"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/easter-eggs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/easter-eggs"] });
      setShowModal(false);
      resetForm();
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

  function resetForm() {
    setFormName(""); setFormDescription(""); setFormLat(""); setFormLng(""); setFormRadius("100"); setFormPoints("10");
  }

  function handleDelete(egg: EasterEgg) {
    Alert.alert("Elimina Easter Egg", `Eliminare "${egg.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(egg.id) },
    ]);
  }

  function renderEgg({ item }: { item: EasterEgg }) {
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description && <Text style={styles.detail}>{item.description}</Text>}
          <Text style={styles.coords}>{item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} | r:{item.radius}m | pts:{item.points}</Text>
          <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.dark.success + "33" : Colors.dark.error + "33" }]}>
            <Text style={[styles.badgeText, { color: item.isActive ? Colors.dark.success : Colors.dark.error }]}>
              {item.isActive ? "Attivo" : "Disattivo"}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}>
            <MaterialIcons name={item.isActive ? "visibility-off" : "visibility"} size={22} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)}>
            <MaterialIcons name="delete" size={22} color={Colors.dark.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const canSubmit = formName && formLat && formLng && parseFloat(formLat) && parseFloat(formLng);

  return (
    <View style={styles.container}>
      <FlatList
        data={eggs}
        keyExtractor={(item) => item.id}
        renderItem={renderEgg}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, padding: 16 }}
        ListEmptyComponent={
          isLoading ? <Text style={styles.emptyText}>Caricamento...</Text> : <Text style={styles.emptyText}>Nessun Easter Egg</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <MaterialIcons name="add" size={28} color={Colors.dark.background} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuovo Easter Egg</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.dark.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TextInput style={styles.input} placeholder="Nome *" placeholderTextColor={Colors.dark.textMuted} value={formName} onChangeText={setFormName} />
              <TextInput style={styles.input} placeholder="Descrizione" placeholderTextColor={Colors.dark.textMuted} value={formDescription} onChangeText={setFormDescription} multiline />
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Latitudine *" placeholderTextColor={Colors.dark.textMuted} value={formLat} onChangeText={setFormLat} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Longitudine *" placeholderTextColor={Colors.dark.textMuted} value={formLng} onChangeText={setFormLng} keyboardType="decimal-pad" />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Raggio (m)" placeholderTextColor={Colors.dark.textMuted} value={formRadius} onChangeText={setFormRadius} keyboardType="numeric" />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Punti" placeholderTextColor={Colors.dark.textMuted} value={formPoints} onChangeText={setFormPoints} keyboardType="numeric" />
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                disabled={!canSubmit || createMutation.isPending}
                onPress={() => createMutation.mutate({
                  name: formName, description: formDescription || undefined,
                  latitude: parseFloat(formLat), longitude: parseFloat(formLng),
                  radius: parseInt(formRadius) || 100, points: parseInt(formPoints) || 10,
                })}
              >
                <Text style={styles.submitBtnText}>{createMutation.isPending ? "Salvataggio..." : "Crea Easter Egg"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.dark.border,
  },
  info: { flex: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.dark.text },
  detail: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },
  coords: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.dark.textMuted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start", marginTop: 6 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  actions: { flexDirection: "row", gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", marginTop: 40 },
  fab: {
    position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.dark.accent, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.dark.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.dark.text },
  input: {
    backgroundColor: Colors.dark.background, borderRadius: 12, padding: 14, marginBottom: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.dark.text, borderWidth: 1, borderColor: Colors.dark.border,
  },
  row: { flexDirection: "row", gap: 12 },
  halfInput: { flex: 1 },
  submitBtn: { backgroundColor: Colors.dark.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.dark.background },
});
