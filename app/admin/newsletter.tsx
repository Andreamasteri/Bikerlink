import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type Subscriber = {
  id: number;
  email: string;
  notifyRides: boolean;
  createdAt: string;
};

type SubscribersResponse = {
  total: number;
  page: number;
  limit: number;
  subscribers: Subscriber[];
};

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function NewsletterAdminScreen() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SubscribersResponse>({
    queryKey: ["/api/admin/newsletter/subscribers", page],
    queryFn: async () => {
      const url = new URL(`/api/admin/newsletter/subscribers`, getApiUrl());
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(PAGE_SIZE));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento iscritti");
      return res.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  function handleExport() {
    const url = new URL(`/api/admin/newsletter/subscribers/export`, getApiUrl());
    Linking.openURL(url.toString());
  }

  function renderSubscriber({ item }: { item: Subscriber }) {
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.rowRight}>
          {item.notifyRides ? (
            <View style={styles.badge}>
              <MaterialCommunityIcons name="motorbike" size={12} color="#fff" />
              <Text style={styles.badgeText}>Raduni</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error ?? "#FF4444"} />
        <Text style={styles.errorText}>Errore nel caricamento</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{data?.total ?? 0}</Text>
          <Text style={styles.statLabel}>Iscritti totali</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.8}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.exportText}>Esporta CSV</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data?.subscribers ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderSubscriber}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <MaterialCommunityIcons name="email-off-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun iscritto</Text>
          </View>
        }
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
      />

      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <Ionicons name="chevron-back" size={20} color={page <= 1 ? Colors.textSecondary : Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.pageText}>
            Pagina {page} / {totalPages}
          </Text>
          <TouchableOpacity
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <Ionicons name="chevron-forward" size={20} color={page >= totalPages ? Colors.textSecondary : Colors.accent} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statBox: {
    gap: 2,
  },
  statNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exportText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  list: {
    padding: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLeft: {
    flex: 1,
    gap: 3,
    marginRight: 8,
  },
  email: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  date: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff",
  },
  separator: {
    height: 8,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: Colors.text,
  },
  retryBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pageBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    minWidth: 110,
    textAlign: "center",
  },
});
