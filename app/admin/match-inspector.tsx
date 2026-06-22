import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import {
  TYPE_LABELS,
  BZ_TYPE_LABELS,
  userTypeColor,
  userTypeLabel,
  userRoleText,
} from "./_match-inspector.part2";

interface InspectorUser {
  id: string;
  nickname: string;
  email?: string;
  userType: string;
  role?: string;
  avatarUrl?: string | null;
  matchCounts: Record<string, number>;
  totalMatches?: number;
  hasNoMatches?: boolean;
  criticalGaps?: number;
}
interface UsersResponse {
  users: InspectorUser[];
  total: number;
  zeroMatchCount: number;
  hasMore?: boolean;
}

type _MatchCounts = Record<string, number>;

export default function MatchInspectorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ zeroOnly?: string }>();
  const [zeroOnlyFilter, setZeroOnlyFilter] = useState(params.zeroOnly === "true");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const toggleZeroMatchFilter = useCallback(() => {
    setZeroOnlyFilter((prev) => !prev);
    setPage(1);
  }, []);

  const queryKey = ["/api/admin/users/match-summary", debouncedSearch, page, zeroOnlyFilter];

  const { data, isLoading, refetch } = useQuery<UsersResponse>({
    queryKey,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/admin/users/match-summary", base);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "30");
      if (debouncedSearch) url.searchParams.set("search", debouncedSearch);
      if (zeroOnlyFilter) url.searchParams.set("zeroOnly", "true");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento");
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const zeroMatchCount = data?.zeroMatchCount ?? 0;

  const renderUser = ({ item }: { item: InspectorUser }) => {
    const nonZeroBB = TYPE_LABELS.filter(
      (tl) => (item.matchCounts?.[tl.key] ?? 0) > 0
    );
    const nonZeroBZ = BZ_TYPE_LABELS.filter(
      (tl) => (item.matchCounts?.[tl.key] ?? 0) > 0
    );
    const hasAny = nonZeroBB.length > 0 || nonZeroBZ.length > 0;

    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() =>
          router.push({ pathname: "/admin/match-inspector-detail", params: { userId: item.id } })
        }
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: userTypeColor(item.userType) + "33" }]}>
              <Text style={[styles.avatarLetter, { color: userTypeColor(item.userType) }]}>
                {item.nickname.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: userTypeColor(item.userType) }]}>
            <Text style={styles.typeBadgeText}>{userTypeLabel(item.userType)}</Text>
          </View>
          {item.totalMatches === 0 && (
            <View style={styles.noMatchDot}>
              <MaterialCommunityIcons name="alert" size={8} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.nickname} numberOfLines={1}>{item.nickname}</Text>
            <Text style={[styles.roleTag, { color: userTypeColor(item.userType) }]}>
              {userRoleText(item.userType)}
            </Text>
          </View>

          {hasAny ? (
            <>
              {nonZeroBB.length > 0 && (
                <View style={styles.countChipsRow}>
                  {nonZeroBB.map((tl) => (
                    <View key={tl.key} style={[styles.countChip, { borderColor: tl.color + "55" }]}>
                      <Text style={[styles.countChipLabel, { color: tl.color }]}>{tl.label}</Text>
                      <Text style={[styles.countChipNum, { color: tl.color }]}>
                        {item.matchCounts[tl.key]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {nonZeroBZ.length > 0 && (
                <View style={[styles.countChipsRow, styles.bzChipsRow]}>
                  {nonZeroBZ.map((tl) => (
                    <View key={tl.key} style={[styles.countChip, { borderColor: tl.color + "55" }]}>
                      <Text style={[styles.countChipLabel, { color: tl.color }]}>{tl.label}</Text>
                      <Text style={[styles.countChipNum, { color: tl.color }]}>
                        {item.matchCounts[tl.key]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.noMatchText}>Nessun match</Text>
          )}
        </View>

        <View style={styles.totalBadge}>
          <Text style={[styles.totalText, item.totalMatches === 0 && { color: Colors.warning }]}>
            {item.totalMatches}
          </Text>
          <Text style={styles.totalLabel}>tot</Text>
        </View>

        <View style={styles.gapsBadge}>
          {item.criticalGaps === 0 ? (
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          ) : (
            <View style={styles.gapsCount}>
              <Text style={styles.gapsCountText}>{item.criticalGaps}</Text>
            </View>
          )}
        </View>

        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca utente..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearchChange("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.totalCount}>{total} utenti</Text>
        {(zeroMatchCount > 0 || zeroOnlyFilter) && (
          <TouchableOpacity
            style={[styles.zeroMatchBadge, zeroOnlyFilter && styles.zeroMatchBadgeActive]}
            onPress={toggleZeroMatchFilter}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={zeroOnlyFilter ? "filter-remove" : "alert"}
              size={12}
              color={zeroOnlyFilter ? "#fff" : Colors.warning}
            />
            <Text style={[styles.zeroMatchBadgeText, zeroOnlyFilter && styles.zeroMatchBadgeTextActive]}>
              {zeroMatchCount} senza match
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={16} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-search" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessun utente trovato</Text>
            </View>
          }
        />
      )}

      {data?.hasMore && (
        <TouchableOpacity style={styles.loadMore} onPress={() => setPage((p) => p + 1)}>
          <Text style={styles.loadMoreText}>Carica altri</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    padding: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  totalCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.warning,
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  filterChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.warning,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  zeroMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.warning,
    backgroundColor: "transparent",
  },
  zeroMatchBadgeActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  zeroMatchBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.warning,
  },
  zeroMatchBadgeTextActive: {
    color: "#fff",
  },
  refreshBtn: { padding: 4 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    gap: 12,
  },
  avatarWrap: { position: "relative", width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontFamily: "Inter_700Bold", fontSize: 18 },
  typeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  typeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 8, color: "#fff" },
  noMatchDot: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.warning,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  userInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nickname: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flexShrink: 1,
  },
  roleTag: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "lowercase",
  },
  countChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  bzChipsRow: {
    borderTopWidth: 1,
    borderTopColor: "#E91E8C22",
    paddingTop: 3,
    marginTop: 1,
  },
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  countChipLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
  },
  countChipNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  noMatchText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  totalBadge: { alignItems: "center", minWidth: 36 },
  totalText: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.accent },
  totalLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  gapsBadge: { alignItems: "center", justifyContent: "center", width: 24 },
  gapsCount: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.error ?? "#F44336",
    alignItems: "center",
    justifyContent: "center",
  },
  gapsCountText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff" },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 72 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary },
  loadMore: {
    margin: 16,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadMoreText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent },
});
