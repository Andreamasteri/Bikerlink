import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ClubRequest {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  status: string;
  reviewNote: string | null;
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
  activityScore: number | null;
  createdAt: string;
}

function clubTypeLabel(type: string) {
  if (type === "brand") return "Marca";
  if (type === "model") return "Modello";
  return type;
}

function TypeBadge({ type }: { type: string }) {
  const isBrand = type === "brand";
  return (
    <View style={[styles.typeBadge, { backgroundColor: isBrand ? Colors.accent + "22" : "#7C3AED22" }]}>
      <Text style={[styles.typeBadgeText, { color: isBrand ? Colors.accent : "#7C3AED" }]}>
        {clubTypeLabel(type)}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "pending" ? "#F59E0B" : status === "approved" ? Colors.success : Colors.error;
  const label = status === "pending" ? "In attesa" : status === "approved" ? "Approvata" : "Rifiutata";
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function AdminMotoclubs() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "clubs">("requests");
  const [search, setSearch] = useState("");
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showAllRequests, setShowAllRequests] = useState(false);

  const { data: requests = [], isLoading: loadingReqs } = useQuery<ClubRequest[]>({
    queryKey: ["/api/admin/motoclubs/requests"],
  });

  const { data: clubs = [], isLoading: loadingClubs } = useQuery<Club[]>({
    queryKey: ["/api/admin/motoclubs"],
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const totalMembers = clubs.reduce((sum, c) => sum + c.memberCount, 0);

  const displayedRequests = useMemo(() => {
    let list = showAllRequests ? requests : requests.filter((r) => r.status === "pending");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.brandName?.toLowerCase().includes(q) || r.modelName?.toLowerCase().includes(q));
    }
    return list;
  }, [requests, search, showAllRequests]);

  const displayedClubs = useMemo(() => {
    if (!search.trim()) return clubs;
    const q = search.toLowerCase();
    return clubs.filter((c) => c.name.toLowerCase().includes(q) || c.brandName?.toLowerCase().includes(q) || c.modelName?.toLowerCase().includes(q));
  }, [clubs, search]);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/motoclubs"] }),
    onError: () => Alert.alert("Errore", "Impossibile eliminare il club"),
  });

  function handleApprove(req: ClubRequest) {
    Alert.alert("Approva club", `Approvare "${req.name}"?\n\nVerrà creato un nuovo club e una chat di gruppo dedicata.`, [
      { text: "Annulla", style: "cancel" },
      { text: "Approva", onPress: () => approveMutation.mutate(req.id) },
    ]);
  }

  function handleDelete(club: Club) {
    Alert.alert(
      "Elimina club",
      `Eliminare "${club.name}"?\n\n${club.memberCount} ${club.memberCount === 1 ? "membro verrà rimosso" : "membri verranno rimossi"}. Questa azione è irreversibile.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(club.id) },
      ]
    );
  }

  function renderRequest({ item }: { item: ClubRequest }) {
    const isPending = item.status === "pending";
    return (
      <View style={styles.card}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="shield-outline" size={22} color={Colors.accent} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardName}>{item.name}</Text>
            <StatusBadge status={item.status} />
          </View>
          <View style={styles.cardRow}>
            <TypeBadge type={item.clubType} />
            {(item.brandName || item.modelName) && (
              <Text style={styles.cardSub}>
                {[item.brandName, item.modelName].filter(Boolean).join(" ")}
              </Text>
            )}
          </View>
          <Text style={styles.cardDate}>
            {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>
          {item.reviewNote && (
            <Text style={[styles.cardSub, { color: Colors.error, marginTop: 4 }]}>
              Nota: {item.reviewNote}
            </Text>
          )}
          {isPending && (
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={[styles.actionPill, { backgroundColor: Colors.success }]}
                onPress={() => handleApprove(item)}
                disabled={approveMutation.isPending}
              >
                <MaterialIcons name="check" size={14} color="#fff" />
                <Text style={styles.actionPillText}>Approva</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionPill, { backgroundColor: Colors.error }]}
                onPress={() => { setRejectNote(""); setRejectModal({ id: item.id, name: item.name }); }}
              >
                <MaterialIcons name="close" size={14} color="#fff" />
                <Text style={styles.actionPillText}>Rifiuta</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  function renderClub({ item }: { item: Club }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/admin/motoclub/${item.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.cardIconWrap}>
          <Ionicons name="shield" size={22} color={Colors.accent} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            <TypeBadge type={item.clubType} />
          </View>
          {(item.brandName || item.modelName) && (
            <Text style={styles.cardSub}>
              {[item.brandName, item.modelName].filter(Boolean).join(" ")}
            </Text>
          )}
          <View style={styles.cardRow}>
            <View style={styles.statChip}>
              <Ionicons name="people" size={12} color={Colors.textSecondary} />
              <Text style={styles.statChipText}>{item.memberCount} {item.memberCount === 1 ? "membro" : "membri"}</Text>
            </View>
            {item.activityScore != null && item.activityScore > 0 && (
              <View style={styles.statChip}>
                <Ionicons name="flame" size={12} color="#F59E0B" />
                <Text style={[styles.statChipText, { color: "#F59E0B" }]}>{item.activityScore} pt</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.chevron}>
          <MaterialIcons name="chevron-right" size={22} color={Colors.textSecondary} />
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); handleDelete(item); }}
          style={styles.deleteIconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  const topPad = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Stats header */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{clubs.length}</Text>
          <Text style={styles.statLabel}>Club attivi</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Text style={[styles.statValue, pendingCount > 0 && { color: "#F59E0B" }]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>In attesa</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalMembers}</Text>
          <Text style={styles.statLabel}>Membri totali</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca club..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "requests" && styles.tabBtnActive]}
          onPress={() => setTab("requests")}
        >
          <Text style={[styles.tabBtnText, tab === "requests" && styles.tabBtnTextActive]}>
            Richieste{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "clubs" && styles.tabBtnActive]}
          onPress={() => setTab("clubs")}
        >
          <Text style={[styles.tabBtnText, tab === "clubs" && styles.tabBtnTextActive]}>
            Club ({clubs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Show all / only pending toggle (requests tab only) */}
      {tab === "requests" && (
        <TouchableOpacity style={styles.toggleRow} onPress={() => setShowAllRequests((v) => !v)}>
          <Text style={styles.toggleText}>
            {showAllRequests ? "Mostra solo in attesa" : "Mostra tutte le richieste"}
          </Text>
          <Ionicons name={showAllRequests ? "eye-off-outline" : "eye-outline"} size={16} color={Colors.accent} />
        </TouchableOpacity>
      )}

      <FlatList
        key={tab}
        data={(tab === "requests" ? displayedRequests : displayedClubs) as any[]}
        keyExtractor={(item) => item.id}
        renderItem={(tab === "requests" ? renderRequest : renderClub) as any}
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shield-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>
              {(tab === "requests" ? loadingReqs : loadingClubs)
                ? "Caricamento..."
                : tab === "requests"
                ? "Nessuna richiesta"
                : "Nessun club attivo"}
            </Text>
          </View>
        }
      />

      {/* Reject modal */}
      <Modal visible={!!rejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>Rifiuta "{rejectModal?.name}"</Text>
              <TouchableOpacity onPress={() => setRejectModal(null)}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Indica una motivazione opzionale che verrà registrata nel log.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Motivazione (opzionale)"
              placeholderTextColor={Colors.textSecondary}
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.rejectConfirmBtn, rejectMutation.isPending && { opacity: 0.6 }]}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statBoxMiddle: {},
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabBtnTextActive: { color: "#fff" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.accent,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  actionPillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  statChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chevron: { justifyContent: "center", paddingLeft: 4 },
  deleteIconBtn: { justifyContent: "center", paddingLeft: 8 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, marginRight: 8 },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  modalInput: {
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
  rejectConfirmBtn: { backgroundColor: Colors.error, borderRadius: 12, padding: 16, alignItems: "center" },
  rejectConfirmBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});
