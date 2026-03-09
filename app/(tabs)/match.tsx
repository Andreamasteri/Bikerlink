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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { queryClient, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const SEARCH_TYPE_LABELS: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "FindAGuest",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker",
};

function getSearchTypeIcon(searchType?: string | null): keyof typeof Ionicons.glyphMap {
  switch (searchType) {
    case "find_a_friend": return "people";
    case "find_a_guest": return "person-add";
    case "hitcher":
    case "hitchhiker": return "car";
    case "find_a_biker": return "bicycle";
    default: return "megaphone";
  }
}

function GarageMatchCard({ match, currentUserId }: { match: any; currentUserId: string }) {
  const isBiker = match.bikerId === currentUserId;
  const otherNickname = isBiker ? match.zavarrinaNickname : match.bikerNickname;
  const otherType = isBiker ? "zavorrina" : "biker";
  const otherColor = otherType === "biker" ? Colors.maleIcon : Colors.femaleIcon;
  const motoInfo = match.bikerMoto;
  const wishInfo = match.wishlistMoto;

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchStatusRow}>
        <Ionicons name="bicycle" size={16} color={Colors.accent} />
        <Text style={styles.statusLabel}>Match Garage</Text>
      </View>

      <View style={styles.proposalRow}>
        <Ionicons name="person" size={16} color={otherColor} />
        <View style={{ flex: 1 }}>
          <Text style={styles.proposalTitle}>{otherNickname}</Text>
          <Text style={styles.proposalMeta}>
            {isBiker ? "Cerca" : "Ha"}: {motoInfo ? `${motoInfo.brand || ""} ${motoInfo.model || ""}`.trim() || motoInfo.motorcycleType || "Moto" : "Moto"}
          </Text>
          {wishInfo && (
            <Text style={[styles.proposalMeta, { color: Colors.accent }]}>
              Wishlist: {`${wishInfo.brand || ""} ${wishInfo.model || ""}`.trim() || wishInfo.motorcycleType || "Qualsiasi"}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

type TabKey = "pending" | "accepted" | "garage" | "history";

function MatchCardFull({ match, currentUserId, onAccept, onReject, onChatPress, isPending }: {
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
  const isExpired = match.status === "expired";

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : isExpired ? Colors.textSecondary : Colors.accent;
  const statusLabel = isAccepted ? "Accettato" : isRejected ? "Rifiutato" : isExpired ? "Scaduto" : "In attesa";
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : isExpired ? "time" : "hourglass";

  const scheduledDate = otherProposal?.scheduledAt
    ? new Date(otherProposal.scheduledAt).toLocaleDateString("it-IT", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString("it-IT", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <View style={[
      styles.matchCard,
      isAccepted && styles.matchCardAccepted,
      (isRejected || isExpired) && styles.matchCardDimmed,
    ]}>
      <View style={styles.matchStatusRow}>
        <Ionicons name={statusIcon} size={18} color={statusColor} />
        <Text style={[styles.matchStatusText, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={styles.matchDate}>{createdDate}</Text>}
      </View>

      <View style={styles.matchUserRow}>
        <View style={styles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : otherType === "zavorrina" ? "person" : "people"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={styles.matchUserType}>
              {otherType === "biker" ? "Biker" : otherType === "zavorrina" ? "Zavorrina" : "Coppia"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.matchProposals}>
        <View style={styles.proposalMini}>
          <Text style={styles.proposalMiniLabel}>La tua proposta</Text>
          <View style={styles.proposalMiniContent}>
            <Ionicons name={getSearchTypeIcon(myProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={styles.proposalMiniTitle} numberOfLines={1}>{myProposal?.title || "—"}</Text>
          </View>
          {myProposal?.searchType && (
            <Text style={styles.proposalMiniSub}>{SEARCH_TYPE_LABELS[myProposal.searchType] || myProposal.searchType}</Text>
          )}
        </View>

        <Ionicons name="swap-horizontal" size={18} color={Colors.accent} style={{ marginHorizontal: 4 }} />

        <View style={styles.proposalMini}>
          <Text style={[styles.proposalMiniLabel, { color: otherColor }]}>Proposta di {otherNickname}</Text>
          <View style={styles.proposalMiniContent}>
            <Ionicons name={getSearchTypeIcon(otherProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={styles.proposalMiniTitle} numberOfLines={1}>{otherProposal?.title || "—"}</Text>
          </View>
          {otherProposal?.searchType && (
            <Text style={styles.proposalMiniSub}>{SEARCH_TYPE_LABELS[otherProposal.searchType] || otherProposal.searchType}</Text>
          )}
        </View>
      </View>

      {otherProposal?.departureAddress && (
        <View style={styles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText} numberOfLines={1}>{otherProposal.departureAddress}</Text>
        </View>
      )}

      {scheduledDate && (
        <View style={styles.infoRow}>
          <Ionicons name="calendar" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{scheduledDate}</Text>
        </View>
      )}

      {match.status === "pending" && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            disabled={isPending}
          >
            <Ionicons name="close" size={18} color={Colors.accentRed} />
            <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>Rifiuta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={onAccept}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#000" />
                <Text style={[styles.actionBtnText, { color: "#000" }]}>Accetta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isAccepted && match.conversationId && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubbles" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>Apri Chat</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function MatchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const { data: matches, isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
    refetchInterval: 30000,
  });

  const { data: garageMatches, isLoading: garageLoading, refetch: garageRefetch } = useQuery<any[]>({
    queryKey: ["/api/proposals/garage-matches"],
    refetchInterval: 30000,
  });

  const allMatches = matches || [];
  const allGarageMatches = garageMatches || [];
  const pendingMatches = allMatches.filter((m: any) => m.status === "pending");
  const acceptedMatches = allMatches.filter((m: any) => m.status === "accepted");
  const historyMatches = allMatches.filter((m: any) => m.status === "rejected" || m.status === "expired");

  const currentList = activeTab === "pending" ? pendingMatches : activeTab === "accepted" ? acceptedMatches : activeTab === "garage" ? allGarageMatches : historyMatches;

  const acceptMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/matches/${matchId}/accept`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message || "Errore nell'accettazione");
      }
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
      const url = new URL(`/api/proposals/matches/${matchId}/reject`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message || "Errore nel rifiuto");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeTab === "garage") {
      return <GarageMatchCard match={item} currentUserId={user?.id || ""} />;
    }
    return (
      <MatchCardFull
        match={item}
        currentUserId={user?.id || ""}
        onAccept={() => {
          setPendingMatchId(item.id);
          acceptMutation.mutate(item.id);
        }}
        onReject={() => rejectMutation.mutate(item.id)}
        onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as any) : undefined}
        isPending={pendingMatchId === item.id}
      />
    );
  }, [user?.id, pendingMatchId, acceptMutation, rejectMutation, router, activeTab]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "pending", label: "In attesa", icon: "hourglass", count: pendingMatches.length },
    { key: "accepted", label: "Accettati", icon: "checkmark-circle", count: acceptedMatches.length },
    { key: "garage", label: "Garage", icon: "bicycle", count: allGarageMatches.length },
    { key: "history", label: "Cronologia", icon: "time", count: historyMatches.length },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? Colors.accent : Colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[
                styles.countBadge,
                { backgroundColor: tab.key === "pending" ? Colors.accentRed : Colors.accent + "30" },
              ]}>
                <Text style={[
                  styles.countBadgeText,
                  { color: tab.key === "pending" ? "#fff" : Colors.accent },
                ]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color={Colors.accent} />
        <Text style={styles.infoBannerText}>
          Il sistema è sempre in cerca di match, sia tra altri Biker che zavorrine. Se vuoi ricevere subito notifiche, non chiudere l'app.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); garageRefetch(); }} tintColor={Colors.accent} />
          }
          scrollEnabled={currentList.length > 0}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={activeTab === "pending" ? "flash-outline" : activeTab === "accepted" ? "checkmark-done-outline" : activeTab === "garage" ? "bicycle-outline" as any : "archive-outline"}
                size={48}
                color={Colors.textSecondary}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === "pending" ? "Nessun match in attesa" : activeTab === "accepted" ? "Nessun match accettato" : activeTab === "garage" ? "Nessun match garage" : "Nessun match nella cronologia"}
              </Text>
              <Text style={styles.emptyDesc}>
                {activeTab === "pending"
                  ? "Crea una proposta nella tab Proposte e il sistema troverà automaticamente biker o zavorrine compatibili!"
                  : activeTab === "accepted"
                  ? "Quando accetti un match, apparirà qui con il link alla chat."
                  : activeTab === "garage"
                  ? "Il sistema incrocia le moto dei biker con la wishlist delle zavorrine. Aggiungi moto al garage o alla wishlist per trovare match!"
                  : "I match rifiutati o scaduti appariranno qui."}
              </Text>
            </View>
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
  infoBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent + "15",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  tabRow: {
    flexDirection: "row" as const,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  loading: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  list: {
    padding: 10,
    paddingBottom: 40,
  },
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  matchCardAccepted: {
    borderColor: Colors.success + "50",
    backgroundColor: Colors.success + "08",
  },
  matchCardDimmed: {
    opacity: 0.6,
    borderColor: Colors.border,
  },
  matchStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 10,
  },
  matchStatusText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  matchDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  matchUserRow: {
    marginBottom: 10,
  },
  matchUserInfo: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  matchNickname: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  matchUserType: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  matchProposals: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  proposalMini: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
  },
  proposalMiniLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  proposalMiniContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  proposalMiniTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  proposalMiniSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 3,
  },
  infoRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  acceptBtn: {
    backgroundColor: Colors.accent,
  },
  rejectBtn: {
    backgroundColor: Colors.accentRed + "15",
    borderWidth: 1,
    borderColor: Colors.accentRed + "40",
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  chatBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginTop: 12,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
  },
  chatBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.background,
  },
  empty: {
    alignItems: "center" as const,
    paddingTop: 60,
    paddingHorizontal: 30,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 20,
  },
});
