import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,

} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { getApiUrl } from "@/lib/query-client";
import EventCard from "@/components/eventi/EventCard";
import EventForm from "@/components/eventi/EventForm";
import type { EventDTO, EventType } from "@/shared/event-types";
import { useT } from "@/lib/language-context";

interface EventsPage {
  events: EventDTO[];
  total: number;
  page: number;
  limit: number;
}

type FilterType = "tutti" | EventType;

const FILTER_KEYS: { key: FilterType; labelKey: string }[] = [
  { key: "tutti", labelKey: "events.typeAll" },
  { key: "raduno", labelKey: "events.typeRaduno" },
  { key: "uscita_gruppo", labelKey: "events.typeUscita" },
  { key: "festa", labelKey: "events.typeFesta" },
  { key: "gara", labelKey: "events.typeGara" },
  { key: "altro", labelKey: "events.typeAltro" },
];

export default function EventiScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const FILTERS = useMemo(() => FILTER_KEYS.map(f => ({ key: f.key, label: t(f.labelKey) })), [t]);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [filter, setFilter] = useState<FilterType>("tutti");
  const [showForm, setShowForm] = useState(false);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery<EventsPage>({
    queryKey: ["/api/events", filter],
    queryFn: async ({ pageParam = 1 }) => {
      const url = new URL("/api/events", getApiUrl());
      url.searchParams.set("page", String(pageParam));
      url.searchParams.set("limit", "20");
      if (filter !== "tutti") url.searchParams.set("type", filter);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(t("events.loadError"));
      return res.json();
    },
    getNextPageParam: (last) => {
      if (!last) return undefined;
      const loaded = last.page * last.limit;
      return loaded < last.total ? last.page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const events = useMemo(
    () => data?.pages.flatMap((p) => p.events) ?? [],
    [data]
  );

  const handleEventPress = useCallback(
    (id: string) => {
      routerRef.current.push(`/evento/${id}` as const);
    },
    []
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const topInset = insets.top;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <InlineMiniPlayer />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Raduni</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={22} color="#000" />
        </Pressable>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList<EventDTO>
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => handleEventPress(item.id)} />
          )}
          contentContainerStyle={[
            styles.listContent,
            events.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 20 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={() => refetch()}
              tintColor={Colors.accent}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator
                size="small"
                color={Colors.accent}
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={56} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>{t("events.noScheduled")}</Text>
              <Text style={styles.emptySubtitle}>{t("events.beFirst")}</Text>
              <Pressable style={styles.emptyBtn} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={18} color="#000" />
                <Text style={styles.emptyBtnText}>Crea un evento</Text>
              </Pressable>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <EventForm
        visible={showForm}
        onClose={() => setShowForm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  filterWrap: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: "#000",
    fontFamily: "Inter_700Bold",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingTop: 12,
  },
  listEmpty: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  emptyBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#000",
  },
});
