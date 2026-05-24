import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FavoriteStar from "@/components/FavoriteStar";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";

interface ProfileDetailHeaderProfile {
  avatarUrl?: string | null;
  userType?: string | null;
  isOnline?: boolean;
  isAvailable?: boolean;
  lastLoginAt?: string | null;
  nickname?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  bio?: string | null;
  sex?: string | null;
}
interface ProfileDetailHeaderProps {
  profile: ProfileDetailHeaderProfile;
  id: string;
  isSelf: boolean;
  color: string;
  baseUrl: string;
  formatLastSeen: (dateStr: string | null) => string;
  getUserTypeLabel: (userType: string) => string;
  sprintRankData: { rank?: number | null } | null | undefined;
  onSprintRankPress: () => void;
}

export const ProfileDetailHeader: React.FC<ProfileDetailHeaderProps> = ({
  profile,
  id,
  isSelf,
  color,
  baseUrl,
  formatLastSeen,
  getUserTypeLabel,
  sprintRankData,
  onSprintRankPress,
}) => {
  return (
    <View style={styles.avatarSection}>
      <View style={[styles.avatar, { backgroundColor: color + "33" }]}>
        {profile.avatarUrl ? (
          <Image
            source={{ uri: profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${baseUrl}${profile.avatarUrl}` }}
            style={styles.avatarImage}
          />
        ) : (
          <Ionicons
            name={profile.userType === "coppia" ? "people" : profile.userType === "zavorrina" ? "person" : "bicycle"}
            size={48}
            color={color}
          />
        )}
      </View>
      <View style={styles.nicknameRow}>
        <Text style={[styles.nickname, { color }]}>{profile.nickname}</Text>
        {!isSelf && <FavoriteStar targetUserId={id} size={22} />}
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: profile.isOnline ? "#4CAF5022" : "#66666622" }]}>
          <View style={[styles.statusDot, { backgroundColor: profile.isOnline ? "#4CAF50" : "#888" }]} />
          <Text style={[styles.statusBadgeText, { color: profile.isOnline ? "#4CAF50" : "#888" }]}>
            {profile.isOnline ? "Online" : "Offline"}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: profile.isAvailable ? "#4CAF5022" : "#66666622" }]}>
          <View style={[styles.statusDot, { backgroundColor: profile.isAvailable ? Colors.success : "#888" }]} />
          <Text style={[styles.statusBadgeText, { color: profile.isAvailable ? Colors.success : "#888" }]}>
            {profile.isAvailable ? "Disponibile" : "Non disponibile"}
          </Text>
        </View>
      </View>
      {!profile.isOnline && profile.lastLoginAt && (
        <Text style={styles.lastSeenText}>
          {"Last seen: " + formatLastSeen(profile.lastLoginAt)}
        </Text>
      )}
      <Text style={styles.userType}>
        {getUserTypeLabel(profile.userType ?? "")}
        {profile.sex ? ` · ${profile.sex === "M" ? "Maschio" : "Femmina"}` : ""}
      </Text>
      {(!!profile.country || !!profile.region) && (
        <View style={styles.locationRow}>
          <Ionicons name="location" size={14} color={Colors.textSecondary} />
          <Text style={styles.locationText}>
            {[
              profile.region || null,
              profile.city || null,
              profile.country ? getCountryFlag(profile.country) + " " + getCountryName(profile.country as string) : null,
            ].filter(Boolean).join(", ")}
          </Text>
        </View>
      )}

      {sprintRankData?.rank != null && (
        <TouchableOpacity
          style={styles.sprintRankBadge}
          onPress={onSprintRankPress}
          activeOpacity={0.8}
          testID="sprint-rank-badge"
        >
          <Ionicons name="trophy-outline" size={16} color={Colors.accentRed} />
          <Text style={styles.sprintRankText}>Sprint rank: #{sprintRankData.rank}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {!!profile.bio && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bio</Text>
          <Text style={styles.bioText}>{profile.bio}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  avatarSection: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  nicknameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 0 },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeenText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  userType: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sprintRankBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentRed + "50",
  },
  sprintRankText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  section: { paddingHorizontal: 20, marginTop: 16, width: "100%" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  bioText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },
});
