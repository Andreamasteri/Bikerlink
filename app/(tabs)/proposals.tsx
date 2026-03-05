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
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

interface ProposalItem {
  id: string;
  userId: string;
  proposalType: string;
  searchType?: string | null;
  title: string;
  description: string | null;
  departureAddress: string | null;
  departureLatitude: number | null;
  departureLongitude: number | null;
  scheduledAt: string | null;
  departureTimeFrom: string | null;
  departureTimeTo: string | null;
  searchRadius: number | null;
  maxParticipants: number | null;
  status: string;
  createdAt: string;
  creatorNickname: string;
  creatorUserType: string;
  participantCount: number;
  motoInfo?: { brand: string; model: string; motorcycleType: string; ridingStyle: string } | null;
}

const FILTER_TYPES = [
  { key: "all", label: "Tutti" },
  { key: "giro", label: "Giro" },
  { key: "passaggio", label: "Passaggio" },
  { key: "zavorrina", label: "Zavorrina" },
  { key: "richieste", label: "Richieste" },
];

const SEARCH_TYPE_LABELS: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "FindAGuest",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker",
};

function getTypeIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case "giro": return { name: "bicycle", color: Colors.maleIcon };
    case "passaggio": return { name: "car", color: Colors.accent };
    case "zavorrina": return { name: "person-add", color: Colors.femaleIcon };
    case "richieste": return { name: "hand-left", color: Colors.femaleIcon };
    default: return { name: "document-text", color: Colors.textSecondary };
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "giro": return "Giro";
    case "passaggio": return "Passaggio";
    case "zavorrina": return "Zavorrina";
    case "richieste": return "Richieste";
    default: return type;
  }
}

function ProposalCard({ item, onPress }: { item: ProposalItem; onPress: () => void }) {
  const typeInfo = getTypeIcon(item.proposalType);
  const scheduledDate = item.scheduledAt
    ? new Date(item.scheduledAt).toLocaleDateString("it-IT", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const creatorColor =
    item.creatorUserType === "biker" ? Colors.maleIcon
    : item.creatorUserType === "zavorrina" ? Colors.femaleIcon
    : Colors.accent;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Ionicons name={typeInfo.name} size={24} color={typeInfo.color} />
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.nickname}>{item.creatorNickname}</Text>
          <Text style={styles.type}>
            {item.searchType ? SEARCH_TYPE_LABELS[item.searchType] || item.searchType : getTypeLabel(item.proposalType)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: typeInfo.color + "30" }]}>
          <Text style={[styles.badgeText, { color: typeInfo.color }]}>
            {getTypeLabel(item.proposalType)}
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

      {item.motoInfo && (
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="motorbike" size={14} color={Colors.accent} />
          <Text style={[styles.infoText, { color: Colors.accent }]}>
            {item.motoInfo.brand} {item.motoInfo.model} • {item.motoInfo.ridingStyle}
          </Text>
        </View>
      )}

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      )}

      {item.departureAddress && (
        <View style={styles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText} numberOfLines={1}>{item.departureAddress}</Text>
        </View>
      )}

      {scheduledDate && (
        <View style={styles.infoRow}>
          <Ionicons name="time" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{scheduledDate}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.infoRow}>
          <Ionicons name="people" size={14} color={Colors.accent} />
          <Text style={[styles.infoText, { color: Colors.accent }]}>
            {item.participantCount}{item.maxParticipants ? `/${item.maxParticipants}` : ""}
          </Text>
        </View>
        {!!item.searchRadius && (
          <View style={styles.infoRow}>
            <Ionicons name="radio-button-on" size={12} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.searchRadius}km</Text>
          </View>
        )}
      </View>

      {item.status !== "active" && (
        <View style={[styles.badge, { backgroundColor: Colors.warning + "30", marginTop: 6, alignSelf: "flex-start" as const }]}>
          <Text style={[styles.badgeText, { color: Colors.warning }]}>{item.status}</Text>
        </View>
      )}
    </Pressable>
  );
}

