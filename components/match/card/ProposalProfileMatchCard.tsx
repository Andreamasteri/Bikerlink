// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { DistanceBadge } from "../DistanceBadge";
import { MatchActions } from "../MatchActions";
import { WhyMatchButton } from "../WhyMatchButton";
import { getSearchTypeIcon } from "./constants";
import { sharedStyles } from "./sharedStyles";
import { NuovoBadge } from "./NuovoBadge";
import { MatchReasonChipsInline } from "../MatchReasonChipsInline";

export function ProposalProfileMatchCard({ match, currentUserId, onAccept, onReject, onChatPress, isPending, t, locale }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match shape varies by type
  match: any;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onChatPress?: () => void;
  isPending: boolean;
  t: (key: string) => string;
  locale: string;
}) {
  const cardRouter = useRouter();
  const isBiker = match.bikerId === currentUserId;
  const otherNickname = isBiker ? match.zavarrinaNickname : match.bikerNickname;
  const otherUserId = isBiker ? match.zavarrinaId : match.bikerId;
  const otherType = isBiker ? "zavorrina" : "biker";
  const otherColor = isBiker ? Colors.femaleIcon : Colors.maleIcon;
  const isNew = match.status === "new";
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : t("match.propProfileLabel");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : "location";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    : null;

  const proposal = match.proposal;

  return (
    <View style={[
      sharedStyles.matchCard,
      isAccepted && sharedStyles.matchCardAccepted,
      isRejected && sharedStyles.matchCardDimmed,
    ]}>
      <View style={sharedStyles.matchStatusRow}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[sharedStyles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={sharedStyles.matchDate}>{createdDate}</Text>}
          {match.isFresh && isNew && <NuovoBadge t={t} />}
      </View>

      <TouchableOpacity
        style={{ marginBottom: 10 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as never)}
        activeOpacity={0.7}
      >
        <View style={sharedStyles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : "person"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[sharedStyles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={sharedStyles.matchUserType}>{t(`userType.${otherType}`)}</Text>
          </View>
          {match.distanceKm != null && (
            <DistanceBadge distanceKm={match.distanceKm} distanceFlag="ok" />
          )}
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {proposal && (
        <View style={sharedStyles.matchProposals}>
          <View style={[sharedStyles.proposalMini, { flex: 1 }]}>
            <Text style={sharedStyles.proposalMiniLabel}>{t("match.bikerProposal")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name={getSearchTypeIcon(proposal.searchType)} size={16} color={Colors.textSecondary} />
              <Text style={sharedStyles.proposalMiniTitle} numberOfLines={1}>{proposal.title || "—"}</Text>
            </View>
            {proposal.departureAddress ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                <Text style={[sharedStyles.proposalMiniLabel, { marginBottom: 0 }]} numberOfLines={1}>{proposal.departureAddress}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {isAccepted && onChatPress && (
        <TouchableOpacity style={sharedStyles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={sharedStyles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      <MatchReasonChipsInline
        scoreBreakdown={match.scoreBreakdown}
        isSupermatch={!!(match.isSupermatch)}
      />

      {(isNew || isAccepted) && match.id && (
        <View style={{ marginTop: 8 }}>
          <WhyMatchButton matchId={match.id} kind="propProfile" t={t} />
        </View>
      )}

      {isNew && (
        <MatchActions
          onAccept={onAccept}
          onReject={onReject}
          isPending={isPending}
          t={t}
        />
      )}
    </View>
  );
}
