import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,

  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

import { formatDeviceInfo, type DeviceInfoPayload } from "@/lib/device-info";

type DeviceInfo = Partial<DeviceInfoPayload>;

interface FeedbackTicket {
  id: string;
  userId: string | null;
  ticketType: string;
  subject: string;
  message: string;
  status: string;
  internalNote: string | null;
  deviceInfo: DeviceInfo | null;
  createdAt: string;
  updatedAt: string;
}

type FilterStatus = "all" | "open" | "in_progress" | "resolved" | "closed";
type FilterType = "all" | "bug" | "feature";

function getStatusFilters(t: (k: string) => string): { key: FilterStatus; label: string }[] {
  return [
    { key: "all", label: t("moderator.statusAll") },
    { key: "open", label: t("moderator.statusOpen") },
    { key: "in_progress", label: t("moderator.statusInProgress") },
    { key: "resolved", label: t("moderator.statusResolved") },
    { key: "closed", label: t("moderator.statusClosed") },
  ];
}

function getTypeFilters(t: (k: string) => string): { key: FilterType; label: string; icon: string }[] {
  return [
    { key: "all", label: t("moderator.typeAll"), icon: "📋" },
    { key: "bug", label: "Bug", icon: "🐛" },
    { key: "feature", label: t("moderator.typeRequests"), icon: "✨" },
  ];
}

function matchesType(ticketType: string, filter: FilterType): boolean {
  if (filter === "all") return true;
  if (filter === "bug") return ticketType === "bug";
  if (filter === "feature") return ticketType === "feature" || ticketType === "feedback";
  return false;
}

const STATUS_COLORS: Record<string, string> = {
  open: Colors.warning,
  in_progress: Colors.accent,
  resolved: Colors.success,
  closed: Colors.textSecondary,
};

const webTopInset = 0;
const webBottomInset = 0;

function TicketCard({ ticket, onOpen }: { ticket: FeedbackTicket; onOpen: (t: FeedbackTicket) => void }) {
  const color = STATUS_COLORS[ticket.status] ?? Colors.textSecondary;
  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpen(ticket)}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.badgeText, { color }]}>{ticket.status.replace("_", " ")}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: Colors.accent + "18" }]}>
          <Text style={[styles.badgeText, { color: Colors.accent }]}>{ticket.ticketType}</Text>
        </View>
      </View>
      <Text style={styles.subject} numberOfLines={1}>{ticket.subject}</Text>
      <Text style={styles.message} numberOfLines={2}>{ticket.message}</Text>
      <Text style={styles.note} numberOfLines={1}>📱 {formatDeviceInfo(ticket.deviceInfo)}</Text>
      {ticket.internalNote ? (
        <Text style={styles.note} numberOfLines={1}>📝 {ticket.internalNote}</Text>
      ) : null}
      <Text style={styles.date}>{new Date(ticket.createdAt).toLocaleDateString("it-IT")}</Text>
    </TouchableOpacity>
  );
}

export default function ModeratorFeedback() {
  const t = useT();
  const STATUS_FILTERS = getStatusFilters(t);
  const TYPE_FILTERS = getTypeFilters(t);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("open");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selected, setSelected] = useState<FeedbackTicket | null>(null);
  const [note, setNote] = useState("");

  const { data: allTickets = [], isLoading } = useQuery<FeedbackTicket[]>({
    queryKey: ["/api/feedback"],
  });

  const tickets = allTickets.filter((t) => {
    const statusOk = filterStatus === "all" || t.status === filterStatus;
    const typeOk = matchesType(t.ticketType, filterType);
    return statusOk && typeOk;
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, internalNote }: { id: string; status?: string; internalNote?: string }) => {
      const body: Partial<{ status: string; internalNote: string }> = {};
      if (status !== undefined) body.status = status;
      if (internalNote !== undefined) body.internalNote = internalNote;
      const res = await apiRequest("PATCH", `/api/feedback/${id}`, body);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      if (selected && selected.id === updated.id) {
        setSelected(updated);
      }
    },
    onError: (err: Error) => {
      Alert.alert("Errore", (err as Error).message);
    },
  });

  function openTicket(t: FeedbackTicket) {
    setSelected(t);
    setNote(t.internalNote ?? "");
  }

  function handleStatusChange(status: string) {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, status });
  }

  function handleSaveNote() {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, internalNote: note });
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset), paddingBottom: webBottomInset }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/moderator")}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bug & Richieste</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filterType === f.key && styles.filterBtnActive]}
            onPress={() => setFilterType(f.key)}
          >
            <Text style={styles.filterIcon}>{f.icon}</Text>
            <Text style={[styles.filterText, filterType === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, { paddingTop: 0 }]}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filterStatus === f.key && styles.filterBtnStatusActive]}
            onPress={() => setFilterStatus(f.key)}
          >
            <Text style={[styles.filterText, filterStatus === f.key && styles.filterTextStatusActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle" size={56} color={Colors.success} />
          <Text style={styles.emptyText}>Nessun ticket</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TicketCard ticket={item} onOpen={openTicket} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>{selected?.subject}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.badge, { backgroundColor: Colors.accent + "18", marginBottom: 12, alignSelf: "flex-start" }]}>
                <Text style={[styles.badgeText, { color: Colors.accent }]}>{selected?.ticketType}</Text>
              </View>

              <Text style={styles.sectionLabel}>Dispositivo</Text>
              <Text style={styles.ticketMessage}>{formatDeviceInfo(selected?.deviceInfo ?? null)}</Text>

              <Text style={styles.sectionLabel}>Messaggio</Text>
              <Text style={styles.ticketMessage}>{selected?.message}</Text>

              <Text style={styles.sectionLabel}>Cambia stato</Text>
              <View style={styles.statusRow}>
                {["open", "in_progress", "resolved", "closed"].map((s) => {
                  const color = STATUS_COLORS[s] ?? Colors.textSecondary;
                  const active = selected?.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusBtn, { borderColor: color, backgroundColor: active ? color + "22" : "transparent" }]}
                      onPress={() => handleStatusChange(s)}
                      disabled={updateMutation.isPending}
                    >
                      <Text style={[styles.statusBtnText, { color }]}>{s.replace("_", " ")}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Nota interna</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={note}
                onChangeText={setNote}
                placeholder={t("moderator.addPrivateNote")}
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
              <TouchableOpacity
                style={[styles.saveBtn, updateMutation.isPending && { opacity: 0.5 }]}
                onPress={handleSaveNote}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Salva nota</Text>
                }
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  filters: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: {
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent,
  },
  filterBtnStatusActive: {
    backgroundColor: Colors.warning + "22",
    borderColor: Colors.warning,
  },
  filterIcon: { fontSize: 14 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  filterTextStatusActive: { color: Colors.warning },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    marginBottom: 4,
  },
  cardHeader: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  subject: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  message: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  note: { fontSize: 12, color: Colors.accent, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  date: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 8, marginTop: 16, textTransform: "uppercase" },
  ticketMessage: { fontSize: 14, color: Colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  statusBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