function MatchCard({ match, currentUserId, onAccept, onReject, onChatPress, isPending }: {
  match: any;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onChatPress?: () => void;
  isPending: boolean;
}) {
  const isUser1 = match.userId1 === currentUserId;
  const myProposal = isUser1 ? match.proposal1 : match.proposal2;
  const otherProposal = isUser1 ? match.proposal2 : match.proposal1;
  const otherNickname = isUser1 ? match.user2Nickname : match.user1Nickname;
  const otherType = isUser1 ? match.user2Type : match.user1Type;

  const otherColor = otherType === "biker" ? Colors.maleIcon : otherType === "zavorrina" ? Colors.femaleIcon : Colors.accent;
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";

  return (
    <View style={[styles.matchCard, isAccepted && styles.matchCardAccepted]}>
      <View style={styles.matchHeader}>
        <Ionicons name="flash" size={20} color={Colors.accent} />
        <Text style={styles.matchTitle}>
          {isAccepted ? "Match accettato!" : isRejected ? "Match rifiutato" : "Nuovo match!"}
        </Text>
      </View>

      <View style={styles.matchPair}>
        <View style={styles.matchProposal}>
          <Text style={styles.matchLabel}>La tua proposta</Text>
          <Text style={styles.matchProposalTitle} numberOfLines={1}>{myProposal?.title}</Text>
          <Text style={styles.matchProposalSub}>
            {myProposal?.searchType ? SEARCH_TYPE_LABELS[myProposal.searchType] : ""}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={20} color={Colors.accent} />
        <View style={styles.matchProposal}>
          <Text style={[styles.matchLabel, { color: otherColor }]}>{otherNickname}</Text>
          <Text style={styles.matchProposalTitle} numberOfLines={1}>{otherProposal?.title}</Text>
          <Text style={styles.matchProposalSub}>
            {otherProposal?.searchType ? SEARCH_TYPE_LABELS[otherProposal.searchType] : ""}
          </Text>
        </View>
      </View>

      {match.status === "pending" && (
        <View style={styles.matchActions}>
          <TouchableOpacity
            style={[styles.matchBtn, styles.matchRejectBtn]}
            onPress={onReject}
            disabled={isPending}
          >
            <Ionicons name="close" size={18} color={Colors.accentRed} />
            <Text style={[styles.matchBtnText, { color: Colors.accentRed }]}>Rifiuta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.matchBtn, styles.matchAcceptBtn]}
            onPress={onAccept}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#000" />
                <Text style={[styles.matchBtnText, { color: "#000" }]}>Accetta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isAccepted && match.conversationId && onChatPress && (
        <TouchableOpacity
          style={styles.chatLink}
          onPress={onChatPress}
        >
          <Ionicons name="chatbubbles" size={16} color={Colors.accent} />
          <Text style={styles.chatLinkText}>Apri chat del match</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ProposalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState("all");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const queryKey =
    activeFilter === "all"
      ? ["/api/proposals"]
      : ["/api/proposals?filter=" + activeFilter];

  const { data: proposals, isLoading, refetch, isRefetching } = useQuery<ProposalItem[]>({ queryKey });

  const { data: matches } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
  });

  const pendingMatches = (matches || []).filter((m: any) => m.status === "pending");
  const recentMatches = (matches || []).filter((m: any) => m.status !== "pending").slice(0, 5);

  const acceptMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/proposals/matches/${matchId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      setPendingMatchId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => {
      setPendingMatchId(null);
      Alert.alert("Errore", err.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/proposals/matches/${matchId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const handleCreatePress = useCallback(() => {
    router.push("/proposals/create");
  }, [router]);

  const handleProposalPress = useCallback((id: string) => {
    router.push(`/proposals/${id}`);
  }, [router]);

  const allData: any[] = [];
  if (pendingMatches.length > 0) {
    allData.push({ type: "matchHeader", key: "mh" });
    pendingMatches.forEach((m: any) => allData.push({ type: "match", key: `match-${m.id}`, data: m }));
  }
  if (recentMatches.length > 0) {
    allData.push({ type: "recentMatchHeader", key: "rmh" });
    recentMatches.forEach((m: any) => allData.push({ type: "recentMatch", key: `rm-${m.id}`, data: m }));
  }
  allData.push({ type: "proposalHeader", key: "ph" });
  (proposals || []).forEach((p) => allData.push({ type: "proposal", key: `p-${p.id}`, data: p }));

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTER_TYPES.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
            {f.key === "all" && pendingMatches.length > 0 && (
              <View style={styles.matchBadge}>
                <Text style={styles.matchBadgeText}>{pendingMatches.length}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={allData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />
          }
          scrollEnabled={allData.length > 1}
          renderItem={({ item }) => {
            if (item.type === "matchHeader") {
              return (
                <View style={styles.sectionHeader}>
                  <Ionicons name="flash" size={18} color={Colors.accent} />
                  <Text style={styles.sectionTitle}>Match trovati</Text>
                </View>
              );
            }
            if (item.type === "recentMatchHeader") {
              return (
                <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                  <Ionicons name="time" size={18} color={Colors.textSecondary} />
                  <Text style={[styles.sectionTitle, { color: Colors.textSecondary }]}>Match recenti</Text>
                </View>
              );
            }
            if (item.type === "match" || item.type === "recentMatch") {
              return (
                <MatchCard
                  match={item.data}
                  currentUserId={user?.id || ""}
                  onAccept={() => {
                    setPendingMatchId(item.data.id);
                    acceptMutation.mutate(item.data.id);
                  }}
                  onReject={() => rejectMutation.mutate(item.data.id)}
                  onChatPress={item.data.conversationId ? () => router.push(`/chat/${item.data.conversationId}`) : undefined}
                  isPending={pendingMatchId === item.data.id}
                />
              );
            }
            if (item.type === "proposalHeader") {
              return (
                <View style={[styles.sectionHeader, { marginTop: pendingMatches.length > 0 ? 12 : 0 }]}>
                  <Ionicons name="megaphone" size={18} color={Colors.text} />
                  <Text style={styles.sectionTitle}>Proposte</Text>
                </View>
              );
            }
            return (
              <ProposalCard
                item={item.data}
                onPress={() => handleProposalPress(item.data.id)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t("common.noResults")}</Text>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={handleCreatePress}>
        <Ionicons name="add" size={28} color={Colors.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: "row", padding: 16, gap: 8 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surface, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16 },
  filterBtnActive: { backgroundColor: Colors.accent + "20" },
  filterText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  matchBadge: { backgroundColor: Colors.accentRed, borderRadius: 10, width: 20, height: 20, justifyContent: "center", alignItems: "center" },
  matchBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" as const },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 80 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
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
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
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
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  matchCardAccepted: { borderColor: Colors.success + "60", backgroundColor: Colors.success + "08" },
  matchHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  matchTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  matchPair: { flexDirection: "row", alignItems: "center", gap: 10 },
  matchProposal: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, padding: 10 },
  matchLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 4 },
  matchProposalTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  matchProposalSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  matchActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  matchBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  matchAcceptBtn: { backgroundColor: Colors.accent },
  matchRejectBtn: { backgroundColor: Colors.accentRed + "15", borderWidth: 1, borderColor: Colors.accentRed + "40" },
  matchBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chatLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "center" },
  chatLinkText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.accent },
});
