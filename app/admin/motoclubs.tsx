import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ClubRequest {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  status: string;
  createdAt: string;
}

interface Club {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  memberCount: number;
  createdAt: string;
}

export default function AdminMotoclubs() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"requests" | "clubs">("requests");
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: requests = [], isLoading: loadingReqs } = useQuery<ClubRequest[]>({
    queryKey: ["/api/admin/motoclubs/requests"],
  });

  const { data: clubs = [], isLoading: loadingClubs } = useQuery<Club[]>({
    queryKey: ["/api/admin/motoclubs"],
  });

  const pendingRequests = requests.filter((r) => r.status === "pending");

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/motoclubs/requests/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile approvare la richiesta"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/admin/motoclubs/requests/${id}/reject`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs/requests"] });
      setRejectModal(null);
      setRejectNote("");
    },
    onError: () => Alert.alert("Errore", "Impossibile rifiutare la richiesta"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/motoclubs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il club"),
  });

  function handleApprove(req: ClubRequest) {
    Alert.alert("Approva club", `Approvare "${req.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Approva", onPress: () => approveMutation.mutate(req.id) },
    ]);
  }

  function handleRejectOpen(req: ClubRequest) {
    setRejectNote("");
    setRejectModal({ id: req.id, name: req.name });
  }

  function handleDelete(club: Club) {
    Alert.alert("Elimina club", `Eliminare "${club.name}" e tutti i suoi membri?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(club.id) },
    ]);
  }

  function clubTypeLabel(type: string) {
    if (type === "brand") return "Marca";
    if (type === "model") return "Modello";
    return type;
  }

  function renderRequest({ item }: { item: ClubRequest }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-outline" size={20} color={Colors.accent} />
          </View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>
            {clubTypeLabel(item.clubType)}
            {item.brandName ? ` · ${item.brandName}` : ""}
            {item.modelName ? ` ${item.modelName}` : ""}
          </Text>
          <Text style={styles.cardDate}>
            {new Date(item.createdAt).toLocaleDateString("it-IT")}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => handleApprove(item)}
            disabled={approveMutation.isPending}
          >
            <MaterialIcons name="check" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => handleRejectOpen(item)}
          >
            <MaterialIcons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderClub({ item }: { item: Club }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield" size={20} color={Colors.accent} />
          </View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>
            {clubTypeLabel(item.clubType)}
            {item.brandName ? ` · ${item.brandName}` : ""}
            {item.modelName ? ` ${item.modelName}` : ""}
          </Text>
          <Text style={styles.cardSub}>
            {item.memberCount} {item.memberCount === 1 ? "membro" : "membri"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          disabled={deleteMutation.isPending}
          style={styles.deleteBtn}
        >
          <MaterialIcons name="delete-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
      </View>
    );
  }

  const isLoadingCurrent = tab === "requests" ? loadingReqs : loadingClubs;
  const listData: any[] = tab === "requests" ? pendingRequests : clubs;
  const emptyText =
    tab === "requests" ? "Nessuna richiesta in attesa" : "Nessun club attivo";

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "requests" && styles.tabBtnActive]}
          onPress={() => setTab("requests")}
        >
          <Text style={[styles.tabBtnText, tab === "requests" && styles.tabBtnTextActive]}>
            Richieste{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "clubs" && styles.tabBtnActive]}
          onPress={() => setTab("clubs")}
        >
          <Text style={[styles.tabBtnText, tab === "clubs" && styles.tabBtnTextActive]}>
            Club Attivi{clubs.length > 0 ? ` (${clubs.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        key={tab}
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={tab === "requests" ? renderRequest : renderClub}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isLoadingCurrent ? "Caricamento..." : emptyText}
          </Text>
        }
      />

      <Modal visible={!!rejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rifiuta "{rejectModal?.name}"</Text>
              <TouchableOpacity onPress={() => setRejectModal(null)}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Motivazione (opzionale)"
              placeholderTextColor={Colors.textSecondary}
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={styles.rejectConfirmBtn}
              onPress={() => rejectMutation.mutate({ id: rejectModal!.id, note: rejectNote })}
              disabled={rejectMutation.isPending}
            >
              <Text style={styles.rejectConfirmBtnText}>
                {rejectMutation.isPending ? "Rifiuto in corso..." : "Conferma Rifiuto"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

import { Platform } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tabBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLeft: {
    marginRight: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.error },
  deleteBtn: {
    padding: 6,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 48,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  rejectConfirmBtn: {
    backgroundColor: Colors.error,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  rejectConfirmBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
