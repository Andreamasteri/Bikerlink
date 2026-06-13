// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { MatchActions } from "../MatchActions";
import { WhyMatchButton } from "../WhyMatchButton";
import { getSearchTypeIcon, SEARCH_TYPE_I18N } from "./constants";
import { sharedStyles } from "./sharedStyles";
import { NuovoBadge } from "./NuovoBadge";
import { CompatibilityBadge } from "./CompatibilityBadge";
import { MatchReasonChipsInline } from "../MatchReasonChipsInline";

export function MatchCardFull({ match, currentUserId, onAccept, onReject, onRemove, isPending, t, locale }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match shape varies by type
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
  const isNew = match.status === "new" || match.status === "pending";

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : isExpired ? Colors.textSecondary : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : isExpired ? t("match.expired") : t("match.pending");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : isExpired ? "time" : "hourglass";

  const scheduledDate = otherProposal?.scheduledAt
    ? new Date(otherProposal.scheduledAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    : null;

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    : null;

  return (
    <View style={[
      sharedStyles.matchCard,
      isAccepted && sharedStyles.matchCardAccepted,
      (isRejected || isExpired) && sharedStyles.matchCardDimmed,
    ]}>
      <View style={sharedStyles.matchStatusRow}>
        <Ionicons name={statusIcon} size={18} color={statusColor} />
        <Text style={[sharedStyles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={sharedStyles.matchDate}>{createdDate}</Text>}
          {match.isFresh && isNew && <NuovoBadge t={t} />}
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={sharedStyles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={{ marginBottom: 10 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as never)}
        activeOpacity={0.7}
      >
        <View style={sharedStyles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : otherType === "zavorrina" ? "person" : "people"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[sharedStyles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={sharedStyles.matchUserType}>
              {t(`userType.${otherType}`)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      <View style={sharedStyles.matchProposals}>
        <View style={sharedStyles.proposalMini}>
          <Text style={sharedStyles.proposalMiniLabel}>{t("match.yourProposal")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name={getSearchTypeIcon(myProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={sharedStyles.proposalMiniTitle} numberOfLines={1}>{myProposal?.title || "—"}</Text>
          </View>
          {myProposal?.searchType && (
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 3 }}>
              {SEARCH_TYPE_I18N[myProposal.searchType]?.includes(".") ? t(SEARCH_TYPE_I18N[myProposal.searchType]) : SEARCH_TYPE_I18N[myProposal.searchType] || myProposal.searchType}
            </Text>
          )}
        </View>

        <Ionicons name="swap-horizontal" size={18} color={Colors.accent} style={{ marginHorizontal: 4 }} />

        <View style={sharedStyles.proposalMini}>
          <Text style={[sharedStyles.proposalMiniLabel, { color: otherColor }]}>{t("match.proposalOf")} {otherNickname}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name={getSearchTypeIcon(otherProposal?.searchType)} size={16} color={Colors.textSecondary} />
            <Text style={sharedStyles.proposalMiniTitle} numberOfLines={1}>{otherProposal?.title || "—"}</Text>
          </View>
          {otherProposal?.searchType && (
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 3 }}>
              {SEARCH_TYPE_I18N[otherProposal.searchType]?.includes(".") ? t(SEARCH_TYPE_I18N[otherProposal.searchType]) : SEARCH_TYPE_I18N[otherProposal.searchType] || otherProposal.searchType}
            </Text>
          )}
        </View>
      </View>

      <CompatibilityBadge
        myTargets={myProposal?.targetUserTypes}
        theirTargets={otherProposal?.targetUserTypes}
        t={t}
      />

      <MatchReasonChipsInline
        scoreBreakdown={match.scoreBreakdown}
        isSupermatch={!!(match.isSupermatch)}
        motorcycleBrand={match.motorcycleBrand}
      />

      {otherProposal?.departureAddress && (
        <View style={sharedStyles.infoRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={sharedStyles.infoText} numberOfLines={1}>{otherProposal.departureAddress}</Text>
        </View>
      )}

      {scheduledDate && (
        <View style={sharedStyles.infoRow}>
          <Ionicons name="calendar" size={14} color={Colors.textSecondary} />
          <Text style={sharedStyles.infoText}>{scheduledDate}</Text>
        </View>
      )}

      {(match.status === "pending" || isAccepted) && match.id && (
        <View style={{ marginTop: 8 }}>
          <WhyMatchButton matchId={match.id} kind="proposal" t={t} />
        </View>
      )}

      {match.status === "pending" && (
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
