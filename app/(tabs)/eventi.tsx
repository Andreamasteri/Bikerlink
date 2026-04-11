import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import EventCard from "@/components/eventi/EventCard";
import EventForm from "@/components/eventi/EventForm";
import type { EventDTO, EventType } from "@/shared/event-types";

type FilterType = "tutti" | EventType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "tutti", label: "Tutti" },
  { key: "raduno", label: "Raduno" },
  { key: "uscita_gruppo", label: "Uscita" },
  { key: "festa", label: "Festa" },
  { key: "gara", label: "Gara" },
  { key: "altro", label: "Altro" },
];

export default function EventiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("tutti");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery<EventDTO[]>({
    queryKey: ["/api/events"],
    select: (d: unknown) => {
      const raw = d as { events?: EventDTO[] } | EventDTO[];
      const list = Array.isArray(raw) ? raw : (raw?.events ?? []);
      return list.filter((e) => filter === "tutti" || e.eventType === filter);
    },
  });

  const events = data ?? [];

  const handleEventPress = useCallback(
    (id: string) => {
      router.push(`/evento/${id}` as const);
    },
    [router]
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
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
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={56} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>Nessun evento in programma</Text>
              <Text style={styles.emptySubtitle}>Sii il primo a crearne uno!</Text>
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
