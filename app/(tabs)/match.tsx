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
  TextInput,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { queryClient, getApiUrl, apiRequest, ServerBusyError } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";

import SynecoAd from "@/components/SynecoAd";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const isSuperMatch = !!(match.isSupermatch);

  const SUPERMATCH_COLOR = "#FF8C00";
  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : (isSuperMatch && isNew) ? SUPERMATCH_COLOR : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : (isSuperMatch && isNew) ? t("match.superMatch") : t("match.garage");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : (isSuperMatch && isNew) ? "flash" : "bicycle";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <View style={[
      styles.matchCard,
      isSuperMatch && isNew && styles.matchCardSupermatch,
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
          {match.distanceFlag === "old_psn" ? (
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color={Colors.warning} />
              <Text style={[styles.distanceBadgeText, { color: Colors.warning }]}>Old Psn</Text>
            </View>
          ) : match.distanceKm != null ? (
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color={Colors.textSecondary} />
              <Text style={styles.distanceBadgeText}>{match.distanceKm} km</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isAccepted && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      {isAccepted && (
        <Text style={{ fontSize: 40, textAlign: "center", marginVertical: 6 }}>❤️</Text>
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

function BikerBikerMatchCard({ match, currentUserId, onAccept, onReject, onBlock, onChatPress, onRemove, isPending, t, locale }: {
  match: any;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onBlock: () => void;
  onChatPress?: () => void;
  onRemove?: () => void;
  isPending: boolean;
  t: (key: string) => string;
  locale: string;
}) {
  const cardRouter = useRouter();
  const isBiker1 = match.biker1Id === currentUserId;
  const otherNickname = isBiker1 ? match.biker2Nickname : match.biker1Nickname;
  const otherUserId = isBiker1 ? match.biker2Id : match.biker1Id;
  const isNew = match.status === "new";
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";
  const isSuperMatch = !!(match.isSupermatch);

  const SUPERMATCH_COLOR = "#FF8C00";
  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : (isSuperMatch && isNew) ? SUPERMATCH_COLOR : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : (isSuperMatch && isNew) ? t("match.superMatch") : "Garage Match!";
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : (isSuperMatch && isNew) ? "flash" : "bicycle";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <View style={[
      styles.matchCard,
      isSuperMatch && isNew && styles.matchCardSupermatch,
      isAccepted && styles.matchCardAccepted,
      isRejected && styles.matchCardDimmed,
    ]}>
      <View style={[styles.matchStatusRow, { marginBottom: 6 }]}>
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
        style={{ marginBottom: 6 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.matchUserInfo}>
          <Ionicons name="bicycle" size={24} color={Colors.maleIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.matchNickname, { color: Colors.maleIcon }]}>{otherNickname}</Text>
            <Text style={styles.matchUserType}>{t("userType.biker")}</Text>
          </View>
          {match.distanceFlag === "old_psn" ? (
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color={Colors.warning} />
              <Text style={[styles.distanceBadgeText, { color: Colors.warning }]}>Old Psn</Text>
            </View>
          ) : match.distanceKm != null ? (
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color={Colors.textSecondary} />
              <Text style={styles.distanceBadgeText}>{match.distanceKm} km</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isAccepted && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}


      {isNew && (
        <View style={{ marginTop: 6, gap: 5 }}>
          <View style={styles.matchActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={onReject}
              disabled={isPending}
            >
              <Ionicons name="close" size={18} color={Colors.accentRed} />
              <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>{t("match.reject")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.blockBtn]}
              onPress={onBlock}
              disabled={isPending}
            >
              <Ionicons name="ban" size={16} color={Colors.accentRed} />
              <Text style={[styles.actionBtnText, { color: Colors.accentRed, fontSize: 16 }]}>{t("match.blockUser")}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={onAccept}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("match.accept")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

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

type TabKey = "zavorrine" | "biker" | "proposals" | "music" | "accepted" | "blacklist";

export default function MatchScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("zavorrine");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [distanceMode, setDistanceMode] = useState<"all" | "km">("all");
  const [distanceKm, setDistanceKm] = useState<string>("50");
  const [pendingKm, setPendingKm] = useState<string>("50");
  const [musicCriteria, setMusicCriteria] = useState<string>("songs,genre");
  const [musicLogic, setMusicLogic] = useState<string>("almeno_uno");
  const [musicMinSongs, setMusicMinSongs] = useState<number>(5);

  const { data: refetchIntervalData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/profile-refetch-interval"],
  });
  const profileRefetchMs = (refetchIntervalData?.seconds ?? 30) * 1000;

  const { data: myProfile } = useQuery<{ latitude?: number | null; longitude?: number | null }>({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
    refetchInterval: profileRefetchMs,
  });

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.multiGet(["match_distance_mode", "match_distance_km"]).then(pairs => {
        const mode = pairs[0][1];
        const km = pairs[1][1];
        if (mode === "all" || mode === "km") setDistanceMode(mode);
        if (km) { setDistanceKm(km); setPendingKm(km); }
      }).catch(() => {});
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (activeTab !== "music") return;
      AsyncStorage.multiGet(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
        .then(pairs => {
          const criteria = pairs[0][1] ?? "songs,genre";
          const logic = pairs[1][1] ?? "almeno_uno";
          const minS = pairs[2][1] ?? "5";
          setMusicCriteria(criteria);
          setMusicLogic(logic);
          setMusicMinSongs(parseInt(minS, 10) || 5);
        })
        .catch(() => {});
    }, [activeTab])
  );

  const { data: proposalMatches, isLoading: proposalLoading, refetch: proposalRefetch, isRefetching: proposalRefetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: garageMatches, isLoading: garageLoading, refetch: garageRefetch, isRefetching: garageRefetching, error: garageError, failureReason: garageFailureReason, isFetching: garageIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/garage-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: bikerMatches, isLoading: bikerLoading, refetch: bikerRefetch, isRefetching: bikerRefetching, error: bikerError, failureReason: bikerFailureReason, isFetching: bikerIsFetching } = useQuery<any[]>({
    queryKey: ["/api/proposals/biker-matches"],
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnMount: true,
  });

  const { data: blockedUsers, isLoading: blockedLoading, refetch: blockedRefetch, isRefetching: blockedRefetching } = useQuery<any[]>({
    queryKey: ["/api/users/blocked"],
    enabled: !!user,
    refetchOnMount: true,
  });

  const { data: lastfmStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/lastfm/status"],
    enabled: !!user && activeTab === "music",
  });

  const { data: musicMatchData, isLoading: musicLoading, isRefetching: musicRefetching, refetch: musicRefetch } = useQuery<{ matches: any[] }>({
    queryKey: ["/api/match/music", distanceMode, distanceKm, musicCriteria, musicLogic, musicMinSongs],
    queryFn: async () => {
      const parsedKmLocal = parseFloat(distanceKm);
      const kmLimitLocal = Number.isFinite(parsedKmLocal) && parsedKmLocal > 0 ? parsedKmLocal : 50;
      const maxKm = distanceMode === "km" ? kmLimitLocal : 500;
      const url = new URL("/api/match/music", getApiUrl());
      url.searchParams.set("criteria", musicCriteria);
      url.searchParams.set("maxKm", String(maxKm));
      url.searchParams.set("logic", musicLogic === "tutti" ? "all" : "any");
      url.searchParams.set("minSongs", String(musicMinSongs));
      const res = await globalThis.fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!user && activeTab === "music" && lastfmStatus?.connected === true,
  });

  const musicMatches = musicMatchData?.matches ?? [];

  const prevMatchCountRef = useRef<number | null>(null);

  const allProposalMatches = proposalMatches || [];
  const allGarageMatches = garageMatches || [];
  const allBikerMatches = bikerMatches || [];
  const allBlockedUsers = blockedUsers || [];

  const matchSortScore = (m: any): number => {
    const isSuper = !!m.isSupermatch;
    const isNew = m.status === "new";
    if (isSuper && isNew) return 3;
    if (isSuper) return 2;
    if (isNew) return 1;
    return 0;
  };

  const myLat = myProfile?.latitude != null ? parseFloat(String(myProfile.latitude)) : (user?.firstLoginLat != null ? parseFloat(String(user.firstLoginLat)) : null);
  const myLng = myProfile?.longitude != null ? parseFloat(String(myProfile.longitude)) : (user?.firstLoginLng != null ? parseFloat(String(user.firstLoginLng)) : null);
  const parsedKm = parseFloat(distanceKm);
  const kmLimit = Number.isFinite(parsedKm) && parsedKm > 0 ? parsedKm : 50;

  const passesDistanceFilter = (match: any): boolean => {
    if (match.status !== "new") return true;
    if (distanceMode !== "km") return true;
    if (match.distanceFlag === "ok" && match.distanceKm != null) return match.distanceKm <= kmLimit;
    if (match.distanceFlag === "old_psn") return true;
    if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return true;
    const lat2 = parseFloat(String(match.otherLat));
    const lng2 = parseFloat(String(match.otherLng));
    if (!Number.isFinite(lat2) || !Number.isFinite(lng2)) return false;
    return haversineKm(myLat!, myLng!, lat2, lng2) <= kmLimit;
  };

  const visibleGarageMatches = allGarageMatches
    .filter((m: any) => m.status !== "rejected" && m.status !== "accepted" && passesDistanceFilter(m))
    .sort((a: any, b: any) => matchSortScore(b) - matchSortScore(a));
  const visibleBikerMatches = allBikerMatches
    .filter((m: any) => m.status !== "rejected" && m.status !== "accepted" && passesDistanceFilter(m))
    .sort((a: any, b: any) => {
      const scoreDiff = matchSortScore(b) - matchSortScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  const visibleProposalMatches = allProposalMatches.filter((m: any) => m.status !== "rejected" && m.status !== "expired" && m.status !== "accepted");

  const acceptedGarageMatches = allGarageMatches
    .filter((m: any) => m.status === "accepted")
    .map((m: any) => ({ ...m, _matchType: "garage" as const }));
  const acceptedBikerMatches = allBikerMatches
    .filter((m: any) => m.status === "accepted")
    .map((m: any) => ({ ...m, _matchType: "biker" as const }));
  const acceptedProposalMatches = allProposalMatches
    .filter((m: any) => m.status === "accepted")
    .map((m: any) => ({ ...m, _matchType: "proposal" as const }));
  const allAcceptedMatches = [...acceptedGarageMatches, ...acceptedBikerMatches, ...acceptedProposalMatches]
    .sort((a: any, b: any) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  const newGarageMatches = visibleGarageMatches.filter((m: any) => m.status === "new");
  const newBikerMatches = visibleBikerMatches.filter((m: any) => m.status === "new");
  const newProposalMatches = visibleProposalMatches.filter((m: any) => m.status === "pending");

  const totalNew = newGarageMatches.length + newBikerMatches.length + newProposalMatches.length;

  useEffect(() => {
    if (prevMatchCountRef.current === null) {
      prevMatchCountRef.current = totalNew;
      return;
    }
    if (totalNew > prevMatchCountRef.current) {
      if (Platform.OS === "web") {
        window.alert(`${t("match.newMatchAlert")}\n${t("match.checkTab")}`);
      } else {
        Alert.alert(t("match.newMatchAlert"), t("match.checkTab"));
      }
    }
    prevMatchCountRef.current = totalNew;
  }, [totalNew]);

  const currentList =
    activeTab === "zavorrine" ? visibleGarageMatches :
    activeTab === "biker" ? visibleBikerMatches :
    activeTab === "proposals" ? visibleProposalMatches :
    activeTab === "music" ? musicMatches :
    activeTab === "accepted" ? allAcceptedMatches :
    allBlockedUsers;

  const isLoading =
    activeTab === "zavorrine" ? garageLoading :
    activeTab === "biker" ? bikerLoading :
    activeTab === "proposals" ? proposalLoading :
    activeTab === "music" ? musicLoading :
    activeTab === "accepted" ? (garageLoading || bikerLoading || proposalLoading) :
    blockedLoading;

  const isServerBusy =
    ((activeTab === "zavorrine" || activeTab === "accepted") &&
      ((garageFailureReason instanceof ServerBusyError && garageIsFetching) || garageError instanceof ServerBusyError)) ||
    ((activeTab === "biker" || activeTab === "accepted") &&
      ((bikerFailureReason instanceof ServerBusyError && bikerIsFetching) || bikerError instanceof ServerBusyError));
  const isRefetching =
    activeTab === "zavorrine" ? garageRefetching :
    activeTab === "biker" ? bikerRefetching :
    activeTab === "proposals" ? proposalRefetching :
    activeTab === "music" ? musicRefetching :
    activeTab === "accepted" ? (garageRefetching || bikerRefetching || proposalRefetching) :
    blockedRefetching;

  const onRefresh = useCallback(() => {
    garageRefetch();
    bikerRefetch();
    proposalRefetch();
    blockedRefetch();
    if (activeTab === "music") musicRefetch();
  }, [garageRefetch, bikerRefetch, proposalRefetch, blockedRefetch, musicRefetch, activeTab]);

  const acceptGarageMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/proposals/garage-matches/${matchId}/accept`);
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
      const res = await apiRequest("POST", `/api/proposals/garage-matches/${matchId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const removeGarageMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("DELETE", `/api/proposals/garage-matches/${matchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const acceptBikerMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/proposals/biker-matches/${matchId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      setPendingMatchId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
    onError: (err: Error) => {
      setPendingMatchId(null);
      Alert.alert(t("match.error"), err.message);
    },
  });

  const rejectBikerMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/proposals/biker-matches/${matchId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const blockFromMatchMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await apiRequest("POST", `/api/users/${otherUserId}/block`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const unblockMutation = useMutation({
    mutationFn: async (blockedId: string) => {
      const res = await apiRequest("DELETE", `/api/users/${blockedId}/block`);
      return res.json();
    },
    onMutate: async (blockedId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/users/blocked"] });
      const previous = queryClient.getQueryData<any[]>(["/api/users/blocked"]);
      queryClient.setQueryData<any[]>(["/api/users/blocked"], (old) =>
        (old ?? []).filter((u: any) => u.id !== blockedId)
      );
      return { previous };
    },
    onError: (err: Error, _blockedId, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/users/blocked"], context.previous);
      }
      Alert.alert(t("match.error"), err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
    },
  });

  const removeBikerMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("DELETE", `/api/proposals/biker-matches/${matchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

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
      Alert.alert(t("match.error"), err.message);
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
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const removeProposalMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("DELETE", `/api/proposals/matches/${matchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] });
    },
    onError: (err: Error) => Alert.alert(t("match.error"), err.message),
  });

  const [isRematching, setIsRematching] = useState(false);

  const resetAndRematchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/proposals/reset-and-rematch");
      return res.json();
    },
    onSuccess: async (data: { created?: { total?: number } }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/proposals/matches"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/proposals/garage-matches"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/proposals/biker-matches"] }),
      ]);
      setIsRematching(false);
      const created = data?.created?.total ?? 0;
      Alert.alert(t("match.rematchDone"), t("match.rematchResult").replace("{count}", String(created)));
    },
    onError: (err: Error) => {
      setIsRematching(false);
      Alert.alert(t("match.error"), err.message);
    },
  });

  const handleResetAndRematch = useCallback(() => {
    const doRematch = () => {
      const val = pendingKm.trim();
      if (val && distanceMode === "km") {
        setDistanceKm(val);
        AsyncStorage.multiSet([["match_distance_mode", "km"], ["match_distance_km", val]]).catch(() => {});
      }
      setIsRematching(true);
      resetAndRematchMutation.mutate();
    };
    if (Platform.OS === "web") {
      if (window.confirm(t("match.rematchConfirm"))) {
        doRematch();
      }
    } else {
      Alert.alert(t("match.rematchTitle"), t("match.rematchConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.confirm"), onPress: doRematch },
      ]);
    }
  }, [resetAndRematchMutation, pendingKm, distanceMode, t]);

  const confirmRemoveGarageMatch = useCallback((matchId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.removeAccepted") + "?")) {
        removeGarageMatchMutation.mutate(matchId);
      }
    } else {
      Alert.alert(t("match.removeAccepted"), t("match.removeMatchConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.removeAccepted"), style: "destructive", onPress: () => removeGarageMatchMutation.mutate(matchId) },
      ]);
    }
  }, [removeGarageMatchMutation, t]);

  const confirmRemoveBikerMatch = useCallback((matchId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.removeAccepted") + "?")) {
        removeBikerMatchMutation.mutate(matchId);
      }
    } else {
      Alert.alert(t("match.removeAccepted"), t("match.removeMatchConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.removeAccepted"), style: "destructive", onPress: () => removeBikerMatchMutation.mutate(matchId) },
      ]);
    }
  }, [removeBikerMatchMutation, t]);

  const confirmRemoveProposalMatch = useCallback((matchId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(t("match.removeAccepted") + "?")) {
        removeProposalMatchMutation.mutate(matchId);
      }
    } else {
      Alert.alert(t("match.removeAccepted"), t("match.removeMatchConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.removeAccepted"), style: "destructive", onPress: () => removeProposalMatchMutation.mutate(matchId) },
      ]);
    }
  }, [removeProposalMatchMutation, t]);

  const startChatMutation = useMutation({
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

  const handleUnblock = useCallback((blockedId: string, nickname: string) => {
    const msg = t("match.unblockConfirmMsg").replace("{nickname}", nickname);
    if (Platform.OS === "web") {
      if (window.confirm(msg)) {
        unblockMutation.mutate(blockedId);
      }
    } else {
      Alert.alert(t("match.unblockConfirmTitle"), msg, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("match.unblock"), onPress: () => unblockMutation.mutate(blockedId) },
      ]);
    }
  }, [unblockMutation, t]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeTab === "music") {
      const musicUser = item.user ?? {};
      const avatar = Array.isArray(musicUser.photos) ? musicUser.photos[0] : undefined;
      return (
        <View style={styles.matchCard}>
          <View style={styles.matchUserInfo}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.blacklistAvatar} />
            ) : (
              <View style={[styles.blacklistAvatarPlaceholder, { backgroundColor: Colors.accent + "20" }]}>
                <Ionicons name="musical-notes" size={22} color={Colors.accent} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.matchNickname, { color: Colors.text }]}>{musicUser.nickname ?? "—"}</Text>
              <Text style={styles.matchUserType}>{musicUser.userType ? t(`userType.${musicUser.userType}`) : ""}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginTop: 8 }}>
            {item.songsInCommon > 0 && (
              <View style={[styles.countBadge, { backgroundColor: Colors.accent + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }]}>
                <Text style={{ fontSize: 15, color: Colors.accent, fontFamily: "Inter_500Medium" }}>{item.songsInCommon} brani in comune</Text>
              </View>
            )}
            {item.sharedArtist && (
              <View style={[styles.countBadge, { backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }]}>
                <Text style={{ fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" }}>{item.sharedArtist}</Text>
              </View>
            )}
            {item.sharedGenre && (
              <View style={[styles.countBadge, { backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }]}>
                <Text style={{ fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" }}>{item.sharedGenre}</Text>
              </View>
            )}
          </View>
        </View>
      );
    }
    if (activeTab === "blacklist") {
      const userColor = item.userType === "biker" ? Colors.maleIcon : Colors.femaleIcon;
      return (
        <View style={styles.matchCard}>
          <View style={styles.matchUserInfo}>
            {item.avatarUrl ? (
              <Image
                source={{ uri: item.avatarUrl }}
                style={styles.blacklistAvatar}
              />
            ) : (
              <View style={[styles.blacklistAvatarPlaceholder, { backgroundColor: userColor + "20" }]}>
                <Ionicons
                  name={item.userType === "biker" ? "bicycle" : "person"}
                  size={22}
                  color={userColor}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.matchNickname, { color: Colors.text }]}>{item.nickname}</Text>
              <Text style={styles.matchUserType}>{t(`userType.${item.userType || "biker"}`)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, { marginTop: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accentRed + "50" }]}
            onPress={() => handleUnblock(item.id, item.nickname)}
          >
            <Ionicons name="lock-open-outline" size={16} color={Colors.accentRed} />
            <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>{t("match.unblock")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeTab === "accepted") {
      if (item._matchType === "biker") {
        const isBiker1 = item.biker1Id === user?.id;
        const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
        return (
          <BikerBikerMatchCard
            match={item}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onBlock={() => {}}
            onChatPress={() => startChatMutation.mutate(otherUserId)}
            onRemove={() => confirmRemoveBikerMatch(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      if (item._matchType === "garage") {
        const isBiker = item.bikerId === user?.id;
        const otherUserId = isBiker ? item.zavarrinaId : item.bikerId;
        return (
          <GarageMatchCard
            match={item}
            currentUserId={user?.id || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={() => startChatMutation.mutate(otherUserId)}
            onRemove={() => confirmRemoveGarageMatch(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }
      return (
        <MatchCardFull
          match={item}
          currentUserId={user?.id || ""}
          onAccept={() => {}}
          onReject={() => {}}
          onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as any) : undefined}
          onRemove={() => confirmRemoveProposalMatch(item.id)}
          isPending={false}
          t={t}
          locale={locale}
        />
      );
    }

    if (activeTab === "biker") {
      const isBiker1 = item.biker1Id === user?.id;
      const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
      return (
        <BikerBikerMatchCard
          match={item}
          currentUserId={user?.id || ""}
          onAccept={() => {
            setPendingMatchId(item.id);
            acceptBikerMutation.mutate(item.id);
          }}
          onReject={() => rejectBikerMutation.mutate(item.id)}
          onBlock={() => {
            const nickname = (item.biker1Id === user?.id ? item.biker2Nickname : item.biker1Nickname) || t("match.thisUser");
            const msg = t("match.blockUserConfirmMsg").replace("{nickname}", nickname);
            Alert.alert(t("match.blockUserConfirmTitle"), msg, [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("match.blockUser"), style: "destructive", onPress: () => blockFromMatchMutation.mutate(otherUserId) },
            ]);
          }}
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherUserId) : undefined}
          onRemove={item.status === "accepted" ? () => confirmRemoveBikerMatch(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
    }
    if (activeTab === "zavorrine") {
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
          onChatPress={item.status === "accepted" ? () => startChatMutation.mutate(otherUserId) : undefined}
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
  }, [activeTab, user?.id, pendingMatchId, acceptGarageMutation, rejectGarageMutation, acceptBikerMutation, rejectBikerMutation, blockFromMatchMutation, acceptMutation, rejectMutation, startChatMutation, confirmRemoveGarageMatch, confirmRemoveBikerMatch, confirmRemoveProposalMatch, handleUnblock, router, t, locale]);

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "zavorrine", label: t("match.tabZavorrine"), icon: "person", count: newGarageMatches.length },
    { key: "biker", label: t("match.tabBiker"), icon: "bicycle", count: newBikerMatches.length },
    { key: "proposals", label: t("match.tabProposals"), icon: "flash", count: newProposalMatches.length },
    { key: "music", label: t("match.tabMusic"), icon: "musical-notes", count: 0 },
    { key: "accepted", label: t("match.tabAccepted"), icon: "checkmark-circle", count: 0 },
    { key: "blacklist", label: t("match.tabBlacklist"), icon: "ban", count: 0 },
  ];

  const getEmptyIcon = (): keyof typeof Ionicons.glyphMap => {
    if (activeTab === "zavorrine") return "person-outline";
    if (activeTab === "biker") return "bicycle-outline";
    if (activeTab === "music") return "musical-notes-outline";
    if (activeTab === "accepted") return "checkmark-circle-outline";
    if (activeTab === "blacklist") return "ban-outline";
    return "flash-outline";
  };

  const getEmptyTitle = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaTitle");
    if (activeTab === "biker") return t("match.emptyBikerTitle");
    if (activeTab === "music") return t("match.emptyMusicNoMatchTitle");
    if (activeTab === "accepted") return t("match.emptyAcceptedTitle");
    if (activeTab === "blacklist") return t("match.emptyBlacklistTitle");
    return t("match.emptyProposalsTitle");
  };

  const getEmptyDesc = () => {
    if (activeTab === "zavorrine") return t("match.emptyZavorrinaDesc");
    if (activeTab === "biker") return t("match.emptyBikerDesc");
    if (activeTab === "music") return t("match.emptyMusicNoMatchDesc");
    if (activeTab === "accepted") return t("match.emptyAcceptedDesc");
    if (activeTab === "blacklist") return t("match.emptyBlacklistDesc");
    return t("match.emptyProposalsDesc");
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? insets.top + 67 : insets.top, backgroundColor: colors.background }, Platform.OS === "web" && { paddingBottom: 34 }]}>
      <InlineMiniPlayer />
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineTitle}>{t("match.title")}</Text>
      </View>

      <View style={styles.systemDescBanner}>
        <Ionicons name="information-circle" size={15} color={Colors.accent} />
        <Text style={styles.systemDescText}>{t("match.systemDesc")}</Text>
      </View>

      <View style={styles.distanceFilterRow}>
        <Ionicons name="locate-outline" size={14} color={Colors.textSecondary} />
        <TouchableOpacity
          style={[styles.distanceModeBtn, distanceMode === "all" && styles.distanceModeBtnActive]}
          onPress={() => {
            const wasKm = distanceMode === "km";
            setDistanceMode("all");
            AsyncStorage.multiSet([["match_distance_mode", "all"], ["match_distance_km", distanceKm]]).catch(() => {});
            if (wasKm) resetAndRematchMutation.mutate();
          }}
        >
          <Text style={[styles.distanceModeBtnText, distanceMode === "all" && styles.distanceModeBtnTextActive]}>
            {t("match.distanceFilterAll")}
          </Text>
        </TouchableOpacity>
        {distanceMode === "all" && (
          <TouchableOpacity
            style={[styles.distanceKmApplyBtn, (isRematching || garageRefetching || bikerRefetching || proposalRefetching) && { opacity: 0.6 }]}
            disabled={isRematching || garageRefetching || bikerRefetching || proposalRefetching}
            onPress={() => {
              handleResetAndRematch();
            }}
          >
            {isRematching ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <MaterialCommunityIcons name="magnify" size={18} color={Colors.background} />
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.distanceModeBtn, distanceMode === "km" && styles.distanceModeBtnActive]}
          onPress={() => {
            setDistanceMode("km");
            AsyncStorage.setItem("match_distance_mode", "km").catch(() => {});
          }}
        >
          <Text style={[styles.distanceModeBtnText, distanceMode === "km" && styles.distanceModeBtnTextActive]}>
            {t("match.distanceFilterKm")}
          </Text>
        </TouchableOpacity>
        {distanceMode === "km" && (
          <>
            <TextInput
              style={styles.distanceKmInput}
              value={pendingKm}
              onChangeText={setPendingKm}
              keyboardType="numeric"
              placeholder={t("match.distanceKmPlaceholder")}
              placeholderTextColor={Colors.textSecondary}
              maxLength={4}
            />
            <TouchableOpacity
              style={[styles.distanceKmApplyBtn, (isRematching || garageRefetching || bikerRefetching || proposalRefetching) && { opacity: 0.6 }]}
              disabled={isRematching || garageRefetching || bikerRefetching || proposalRefetching}
              onPress={() => {
                handleResetAndRematch();
              }}
            >
              {isRematching ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <MaterialCommunityIcons name="magnify" size={18} color={Colors.background} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
      {distanceMode === "km" && (myLat == null || myLng == null) && (
        <View style={styles.distanceWarningRow}>
          <Text style={styles.distanceWarning}>{t("match.positionUnavailable")}</Text>
        </View>
      )}

      <View style={styles.tabRowSpaced}>
        <View style={styles.tabRow}>
          {tabs.slice(0, 4).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              {tab.key !== "zavorrine" && tab.key !== "biker" && (
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={activeTab === tab.key ? Colors.accent : Colors.textSecondary}
                />
              )}
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.countBadge, { backgroundColor: Colors.accentRed }]}>
                  <Text style={[styles.countBadgeText, { color: "#fff" }]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.tabRow, styles.tabRowSecond]}>
          {tabs.slice(4).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, styles.tabSecond, activeTab === tab.key && styles.tabActive]}
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
                <View style={[styles.countBadge, { backgroundColor: Colors.accentRed }]}>
                  <Text style={[styles.countBadgeText, { color: "#fff" }]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "biker" && (
        <View style={styles.bikerInfoBanner}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.bikerInfoText}>{t("match.bikerTabInfo")}</Text>
        </View>
      )}

      {activeTab === "music" && lastfmStatus?.connected === true && (
        <View style={styles.musicCriteriaChip}>
          <Ionicons name="musical-notes" size={13} color={Colors.accent} />
          <Text style={styles.musicCriteriaText}>
            {musicCriteria.split(",").map(c =>
              c === "songs" ? t("match.musicCriteria.tracks") : c === "genre" ? t("match.musicCriteria.genre") : c === "artist" ? t("match.musicCriteria.artist") : c
            ).join(" + ")}
            {" · min "}{musicMinSongs}
            {distanceMode === "km" ? ` · ≤ ${kmLimit} km` : ` · ${t("match.anyDistance")}`}
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/music" as any)}>
            <Text style={styles.musicCriteriaChange}>{t("match.change")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === "music" && lastfmStatus?.connected !== true ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>{t("match.emptyMusicTitle")}</Text>
          <Text style={styles.emptyDesc}>{t("match.emptyMusicDesc")}</Text>
        </View>
      ) : isServerBusy ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.serverBusyText}>Per favore attendere…</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.id?.toString() ?? item.user?.id ?? item.lastfmTrackId ?? String(item.songsInCommon) + (item.user?.id ?? "")}
          renderItem={renderItem}
          extraData={[currentList, activeTab]}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
          scrollEnabled={currentList.length > 0}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={getEmptyIcon()} size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>{getEmptyTitle()}</Text>
              <Text style={styles.emptyDesc}>{getEmptyDesc()}</Text>
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
  inlineHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  inlineTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  tabRowSpaced: {
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row" as const,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    alignItems: "center" as const,
  },
  tabRowSecond: {
    justifyContent: "center" as const,
    paddingTop: 0,
  },
  tab: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  tabSecond: {
    flex: 0,
    width: "45%" as const,
  },
  tabActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  tabText: {
    fontSize: 16,
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
    fontSize: 13,
    fontWeight: "700" as const,
  },
  systemDescBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
    backgroundColor: Colors.accent + "10",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.accent + "25",
  },
  systemDescText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  distanceFilterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 6,
  },
  distanceModeBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  distanceModeBtnActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  distanceModeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  distanceModeBtnTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  distanceKmInput: {
    flex: 1,
    minWidth: 52,
    maxWidth: 88,
    height: 38,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    textAlign: "center" as const,
    includeFontPadding: false,
  },
  distanceKmApplyBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  distanceKmApplyText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  distanceWarningRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  distanceWarning: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic" as const,
    color: Colors.textSecondary,
  },
  bikerInfoBanner: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  bikerInfoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  removeBtn: {
    marginLeft: 4,
    padding: 2,
  },
  blacklistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
  },
  blacklistAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  loading: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  serverBusyText: {
    marginTop: 12,
    fontSize: 17,
    color: Colors.textSecondary,
  },
  list: {
    padding: 10,
    paddingBottom: 40,
  },
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  matchCardAccepted: {
    borderColor: Colors.success + "50",
    backgroundColor: Colors.success + "08",
  },
  matchCardSupermatch: {
    backgroundColor: "#FF8C001F",
    borderColor: "#FF8C0099",
    borderWidth: 2,
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  matchStatusText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  matchDate: {
    fontSize: 15,
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
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  matchUserType: {
    fontSize: 15,
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
    fontSize: 14,
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
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  proposalMiniSub: {
    fontSize: 14,
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
    fontSize: 16,
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
  blockBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.accentRed + "30",
  },
  actionBtnText: {
    fontSize: 17,
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
    fontSize: 17,
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
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
  },
  emptyDesc: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 24,
  },
  musicCriteriaChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  musicCriteriaText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  musicCriteriaChange: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  distanceBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    marginRight: 4,
  },
  distanceBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
