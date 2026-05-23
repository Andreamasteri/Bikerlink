import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FavoriteStar from "@/components/FavoriteStar";
import { useRouter } from "expo-router";

export interface Member {
  profileId: string;
  role: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  country: string | null;
}

interface _ClubMembersListProps {
  members: Member[];
  totalCount: number;
  currentUserId?: string;
}

export function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return (
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65)
  );
}

export function userTypeColor(type: string) {
  if (type === "biker") return Colors.accent;
  if (type === "zavorrina") return "#EC4899";
  if (type === "couple") return "#7C3AED";
  return Colors.textSecondary;
}

export function userTypeIcon(type: string): "bicycle" | "person" | "people" {
  if (type === "biker") return "bicycle";
  if (type === "couple") return "people";
  return "person";
}

export function AvatarCircle({ nickname, size = 40 }: { nickname: string; size?: number }) {
  const palette = [Colors.accent, "#7C3AED", "#EC4899", "#059669", "#D97706", "#2563EB"];
  const idx = (nickname.charCodeAt(0) || 0) % palette.length;
  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette[idx] },
      ]}
    >
      <Text style={[avatarStyles.letter, { fontSize: size * 0.4 }]}>
        {nickname.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#fff", fontFamily: "Inter_700Bold" },
});

export const MemberCard: React.FC<{ item: Member; currentUserId?: string }> = ({ item, currentUserId }) => {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.memberCard}
      activeOpacity={0.7}
      onPress={() => router.push(`/profile/${item.profileId}` as any)}
    >
      <AvatarCircle nickname={item.nickname} size={42} />
      <View style={styles.memberInfo}>
        <View style={styles.memberRow}>
          <Text style={styles.memberName}>@{item.nickname}</Text>
          {item.profileId !== currentUserId && <FavoriteStar targetUserId={item.profileId} size={14} />}
          {item.role === "admin" && (
            <View style={[styles.rolePill, { backgroundColor: Colors.accent + "22" }]}>
              <Text style={[styles.rolePillText, { color: Colors.accent }]}>admin</Text>
            </View>
          )}
        </View>
        <View style={styles.memberRow}>
          <Ionicons
            name={userTypeIcon(item.userType)}
            size={12}
            color={userTypeColor(item.userType)}
          />
          <Text style={[styles.memberSub, { color: userTypeColor(item.userType) }]}>
            {item.userType}
          </Text>
          {item.country && (
            <Text style={styles.memberSub}>
              {countryFlag(item.country)} {item.country}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.border} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  memberSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  rolePillText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
});
