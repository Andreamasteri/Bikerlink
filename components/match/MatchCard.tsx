import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { DistanceBadge } from "./DistanceBadge";
import { MatchActions } from "./MatchActions";

export function getSearchTypeIcon(searchType?: string | null): keyof typeof Ionicons.glyphMap {
  switch (searchType) {
    case "find_a_friend": return "people";
    case "find_a_guest": return "person-add";
    case "hitcher":
    case "hitchhiker": return "car";
    case "find_a_biker": return "bicycle";
    default: return "megaphone";
  }
}

export const SEARCH_TYPE_I18N: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "proposals.searchType.findPassenger",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker",
};

const TARGET_TYPE_I18N: Record<string, string> = {
  biker: "proposal.targetBiker",
  zavorrina: "proposal.targetZavorrina",
  hitchhiker: "proposal.targetHitchhiker",
  hitcher: "proposal.targetHotcher",
  coppia: "userType.coppia",
};

function getTargetLabel(types: string[] | null | undefined, t: (k: string) => string): string | null {
  if (!types || types.length === 0) return null;
  return types
    .map((type) => {
      const key = TARGET_TYPE_I18N[type];
      return key ? t(key) : type;
    })
    .filter(Boolean)
    .join(" / ") || null;
}

function getCompatibilityExplanation(
  myTargets: string[] | null | undefined,
  theirTargets: string[] | null | undefined,
  t: (k: string) => string
): string {
  const mySet = new Set(myTargets ?? []);
  const theirSet = new Set(theirTargets ?? []);

  const isBikerBiker = mySet.has("biker") && theirSet.has("biker");
  const isGarage =
    (mySet.has("zavorrina") && theirSet.has("biker")) ||
    (mySet.has("biker") && theirSet.has("zavorrina"));

  if (isBikerBiker) {
    return t("compatibility.bikerBikerExplanation");
  }
  if (isGarage) {
    return t("compatibility.garageExplanation");
  }
  return t("compatibility.genericExplanation");
}

function CompatibilitySheet({
  visible,
  onClose,
  label,
  explanation,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  label: string;
  explanation: string;
  t: (k: string) => string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={sheetStyles.grabber} />

          <View style={sheetStyles.iconRow}>
            <View style={sheetStyles.iconCircle}>
              <Ionicons name="git-compare-outline" size={28} color={Colors.accent} />
            </View>
          </View>

          <Text style={sheetStyles.title}>{t("compatibility.sheetTitle")}</Text>

          <View style={sheetStyles.badgeRow}>
            <Ionicons name="git-compare-outline" size={14} color={Colors.accent} />
            <Text style={sheetStyles.badgeLabel}>{label}</Text>
          </View>

          <Text style={sheetStyles.explanation}>{explanation}</Text>

          <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={sheetStyles.closeBtnText}>{t("compatibility.closeBtn")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "web" ? 34 : 40,
    paddingTop: 12,
    alignItems: "center",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 20,
  },
  iconRow: {
    marginBottom: 12,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 14,
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent + "14",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 16,
  },
  badgeLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  explanation: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  closeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.background,
  },
});

function CompatibilityBadge({ myTargets, theirTargets, t }: {
  myTargets: string[] | null | undefined;
  theirTargets: string[] | null | undefined;
  t: (k: string) => string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const myLabel = getTargetLabel(myTargets, t);
  const theirLabel = getTargetLabel(theirTargets, t);
  if (!myLabel && !theirLabel) return null;

  const label =
    myLabel && theirLabel
      ? `${myLabel} ↔ ${theirLabel}`
      : myLabel || theirLabel || "";

  const explanation = getCompatibilityExplanation(myTargets, theirTargets, t);

  return (
    <>
      <TouchableOpacity
        style={compatBadgeStyles.row}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="git-compare-outline" size={12} color={Colors.accent} />
        <Text style={compatBadgeStyles.text} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="information-circle-outline" size={13} color={Colors.accent} style={{ opacity: 0.7 }} />
      </TouchableOpacity>

      <CompatibilitySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={label}
        explanation={explanation}
        t={t}
      />
    </>
  );
}

const compatBadgeStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.accent + "14",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    flexShrink: 1,
  },
});

export const SUPERMATCH_COLOR = "#FF8C00";

const sharedStyles = StyleSheet.create({
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
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  matchCardDimmed: {
    opacity: 0.6,
    borderColor: Colors.border,
  },
  matchStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  matchDate: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  removeBtn: {
    marginLeft: 4,
    padding: 2,
  },
  matchUserInfo: {
    flexDirection: "row",
    alignItems: "center",
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
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  chatBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  matchProposals: {
    flexDirection: "row",
    alignItems: "center",
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
  proposalMiniTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});

export function GarageMatchCard({ match, currentUserId, onAccept, onReject, onChatPress, onRemove, isPending, t, locale }: {
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
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
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
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={sharedStyles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={{ marginBottom: 10 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
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

export function BikerBikerMatchCard({ match, currentUserId, onAccept, onReject, onBlock, onChatPress, onRemove, isPending, t, locale }: {
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
      sharedStyles.matchCard,
      isSuperMatch && isNew && sharedStyles.matchCardSupermatch,
      isAccepted && sharedStyles.matchCardAccepted,
      isRejected && sharedStyles.matchCardDimmed,
    ]}>
      <View style={[sharedStyles.matchStatusRow, { marginBottom: 6 }]}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[sharedStyles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={sharedStyles.matchDate}>{createdDate}</Text>}
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={sharedStyles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={{ marginBottom: 6 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
        activeOpacity={0.7}
      >
        <View style={sharedStyles.matchUserInfo}>
          <Ionicons name="bicycle" size={24} color={Colors.maleIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[sharedStyles.matchNickname, { color: Colors.maleIcon }]}>{otherNickname}</Text>
            <Text style={sharedStyles.matchUserType}>{t("userType.biker")}</Text>
          </View>
          <DistanceBadge distanceKm={match.distanceKm} distanceFlag={match.distanceFlag} />
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      <CompatibilityBadge
        myTargets={["biker"]}
        theirTargets={["biker"]}
        t={t}
      />

      {isAccepted && onChatPress && (
        <TouchableOpacity style={sharedStyles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={sharedStyles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      {isNew && (
        <MatchActions
          onAccept={onAccept}
          onReject={onReject}
          onBlock={onBlock}
          isPending={isPending}
          t={t}
        />
      )}
    </View>
  );
}

export function MatchCardFull({ match, currentUserId, onAccept, onReject, onChatPress, onRemove, isPending, t, locale }: {
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
      sharedStyles.matchCard,
      isAccepted && sharedStyles.matchCardAccepted,
      (isRejected || isExpired) && sharedStyles.matchCardDimmed,
    ]}>
      <View style={sharedStyles.matchStatusRow}>
        <Ionicons name={statusIcon} size={18} color={statusColor} />
        <Text style={[sharedStyles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={sharedStyles.matchDate}>{createdDate}</Text>}
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} style={sharedStyles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={{ marginBottom: 10 }}
        onPress={() => otherUserId && cardRouter.push(`/profile/${otherUserId}` as any)}
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
