import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Member {
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  country: string | null;
  isFake: boolean;
}

interface AdminClubMembersHeaderProps {
  totalCount: number;
  loadedCount: number;
  hasMore: boolean;
}

export const AdminClubMembersHeader: React.FC<AdminClubMembersHeaderProps> = ({
  totalCount,
  loadedCount,
  hasMore,
}) => {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        Membri ({loadedCount}{hasMore ? ` di ${totalCount}` : ""})
      </Text>
    </View>
  );
};

export const AdminClubMembersEmpty: React.FC = () => (
  <View style={styles.emptyMembersWrap}>
    <Ionicons name="people-outline" size={40} color={Colors.border} />
    <Text style={styles.emptyMembersText}>Nessun membro ancora</Text>
  </View>
);

interface AdminClubMembersFooterProps {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  remaining: number;
  pageSize: number;
}

export const AdminClubMembersFooter: React.FC<AdminClubMembersFooterProps> = ({
  hasMore,
  loadingMore,
  onLoadMore,
  remaining,
  pageSize,
}) => {
  if (!hasMore) return null;

  return (
    <TouchableOpacity
      style={[styles.loadMoreBtn, loadingMore && { opacity: 0.6 }]}
      onPress={onLoadMore}
      disabled={loadingMore}
    >
      {loadingMore ? (
        <ActivityIndicator size="small" color={Colors.accent} />
      ) : (
        <>
          <Ionicons name="chevron-down" size={16} color={Colors.accent} />
          <Text style={styles.loadMoreText}>
            Carica altri {Math.min(remaining, pageSize)} membri
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

function userTypeIcon(type: string) {
  if (type === "biker") return "motorcycle";
  if (type === "zavorrina") return "person";
  if (type === "couple") return "people";
  return "person";
}

function userTypeColor(type: string) {
  if (type === "biker") return Colors.accent;
  if (type === "zavorrina") return "#EC4899";
  if (type === "couple") return "#7C3AED";
  return Colors.textSecondary;
}

function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65);
}

function AvatarCircle({ nickname, size = 44 }: { nickname: string; size?: number }) {
  const colors = [Colors.accent, "#7C3AED", "#EC4899", "#059669", "#D97706", "#2563EB"];
  const colorIdx = nickname.charCodeAt(0) % colors.length;
  return (
    <View style={[avatarStyles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[colorIdx] }]}>
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

interface MemberItemProps {
  item: Member;
  onRemove: (member: Member) => void;
  isRemoving: boolean;
}

export const MemberItem: React.FC<MemberItemProps> = ({ item, onRemove, isRemoving }) => {
  return (
    <View style={styles.memberCard}>
      <AvatarCircle nickname={item.nickname} size={42} />
      <View style={styles.memberInfo}>
        <View style={styles.memberRow}>
          <Text style={styles.memberName}>@{item.nickname}</Text>
          {item.isFake && (
            <View style={[styles.roleBadge, { backgroundColor: "#6B728022" }]}>
              <Text style={[styles.roleBadgeText, { color: Colors.textSecondary }]}>🤖 fake</Text>
            </View>
          )}
          {item.role === "admin" && (
            <View style={[styles.roleBadge, { backgroundColor: Colors.accent + "22" }]}>
              <Text style={[styles.roleBadgeText, { color: Colors.accent }]}>admin</Text>
            </View>
          )}
        </View>
        <View style={styles.memberRow}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Ionicons name from userTypeIcon */}
          <Ionicons name={userTypeIcon(item.userType) as any} size={13} color={userTypeColor(item.userType)} />
          <Text style={[styles.memberSub, { color: userTypeColor(item.userType) }]}>{item.userType}</Text>
          {item.country && (
            <Text style={styles.memberSub}>{countryFlag(item.country)} {item.country}</Text>
          )}
        </View>
        <Text style={styles.memberDate}>
          Dal {new Date(item.joinedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onRemove(item)}
        disabled={isRemoving}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="person-remove" size={20} color={Colors.error} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  emptyMembersWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyMembersText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  memberSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  memberDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    marginTop: 4,
  },
  loadMoreText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
});
