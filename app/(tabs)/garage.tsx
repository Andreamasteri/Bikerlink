import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MOTO_TYPES = [
  { value: "sportiva", label: "Sportiva" },
  { value: "supersportiva", label: "Supersportiva" },
  { value: "custom", label: "Custom" },
  { value: "harley", label: "Harley" },
  { value: "touring", label: "Touring" },
  { value: "naked", label: "Naked" },
  { value: "enduro", label: "Enduro" },
  { value: "altro", label: "Altro" },
] as const;

const RIDING_STYLES = [
  { value: "passeggio", label: "Passeggio" },
  { value: "tranquilla", label: "Tranquilla" },
  { value: "allegra", label: "Allegra" },
  { value: "mozzafiato", label: "Mozzafiato" },
] as const;

export default function GarageScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", motorcycleType: "", ridingStyle: "", isDefault: false });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/garage"],
  });

  const motorcycles = (data as any)?.motorcycles || [];

  const saveMutation = useMutation({
    mutationFn: async (motoData: any) => {
      if (editingId) {
        await apiRequest("PUT", `/api/garage/${editingId}`, motoData);
      } else {
        await apiRequest("POST", "/api/garage", motoData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/garage"] });
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Errore nel salvataggio");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/garage/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/garage"] });
    },
  });

  const resetForm = () => {
    setForm({ name: "", motorcycleType: "", ridingStyle: "", isDefault: false });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (moto: any) => {
    setEditingId(moto.id);
    setForm({
      name: moto.name,
      motorcycleType: moto.motorcycleType,
      ridingStyle: moto.ridingStyle,
      isDefault: moto.isDefault,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name || !form.motorcycleType || !form.ridingStyle) {
      Alert.alert("Errore", "Compila tutti i campi");
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (id: string, name: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Eliminare "${name}"?`)) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert("Elimina Moto", `Eliminare "${name}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable style={[styles.optionBtn, selected && styles.optionBtnSelected]} onPress={onPress}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  const getMotoTypeLabel = (v: string) => MOTO_TYPES.find(t => t.value === v)?.label || v;
  const getStyleLabel = (v: string) => RIDING_STYLES.find(t => t.value === v)?.label || v;

  const renderMoto = ({ item }: { item: any }) => (
    <Pressable style={styles.card} onPress={() => openEdit(item)}>
      <View style={styles.cardHeader}>
        <Ionicons name="bicycle" size={28} color={Colors.accent} />
        <View style={styles.cardInfo}>
          <Text style={styles.motoName}>{item.name}</Text>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Predefinita</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => handleDelete(item.id, item.name)} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
        </Pressable>
      </View>
      <View style={styles.cardDetails}>
        <View style={styles.detailChip}>
          <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailText}>{getMotoTypeLabel(item.motorcycleType)}</Text>
        </View>
        <View style={styles.detailChip}>
          <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailText}>{getStyleLabel(item.ridingStyle)}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={motorcycles}
          renderItem={renderMoto}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bicycle" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna moto nel garage</Text>
              <Text style={styles.emptySubtext}>Aggiungi la tua prima moto!</Text>
            </View>
          }
          scrollEnabled={motorcycles.length > 0}
        />
      )}

      <Pressable style={[styles.fab, { bottom: Platform.OS === "web" ? 50 : 16 }]} onPress={openAdd}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setShowForm(false); resetForm(); }}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? "Modifica Moto" : "Aggiungi Moto"}</Text>
                <Pressable onPress={() => { setShowForm(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <Text style={styles.label}>Nome *</Text>
              <TextInput
                style={styles.input}
                placeholder='es. "La mia Ducati"'
                placeholderTextColor={Colors.textSecondary}
                value={form.name}
                onChangeText={(v) => setForm(p => ({ ...p, name: v }))}
              />

              <Text style={styles.label}>Tipo Moto *</Text>
              <View style={styles.optionRow}>
                {MOTO_TYPES.map(t => (
                  <OptionButton key={t.value} label={t.label} selected={form.motorcycleType === t.value} onPress={() => setForm(p => ({ ...p, motorcycleType: t.value }))} />
                ))}
              </View>

              <Text style={styles.label}>Stile Guida *</Text>
              <View style={styles.optionRow}>
                {RIDING_STYLES.map(s => (
                  <OptionButton key={s.value} label={s.label} selected={form.ridingStyle === s.value} onPress={() => setForm(p => ({ ...p, ridingStyle: s.value }))} />
                ))}
              </View>

              <Pressable style={styles.defaultRow} onPress={() => setForm(p => ({ ...p, isDefault: !p.isDefault }))}>
                <View style={[styles.checkbox, form.isDefault && styles.checkboxChecked]}>
                  {form.isDefault && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.defaultLabel}>Moto predefinita</Text>
              </Pressable>

              <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingId ? "Salva Modifiche" : "Aggiungi al Garage"}</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardInfo: { flex: 1 },
  motoName: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  defaultBadge: { backgroundColor: Colors.accent + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
  defaultBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
  cardDetails: { flexDirection: "row", gap: 12, marginTop: 12 },
  detailChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  optionBtnSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  optionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  optionTextSelected: { color: Colors.accent },
  defaultRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: Colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  checkmark: { color: Colors.accent, fontSize: 16, fontFamily: "Inter_700Bold" },
  defaultLabel: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
