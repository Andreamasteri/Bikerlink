// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { DistanceBadge } from "../DistanceBadge";
import { MatchActions } from "../MatchActions";
import { WhyMatchButton } from "../WhyMatchButton";
import { SUPERMATCH_COLOR } from "./constants";
import { sharedStyles } from "./sharedStyles";
import { NuovoBadge } from "./NuovoBadge";
import { CompatibilityBadge } from "./CompatibilityBadge";
import { MatchReasonChipsInline } from "../MatchReasonChipsInline";

export function GarageMatchCard({ match, currentUserId, onAccept, onReject, onChatPress, onRemove, isPending, t, locale }: {
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

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : (isSuperMatch && isNew) ? SUPERMATCH_COLOR : Colors.accent;
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : (isSuperMatch && isNew) ? t("match.superMatch") : t("match.garage");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted ? "checkmark-circle" : isRejected ? "close-circle" : (isSuperMatch && isNew) ? "flash" : "bicycle";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    : null;

  return (
    <View style={[
      sharedStyles.matchCard,
      isSuperMatch && isNew && sharedStyles.matchCardSupermatch,
      isAccepted && sharedStyles.matchCardAccepted,
      isRejected && sharedStyles.matchCardDimmed,
    ]}>
      <View style={sharedStyles.matchStatusRow}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
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
            name={otherType === "biker" ? "bicycle" : "person"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[sharedStyles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={sharedStyles.matchUserType}>
              {t(`userType.${otherType}`)}
            </Text>
          </View>
          <DistanceBadge distanceKm={match.distanceKm} distanceFlag={match.distanceFlag} />
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isAccepted && onChatPress && (
        <TouchableOpacity style={sharedStyles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={sharedStyles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      {isAccepted && (
        <Text style={{ fontSize: 40, textAlign: "center", marginVertical: 6 }}>❤️</Text>
      )}

      <View style={sharedStyles.matchProposals}>
        <View style={[sharedStyles.proposalMini, { flex: 1 }]}>
          <Text style={sharedStyles.proposalMiniLabel}>{t("match.moto")}</Text>
          <Text style={sharedStyles.proposalMiniTitle} numberOfLines={1}>
            {motoInfo ? `${motoInfo.brand || ""} ${motoInfo.model || ""}`.trim() || motoInfo.motorcycleType || t("match.moto") : t("match.moto")}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={18} color={Colors.accent} style={{ marginHorizontal: 4 }} />
        <View style={[sharedStyles.proposalMini, { flex: 1 }]}>
          <Text style={[sharedStyles.proposalMiniLabel, { color: Colors.accent }]}>{t("match.wishlist")}</Text>
          <Text style={sharedStyles.proposalMiniTitle} numberOfLines={1}>
            {wishInfo ? `${wishInfo.brand || ""} ${wishInfo.model || ""}`.trim() || wishInfo.motorcycleType || t("match.any") : t("match.any")}
          </Text>
        </View>
      </View>

      <CompatibilityBadge
        myTargets={isBiker ? ["zavorrina"] : ["biker"]}
        theirTargets={isBiker ? ["biker"] : ["zavorrina"]}
        t={t}
      />

      <MatchReasonChipsInline
        scoreBreakdown={match.scoreBreakdown}
        isSupermatch={isSuperMatch}
        motorcycleBrand={match.motorcycleBrand}
      />

      {(isNew || isAccepted) && match.id && (
        <View style={{ marginTop: 8 }}>
          <WhyMatchButton matchId={match.id} kind="garage" t={t} />
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
