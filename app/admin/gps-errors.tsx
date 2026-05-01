import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface GpsError {
  id: string;
  userId: string | null;
  routeId: string | null;
  otaNumber: number | null;
  platform: string | null;
  osVersion: string | null;
  context: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  speedKmh: number | null;
  createdAt: string;
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

function ErrorCard({ item }: { item: GpsError }) {
  const [expanded, setExpanded] = useState(false);
  const colors = useColors();

  const msg = item.errorMessage ?? "—";
  const truncatedMsg = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.otaLabel, { color: colors.accent }]}>
            OTA-{item.otaNumber ?? "?"}
          </Text>
          <Text style={[styles.platformLabel, { color: colors.textSecondary }]}>
            {item.platform ?? "?"} {item.osVersion ?? ""}
          </Text>
        </View>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
          {formatDate(item.createdAt)}
        </Text>
      </View>

      <Text style={[styles.contextLabel, { color: colors.textSecondary }]}>
        📍 {item.context ?? "watchPositionAsync"}
      </Text>

      <Text style={[styles.errorMsg, { color: colors.text }]}>
        {expanded ? msg : truncatedMsg}
      </Text>

      {expanded && item.stackTrace && (
        <Text style={[styles.stackTrace, { color: colors.textSecondary }]}>
          {item.stackTrace.slice(0, 600)}
          {item.stackTrace.length > 600 ? "…" : ""}
        </Text>
      )}

      <View style={styles.cardFooter}>
        {item.speedKmh != null && (
          <Text style={[styles.footerItem, { color: colors.textSecondary }]}>
            🚀 {item.speedKmh.toFixed(1)} km/h
          </Text>
        )}
        {item.userId && (
          <Text style={[styles.footerItem, { color: colors.textSecondary }]}>
            👤 {item.userId.slice(0, 8)}…
          </Text>
        )}
        {item.routeId && (
          <Text style={[styles.footerItem, { color: colors.textSecondary }]}>
            🗺 giro/{item.routeId.slice(0, 8)}…
          </Text>
        )}
        <Text style={[styles.expandHint, { color: colors.accent }]}>
          {expanded ? "▲ riduci" : "▼ espandi"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function GpsErrorsScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery<{ errors: GpsError[]; total: number }>({
    queryKey: ["/api/admin/gps-errors"],
  });

  const errors = data?.errors ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          GPS Error Log
        </Text>
        <Text style={[styles.headerCount, { color: colors.textSecondary }]}>
          {errors.length} record
        </Text>
      </View>

      <FlatList
        data={errors}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ErrorCard item={item} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 16 },
          Platform.OS === "web" && { paddingBottom: 34 + 16 },
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
              {isLoading ? t("common.loading") : t("admin.noGpsErrors")}
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
    ...(Platform.OS === "web" && { paddingTop: 67 + 10 }),
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
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  otaLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  platformLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  contextLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 6,
  },
  errorMsg: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 8,
  },
  stackTrace: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  footerItem: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  expandHint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginLeft: "auto",
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
