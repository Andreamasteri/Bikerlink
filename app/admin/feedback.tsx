import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STATUS_TABS = [
  { key: "", label: "Tutti" },
  { key: "nuovo", label: "Nuovi" },
  { key: "in_lavorazione", label: "In Lavorazione" },
  { key: "risolto", label: "Risolti" },
  { key: "rifiutato", label: "Rifiutati" },
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  nuovo: { label: "Nuovo", color: Colors.warning },
  in_lavorazione: { label: "In Lavorazione", color: Colors.maleIcon },
  risolto: { label: "Risolto", color: Colors.success },
  rifiutato: { label: "Rifiutato", color: Colors.accentRed },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  bassa: { label: "Bassa", color: Colors.textSecondary },
  media: { label: "Media", color: Colors.warning },
  alta: { label: "Alta", color: Colors.accentRed },
};

export default function AdminFeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [saving, setSaving] = useState(false);

  const queryKey = activeTab ? `/api/admin/feedback?status=${activeTab}` : "/api/admin/feedback";
  const { data, isLoading } = useQuery({ queryKey: [queryKey] });
  const tickets = (data as any)?.tickets || [];

  const openDetail = (ticket: any) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setAdminResponse(ticket.adminResponse || "");
  };

  const saveTicket = async () => {
    if (!selectedTicket) return;
    if ((newStatus === "risolto" || newStatus === "rifiutato") && !adminResponse.trim()) {
      Alert.alert("Attenzione", "Scrivi una risposta per l'utente prima di risolvere/rifiutare");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/admin/feedback/${selectedTicket.id}`, {
        status: newStatus,
        adminResponse: adminResponse.trim() || undefined,
      });
      setSelectedTicket(null);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback/count"] });
      Alert.alert("Salvato", newStatus === "risolto" || newStatus === "rifiutato"
        ? "Ticket aggiornato e notifica inviata all'utente"
        : "Ticket aggiornato"
      );
    } catch {
      Alert.alert("Errore", "Impossibile aggiornare il ticket");
    } finally {
      setSaving(false);
    }
  };

  const renderTicket = ({ item }: { item: any }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.nuovo;
    const priorityCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.media;

    return (
      <Pressable style={styles.card} onPress={() => openDetail(item)}>
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Ionicons
              name={item.type === "bug" ? "bug" : "bulb"}
              size={18}
              color={item.type === "bug" ? Colors.accentRed : Colors.accent}
            />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "25" }]}>
            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.cardBottom}>
          <Text style={styles.cardMeta}>
            {item.user?.nickname} • {item.type === "bug" ? "Bug" : "Richiesta"}
          </Text>
          <View style={styles.priorityDot}>
            <View style={[styles.dot, { backgroundColor: priorityCfg.color }]} />
            <Text style={[styles.priorityLabel, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {new Date(item.createdAt).toLocaleDateString("it-IT")}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {STATUS_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tickets}
          renderItem={renderTicket}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>
                {activeTab === "nuovo" ? "Nessun ticket nuovo" : "Nessun ticket"}
              </Text>
            </View>
          }
          scrollEnabled={tickets.length > 0}
        />
      )}

      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dettaglio Ticket</Text>
              <Pressable onPress={() => setSelectedTicket(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            {selectedTicket && (
              <>
                <View style={styles.detailRow}>
                  <Ionicons
                    name={selectedTicket.type === "bug" ? "bug" : "bulb"}
                    size={20}
                    color={selectedTicket.type === "bug" ? Colors.accentRed : Colors.accent}
                  />
                  <Text style={styles.detailType}>
                    {selectedTicket.type === "bug" ? "Bug Report" : "Richiesta Funzionalità"}
                  </Text>
                </View>

                <Text style={styles.detailTitle}>{selectedTicket.title}</Text>

                <View style={styles.detailMeta}>
                  <Text style={styles.metaItem}>Utente: {selectedTicket.user?.nickname}</Text>
                  <Text style={styles.metaItem}>Email: {selectedTicket.user?.email}</Text>
                  <Text style={styles.metaItem}>
                    Priorità: {PRIORITY_CONFIG[selectedTicket.priority]?.label}
                  </Text>
                  <Text style={styles.metaItem}>
                    Data: {new Date(selectedTicket.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
                  </Text>
                </View>

                <Text style={styles.sectionLabel}>Descrizione</Text>
                <Text style={styles.detailDesc}>{selectedTicket.description}</Text>

                <Text style={styles.sectionLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {(["nuovo", "in_lavorazione", "risolto", "rifiutato"] as const).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <Pressable
                        key={s}
                        style={[styles.statusBtn, newStatus === s && { backgroundColor: cfg.color + "30", borderColor: cfg.color }]}
                        onPress={() => setNewStatus(s)}
                      >
                        <Text style={[styles.statusBtnText, newStatus === s && { color: cfg.color }]}>{cfg.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>Risposta Admin</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={adminResponse}
                  onChangeText={setAdminResponse}
                  placeholder="Scrivi la risposta per l'utente..."
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                {(newStatus === "risolto" || newStatus === "rifiutato") && (
                  <View style={styles.noticeBox}>
                    <Ionicons name="notifications" size={16} color={Colors.warning} />
                    <Text style={styles.noticeText}>
                      L'utente riceverà una notifica con la tua risposta
                    </Text>
                  </View>
                )}

                <Pressable
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={saveTicket}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {newStatus === "risolto" || newStatus === "rifiutato" ? "Salva e Notifica Utente" : "Salva"}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabsScroll: { maxHeight: 52 },
  tabs: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  tabTextActive: { color: "#000" },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTopLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  priorityDot: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  priorityLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalScroll: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  detailType: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  detailMeta: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, gap: 4, marginBottom: 16 },
  metaItem: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },
  detailDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 20, marginBottom: 16 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statusBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  statusBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  input: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  textArea: { minHeight: 80 },
  noticeBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.warning + "15", borderRadius: 10, padding: 12, marginTop: 12 },
  noticeText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.warning, flex: 1 },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 16 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#000" },
});
