import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCurrentLocale } from "@/lib/i18n";

export type Club = {
  id: string;
  name: string;
  clubType: "brand" | "model" | "custom";
  brandName?: string | null;
  modelName?: string | null;
  country?: string | null;
  region?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  isApproved: boolean;
  isFeatured: boolean;
  memberCount: number;
  activityScore: number;
  createdAt?: string;
};

export type UserClub = {
  id: string;
  name: string;
  clubType: string;
  brandName?: string | null;
  modelName?: string | null;
  logoUrl?: string | null;
  country?: string | null;
  memberCount?: number;
  joinedAt?: string;
  role?: string;
  conversationId?: string | null;
};

const COUNTRY_LABELS: Record<string, string> = {
  IT: "🇮🇹 Italia",
  DE: "🇩🇪 Germania",
  FR: "🇫🇷 Francia",
  ES: "🇪🇸 Spagna",
  AT: "🇦🇹 Austria",
  CH: "🇨🇭 Svizzera",
  PT: "🇵🇹 Portogallo",
  NL: "🇳🇱 Paesi Bassi",
  BE: "🇧🇪 Belgio",
  PL: "🇵🇱 Polonia",
};

export function countryFlag(code?: string | null): string {
  if (!code) return "";
  const flag = COUNTRY_LABELS[code.toUpperCase()];
  return flag ? flag.split(" ")[0] : code.toUpperCase();
}

export function ClubAvatar({ club, size = 48 }: { club: Club | UserClub; size?: number }) {
  if (club.logoUrl) {
    return (
      <View style={[styles.avatarBox, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={{ fontSize: size * 0.45 }}>{countryFlag(club.country) || "🏍️"}</Text>
      </View>
    );
  }
  const initials = (club.brandName || club.name || "?").slice(0, 2).toUpperCase();
  const colors = ["#FF6600", "#4A90D9", "#E91E8C", "#4CAF50", "#FF9800", "#9C27B0"];
  const idx = initials.charCodeAt(0) % colors.length;
  return (
    <View
      style={[
        styles.avatarBox,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[idx] },
      ]}
    >
      <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

interface MotoClubCardProps {
  club: Club;
  myClubIds: Set<string>;
  onJoin: (id: string) => void;
  onLeave: (id: string, name: string) => void;
  onOpenChat?: (clubId: string, conversationId?: string | null) => void;
  joinedAt?: string;
  role?: string;
  conversationId?: string | null;
}

export const MotoClubCard: React.FC<MotoClubCardProps> = ({
  club,
  myClubIds,
  onJoin,
  onLeave,
  onOpenChat,
  joinedAt,
  role,
  conversationId,
}) => {
  const t = useT();
  const isMember = myClubIds.has(club.id);

  const cardBodyContent = (
    <>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {club.name}
        </Text>
        {club.isFeatured && (
          <View style={styles.featuredPill}>
            <Text style={styles.featuredText}>{t("motoclub.featured")}</Text>
          </View>
        )}
        {isMember && conversationId && (
          <Ionicons name="chatbubbles" size={14} color={Colors.accent} />
        )}
      </View>
      <Text style={styles.cardSub} numberOfLines={1}>
        {club.clubType === "brand"
          ? `${t("motoclub.clubOfficialPrefix")} ${club.brandName}`
          : club.clubType === "model"
          ? `${club.brandName} ${club.modelName}`
          : t("motoclub.clubCustom")}
        {club.country ? `  ${countryFlag(club.country)}` : ""}
      </Text>
      <View style={styles.cardStats}>
        <Ionicons name="people" size={12} color={Colors.textSecondary} />
        <Text style={styles.statText}>{club.memberCount ?? 0} {t("motoclub.members")}</Text>
        {isMember && joinedAt && (
          <>
            <Text style={styles.dotSep}>·</Text>
            <Text style={styles.statText}>
              {new Date(joinedAt).toLocaleDateString(getCurrentLocale(), { month: "short", year: "numeric" })}
            </Text>
          </>
        )}
        {isMember && role === "admin" && (
          <>
            <Text style={styles.dotSep}>·</Text>
            <Text style={[styles.statText, { color: Colors.accent }]}>Admin</Text>
          </>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <ClubAvatar club={club} size={52} />
        {isMember && (
          <View style={styles.memberBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          </View>
        )}
      </View>
      {isMember && onOpenChat ? (
        <TouchableOpacity
          style={styles.cardBody}
          onPress={() => onOpenChat(club.id, conversationId)}
          activeOpacity={0.7}
        >
          {cardBodyContent}
        </TouchableOpacity>
      ) : (
        <View style={styles.cardBody}>{cardBodyContent}</View>
      )}
      <TouchableOpacity
        style={[styles.joinBtn, isMember && styles.leaveBtn]}
        onPress={() =>
          isMember ? onLeave(club.id, club.name) : onJoin(club.id)
        }
        activeOpacity={0.8}
      >
        <Text style={[styles.joinBtnText, isMember && styles.leaveBtnText]}>
          {isMember ? "Iscritto" : "Entra"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  cardLeft: { position: "relative" },
  avatarBox: { alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceLight },
  avatarInitials: { color: Colors.text, fontFamily: "Inter_700Bold" },
  memberBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 1,
  },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", flex: 1 },
  featuredPill: {
    backgroundColor: Colors.warning + "33",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: { fontSize: 11, color: Colors.warning, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  statText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  dotSep: { color: Colors.textSecondary },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  joinBtnText: { fontSize: 13, color: Colors.text, fontFamily: "Inter_600SemiBold" },
  leaveBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border },
  leaveBtnText: { color: Colors.textSecondary },
});
