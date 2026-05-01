import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Image,

  ActivityIndicator,
} from "react-native";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

interface BlockEntry {
  id: string;
  blockerId: string;
  blockerNickname: string;
  blockerAvatarUrl: string | null;
  blockedId: string;
  blockedNickname: string;
  blockedAvatarUrl: string | null;
  createdAt: string;
}

interface BlocksResponse {
  blocks: BlockEntry[];
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ url, nickname }: { url: string | null; nickname: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{nickname.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function AdminBlocks() {
  const t = useT();
  const rawInsets = useSafeAreaInsets();
  const insets = rawInsets;

  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<BlocksResponse>({
    queryKey: ["/api/admin/blocks", searchQuery],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const path = "/api/admin/blocks";
      const url = new URL(path, getApiUrl());
      url.searchParams.set("page", String(pageParam as number));
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (searchQuery.trim()) url.searchParams.set("search", searchQuery.trim());
      const res = await apiRequest("GET", url.pathname + url.search);
      return res.json() as Promise<BlocksResponse>;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });

  const allBlocks = useMemo(
    () => data?.pages.flatMap((p) => p.blocks) ?? [],
    [data]
  );
  const total = data?.pages[0]?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/blocks/${id}`);
      return res.json() as Promise<{ deleted: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blocks"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile rimuovere il blocco"),
  });

  function handleSearch() {
    setSearchQuery(search);
  }

  function handleRemove(item: BlockEntry) {
    Alert.alert(
      t("admin.removeBlock"),
      `Vuoi rimuovere il blocco tra ${item.blockerNickname} e ${item.blockedNickname}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.remove"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(item.id),
        },
      ]
    );
  }

  function handleEndReached() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  function renderItem({ item }: { item: BlockEntry }) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.userCell}>
            <Avatar url={item.blockerAvatarUrl} nickname={item.blockerNickname} />
            <Text style={styles.nickname} numberOfLines={1}>{item.blockerNickname}</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={Colors.error} style={styles.arrow} />
          <View style={styles.userCell}>
            <Avatar url={item.blockedAvatarUrl} nickname={item.blockedNickname} />
            <Text style={styles.nickname} numberOfLines={1}>{item.blockedNickname}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item)}
            disabled={deleteMutation.isPending}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={deleteMutation.isPending ? Colors.border : Colors.error}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder={t("admin.searchNickname")}
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Ionicons name="search" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {total > 0 && (
        <Text style={styles.totalLabel}>
          {total} {total === 1 ? "blocco attivo" : "blocchi attivi"}
        </Text>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : allBlocks.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun blocco trovato</Text>
        </View>
      ) : (
        <FlatList
          data={allBlocks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          scrollEnabled={!!allBlocks.length}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={Colors.accent} style={{ marginVertical: 12 }} />
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
  searchBar: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  searchBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  totalLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  userCell: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  arrow: {
    marginHorizontal: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
  nickname: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    textAlign: "center",
  },
  removeBtn: {
    padding: 8,
    marginLeft: 8,
  },
  date: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "right",
  },
});
