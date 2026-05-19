import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface GpsRejectionStat {
  userId: string;
  deviceId: string;
  platform: string | null;
  nickname: string | null;
  email: string | null;
  lastOtaNumber: number | null;
  rejectionCount: number;
  lastRejectedPayload: string | null;
  lastRejectedAt: string;
  lastSource: string | null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function RejectionCard({ item, alertThreshold }: { item: GpsRejectionStat; alertThreshold: number }) {
  const [expanded, setExpanded] = useState(false);
  const colors = useColors();

  const severity = item.rejectionCount >= 50 ? "#FF3B30" : item.rejectionCount >= 10 ? "#FF9500" : "#34C759";
  const isOverThreshold = item.rejectionCount >= alertThreshold;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.countBadge, { backgroundColor: severity }]}>
            <Text style={styles.countText}>{item.rejectionCount}</Text>
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.nickname, { color: colors.text }]}>
                {item.nickname ?? item.userId.slice(0, 8) + "…"}
              </Text>
              {isOverThreshold && (
                <View style={{ backgroundColor: "#FF3B3022", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#FF3B3066" }}>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#FF3B30", letterSpacing: 0.3 }}>⚠ ALERT</Text>
                </View>
              )}
            </View>
            {item.email && (
              <Text style={[styles.email, { color: colors.textSecondary }]}>
                {item.email}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
          {formatDate(item.lastRejectedAt)}
        </Text>
      </View>

      <Text style={[styles.deviceId, { color: colors.textSecondary }]} numberOfLines={1}>
        {item.deviceId !== "unknown" ? item.deviceId.slice(0, 32) + (item.deviceId.length > 32 ? "…" : "") : "device sconosciuto"}
      </Text>

      <View style={styles.metaRow}>
        {item.platform && (
          <Text style={[styles.metaChip, { color: colors.textSecondary, borderColor: colors.border }]}>
            {item.platform}
          </Text>
        )}
        {item.lastOtaNumber != null && (
          <Text style={[styles.metaChip, { color: colors.textSecondary, borderColor: colors.border }]}>
            OTA-{item.lastOtaNumber}
          </Text>
        )}
        {item.lastSource && (
          <Text style={[styles.metaChip, { color: colors.textSecondary, borderColor: colors.border }]}>
            {item.lastSource}
          </Text>
        )}
      </View>

      {expanded && item.lastRejectedPayload && (
        <Text style={[styles.payload, { color: colors.textSecondary, backgroundColor: colors.background }]}>
          {item.lastRejectedPayload.slice(0, 400)}
          {item.lastRejectedPayload.length > 400 ? "…" : ""}
        </Text>
      )}

      <Text style={[styles.expandHint, { color: colors.accent }]}>
        {expanded ? "▲ riduci" : "▼ payload"}
      </Text>
    </TouchableOpacity>
  );
}

export default function GpsRejectionsScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery<{ stats: GpsRejectionStat[]; total: number; alertThreshold: number }>({
    queryKey: ["/api/admin/gps-rejections"],
  });

  const stats = data?.stats ?? [];
  const alertThreshold = data?.alertThreshold ?? 100;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          GPS Rifiutati per Utente
        </Text>
        <Text style={[styles.headerCount, { color: colors.textSecondary }]}>
          {stats.length} utenti
        </Text>
      </View>

      <FlatList
        data={stats}
        keyExtractor={(item) => item.userId + "_" + item.deviceId}
        renderItem={({ item }) => <RejectionCard item={item} alertThreshold={alertThreshold} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 16 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isLoading ? t("common.loading") : "Nessun payload GPS rifiutato registrato"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  headerCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  list: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  countBadge: {
    borderRadius: 8,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  nickname: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  deviceId: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    opacity: 0.6,
  },
  email: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaChip: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  payload: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    borderRadius: 6,
    padding: 8,
  },
  expandHint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
