import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";

interface ProposalItem {
  id: string;
  userId: string;
  proposalType: string;
  title: string;
  description: string | null;
  departureAddress: string | null;
  departureLatitude: number | null;
  departureLongitude: number | null;
  scheduledAt: string | null;
  maxParticipants: number | null;
  status: string;
  createdAt: string;
  creatorNickname: string;
  creatorUserType: string;
  participantCount: number;
}

const FILTER_TYPES = [
  { key: "all", label: "Tutti" },
  { key: "giro", label: "Giro" },
  { key: "raduno", label: "Raduno" },
  { key: "con_zavorrina", label: "Con zavorrina" },
  { key: "richiesta", label: "Richiesta" },
];

function getTypeIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case "giro":
      return { name: "bicycle", color: Colors.maleIcon };
    case "raduno":
      return { name: "people", color: Colors.accent };
    case "con_zavorrina":
      return { name: "person-add", color: Colors.femaleIcon };
    case "richiesta":
      return { name: "hand-left", color: Colors.femaleIcon };
    default:
      return { name: "document-text", color: Colors.textSecondary };
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "giro": return t("proposals.ride");
    case "raduno": return t("proposals.rally");
    case "con_zavorrina": return t("proposals.withPassenger");
    case "richiesta": return t("proposals.request");
    default: return type;
  }
}

function ProposalCard({ item, onPress }: { item: ProposalItem; onPress: () => void }) {
  const typeInfo = getTypeIcon(item.proposalType);
  const scheduledDate = item.scheduledAt
    ? new Date(item.scheduledAt).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const creatorColor =
    item.creatorUserType === "biker"
      ? Colors.maleIcon
      : item.creatorUserType === "zavorrina"
      ? Colors.femaleIcon
      : Colors.accent;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Ionicons
          name={typeInfo.name}
          size={24}
          color={typeInfo.color}
        />
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.nickname}>{item.creatorNickname}</Text>
          <Text style={styles.type}>{getTypeLabel(item.proposalType)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: typeInfo.color + "30" }]}>
          <Text style={[styles.badgeText, { color: typeInfo.color }]}>
            {getTypeLabel(item.proposalType)}
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      {item.departureAddress && (
        <View style={styles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText} numberOfLines={1}>
            {item.departureAddress}
          </Text>
        </View>
      )}

      {scheduledDate && (
        <View style={styles.infoRow}>
          <Ionicons name="time" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{scheduledDate}</Text>
        </View>
      )}

      <View style={styles.infoRow}>
        <Ionicons name="people" size={14} color={Colors.accent} />
        <Text style={[styles.infoText, { color: Colors.accent }]}>
          {item.participantCount}
          {item.maxParticipants ? `/${item.maxParticipants}` : ""}
        </Text>
      </View>

      {item.status !== "active" && (
        <View style={[styles.badge, { backgroundColor: Colors.warning + "30", marginTop: 6, alignSelf: "flex-start" }]}>
          <Text style={[styles.badgeText, { color: Colors.warning }]}>{item.status}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ProposalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState("all");

  const queryKey =
    activeFilter === "all"
      ? ["/api/proposals"]
      : ["/api/proposals?type=" + activeFilter];

  const { data: proposals, isLoading, refetch, isRefetching } = useQuery<ProposalItem[]>({
    queryKey,
  });

  const handleCreatePress = useCallback(() => {
    router.push("/proposals/create");
  }, [router]);

  const handleProposalPress = useCallback(
    (id: string) => {
      router.push(`/proposals/${id}`);
    },
    [router]
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTER_TYPES.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={proposals ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.accent}
            />
          }
          scrollEnabled={!!(proposals && proposals.length > 0)}
          renderItem={({ item }) => (
            <ProposalCard
              item={item}
              onPress={() => handleProposalPress(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            </View>
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={handleCreatePress}
      >
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: "row", padding: 16, gap: 8 },
  filterBtn: { backgroundColor: Colors.surface, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.accent + "20", borderColor: Colors.accent },
  filterText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 80 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  cardHeaderInfo: { flex: 1 },
  nickname: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 4 },
  description: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 50 : 16,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
