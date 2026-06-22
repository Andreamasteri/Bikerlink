import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,

  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import type { EventDTO, EventStatus } from "@/shared/event-types";
import { useT } from "@/lib/language-context";
import { EventAdminCard } from "./eventi.part2";
import { styles } from "@/components/admin/eventi.styles";

function getStatusLabels(t: (k: string) => string): Record<EventStatus, string> {
  return {
    pending: t("admin.pendingStatus"),
    approved: t("admin.approvedStatuses"),
    rejected: t("admin.rejectedStatuses"),
    cancelled: t("events.cancelled"),
  };
}

function _formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function _resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${getApiUrl()}${imageUrl}`;
}


const _card = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  pressable: {
    flexDirection: "row",
  },
  image: {
    width: 80,
    height: 80,
  },
  imageFallback: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    padding: 10,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  date: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    lineHeight: 18,
  },
  location: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  creator: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.error,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});

export default function AdminEventiScreen() {
  const t = useT();
  const STATUS_LABELS = getStatusLabels(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [allFilter, setAllFilter] = useState<EventStatus>("approved");
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingQuery = useQuery<EventDTO[]>({
    queryKey: ["/api/events/admin/pending"],
    enabled: tab === "pending",
  });

  const allQuery = useQuery<EventDTO[]>({
    queryKey: ["/api/events/admin/all"],
    select: (d: unknown) => {
      const raw = d as { events?: EventDTO[] } | EventDTO[];
      const list = Array.isArray(raw) ? raw : (raw?.events ?? []);
      return list.filter((e) => e.status === allFilter);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/events/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/admin/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/admin/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/map"] });
    },
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest("POST", `/api/events/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/admin/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/admin/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setRejectModal(null);
      setRejectReason("");
    },
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
  });

  const handleRejectConfirm = () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) {
      Alert.alert(t("common.warning"), t("admin.rejectionReasonRequired"));
      return;
    }
    rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason.trim() });
  };

  const topInset = insets.top;
  const bottomInset = insets.bottom;

  const currentData = tab === "pending" ? (pendingQuery.data ?? []) : (allQuery.data ?? []);
  const isLoading = tab === "pending" ? pendingQuery.isLoading : allQuery.isLoading;
  const isRefetching = tab === "pending" ? pendingQuery.isRefetching : allQuery.isRefetching;
  const refetch = tab === "pending" ? pendingQuery.refetch : allQuery.refetch;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Gestione Raduni</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tabBtn, tab === "pending" && styles.tabBtnActive]}
          onPress={() => setTab("pending")}
        >
          <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>
            Da approvare {pendingQuery.data?.length ? `(${pendingQuery.data.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "all" && styles.tabBtnActive]}
          onPress={() => setTab("all")}
        >
          <Text style={[styles.tabText, tab === "all" && styles.tabTextActive]}>Tutti gli eventi</Text>
        </Pressable>
      </View>

      {tab === "all" && (
        <View style={styles.filterRow}>
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.filterChip, allFilter === s && styles.filterChipActive]}
              onPress={() => setAllFilter(s)}
            >
              <Text style={[styles.filterText, allFilter === s && styles.filterTextActive]}>
                {STATUS_LABELS[s]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList<EventDTO>
          data={currentData}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <EventAdminCard
              event={item}
              onView={() => router.push(`/evento/${item.id}` as const)}
              onApprove={item.status === "pending" ? () => approveMutation.mutate(item.id) : undefined}
              onReject={item.status === "pending" ? () => setRejectModal({ id: item.id }) : undefined}
              isPending={approveMutation.isPending || rejectMutation.isPending}
              apiUrl={getApiUrl()}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 16 },
            currentData.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>
                {tab === "pending" ? t("admin.noPendingEvents") : t("admin.noEvents")}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {rejectModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Motivo del rifiuto</Text>
            <Text style={styles.modalHint}>{t("admin.rejectionReasonHint")}</Text>
            <TextInput
              style={styles.modalInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Es. Contenuto non appropriato, informazioni incomplete..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => { setRejectModal(null); setRejectReason(""); }}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </Pressable>
              <Pressable
                style={[styles.modalRejectBtn, rejectMutation.isPending && { opacity: 0.6 }]}
                onPress={handleRejectConfirm}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalRejectText}>Rifiuta</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
