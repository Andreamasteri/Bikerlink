import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const PAGE_SIZE = 30;
const INITIAL_VISIBLE = 5;

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
  country: string | null;
}

interface ClubDetail {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  isApproved: boolean;
  activityScore: number | null;
  createdAt: string;
  conversationId: string | null;
  members: Member[];
  totalCount: number;
  hasMore: boolean;
}

function countryFlag(code: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1F1E6;
  return (
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(0) - 65) +
    String.fromCodePoint(base + code.toUpperCase().charCodeAt(1) - 65)
  );
}

function userTypeColor(type: string) {
  if (type === "biker") return Colors.accent;
  if (type === "zavorrina") return "#EC4899";
  if (type === "couple") return "#7C3AED";
  return Colors.textSecondary;
}

function userTypeIcon(type: string): "bicycle" | "person" | "people" {
  if (type === "biker") return "bicycle";
  if (type === "couple") return "people";
  return "person";
}

function AvatarCircle({ nickname, size = 40 }: { nickname: string; size?: number }) {
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

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [showAll, setShowAll] = useState(false);
  const [extraMembers, setExtraMembers] = useState<Member[]>([]);
  const [nextOffset, setNextOffset] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setShowAll(false);
    setExtraMembers([]);
    setNextOffset(PAGE_SIZE);
  }, [id]);

  const queryKey = `/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=0`;

  const { data: club, isLoading, error } = useQuery<ClubDetail>({
    queryKey: [queryKey],
    enabled: !!id,
  });

  const allMembers: Member[] = [...(club?.members ?? []), ...extraMembers];
  const totalCount = club?.totalCount ?? 0;
  const hasMore = allMembers.length < totalCount;
  const visibleMembers = showAll ? allMembers : allMembers.slice(0, INITIAL_VISIBLE);
  const hiddenCount = totalCount - INITIAL_VISIBLE;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await apiRequest("GET", `/api/motoclubs/${id}/detail?limit=${PAGE_SIZE}&offset=${nextOffset}`);
      const data = (await res.json()) as ClubDetail;
      setExtraMembers((prev) => [...prev, ...data.members]);
      setNextOffset((prev) => prev + PAGE_SIZE);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  function handleBack() {
    router.back();
  }

  function handleOpenChat() {
    if (!club?.conversationId) return;
    router.push(`/chat/${club.conversationId}` as any);
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (!club || error) {
    return (
      <View style={[styles.center, { paddingTop: topPad }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.border} />
        <Text style={styles.errorText}>Club non trovato</Text>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const brandOrModel = [club.brandName, club.modelName].filter(Boolean).join(" ");

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{club.name}</Text>
        {club.conversationId ? (
          <TouchableOpacity onPress={handleOpenChat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={visibleMembers}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="shield" size={40} color={Colors.accent} />
              </View>
              <Text style={styles.heroName}>{club.name}</Text>
              {brandOrModel ? (
                <Text style={styles.heroSub}>{brandOrModel}</Text>
              ) : null}
              <View style={styles.heroBadges}>
                <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
                  <Text style={[styles.badgeText, { color: Colors.accent }]}>
                    {club.clubType === "brand" ? "Marca" : club.clubType === "model" ? "Modello" : "Custom"}
                  </Text>
                </View>
                {club.isApproved && (
                  <View style={[styles.badge, { backgroundColor: Colors.success + "22" }]}>
                    <Text style={[styles.badgeText, { color: Colors.success }]}>Approvato</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="people" size={20} color={Colors.accent} />
                <Text style={styles.statValue}>{totalCount}</Text>
                <Text style={styles.statLabel}>Membri</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="flame" size={20} color="#F59E0B" />
                <Text style={styles.statValue}>{club.activityScore ?? 0}</Text>
                <Text style={styles.statLabel}>Attività</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.statValue}>
                  {new Date(club.createdAt).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}
                </Text>
                <Text style={styles.statLabel}>Creato</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Membri ({totalCount})
              </Text>
            </View>

            {totalCount === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={40} color={Colors.border} />
                <Text style={styles.emptyText}>Nessun membro ancora</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberCard}
            activeOpacity={0.7}
            onPress={() => router.push(`/profile/${item.userId}` as any)}
          >
            <AvatarCircle nickname={item.nickname} size={42} />
            <View style={styles.memberInfo}>
              <View style={styles.memberRow}>
                <Text style={styles.memberName}>@{item.nickname}</Text>
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
        )}
        ListFooterComponent={
          <View style={{ marginTop: 4 }}>
            {!showAll && totalCount > INITIAL_VISIBLE && (
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => setShowAll(true)}
              >
                <Ionicons name="people-outline" size={16} color={Colors.accent} />
                <Text style={styles.expandBtnText}>
                  Mostra tutti {hiddenCount > 0 ? `(+${hiddenCount})` : ""}
                </Text>
              </TouchableOpacity>
            )}
            {showAll && hasMore && (
              <TouchableOpacity
                style={[styles.expandBtn, loadingMore && { opacity: 0.6 }]}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <>
                    <Ionicons name="chevron-down" size={16} color={Colors.accent} />
                    <Text style={styles.expandBtnText}>
                      Carica altri {Math.min(totalCount - allMembers.length, PAGE_SIZE)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {club.conversationId && (
              <TouchableOpacity style={styles.chatBtn} onPress={handleOpenChat}>
                <Ionicons name="chatbubbles" size={20} color="#fff" />
                <Text style={styles.chatBtnText}>Apri chat del club</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
  },
  backBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  navTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
    marginHorizontal: 8,
  },

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
    marginBottom: 12,
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  heroBadges: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  statsRow: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 16, gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },

  sectionHeader: { paddingBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },

  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },

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

  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    marginBottom: 12,
  },
  expandBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent },

  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
  },
  chatBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
});
