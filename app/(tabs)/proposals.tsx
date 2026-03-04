import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
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

function getTypeIcon(type: string): { name: string; color: string } {
  switch (type) {
    case "giro":
      return { name: "motorbike", color: Colors.dark.azzurro };
    case "raduno":
      return { name: "account-group", color: Colors.dark.accent };
    case "con_zavorrina":
      return { name: "seat-passenger", color: Colors.dark.rosa };
    case "richiesta":
      return { name: "hand-wave", color: Colors.dark.rosa };
    default:
      return { name: "clipboard-text", color: Colors.dark.textSecondary };
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
      ? Colors.dark.bikerColor
      : item.creatorUserType === "zavorrina"
      ? Colors.dark.zavorrinaColor
      : Colors.dark.coppiaColor;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + "22" }]}>
          <MaterialCommunityIcons
            name={typeInfo.name as any}
            size={18}
            color={typeInfo.color}
          />
          <Text style={[styles.typeLabel, { color: typeInfo.color }]}>
            {getTypeLabel(item.proposalType)}
          </Text>
        </View>
        {item.status !== "active" && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>

      {item.description && (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="person" size={14} color={creatorColor} />
          <Text style={[styles.metaText, { color: creatorColor }]}>
            {item.creatorNickname}
          </Text>
        </View>

        {scheduledDate && (
          <View style={styles.metaRow}>
            <Ionicons name="calendar" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.metaText}>{scheduledDate}</Text>
          </View>
        )}

        {item.departureAddress && (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.departureAddress}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.participantsRow}>
          <Ionicons name="people" size={16} color={Colors.dark.accent} />
          <Text style={styles.participantCount}>
            {item.participantCount}
            {item.maxParticipants ? `/${item.maxParticipants}` : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: webTopInset }]}>
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_TYPES}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === item.key && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : (
        <FlatList
          data={proposals ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Platform.OS === "web" ? 34 : 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.dark.accent}
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
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={48}
                color={Colors.dark.textMuted}
              />
              <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: Platform.OS === "web" ? 50 : 100 }]}
        onPress={handleCreatePress}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  filterRow: {
    paddingVertical: 12,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.accent + "22",
    borderColor: Colors.dark.accent,
  },
  filterText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "500" as const,
  },
  filterTextActive: {
    color: Colors.dark.accent,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  statusBadge: {
    backgroundColor: Colors.dark.warning + "33",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    color: Colors.dark.warning,
    fontSize: 11,
    fontWeight: "600" as const,
  },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  cardDesc: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  cardMeta: {
    gap: 6,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 10,
  },
  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantCount: {
    color: Colors.dark.accent,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 16,
  },
});
