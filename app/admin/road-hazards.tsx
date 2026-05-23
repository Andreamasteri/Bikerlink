import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, authFetchHeaders } from "@/lib/query-client";
import { HAZARD_LABELS, HAZARD_ICONS, type HazardType, RECURRING_TYPES } from "@shared/db/road-hazards";

interface RoadHazard {
  id: string;
  userId: string;
  type: HazardType;
  lat: number;
  lng: number;
  description: string | null;
  confirmCount: number;
  isApproved: boolean;
  expiresAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface HazardListResponse {
  hazards: RoadHazard[];
  total: number;
}

interface HazardSettingResponse {
  enabled: boolean;
}

function isRecurring(type: HazardType): boolean {
  return RECURRING_TYPES.includes(type);
}

function formatAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Ricorrente";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Scaduta";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Scade in ${mins} min`;
  return `Scade in ${Math.floor(mins / 60)}h`;
}

export default function RoadHazardsAdmin() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const { data: settingData, isLoading: settingLoading } = useQuery<HazardSettingResponse>({
    queryKey: ["/api/admin/settings/road-hazards-enabled"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/settings/road-hazards-enabled", getApiUrl()).toString(), {
        headers: { ...(authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
  });

  const { data: hazardData, isLoading: hazardsLoading, refetch } = useQuery<HazardListResponse>({
    queryKey: ["/api/admin/road-hazards", page],
    queryFn: async () => {
      const url = new URL("/api/admin/road-hazards", getApiUrl());
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(url.toString(), {
        headers: { ...(authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
  });

  const toggleSettingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(new URL("/api/admin/settings/road-hazards-enabled", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authFetchHeaders()) },
        body: JSON.stringify({ enabled }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/road-hazards-enabled"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(new URL(`/api/admin/road-hazards/${id}/approve`, getApiUrl()).toString(), {
        method: "POST",
        headers: { ...(authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(new URL(`/api/admin/road-hazards/${id}`, getApiUrl()).toString(), {
        method: "DELETE",
        headers: { ...(authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const hazards = hazardData?.hazards ?? [];
  const total = hazardData?.total ?? 0;
  const enabled = settingData?.enabled ?? true;

  const handleDelete = (id: string) => {
    Alert.alert("Elimina segnalazione", "Sei sicuro?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const renderItem = ({ item }: { item: RoadHazard }) => {
    const recurring = isRecurring(item.type);
    const pendingApproval = recurring && !item.isApproved;

    return (
      <View style={[styles.card, pendingApproval && styles.cardPending]}>
        <View style={styles.cardHeader}>
          <Text style={styles.hazardIcon}>{HAZARD_ICONS[item.type] ?? "⚠️"}</Text>
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.hazardType}>{HAZARD_LABELS[item.type] ?? item.type}</Text>
              {pendingApproval && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>In attesa</Text>
                </View>
              )}
              {recurring && item.isApproved && (
                <View style={styles.recurringBadge}>
                  <Text style={styles.recurringBadgeText}>Ricorrente</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardMeta}>
              {formatAge(item.createdAt)} · {formatExpiry(item.expiresAt)} · {item.confirmCount} confirm{item.confirmCount !== 1 ? "e" : "a"}
            </Text>
            <Text style={styles.cardCoords}>
              {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
            </Text>
            {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
          </View>
        </View>

        <View style={styles.cardActions}>
          {pendingApproval && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => approveMutation.mutate(item.id)}
              disabled={approveMutation.isPending}
            >
              <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
              <Text style={[styles.actionBtnText, { color: "#22c55e" }]}>Approva</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item.id)}
            disabled={deleteMutation.isPending}
          >
            <Ionicons name="trash-outline" size={14} color="#ef4444" />
            <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Elimina</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Global toggle */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleLeft}>
          <MaterialCommunityIcons name="alert-rhombus-outline" size={20} color={enabled ? Colors.accent : Colors.textSecondary} />
          <View>
            <Text style={styles.toggleTitle}>Segnalazioni Stradali</Text>
            <Text style={styles.toggleSub}>{enabled ? "Attive — gli utenti possono segnalare" : "Disattivate — nessun utente può segnalare"}</Text>
          </View>
        </View>
        {settingLoading ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={(v) => toggleSettingMutation.mutate(v)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        )}
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {hazardsLoading ? "Caricamento…" : `${total} segnalazioni totali`}
        </Text>
        <Text style={styles.statsHint}>
          {hazards.filter((h) => !h.isApproved).length > 0
            ? `⚠️ ${hazards.filter((h) => !h.isApproved).length} in attesa di approvazione`
            : ""}
        </Text>
      </View>

      {hazardsLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={hazards}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="alert-rhombus-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna segnalazione</Text>
            </View>
          }
          ListFooterComponent={
            total > (page + 1) * PAGE_SIZE ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setPage((p) => p + 1)}>
                <Text style={styles.loadMoreText}>Carica altri</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  toggleSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statsHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#f59e0b",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPending: {
    borderColor: "#f59e0b",
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  hazardIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  hazardType: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  pendingBadge: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pendingBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#f59e0b",
  },
  recurringBadge: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recurringBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#ef4444",
  },
  cardMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardCoords: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    fontStyle: "italic",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  approveBtn: {
    borderColor: "rgba(34,197,94,0.3)",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  deleteBtn: {
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loadMoreBtn: {
    alignItems: "center",
    padding: 14,
  },
  loadMoreText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
});
