import React, { useState, useCallback, useRef, useEffect } from "react";
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
import { queryClient, getApiUrl, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";

const SEARCH_TYPE_I18N: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "proposals.searchType.findPassenger",
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

function GarageMatchCard({ match, currentUserId, onAccept, onReject, onChatPress, onRemove, isPending, t, locale }: {
  match: any;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onChatPress?: () => void;
  onRemove?: () => void;
  isPending: boolean;
  t: (key: string) => string;
  locale: string;
}) {
  const cardRouter = useRouter();
  const isBiker = match.bikerId === currentUserId;
  const otherNickname = isBiker ? match.zavarrinaNickname : match.bikerNickname;
  const otherUserId = isBiker ? match.zavarrinaId : match.bikerId;
  const otherType = isBiker ? "zavorrina" : "biker";
  const otherColor = otherType === "biker" ? Colors.maleIcon : Colors.femaleIcon;
  const motoInfo = match.bikerMoto;
  const wishInfo = match.wishlistMoto;
  const isNew = match.status === "new";
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : t("match.garage");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : "bicycle";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <View style={[
      styles.matchCard,
      isAccepted && styles.matchCardAccepted,
      isRejected && styles.matchCardDimmed,
    ]}>
      <View style={styles.matchStatusRow}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={styles.matchDate}>{createdDate}</Text>}
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.matchUserRow}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : "person"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={styles.matchUserType}>
              {t(`userType.${otherType}`)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isAccepted && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.matchProposals}>
        <View style={[styles.proposalMini, { flex: 1 }]}>
          <Text style={styles.proposalMiniLabel}>{t("match.moto")}</Text>
          <Text style={styles.proposalMiniTitle} numberOfLines={1}>
            {motoInfo ? `${motoInfo.brand || ""} ${motoInfo.model || ""}`.trim() || motoInfo.motorcycleType || t("match.moto") : t("match.moto")}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={18} color={Colors.accent} style={{ marginHorizontal: 4 }} />
        <View style={[styles.proposalMini, { flex: 1 }]}>
          <Text style={[styles.proposalMiniLabel, { color: Colors.accent }]}>{t("match.wishlist")}</Text>
          <Text style={styles.proposalMiniTitle} numberOfLines={1}>
            {wishInfo ? `${wishInfo.brand || ""} ${wishInfo.model || ""}`.trim() || wishInfo.motorcycleType || t("match.any") : t("match.any")}
          </Text>
        </View>
      </View>

      {isNew && (
        <View style={styles.matchActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            disabled={isPending}
          >
            <Ionicons name="close" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>{t("match.reject")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={onAccept}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>{t("match.accept")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

type TabKey = "pending" | "accepted" | "garage";

function MatchCardFull({ match, currentUserId, onAccept, onReject, onChatPress, onRemove, isPending, t, locale }: {
  match: any;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onChatPress?: () => void;
  onRemove?: () => void;
  isPending: boolean;
  t: (key: string) => string;
  locale: string;
}) {
  const cardRouter = useRouter();
  const isUser1 = match.userId1 === currentUserId;
  const myProposal = isUser1 ? match.proposal1 : match.proposal2;
  const otherProposal = isUser1 ? match.proposal2 : match.proposal1;
  const otherNickname = isUser1 ? match.user2Nickname : match.user1Nickname;
  const otherUserId = isUser1 ? match.userId2 : match.userId1;
  const otherType = isUser1 ? match.user2Type : match.user1Type;

  const otherColor = otherType === "biker" ? Colors.maleIcon : otherType === "zavorrina" ? Colors.femaleIcon : Colors.accent;
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";
  const isExpired = match.status === "expired";

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : isExpired ? Colors.textSecondary : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : isExpired ? t("match.expired") : t("match.pending");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : isExpired ? "time" : "hourglass";

  const scheduledDate = otherProposal?.scheduledAt
    ? new Date(otherProposal.scheduledAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
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
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.matchUserRow}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : otherType === "zavorrina" ? "person" : "people"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={styles.matchUserType}>
              {t(`userType.${otherType}`)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      <View style={styles.matchProposals}>
        <View style={styles.proposalMini}>
          <Text style={styles.proposalMiniLabel}>{t("match.yourProposal")}</Text>
          <View style={styles.proposalMiniContent}>
            <Ionicons name={getSearchTypeIcon(myProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={styles.proposalMiniTitle} numberOfLines={1}>{myProposal?.title || "—"}</Text>
          </View>
          {myProposal?.searchType && (
            <Text style={styles.proposalMiniSub}>{SEARCH_TYPE_I18N[myProposal.searchType]?.includes(".") ? t(SEARCH_TYPE_I18N[myProposal.searchType]) : SEARCH_TYPE_I18N[myProposal.searchType] || myProposal.searchType}</Text>
          )}
        </View>

        <Ionicons name="swap-horizontal" size={18} color={Colors.accent} style={{ marginHorizontal: 4 }} />

        <View style={styles.proposalMini}>
          <Text style={[styles.proposalMiniLabel, { color: otherColor }]}>{t("match.proposalOf")} {otherNickname}</Text>
          <View style={styles.proposalMiniContent}>
            <Ionicons name={getSearchTypeIcon(otherProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={styles.proposalMiniTitle} numberOfLines={1}>{otherProposal?.title || "—"}</Text>
          </View>
          {otherProposal?.searchType && (
            <Text style={styles.proposalMiniSub}>{SEARCH_TYPE_I18N[otherProposal.searchType]?.includes(".") ? t(SEARCH_TYPE_I18N[otherProposal.searchType]) : SEARCH_TYPE_I18N[otherProposal.searchType] || otherProposal.searchType}</Text>
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
            <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>{t("match.reject")}</Text>
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
                <Text style={[styles.actionBtnText, { color: "#000" }]}>{t("match.accept")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isAccepted && match.conversationId && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubbles" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>{t("match.openChat")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function MatchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
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

  const prevMatchCountRef = useRef<number | null>(null);

  const allMatches = matches || [];
  const allGarageMatches = garageMatches || [];
  const pendingProposalMatches = allMatches.filter((m: any) => m.status === "pending");
  const acceptedProposalMatches = allMatches.filter((m: any) => m.status === "accepted");

  const garageMatchesTagged = allGarageMatches.map((m: any) => ({ ...m, _isGarage: true }));
  const newGarageMatches = garageMatchesTagged.filter((m: any) => m.status === "new");
  const acceptedGarageMatches = garageMatchesTagged.filter((m: any) => m.status === "accepted");
  const visibleGarageMatches = garageMatchesTagged.filter((m: any) => m.status !== "rejected");

  const pendingMatches = [...pendingProposalMatches, ...newGarageMatches];
  const acceptedMatches = [...acceptedProposalMatches, ...acceptedGarageMatches];

  const hasRejected =
    allMatches.some((m: any) => m.status === "rejected") ||
    allGarageMatches.some((m: any) => m.status === "rejected");

  const totalNewMatches = pendingMatches.length;

  useEffect(() => {
    if (prevMatchCountRef.current === null) {
      prevMatchCountRef.current = totalNewMatches;
      return;
    }
    if (totalNewMatches > prevMatchCountRef.current) {
      if (Platform.OS === "web") {
        window.alert(`${t("match.newMatchAlert")}\n${t("match.checkTab")}`);
      } else {
        Alert.alert(t("match.newMatchAlert"), t("match.checkTab"));
      }
    }
    prevMatchCountRef.current = totalNewMatches;
  }, [totalNewMatches]);

  const currentList =
    activeTab === "pending" ? pendingMatches :
    activeTab === "accepted" ? acceptedMatches :
    visibleGarageMatches;

  const acceptMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/matches/${matchId}/accept`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.errorAccept"));
      }
      return res.json();
    },
    onSuccess: () => {
      setPendingMatchId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => {
      setPendingMatchId(null);
      Alert.alert(t("match.error"), err.message);
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
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.errorReject"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const acceptGarageMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/garage-matches/${matchId}/accept`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.errorAccept"));
      }
      return res.json();
    },
    onSuccess: () => {
      setPendingMatchId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => {
      setPendingMatchId(null);
      Alert.alert(t("match.error"), err.message);
    },
  });

  const rejectGarageMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/garage-matches/${matchId}/reject`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.errorReject"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const removeProposalMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/matches/${matchId}`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.error"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const removeGarageMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const url = new URL(`/api/proposals/garage-matches/${matchId}`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("match.error") }));
        throw new Error(err.message || t("match.error"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const resetRejectedMutation = useMutation({
    mutationFn: async () => {
      const url1 = new URL("/api/proposals/matches/rejected", getApiUrl());
      const url2 = new URL("/api/proposals/garage-matches/rejected", getApiUrl());
      const [res1, res2] = await Promise.all([
        globalThis.fetch(url1.toString(), { method: "DELETE", credentials: "include" }),
        globalThis.fetch(url2.toString(), { method: "DELETE", credentials: "include" }),
      ]);
      if (!res1.ok || !res2.ok) {
        throw new Error(t("match.error"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const handleResetRejected = useCallback(() => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.resetRejectedConfirm"))) {
        resetRejectedMutation.mutate();
      }
    } else {
      Alert.alert(t("match.resetRejected"), t("match.resetRejectedConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.confirm"), style: "destructive", onPress: () => resetRejectedMutation.mutate() },
      ]);
    }
  }, [resetRejectedMutation, t]);

  const confirmRemoveProposalMatch = useCallback((matchId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.removeAccepted") + "?")) {
        removeProposalMatchMutation.mutate(matchId);
      }
    } else {
      Alert.alert(t("match.removeAccepted"), t("match.removeMatchConfirm") || t("match.removeAccepted") + "?", [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.removeAccepted"), style: "destructive", onPress: () => removeProposalMatchMutation.mutate(matchId) },
      ]);
    }
  }, [removeProposalMatchMutation, t]);

  const confirmRemoveGarageMatch = useCallback((matchId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.removeAccepted") + "?")) {
        removeGarageMatchMutation.mutate(matchId);
      }
    } else {
      Alert.alert(t("match.removeAccepted"), t("match.removeMatchConfirm") || t("match.removeAccepted") + "?", [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.removeAccepted"), style: "destructive", onPress: () => removeGarageMatchMutation.mutate(matchId) },
      ]);
    }
  }, [removeGarageMatchMutation, t]);

  const startGarageChatMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await apiRequest("POST", "/api/chat/conversations", {
        conversationType: "private",
        participantIds: [otherUserId],
      });
      return await res.json();
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      router.push(`/chat/${conv.id}` as any);
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (item._isGarage) {
      const isBiker = item.bikerId === user?.id;
      const otherUserId = isBiker ? item.zavarrinaId : item.bikerId;
      return (
        <GarageMatchCard
          match={item}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPendingMatchId(item.id);
            acceptGarageMutation.mutate(item.id);
          }}
          onReject={() => rejectGarageMutation.mutate(item.id)}
          onChatPress={item.status === "accepted" ? () => startGarageChatMutation.mutate(otherUserId) : undefined}
          onRemove={item.status === "accepted" ? () => confirmRemoveGarageMatch(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
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
        onRemove={item.status === "accepted" ? () => confirmRemoveProposalMatch(item.id) : undefined}
        isPending={pendingMatchId === item.id}
        t={t}
        locale={locale}
      />
    );
  }, [user?.id, pendingMatchId, acceptMutation, rejectMutation, acceptGarageMutation, rejectGarageMutation, startGarageChatMutation, confirmRemoveProposalMatch, confirmRemoveGarageMatch, router]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "pending", label: t("match.tabPending"), icon: "hourglass", count: pendingMatches.length },
    { key: "accepted", label: t("match.tabAccepted"), icon: "checkmark-circle", count: acceptedMatches.length },
    { key: "garage", label: t("match.tabGarage"), icon: "bicycle", count: visibleGarageMatches.length },
  ];

  return (
    <View style={[styles.container, Platform.OS === "web" && { paddingTop: insets.top + 67, paddingBottom: 34 }]}>
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={14}
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
        {hasRejected && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleResetRejected}
            disabled={resetRejectedMutation.isPending}
          >
            {resetRejectedMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.accentRed} />
            ) : (
              <>
                <Ionicons name="refresh" size={13} color={Colors.accentRed} />
                <Text style={styles.resetBtnText}>{t("match.resetRejected")}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color={Colors.accent} />
        <Text style={styles.infoBannerText}>
          {t("match.infoBanner")}
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
          extraData={currentList}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); garageRefetch(); }} tintColor={Colors.accent} />
          }
          scrollEnabled={currentList.length > 0}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={activeTab === "pending" ? "flash-outline" : activeTab === "accepted" ? "checkmark-done-outline" : "bicycle-outline" as any}
                size={48}
                color={Colors.textSecondary}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === "pending" ? t("match.emptyPendingTitle") : activeTab === "accepted" ? t("match.emptyAcceptedTitle") : t("match.emptyGarageTitle")}
              </Text>
              <Text style={styles.emptyDesc}>
                {activeTab === "pending"
                  ? t("match.emptyPendingDesc")
                  : activeTab === "accepted"
                  ? t("match.emptyAcceptedDesc")
                  : t("match.emptyGarageDesc")}
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
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 4,
    alignItems: "center" as const,
  },
  tab: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  tabText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 4,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
  },
  resetBtn: {
    flexDirection: "row" as const,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accentRed + "15",
    borderWidth: 1,
    borderColor: Colors.accentRed + "30",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 8,
    gap: 4,
  },
  resetBtnText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accentRed,
  },
  removeBtn: {
    marginLeft: 4,
    padding: 2,
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
  statusLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
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
  matchActions: {
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
  chatIconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.accent + "20",
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
