import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, ScrollView } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Campaign {
  id: string;
  name: string;
  sponsor: string;
  imageUrl: string | null;
  linkUrl: string | null;
  displayMode: string;
  description: string | null;
  isActive: boolean;
  impressions: number;
}

export default function AdminAds() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSponsor, setFormSponsor] = useState("Syneco Lubrificanti");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formLinkUrl, setFormLinkUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDisplayMode, setFormDisplayMode] = useState("banner");

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/campaigns"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/campaigns", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      setShowModal(false);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/campaigns/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/campaigns/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] }),
  });

  function resetForm() {
    setFormName(""); setFormSponsor("Syneco Lubrificanti"); setFormImageUrl(""); setFormLinkUrl(""); setFormDescription(""); setFormDisplayMode("banner");
  }

  function handleDelete(campaign: Campaign) {
    Alert.alert("Elimina campagna", `Eliminare "${campaign.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(campaign.id) },
    ]);
  }

  function renderCampaign({ item }: { item: Campaign }) {
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.detail}>{item.sponsor} | {item.displayMode}</Text>
          <Text style={styles.stats}>Impressioni: {item.impressions}</Text>
          <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.dark.success + "33" : Colors.dark.error + "33" }]}>
            <Text style={[styles.badgeText, { color: item.isActive ? Colors.dark.success : Colors.dark.error }]}>
              {item.isActive ? "Attiva" : "Disattiva"}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}>
            <MaterialIcons name={item.isActive ? "pause" : "play-arrow"} size={24} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)}>
            <MaterialIcons name="delete" size={24} color={Colors.dark.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const displayModes = ["banner", "carousel", "card", "fullscreen"];

  return (
    <View style={styles.container}>
      <FlatList
        data={campaigns}
        keyExtractor={(item) => item.id}
        renderItem={renderCampaign}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, padding: 16 }}
        ListEmptyComponent={
          isLoading ? <Text style={styles.emptyText}>Caricamento...</Text> : <Text style={styles.emptyText}>Nessuna campagna</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <MaterialIcons name="add" size={28} color={Colors.dark.background} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuova Campagna</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.dark.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TextInput style={styles.input} placeholder="Nome campagna *" placeholderTextColor={Colors.dark.textMuted} value={formName} onChangeText={setFormName} />
              <TextInput style={styles.input} placeholder="Sponsor" placeholderTextColor={Colors.dark.textMuted} value={formSponsor} onChangeText={setFormSponsor} />
              <TextInput style={styles.input} placeholder="URL Immagine" placeholderTextColor={Colors.dark.textMuted} value={formImageUrl} onChangeText={setFormImageUrl} />
              <TextInput style={styles.input} placeholder="URL Link" placeholderTextColor={Colors.dark.textMuted} value={formLinkUrl} onChangeText={setFormLinkUrl} />
              <TextInput style={styles.input} placeholder="Descrizione" placeholderTextColor={Colors.dark.textMuted} value={formDescription} onChangeText={setFormDescription} multiline />
              <Text style={styles.label}>Modalita display:</Text>
              <View style={styles.modeRow}>
                {displayModes.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modeBtn, formDisplayMode === mode && styles.modeBtnActive]}
                    onPress={() => setFormDisplayMode(mode)}
                  >
                    <Text style={[styles.modeBtnText, formDisplayMode === mode && styles.modeBtnTextActive]}>{mode}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, !formName && styles.submitBtnDisabled]}
                disabled={!formName || createMutation.isPending}
                onPress={() => createMutation.mutate({
                  name: formName, sponsor: formSponsor, imageUrl: formImageUrl || undefined,
                  linkUrl: formLinkUrl || undefined, description: formDescription || undefined,
                  displayMode: formDisplayMode,
                })}
              >
                <Text style={styles.submitBtnText}>{createMutation.isPending ? "Salvataggio..." : "Crea Campagna"}</Text>
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
  stats: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.dark.accent, marginTop: 4 },
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
  modalContent: { backgroundColor: Colors.dark.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.dark.text },
  input: {
    backgroundColor: Colors.dark.background, borderRadius: 12, padding: 14, marginBottom: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.dark.text, borderWidth: 1, borderColor: Colors.dark.border,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.dark.textSecondary, marginBottom: 8 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.dark.background, borderWidth: 1, borderColor: Colors.dark.border },
  modeBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accent + "22" },
  modeBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.dark.textSecondary },
  modeBtnTextActive: { color: Colors.dark.accent },
  submitBtn: { backgroundColor: Colors.dark.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.dark.background },
});
